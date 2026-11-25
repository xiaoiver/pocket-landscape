// Use English for visitors whose browser's primary language is not Chinese.
const chinese = /^zh(?:-|$)/i.test(navigator.language);
export const wording = (zh, en) => chinese ? zh : en;

export function labelButton(button, label) {
  button.setAttribute('aria-label', label);
  button.title = label;
}

export function describeGarden(name) {
  document.getElementById('garden').setAttribute('aria-label', wording(
    '可旋转的玻璃微景观，陶土' + name + '。点选后再点落点，或直接拖动。键盘按回车选中，方向键移动，Q 和 E 转向，回车放下，Esc 取消。',
    'Terrarium with a clay ' + name.toLowerCase() + '. Tap the figurine then a destination, or drag it. Press Enter to select, arrow keys to move, Q or E to turn, Enter to place, or Escape to cancel.'
  ));
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
  describeGarden(wording('狐狸', 'Fox'));
}
