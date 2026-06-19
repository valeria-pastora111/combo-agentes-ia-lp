const BASE_AMOUNT = 97;
const VIP_AMOUNT = 47;

const form = document.getElementById('checkout-form');
const stepForm = document.getElementById('step-form');
const stepPix = document.getElementById('step-pix');
const alertEl = document.getElementById('alert');
const vipBump = document.getElementById('vip-bump');
const summaryAmount = document.getElementById('summary-amount');
const btnAmount = document.getElementById('btn-amount');
const submitBtn = document.getElementById('submit-btn');
const pixQr = document.getElementById('pix-qr');
const pixQrFallback = document.getElementById('pix-qr-fallback');
const pixCode = document.getElementById('pix-code');
const pixStatus = document.getElementById('pix-status');
const copyBtn = document.getElementById('copy-btn');
const backBtn = document.getElementById('back-btn');

let pollTimer = null;
let currentPaymentId = null;

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function formatCpf(value) {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function formatMoney(amount) {
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getTotal() {
  return BASE_AMOUNT + (vipBump.checked ? VIP_AMOUNT : 0);
}

function updateAmounts() {
  const total = getTotal();
  summaryAmount.textContent = formatMoney(total);
  btnAmount.textContent = formatMoney(total);
}

function showAlert(message, ok = false) {
  alertEl.textContent = message;
  alertEl.classList.toggle('ok', ok);
  alertEl.classList.remove('hidden');
}

function hideAlert() {
  alertEl.classList.add('hidden');
}

function showPixStep(data) {
  stepForm.classList.add('hidden');
  stepPix.classList.remove('hidden');
  hideAlert();

  pixCode.value = data.qrCode || '';

  if (data.qrCodeBase64) {
    pixQr.src = data.qrCodeBase64.startsWith('data:')
      ? data.qrCodeBase64
      : `data:image/png;base64,${data.qrCodeBase64}`;
    pixQr.classList.remove('hidden');
    pixQrFallback.classList.add('hidden');
  } else if (data.ticketUrl) {
    pixQr.src = data.ticketUrl;
    pixQr.classList.remove('hidden');
    pixQrFallback.classList.add('hidden');
  } else {
    pixQr.classList.add('hidden');
    pixQrFallback.classList.remove('hidden');
  }

  currentPaymentId = data.paymentId;
  startPolling();
}

function showFormStep() {
  stopPolling();
  stepPix.classList.add('hidden');
  stepForm.classList.remove('hidden');
  currentPaymentId = null;
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollPayment() {
  if (!currentPaymentId) return;
  try {
    const res = await fetch(`/api/payment-status?paymentId=${encodeURIComponent(currentPaymentId)}`);
    const data = await res.json();
    if (!res.ok) return;

    if (data.paymentConfirmed) {
      stopPolling();
      pixStatus.textContent = 'Pagamento confirmado! Redirecionando...';
      window.location.href = '/obrigado';
    }
  } catch {
    /* retry on next interval */
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollPayment, 4000);
  pollPayment();
}

document.getElementById('cpf').addEventListener('input', (e) => {
  e.target.value = formatCpf(e.target.value);
});

vipBump.addEventListener('change', updateAmounts);
updateAmounts();

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(pixCode.value);
    copyBtn.textContent = 'Copiado!';
    setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 2000);
  } catch {
    pixCode.select();
    document.execCommand('copy');
  }
});

backBtn.addEventListener('click', showFormStep);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert();
  submitBtn.disabled = true;
  submitBtn.textContent = 'Gerando PIX...';

  try {
    const payload = {
      name: document.getElementById('name').value.trim(),
      email: document.getElementById('email').value.trim(),
      cpf: document.getElementById('cpf').value.trim(),
      includeVip: vipBump.checked
    };

    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Não foi possível gerar o PIX.');
    }

    showPixStep(data);
  } catch (err) {
    showAlert(err.message || 'Erro ao processar pagamento.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `Gerar PIX · <span id="btn-amount">${formatMoney(getTotal())}</span>`;
  }
});
