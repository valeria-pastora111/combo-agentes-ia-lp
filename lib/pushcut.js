const SALE_NAME = 'agente de ia';

/** Evita notificação duplicada de aprovada (webhook + polling). */
const approvedNotified = new Set();

function env(key) {
  return (process.env[key] || '').trim();
}

function formatValor(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num) || num <= 0) return String(amount || '');
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getNotificationUrl(kind) {
  if (kind === 'pending') return env('PUSHCUT_PENDING_URL');
  if (kind === 'approved') return env('PUSHCUT_APPROVED_URL');
  return '';
}

export async function notifySale(kind, { amount, paymentId } = {}) {
  const url = getNotificationUrl(kind);
  if (!url) {
    console.warn('[pushcut]', kind, 'URL não configurada');
    return { skipped: true, reason: 'missing_url' };
  }

  if (kind === 'approved' && paymentId) {
    const key = String(paymentId);
    if (approvedNotified.has(key)) {
      return { skipped: true, reason: 'duplicate' };
    }
    approvedNotified.add(key);
    if (approvedNotified.size > 500) {
      approvedNotified.delete(approvedNotified.values().next().value);
    }
  }

  const valor = formatValor(amount);
  const payload = {
    title: kind === 'approved' ? 'Venda aprovada' : 'Venda pendente',
    text: `${valor} · ${SALE_NAME}`,
    input: JSON.stringify({ valor, nome: SALE_NAME, amount: Number(amount) || amount })
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

    if (!response.ok) {
      console.error('[pushcut]', kind, response.status, data);
      return { ok: false, status: response.status, data };
    }

    console.info('[pushcut]', kind, 'ok', { amount, paymentId: paymentId || null });
    return { ok: true, id: data.id || data.notificationId || null };
  } catch (error) {
    console.error('[pushcut]', kind, error);
    return { ok: false, error: error.message };
  }
}

export function unwrapWebhookPayload(body) {
  if (!body || typeof body !== 'object') return {};
  if (Array.isArray(body)) return body[0] || {};

  const nested = body.data ?? body.Data ?? body.transaction ?? body.Transaction ?? null;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return { ...body, ...nested };
  }

  return body;
}

export function extractAmountFromWebhook(payload) {
  const p = unwrapWebhookPayload(payload);
  const raw =
    p?.amount ??
    p?.Amount ??
    p?.metadata?.amount ??
    p?.Metadata?.amount ??
    p?.items?.[0]?.amount ??
    p?.items?.[0]?.unit_price ??
    null;

  if (raw == null) return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return num >= 100 ? num / 100 : num;
}

export function extractPaymentIdFromWebhook(payload) {
  const p = unwrapWebhookPayload(payload);
  return String(p?.Id || p?.id || p?.transaction_id || p?.transactionId || '').trim() || null;
}

export function extractStatusFromWebhook(payload) {
  const p = unwrapWebhookPayload(payload);
  return p?.Status ?? p?.status ?? p?.payment_status ?? p?.paymentStatus ?? null;
}
