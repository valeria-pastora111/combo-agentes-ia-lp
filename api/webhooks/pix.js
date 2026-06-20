import { mapPaymentStatus } from '../../lib/pix.js';
import {
  notifySale,
  extractAmountFromWebhook,
  extractPaymentIdFromWebhook,
  extractStatusFromWebhook,
  unwrapWebhookPayload
} from '../../lib/pushcut.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const rawBody = req.body || {};
    const payload = unwrapWebhookPayload(rawBody);
    const status = extractStatusFromWebhook(rawBody);
    const transactionId = extractPaymentIdFromWebhook(rawBody) || '';
    const mappedStatus = mapPaymentStatus(status);

    console.info('[payment-webhook]', {
      transactionId,
      status,
      mappedStatus,
      keys: Object.keys(payload).slice(0, 12)
    });

    if (mappedStatus === 'paid') {
      const amount = extractAmountFromWebhook(rawBody) ?? 47;
      await notifySale('approved', { amount, paymentId: transactionId });
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
