import { fetchPixTransaction, isPaymentConfigured } from '../lib/pix.js';
import { notifySale } from '../lib/pushcut.js';

function extractAmountFromTransaction(raw) {
  const amount =
    raw?.amount ??
    raw?.Amount ??
    raw?.items?.[0]?.amount ??
    raw?.items?.[0]?.unit_price ??
    null;
  if (amount == null) return null;
  const num = Number(amount);
  if (!Number.isFinite(num)) return null;
  return num >= 100 ? num / 100 : num;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  const paymentId = String(req.query?.paymentId || '').trim();
  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId obrigatório' });
  }

  if (!isPaymentConfigured()) {
    return res.status(503).json({ error: 'Pagamento indisponível no momento.' });
  }

  try {
    const result = await fetchPixTransaction(paymentId);
    const paymentConfirmed = result.mappedStatus === 'paid';

    if (paymentConfirmed) {
      const amount = extractAmountFromTransaction(result.raw) ?? 47;
      await notifySale('approved', { amount, paymentId: result.id });
    }

    return res.status(200).json({
      paymentId: result.id,
      status: result.status,
      mappedStatus: result.mappedStatus,
      paymentConfirmed
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Erro ao consultar pagamento.' });
  }
}
