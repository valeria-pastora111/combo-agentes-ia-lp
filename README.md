# Combo +50 Agentes IA — Landing Page

LP de vendas do **Combo Agentes IA** com checkout PIX via **FreePay**.

## Stack

- `index.html` — landing page
- `checkout.html` — checkout PIX (FreePay)
- `api/checkout.js` — gera PIX
- `api/payment-status.js` — polling de status
- `api/webhooks/freepay.js` — postback FreePay

## Deploy (Vercel)

Variáveis obrigatórias:

- `FREEPAY_PUBLIC_KEY`
- `FREEPAY_SECRET_KEY`
- `SITE_URL` — URL pública do projeto
- `FREEPAY_POSTBACK_URL` — `{SITE_URL}/api/webhooks/freepay`

```bash
npm run setup:vercel
```

## Desenvolvimento local

```bash
npx vercel dev
```
