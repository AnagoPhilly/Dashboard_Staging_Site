// js/utils.js
const LOCATIONIQ_KEY = "pk.c92dcfda3c6ea1c6da25f0c36c34c99e";

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.id = 'toast';
  t.classList.add('toast-visible');
  // Re-use style from CSS or inline for quick fix if CSS missing
  // But since we moved it to CSS, we just need to add the ID and Append
  
  // Logic from original:
  document.body.appendChild(t);
  
  // Wait a tick for transition
  requestAnimationFrame(() => {
    t.classList.add('toast-visible');
  });

  setTimeout(() => {
    t.classList.remove('toast-visible');
    setTimeout(() => t.remove(), 500);
  }, 4000);
}

function formatMoney(amount) {
    return '$' + amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

// Make sure these are available globally if needed, though mostly used by other JS files
window.showToast = showToast;
window.formatMoney = formatMoney;
window.LOCATIONIQ_KEY = LOCATIONIQ_KEY;