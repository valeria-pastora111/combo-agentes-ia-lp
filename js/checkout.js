const BASE_AMOUNT = 47;

const UPSELLS = {
  scripts_wa: { amount: 9.9, label: 'Scripts WhatsApp Turbo' },
  ads_pack: { amount: 14.9, label: 'Pack Anúncios Que Convertem' },
  kit_24h: { amount: 19.9, label: 'Kit Implementação 24h' }
};

const form = document.getElementById('checkout-form');
const stepForm = document.getElementById('step-form');
const stepPix = document.getElementById('step-pix');
const alertEl = document.getElementById('alert');
const upsellInputs = document.querySelectorAll('[data-upsell]');
const summaryAmount = document.getElementById('summary-amount');
const summaryBreakdown = document.getElementById('summary-breakdown');
const stickyAmount = document.getElementById('sticky-amount');
const stickyBar = document.getElementById('sticky-bar');
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

function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  return check === Number(cpf[10]);
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

function getSelectedUpsells() {
  return [...upsellInputs]
    .filter((input) => input.checked)
    .map((input) => input.dataset.upsell);
}

function getTotal() {
  const upsellTotal = getSelectedUpsells().reduce((sum, id) => sum + (UPSELLS[id]?.amount || 0), 0);
  return Math.round((BASE_AMOUNT + upsellTotal) * 100) / 100;
}

function updateAmounts() {
  const total = getTotal();
  const formatted = formatMoney(total);
  const selected = getSelectedUpsells();

  summaryAmount.textContent = formatted;
  if (stickyAmount) stickyAmount.textContent = formatted;
  const btnEl = document.getElementById('btn-amount');
  if (btnEl) btnEl.textContent = formatted;

  if (!summaryBreakdown) return;

  if (!selected.length) {
    summaryBreakdown.textContent = 'Combo base · acesso anual';
    return;
  }

  const lines = selected.map((id) => `+ ${UPSELLS[id].label}`);
  summaryBreakdown.textContent = `Combo + ${lines.join(' + ')}`;
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
  if (stickyBar) stickyBar.classList.add('hidden');
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
  if (stickyBar) stickyBar.classList.remove('hidden');
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

upsellInputs.forEach((input) => input.addEventListener('change', updateAmounts));
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
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const cpf = document.getElementById('cpf').value.trim();

    if (name.length < 3) {
      throw new Error('Informe seu nome completo.');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Informe um e-mail válido.');
    }
    if (!isValidCpf(cpf)) {
      throw new Error('CPF inválido. Confira os números digitados.');
    }

    const payload = {
      name,
      email,
      cpf,
      upsells: getSelectedUpsells()
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
    const formatted = formatMoney(getTotal());
    submitBtn.innerHTML = `Gerar PIX · <span id="btn-amount">${formatted}</span>`;
  }
});
