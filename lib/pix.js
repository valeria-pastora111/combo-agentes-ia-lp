function env(key) {
  return (process.env[key] || '').trim();
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function phoneWithDdi55(phone) {
  let digits = onlyDigits(phone);
  if (digits.startsWith('55') && digits.length >= 12) return digits.slice(0, 13);
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits.slice(0, 13);
}

export function getPaymentCredentials() {
  return {
    publicKey: env('PAYMENT_PUBLIC_KEY'),
    secretKey: env('PAYMENT_SECRET_KEY')
  };
}

export function isPaymentConfigured() {
  const { publicKey, secretKey } = getPaymentCredentials();
  return !!(publicKey && secretKey && env('PAYMENT_API_URL'));
}

function getGatewayApi() {
  const url = env('PAYMENT_API_URL');
  if (!url) {
    const error = new Error('Gateway de pagamento não configurado.');
    error.status = 503;
    throw error;
  }
  return url.replace(/\/$/, '');
}

function getAuthHeader() {
  const { publicKey, secretKey } = getPaymentCredentials();
  if (!publicKey || !secretKey) {
    const error = new Error('Credenciais de pagamento não configuradas.');
    error.status = 503;
    throw error;
  }
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`;
}

export function mapPaymentStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (['paid', 'approved', 'approved_payment'].includes(normalized)) return 'paid';
  if (['refused', 'rejected', 'cancelled', 'canceled', 'failed'].includes(normalized)) return 'failed';
  if (normalized === 'refunded') return 'failed';
  return 'pending';
}

function unwrapPayload(result) {
  if (!result || typeof result !== 'object') return {};
  return result.data && typeof result.data === 'object' ? result.data : result;
}

export function getWebhookUrl() {
  const explicit = env('PAYMENT_WEBHOOK_URL');
  if (explicit) return explicit;
  const siteUrl = env('SITE_URL').replace(/\/$/, '');
  if (siteUrl) return `${siteUrl}/api/webhooks/pix`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/webhooks/pix`;
  return '';
}

export async function createPixPayment({
  amount,
  description,
  payerName,
  payerEmail,
  payerPhone,
  payerCpf,
  orderId
}) {
  const cpf = onlyDigits(payerCpf);
  const phone = phoneWithDdi55(payerPhone || '11999999999');
  const name = String(payerName || '').trim();
  const email = String(payerEmail || '').trim();

  if (cpf.length !== 11) {
    throw Object.assign(new Error('CPF inválido (11 dígitos).'), { status: 400 });
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

  const postbackUrl = getWebhookUrl();
  const itemTitle = description || 'Combo +50 Agentes de IA';
  const metadata = {
    store: 'Combo Agentes IA',
    service: 'combo_agentes_ia_lp',
    order_id: orderId || null
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

  const response = await fetch(`${getGatewayApi()}/v1/payment-transaction/create`, {
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
    const message = result?.message || result?.error || 'Não foi possível gerar o PIX.';
    throw Object.assign(new Error(message), { status: response.status, details: result });
  }

  const row = unwrapCreateResult(result);
  const pix = normalizePixBlock(row.pix);
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
      new Error('Código PIX não retornado pelo gateway.'),
      { status: 500, details: result }
    );
  }

  return {
    id: transactionId,
    status,
    mappedStatus: mapPaymentStatus(status),
    pixCode,
    pixQrUrl,
    qrCodeBase64,
    amountCents
  };
}

function unwrapCreateResult(result) {
  if (!result || typeof result !== 'object') return {};
  const data = result.data;
  if (Array.isArray(data) && data.length) return data[0];
  if (data && typeof data === 'object') return data;
  return result;
}

function normalizePixBlock(pixRaw) {
  if (!pixRaw) return {};
  if (Array.isArray(pixRaw)) return pixRaw[0] || {};
  return pixRaw;
}

export async function fetchPixTransaction(transactionId) {
  const id = String(transactionId || '').trim();
  if (!id) {
    throw Object.assign(new Error('ID da transação inválido.'), { status: 400 });
  }

  const response = await fetch(
    `${getGatewayApi()}/v1/payment-transaction/info/${encodeURIComponent(id)}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: getAuthHeader()
      }
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = result?.message || result?.error || result?.Message;
    const message = apiMessage || 'Não foi possível consultar o pagamento.';
    throw Object.assign(new Error(message), { status: response.status, details: result });
  }

  const data = unwrapPayload(result);
  const status = String(data.Status || data.status || 'pending');
  return {
    id: String(data.Id || data.id || id),
    status,
    mappedStatus: mapPaymentStatus(status),
    raw: data
  };
}

export function buildCheckoutResponse(payment, extra = {}) {
  return {
    type: 'pix',
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
