import { fetchFreepayTransaction, isFreepayConfigured } from '../lib/freepay.js';

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

  if (!isFreepayConfigured()) {
    return res.status(503).json({ error: 'FreePay não configurado.' });
  }

  try {
    const result = await fetchFreepayTransaction(paymentId);
    return res.status(200).json({
      paymentId: result.id,
      status: result.status,
      mappedStatus: result.mappedStatus,
      paymentConfirmed: result.mappedStatus === 'paid'
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Erro ao consultar pagamento.' });
  }
}
