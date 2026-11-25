// Use English for visitors whose browser's primary language is not Chinese.
const chinese = /^zh(?:-|$)/i.test(navigator.language);
export const wording = (zh, en) => chinese ? zh : en;

export function labelButton(button, label) {
  button.setAttribute('aria-label', label);
  button.title = label;
}

export function localizeInterface() {
  document.documentElement.lang = wording('zh-CN', 'en');
  document.title = wording('蕨间小径 · 口袋景观', 'Fern Path · Pocket Landscape');
  for (const node of document.querySelectorAll('[data-en]')) {
    if (node.hasAttribute('aria-label')) {
      const label = wording(node.getAttribute('aria-label'), node.dataset.en);
      if (node.tagName === 'BUTTON') labelButton(node, label);
      else node.setAttribute('aria-label', label);
    } else if (!chinese) {
      node.textContent = node.dataset.en;
    }
  }
}
