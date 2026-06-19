# Combo +50 Agentes IA — Landing Page

LP de vendas do **Combo Agentes IA** com checkout PIX.

## Stack

- `index.html` — landing page
- `checkout.html` — checkout PIX
- `api/checkout.js` — gera PIX
- `api/payment-status.js` — polling de status
- `api/webhooks/pix.js` — webhook de confirmação

## Deploy (Vercel)

Variáveis obrigatórias:

- `PAYMENT_API_URL` — URL base do gateway
- `PAYMENT_PUBLIC_KEY`
- `PAYMENT_SECRET_KEY`
- `SITE_URL` — URL pública do projeto
- `PAYMENT_WEBHOOK_URL` — `{SITE_URL}/api/webhooks/pix` (opcional se `SITE_URL` estiver definida)

```bash
npm run setup:vercel
```

## Desenvolvimento local

```bash
npx vercel dev
```
