(function initToasts() {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;

  const NAMES = [
    'Ana Paula', 'Carlos M.', 'Juliana R.', 'Ricardo S.', 'Fernanda L.',
    'Bruno K.', 'Camila T.', 'Diego A.', 'Patrícia N.', 'Marcelo V.',
    'Larissa F.', 'Gabriel P.', 'Renata C.', 'Thiago H.', 'Beatriz O.',
    'Lucas D.', 'Amanda S.', 'Rodrigo T.', 'Vanessa M.', 'Felipe R.'
  ];

  const PURCHASE_MSGS = [
    (n) => `${n} acabou de garantir o combo`,
    (n) => `${n} comprou agora`,
    (n) => `${n} finalizou a compra há instantes`
  ];

  const COMMUNITY_MSGS = [
    (n) => `${n} postou um case na comunidade`,
    (n) => `${n} compartilhou um resultado na comunidade`,
    (n) => `${n} publicou conteúdo novo na comunidade`
  ];

  const iconPurchase = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
  const iconCommunity = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

  let toggle = 'purchase';

  function randomFrom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function showToast(type) {
    const name = randomFrom(NAMES);
    const isPurchase = type === 'purchase';
    const message = randomFrom(isPurchase ? PURCHASE_MSGS : COMMUNITY_MSGS)(name);

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <div class="toast-icon toast-icon--${isPurchase ? 'purchase' : 'community'}">
        ${isPurchase ? iconPurchase : iconCommunity}
      </div>
      <div class="toast-body">
        <div class="toast-app">Combo Agentes IA</div>
        <div class="toast-title">${isPurchase ? 'Nova compra' : 'Comunidade'}</div>
        <div class="toast-sub">${message}</div>
      </div>
      <span class="toast-time">agora</span>
    `;

    stack.replaceChildren(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 350);
    }, 4500);
  }

  function scheduleToast() {
    const delay = 5000 + Math.random() * 6000;
    setTimeout(() => {
      showToast(toggle);
      toggle = toggle === 'purchase' ? 'community' : 'purchase';
      scheduleToast();
    }, delay);
  }

  setTimeout(() => {
    showToast('purchase');
    toggle = 'community';
    scheduleToast();
  }, 3500);
})();
