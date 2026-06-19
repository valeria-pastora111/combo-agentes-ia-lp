import {
  createFreepayPixPayment,
  buildFreepayCheckoutResponse,
  isFreepayConfigured
} from '../lib/freepay.js';

const PRODUCT_BASE = {
  name: 'Combo +50 Agentes IA — Ecossistema Completo',
  amount: 97
};

const PRODUCT_VIP_BUMP = {
  name: 'Combo +50 Agentes IA + Plano VIP Implementação',
  amount: 144
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      configured: isFreepayConfigured(),
      product: PRODUCT_BASE,
      vipBump: { label: 'Plano VIP Implementação', amount: 47, totalWithBump: PRODUCT_VIP_BUMP.amount },
      paymentMethod: 'pix',
      provider: 'freepay'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!isFreepayConfigured()) {
    return res.status(503).json({ error: 'Pagamento PIX indisponível no momento. Tente novamente em instantes.' });
  }

  try {
    const body = req.body || {};
    const includeVip = body.includeVip === true || body.includeVip === 'true';
    const product = includeVip ? PRODUCT_VIP_BUMP : PRODUCT_BASE;
    const orderId = `combo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const payment = await createFreepayPixPayment({
      amount: product.amount,
      description: product.name,
      payerName: body.name,
      payerEmail: body.email,
      payerCpf: body.cpf,
      orderId
    });

    return res.status(200).json(buildFreepayCheckoutResponse(payment, {
      orderId,
      productName: product.name,
      amount: product.amount
    }));
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Erro ao gerar PIX.' });
  }
}
