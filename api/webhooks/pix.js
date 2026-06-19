import { mapPaymentStatus } from '../../lib/pix.js';
import { notifySale, extractAmountFromWebhook } from '../../lib/pushcut.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const payload = req.body || {};
    const status = payload.Status || payload.status || null;
    const transactionId = String(payload.Id || payload.id || '');
    const mappedStatus = mapPaymentStatus(status);

    console.info('[payment-webhook]', {
      transactionId,
      status,
      mappedStatus
    });

    if (mappedStatus === 'paid') {
      const amount = extractAmountFromWebhook(payload) ?? 97;
      notifySale('approved', { amount }).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      received: true,
      transactionId,
      status: mappedStatus
    });
  } catch (error) {
    console.error('[payment-webhook]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
