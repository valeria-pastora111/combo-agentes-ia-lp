const FREEPAY_API = 'https://api.freepaybrasil.com';

export const FREEPAY_PROVIDER = 'freepay';

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function phoneWithDdi55(phone) {
  let digits = onlyDigits(phone);
  if (digits.startsWith('55') && digits.length >= 12) return digits.slice(0, 13);
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits.slice(0, 13);
}

export function getFreepayCredentials() {
  const publicKey = (process.env.FREEPAY_PUBLIC_KEY || '').trim();
  const secretKey = (process.env.FREEPAY_SECRET_KEY || '').trim();
  return { publicKey, secretKey };
}

export function isFreepayConfigured() {
  const { publicKey, secretKey } = getFreepayCredentials();
  return !!(publicKey && secretKey);
}

function getAuthHeader() {
  const { publicKey, secretKey } = getFreepayCredentials();
  if (!publicKey || !secretKey) {
    const error = new Error('Credenciais FreePay não configuradas (FREEPAY_PUBLIC_KEY / FREEPAY_SECRET_KEY).');
    error.status = 503;
    throw error;
  }
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`;
}

export function mapFreepayStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (['paid', 'approved', 'approved_payment'].includes(normalized)) return 'paid';
  if (['refused', 'rejected', 'cancelled', 'canceled', 'failed'].includes(normalized)) return 'failed';
  if (normalized === 'refunded') return 'failed';
  return 'pending';
}

function unwrapFreepayPayload(result) {
  if (!result || typeof result !== 'object') return {};
  return result.data && typeof result.data === 'object' ? result.data : result;
}

export function getFreepayPostbackUrl() {
  const explicit = (process.env.FREEPAY_POSTBACK_URL || '').trim();
  if (explicit) return explicit;
  const siteUrl = (process.env.SITE_URL || '').trim().replace(/\/$/, '');
  if (siteUrl) return `${siteUrl}/api/webhooks/freepay`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/webhooks/freepay`;
  return '';
}

export async function createFreepayPixPayment({
  amount,
  description,
  payerName,
  payerEmail,
  payerPhone,
  payerCpf,
  orderId
}) {
  const cpf = onlyDigits(payerCpf);
  const phone = phoneWithDdi55(payerPhone);
  const name = String(payerName || '').trim();
  const email = String(payerEmail || '').trim();

  if (cpf.length !== 11) {
    throw Object.assign(new Error('CPF inválido (11 dígitos).'), { status: 400 });
  }
  if (phone.length < 12) {
    throw Object.assign(new Error('Telefone inválido (DDD + número).'), { status: 400 });
  }
  if (name.length < 3) {
    throw Object.assign(new Error('Nome inválido (mínimo 3 caracteres).'), { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('E-mail inválido.'), { status: 400 });
  }

  const amountCents = Math.round(Number(amount) * 100);
  if (!amountCents || amountCents < 100) {
    throw Object.assign(new Error('Valor inválido para pagamento.'), { status: 400 });
  }

  const postbackUrl = getFreepayPostbackUrl();
  const itemTitle = description || 'Combo +50 Agentes de IA';
  const metadata = {
    provider_name: 'HubCRM',
    service: 'combo_agentes_ia_lp',
    order_id: orderId || null,
    hub_cliente: name
  };

  const payload = {
    amount: amountCents,
    payment_method: 'pix',
    pix: { expires_in_days: 1 },
    ...(postbackUrl ? { postback_url: postbackUrl } : {}),
    customer: {
      name,
      email,
      phone,
      document: { type: 'cpf', number: cpf }
    },
    items: [{
      title: itemTitle,
      name: itemTitle,
      quantity: 1,
      unit_price: amountCents,
      amount: amountCents
    }],
    metadata
  };

  const response = await fetch(`${FREEPAY_API}/v1/payment-transaction/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: getAuthHeader()
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result?.message || result?.error || 'Não foi possível gerar o PIX na FreePay.';
    throw Object.assign(new Error(message), { status: response.status, details: result });
  }

  const row = unwrapFreepayCreateResult(result);
  const pix = normalizeFreepayPixBlock(row.pix);
  const transactionId = String(row.id || row.Id || result.id || '');
  const pixCode = String(
    pix.qr_code || pix.qrcode || pix.copy_paste || row.qr_code || row.pix_copy_paste || ''
  ).trim();
  const pixQrUrl = String(pix.url || pix.image_url || row.pix_url || '').trim();
  const qrCodeBase64 = String(
    pix.qr_code_base64 || pix.qrcode_base64 || row.qr_code_base64 || ''
  ).trim();
  const status = String(row.status || row.Status || result.status || 'pending');

  if (!pixCode) {
    throw Object.assign(
      new Error('Código PIX não retornado pela FreePay.'),
      { status: 500, details: result }
    );
  }

  return {
    provider: FREEPAY_PROVIDER,
    id: transactionId,
    status,
    mappedStatus: mapFreepayStatus(status),
    pixCode,
    pixQrUrl,
    qrCodeBase64,
    amountCents
  };
}

function unwrapFreepayCreateResult(result) {
  if (!result || typeof result !== 'object') return {};
  const data = result.data;
  if (Array.isArray(data) && data.length) return data[0];
  if (data && typeof data === 'object') return data;
  return result;
}

function normalizeFreepayPixBlock(pixRaw) {
  if (!pixRaw) return {};
  if (Array.isArray(pixRaw)) return pixRaw[0] || {};
  return pixRaw;
}

export async function fetchFreepayTransaction(transactionId) {
  const id = String(transactionId || '').trim();
  if (!id) {
    throw Object.assign(new Error('ID da transação FreePay inválido.'), { status: 400 });
  }

  const response = await fetch(`${FREEPAY_API}/v1/payment-transaction/info/${encodeURIComponent(id)}`, {
    headers: {
      Accept: 'application/json',
      Authorization: getAuthHeader()
    }
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = result?.message || result?.error || result?.Message;
    const message = apiMessage
      ? `FreePay: ${apiMessage}`
      : 'Não foi possível consultar transação FreePay.';
    throw Object.assign(new Error(message), { status: response.status, details: result });
  }

  const data = unwrapFreepayPayload(result);
  const status = String(data.Status || data.status || 'pending');
  return {
    id: String(data.Id || data.id || id),
    status,
    mappedStatus: mapFreepayStatus(status),
    raw: data
  };
}

export function buildFreepayCheckoutResponse(payment, extra = {}) {
  return {
    type: 'pix',
    provider: FREEPAY_PROVIDER,
    paymentId: payment.id,
    status: payment.status,
    mappedStatus: payment.mappedStatus,
    qrCode: payment.pixCode,
    qrCodeBase64: payment.qrCodeBase64 || '',
    ticketUrl: payment.pixQrUrl || '',
    amountCents: payment.amountCents,
    ...extra
  };
}
