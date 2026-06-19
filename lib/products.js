export const BASE_PRODUCT = {
  amount: 47,
  name: 'Combo +50 Agentes IA — Ecossistema Completo'
};

export const UPSELLS = {
  scripts_wa: {
    id: 'scripts_wa',
    amount: 9.9,
    label: 'Scripts WhatsApp Turbo',
    tag: 'Mais vendido',
    description: '15 roteiros copy-paste para abordar, quebrar objeções e fechar no WhatsApp hoje.',
    emoji: '💬'
  },
  ads_pack: {
    id: 'ads_pack',
    amount: 14.9,
    label: 'Pack Anúncios Que Convertem',
    tag: 'Alta conversão',
    description: '10 criativos Meta + 5 Google Ads prontos — só trocar logo e colocar no ar.',
    emoji: '📢'
  },
  kit_24h: {
    id: 'kit_24h',
    amount: 19.9,
    label: 'Kit Implementação 24h',
    tag: 'Resultado rápido',
    description: 'Checklist passo a passo + 20 agentes ajustáveis pro seu nicho. Primeira venda em 24h.',
    emoji: '⚡'
  }
};

export function normalizeUpsellIds(raw) {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(Object.keys(UPSELLS));
  return [...new Set(raw.filter((id) => allowed.has(id)))];
}

export function buildOrderProduct(selectedIds = []) {
  const upsellIds = normalizeUpsellIds(selectedIds);
  const upsellItems = upsellIds.map((id) => UPSELLS[id]);
  const upsellTotal = upsellItems.reduce((sum, item) => sum + item.amount, 0);
  const amount = Math.round((BASE_PRODUCT.amount + upsellTotal) * 100) / 100;

  const parts = [BASE_PRODUCT.name];
  if (upsellItems.length) {
    parts.push(...upsellItems.map((item) => item.label));
  }

  return {
    amount,
    name: parts.join(' + '),
    upsellIds,
    upsellItems
  };
}

export function getCatalog() {
  return {
    base: BASE_PRODUCT,
    upsells: Object.values(UPSELLS)
  };
}
