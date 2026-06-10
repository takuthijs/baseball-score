/**
 * ユーティリティ関数
 */

/** UUID生成 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/** 日付フォーマット */
export function formatDate(dateStr) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${y}/${m}/${day}(${w})`;
}

/** イニング表示テキスト */
export function formatInning(inning, side) {
  return `${inning}回${side === 'top' ? '表' : '裏'}`;
}

/** HTMLエスケープ */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** DOM要素作成ヘルパー */
export function el(tag, attrs = {}, children = []) {
  const elem = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') {
      elem.className = val;
    } else if (key === 'style' && typeof val === 'object') {
      Object.assign(elem.style, val);
    } else if (key.startsWith('on')) {
      elem.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === 'innerHTML') {
      elem.innerHTML = val;
    } else if (key === 'textContent') {
      elem.textContent = val;
    } else {
      elem.setAttribute(key, val);
    }
  }
  for (const child of children) {
    if (typeof child === 'string') {
      elem.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      elem.appendChild(child);
    }
  }
  return elem;
}

/** Toast通知 */
export function showToast(message, type = 'success', duration = 2500) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = el('div', { className: 'toast-container' });
    document.body.appendChild(container);
  }
  const toast = el('div', { className: `toast ${type}`, textContent: message });
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/** debounce */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** 配列のアイテムを移動 */
export function moveArrayItem(arr, fromIndex, toIndex) {
  const result = [...arr];
  const [item] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, item);
  return result;
}
