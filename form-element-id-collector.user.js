// ==UserScript==
// @name         Form Element ID Collector
// @namespace    https://example.com/tampermonkey/form-element-id-collector
// @version      1.0.0
// @description  Collect form inputs, dropdowns, checkboxes, and radio buttons from the current page and display their tag, id, and hints in a copyable overlay.
// @match        *://*/*
// @grant        GM_addStyle
// ==/UserScript==

(function() {
  'use strict';

  const PANEL_ID = 'tm-form-element-id-collector-panel';
  const TEXTAREA_ID = 'tm-form-element-id-collector-output';
  const COPY_BUTTON_ID = 'tm-form-element-id-collector-copy';

  const ignoredInputTypes = new Set(['button', 'submit', 'reset', 'image', 'file', 'hidden']);

  const getLabelText = (element) => {
    if (element.id) {
      const labelByFor = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (labelByFor && labelByFor.textContent.trim()) {
        return labelByFor.textContent.trim();
      }
    }

    const closestLabel = element.closest('label');
    if (closestLabel && closestLabel.textContent.trim()) {
      return closestLabel.textContent.trim();
    }

    if (element.ariaLabel) {
      return element.ariaLabel.trim();
    }

    if (element.placeholder) {
      return element.placeholder.trim();
    }

    const container = element.parentElement;
    if (container) {
      const labelInContainer = container.querySelector('label');
      if (labelInContainer && labelInContainer.textContent.trim()) {
        return labelInContainer.textContent.trim();
      }

      const textNodes = Array.from(container.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent.trim())
        .filter(Boolean);

      if (textNodes.length) {
        return textNodes.join(' ');
      }
    }

    return '';
  };

  const describeElement = (element, index) => {
    const tag = element.tagName.toLowerCase();
    const type = element.type ? element.type.toLowerCase() : '';
    const idPart = element.id ? `id="${element.id}"` : 'id: (none)';
    const namePart = element.name ? `name="${element.name}"` : 'name: (none)';
    const label = getLabelText(element) || '（ラベル未検出）';
    const placeholder = element.placeholder ? `placeholder="${element.placeholder}"` : '';
    const targetHint = element.id ? `id="${element.id}" に ${label} を入力` : element.name ? `name="${element.name}" に ${label} を入力` : `${label} を入力`;

    const attributes = [idPart, namePart, placeholder].filter(Boolean).join(', ');
    const typeSuffix = type && tag === 'input' ? `[type=${type}]` : '';

    return `${index + 1}. <${tag}${typeSuffix}> (${attributes}) -> 入力先: ${targetHint}`;
  };

  const collectFormElements = () => {
    const nodes = Array.from(document.querySelectorAll('input, select, textarea'));

    return nodes
      .filter((element) => {
        if (element.tagName.toLowerCase() !== 'input') return true;
        return !ignoredInputTypes.has(element.type.toLowerCase());
      })
      .map((element, index) => describeElement(element, index));
  };

  const createPanel = () => {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="tm-panel-header">フォーム要素一覧 <button id="${COPY_BUTTON_ID}">コピー</button></div>
      <textarea id="${TEXTAREA_ID}" readonly></textarea>
      <div class="tm-panel-footnote">タグ・id・name・placeholder と、どの id/name にどの情報を入れるかのヒントを一覧化しています。</div>
    `;

    document.body.appendChild(panel);

    const textarea = panel.querySelector(`#${TEXTAREA_ID}`);
    textarea.value = collectFormElements().join('\n');

    panel.querySelector(`#${COPY_BUTTON_ID}`).addEventListener('click', async () => {
      await navigator.clipboard.writeText(textarea.value);
      panel.querySelector('.tm-panel-header').textContent = 'フォーム要素一覧（コピーしました）';
      setTimeout(() => {
        panel.querySelector('.tm-panel-header').textContent = 'フォーム要素一覧';
      }, 1200);
    });
  };

  const injectStyles = () => {
    const styles = `
      #${PANEL_ID} {
        position: fixed;
        bottom: 16px;
        right: 16px;
        width: 360px;
        max-height: 60vh;
        z-index: 2147483647;
        background: #ffffff;
        border: 1px solid #ccc;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #222;
      }

      #${PANEL_ID} .tm-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 12px;
        font-weight: 700;
        background: #f4f4f4;
        border-bottom: 1px solid #ddd;
      }

      #${PANEL_ID} button {
        padding: 4px 10px;
        font-size: 12px;
        border: 1px solid #888;
        border-radius: 4px;
        background: linear-gradient(#fff, #f0f0f0);
        cursor: pointer;
      }

      #${PANEL_ID} button:hover {
        background: linear-gradient(#fefefe, #eaeaea);
      }

      #${TEXTAREA_ID} {
        width: 100%;
        flex: 1;
        min-height: 200px;
        border: none;
        border-top: 1px solid #ddd;
        border-bottom: 1px solid #ddd;
        padding: 10px;
        resize: vertical;
        box-sizing: border-box;
        font-size: 12px;
        line-height: 1.4;
        color: #333;
      }

      #${PANEL_ID} .tm-panel-footnote {
        padding: 8px 10px;
        font-size: 11px;
        color: #555;
        background: #fafafa;
      }
    `;

    if (typeof GM_addStyle === 'function') {
      GM_addStyle(styles);
    } else {
      const style = document.createElement('style');
      style.textContent = styles;
      document.head.appendChild(style);
    }
  };

  const init = () => {
    injectStyles();
    createPanel();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
