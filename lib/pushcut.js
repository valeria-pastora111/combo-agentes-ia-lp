const SALE_NAME = 'agente de ia';

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

export async function notifySale(kind, { amount }) {
  const url = getNotificationUrl(kind);
  if (!url) return { skipped: true };

  const valor = formatValor(amount);
  const payload = {
    title: kind === 'approved' ? 'Venda aprovada' : 'Venda pendente',
    text: `${valor} · ${SALE_NAME}`,
    input: { valor, nome: SALE_NAME, amount: Number(amount) || amount }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[pushcut]', kind, response.status, data);
      return { ok: false, status: response.status };
    }
    return { ok: true, id: data.id || data.notificationId || null };
  } catch (error) {
    console.error('[pushcut]', kind, error);
    return { ok: false, error: error.message };
  }
}

export function extractAmountFromWebhook(payload) {
  const raw =
    payload?.amount ??
    payload?.Amount ??
    payload?.metadata?.amount ??
    payload?.items?.[0]?.amount ??
    null;
  if (raw == null) return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return num >= 100 ? num / 100 : num;
}
