// ==UserScript==
// @name         syukatsu Entry Autofill Panel (Full Enhanced)
// @namespace    https://github.com/Nagi-Inaba/syukatsu-autofill
// @version      0.4.1
// @description  就活サイト入力補助：プロフィール管理＋フォーム構造学習機能＋React対応
// @author       You
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ===== 設定・定数 =====
  const STORAGE_KEY = 'syukatsu_autofill_data';
  const DEBUG = true;
  const FILL_FEEDBACK_MS = 1600;

  // ===== ユーティリティ =====
  const log = (...a) => DEBUG && console.log('[Autofill]', ...a);
  const el = (sel, root = document) => root.querySelector(sel);
  const els = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // React/Vueなどのフレームワーク対策
  function setNativeValue(element, value) {
    if (!element) return;

    // value プロパティを安全に取得（存在しない要素に備える）
    const ownDesc = Object.getOwnPropertyDescriptor(element, 'value');
    const proto = Object.getPrototypeOf(element);
    const protoDesc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;

    const valueSetter = ownDesc?.set || protoDesc?.set;
    if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      // セッターが無い特殊要素でも値を直接代入してイベントを飛ばす
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function isInteractive(node) {
    if (!node || !(node instanceof Element)) return false;
    if (node.disabled) return false;
    if (node.type === 'hidden') return false;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  // ストレージ操作
  async function loadData() {
    const defaultData = {
      profile: defaultProfile(),
      patterns: {},
      savedSettings: { lastPattern: 'default' }
    };
    const str = typeof GM_getValue === 'function' ? GM_getValue(STORAGE_KEY, '') : localStorage.getItem(STORAGE_KEY);
    if (!str) return defaultData;
    try {
      const data = JSON.parse(str);
      const normalizedPatterns = {};
      Object.entries(data.patterns || {}).forEach(([name, pattern]) => {
        if (pattern && typeof pattern === 'object' && pattern.mapping) {
          normalizedPatterns[name] = { ...pattern, learnedFields: pattern.learnedFields || [] };
        } else {
          normalizedPatterns[name] = { mapping: pattern || {}, learnedFields: [] };
        }
      });
      return {
        ...defaultData,
        ...data,
        profile: { ...defaultData.profile, ...data.profile },
        patterns: normalizedPatterns
      };
    } catch (e) {
      return defaultData;
    }
  }

  async function saveData(data) {
    const str = JSON.stringify(data);
    if (typeof GM_setValue === 'function') GM_setValue(STORAGE_KEY, str);
    else localStorage.setItem(STORAGE_KEY, str);
  }

  function flattenObject(obj, prefix = '') {
    let result = {};
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        Object.assign(result, flattenObject(obj[key], prefix + key + '.'));
      } else {
        result[prefix + key] = obj[key];
      }
    }
    return result;
  }

  function getValueByPath(obj, path) {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  }

  function getLabelText(node) {
    if (!node) return '';
    const id = node.id;
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label) return label.textContent.trim();
    }
    if (node.closest('label')) return node.closest('label').textContent.trim();
    const prevText = node.previousElementSibling && node.previousElementSibling.textContent;
    if (prevText) return prevText.trim();
    const parentLabel = node.parentElement && node.parentElement.querySelector('label');
    if (parentLabel) return parentLabel.textContent.trim();
    return node.placeholder || '';
  }

  function buildSelector(node) {
    if (!node) return '';
    if (node.id) return `#${CSS.escape(node.id)}`;
    if (node.name) return `[name="${CSS.escape(node.name)}"]`;
    if (node.classList.length) return `${node.tagName.toLowerCase()}.${Array.from(node.classList).map(c => CSS.escape(c)).join('.')}`;
    const path = [];
    let elNode = node;
    while (elNode && elNode !== document.body) {
      const siblings = Array.from(elNode.parentElement ? elNode.parentElement.children : []);
      const index = siblings.indexOf(elNode) + 1;
      path.unshift(`${elNode.tagName.toLowerCase()}:nth-child(${index})`);
      elNode = elNode.parentElement;
    }
    return path.length ? path.join(' > ') : '';
  }

  function defaultProfile() {
    return {
      kanji_sei: "", kanji_na: "",
      kana_sei: "", kana_na: "",
      roma_sei: "", roma_na: "",
      sex: "",
      birth: { Y: "", m: "", d: "" },
      address: {
        current: { postal: "", pref: "", city: "", street: "", building: "" },
        vacation: { sameAsCurrent: true, postal: "", pref: "", city: "", street: "", building: "", tel: "" }
      },
      tel: { home: "", mobile: "" },
      email: { primary: "", primaryConfirm: true, secondary: "", secondaryConfirm: false },
      school: {
        kubun: "", kokushi: "", initial: "",
        dname: "", dcd: "",
        bname: "", bcd: "",
        kname: "", paxcd: "",
        from: { Y: "", m: "" }, to: { Y: "", m: "" },
        zemi: "", club: ""
      }
    };
  }

  // ===== コアロジック 1: 学習 (Learn) =====
  function learnPage(profile) {
    const flatProfile = flattenObject(profile);
    const mapping = {};
    const learnedFields = [];
    const inputs = document.querySelectorAll('input, select, textarea');

    let learnedCount = 0;

    for (const node of inputs) {
      if (!isInteractive(node)) continue;

      let val = node.value;
      if (node.type === 'radio' || node.type === 'checkbox') {
        if (!node.checked) continue;
        val = node.value;
      }
      val = String(val || '').trim();
      if (!val) continue;

      const labelText = getLabelText(node);
      const selector = buildSelector(node);
      learnedFields.push({
        label: labelText,
        selector,
        value: val,
        name: node.name || '',
        placeholder: node.placeholder || '',
        tag: node.tagName.toLowerCase(),
        type: node.type || ''
      });

      for (const [key, profVal] of Object.entries(flatProfile)) {
        const isShort = String(profVal).length <= 1;
        const isSafeKey = key.includes('sex') || key.includes('kubun') || key.includes('kokushi');
        if (isShort && !isSafeKey) continue;

        if (String(profVal).trim() === val) {
          if (selector) {
            mapping[key] = selector;
            learnedCount++;
          }
        }
      }
    }
    return { mapping, learnedFields, count: learnedCount };
  }

  // ===== コアロジック 2: 適用 (Fill) =====
  async function fillByPattern(profile, patternEntry, patternName = 'unnamed pattern') {
    const pattern = patternEntry.mapping || patternEntry;
    let count = 0;

    for (const [key, selector] of Object.entries(pattern)) {
      const val = getValueByPath(profile, key);
      if (val === undefined || val === "") continue;

      let nodes;
      try {
        nodes = document.querySelectorAll(selector);
      } catch (error) {
        console.log(`[Autofill] selector not found/invalid for pattern "${patternName}" (key: ${key}): ${selector}`, error);
        continue;
      }

      if (!nodes || nodes.length === 0) {
        console.log(`[Autofill] selector not found/invalid for pattern "${patternName}" (key: ${key}): ${selector}`);
        continue;
      }

      for (const node of nodes) {
        if (!isInteractive(node)) continue;

        if (node.tagName === 'SELECT') {
            let found = false;
            for(const opt of node.options) {
                if(opt.value === val) {
                    node.value = val;
                    found = true; break;
                }
            }
            if(!found) {
                for(const opt of node.options) {
                    if(opt.textContent.trim() === val) {
                        node.value = opt.value;
                        found = true; break;
                    }
                }
            }
            if(found) {
                setNativeValue(node, node.value);
                count++;
            }
        }
        else if (node.type === 'radio' || node.type === 'checkbox') {
            if (selector.includes('[name=')) {
                const nameMatch = selector.match(/name="([^"]+)"/);
                if(nameMatch) {
                    const name = nameMatch[1];
                    const radio = document.querySelector(`input[type="${node.type}"][name="${name}"][value="${val}"]`);
                    if(radio && !radio.checked) {
                        radio.checked = true;
                        radio.dispatchEvent(new Event('change', { bubbles: true }));
                        radio.dispatchEvent(new Event('click', { bubbles: true }));
                        count++;
                    }
                }
            } else {
                if (node.value === val && !node.checked) {
                    node.checked = true;
                    setNativeValue(node, val);
                    count++;
                }
            }
        }
        else {
            setNativeValue(node, val);
            count++;
        }
      }
    }

    if (patternEntry.learnedFields && patternEntry.learnedFields.length) {
      count += await fillLearnedFields(profile, patternEntry.learnedFields, patternName);
    }
    count += await fillSchoolSequence(profile);
    return count;
  }

  function fillDefault(profile) {
    let count = 0;
    const flat = flattenObject(profile);

    for (const [key, val] of Object.entries(flat)) {
        const fieldName = key.split('.').pop();
        const target = document.querySelector(`[name*="${fieldName}"]`);
        if (target && isInteractive(target) && val) {
            if(target.type !== 'radio' && target.type !== 'checkbox') {
                 setNativeValue(target, val);
                 count++;
            }
        }
    }
    return count;
  }

  async function waitForCondition(cond, timeout = 5000, interval = 150) {
    const start = Date.now();
    return new Promise(resolve => {
      const tick = () => {
        if (cond()) return resolve(true);
        if (Date.now() - start > timeout) return resolve(false);
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  function findByLabel(labelText) {
    if (!labelText) return null;
    const labels = Array.from(document.querySelectorAll('label'));
    const label = labels.find(l => l.textContent && l.textContent.trim().includes(labelText.trim()));
    if (label) {
      if (label.htmlFor) return document.getElementById(label.htmlFor);
      const input = label.querySelector('input, select, textarea');
      if (input) return input;
    }
    const candidates = Array.from(document.querySelectorAll('input, select, textarea'));
    return candidates.find(c => getLabelText(c).includes(labelText.trim()));
  }

  async function fillLearnedFields(profile, learnedFields, patternName = 'unnamed pattern') {
    let count = 0;
    const flatProfile = flattenObject(profile);
    for (const field of learnedFields) {
      const { label, selector, value } = field;
      let node = null;
      if (selector) {
        try {
          node = document.querySelector(selector);
        } catch (error) {
          console.log(`[Autofill] selector not found/invalid for pattern "${patternName}" (learned field: ${label || 'unknown'}): ${selector}`, error);
        }
      }
      if (!node) node = findByLabel(label);
      if (!node) {
        console.log(`[Autofill] selector not found/invalid for pattern "${patternName}" (learned field: ${label || 'unknown'}): ${selector || label || 'N/A'}`);
        continue;
      }
      if (!node || !isInteractive(node)) continue;
      let targetVal = value || '';
      if (!targetVal && label) {
        const hit = Object.entries(flatProfile).find(([k]) => label.toLowerCase().includes(k.split('.').pop().toLowerCase()));
        if (hit) targetVal = hit[1];
      }
      if (!targetVal) continue;

      if (node.tagName === 'SELECT') {
        let found = false;
        for (const opt of node.options) {
          if (opt.value === targetVal || opt.textContent.trim() === targetVal) {
            node.value = opt.value;
            found = true;
            break;
          }
        }
        if (found) {
          setNativeValue(node, node.value);
          count++;
        }
      } else if (node.type === 'radio' || node.type === 'checkbox') {
        if (node.value === targetVal) {
          node.checked = true;
          setNativeValue(node, node.value);
          count++;
        }
      } else {
        setNativeValue(node, targetVal);
        count++;
      }
    }
    return count;
  }

  async function fillSchoolSequence(profile) {
    const school = profile.school || {};
    const steps = [
      { key: 'kubun', query: 'select[name*="kubun"], select[id*="kubun"], select[name*="shubetsu"]' },
      { key: 'kokushi', query: 'select[name*="kokushi"], select[id*="kokushi"], select[name*="kokusai"], select[name*="public"]' },
      { key: 'initial', query: 'input[name*="initial"], input[id*="initial"], input[name*="initials"], input[name*="kibana"]' },
      { key: 'dname', query: 'select[name*="dname"], select[id*="dname"], select[name*="school"], select[name*="daigaku"], input[name*="school"], input[name*="daigaku"]' },
      { key: 'bname', query: 'select[name*="bname"], select[id*="bname"], select[name*="gakubu"], input[name*="gakubu"]' },
      { key: 'kname', query: 'select[name*="kname"], select[id*="kname"], select[name*="gakka"], input[name*="gakka"], input[name*="senkou"]' }
    ];

    let count = 0;

    for (const step of steps) {
      const val = school[step.key];
      if (!val) continue;
      const node = document.querySelector(step.query);
      if (!node || !isInteractive(node)) continue;

      if (node.tagName === 'SELECT') {
        let matched = false;
        for (const opt of node.options) {
          if (opt.value === val || opt.textContent.trim() === val) {
            node.value = opt.value;
            matched = true;
            break;
          }
        }
        if (!matched) continue;
        setNativeValue(node, node.value);
        count++;
        await waitForCondition(() => node.options.length > 0, 1200);
      } else {
        setNativeValue(node, val);
        count++;
        node.dispatchEvent(new Event('keyup', { bubbles: true }));
        await waitForCondition(() => true, 350);
      }
    }
    return count;
  }

  // ===== UI 構築 =====
  GM_addStyle(`
    #af-toggle {
      position: fixed; right: 20px; bottom: 20px; z-index: 999990;
      width: 48px; height: 48px; border-radius: 50%;
      background: #2563eb; color: #fff; font-size: 24px; border: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3); cursor: pointer; transition: transform 0.2s;
    }
    #af-toggle:hover { transform: scale(1.1); }
    #af-panel {
      position: fixed; right: 20px; bottom: 80px; z-index: 999999;
      width: 340px; max-height: 80vh; background: #fff; color: #333;
      border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.25);
      display: flex; flex-direction: column; overflow: hidden;
      font-family: sans-serif; font-size: 13px;
    }
    .af-header { background: #f8fafc; padding: 10px; border-bottom: 1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; }
    .af-header h3 { margin:0; font-size:14px; color:#1e293b; font-weight:700; }
    .af-tabs { display: flex; background: #eee; }
    .af-tab { flex: 1; padding: 10px; text-align: center; cursor: pointer; border-bottom: 2px solid transparent; background: #f1f5f9; color: #64748b; }
    .af-tab.active { background: #fff; border-bottom-color: #2563eb; color: #2563eb; font-weight: bold; }
    .af-content { padding: 15px; overflow-y: auto; flex: 1; display: none; }
    .af-content.active { display: block; }
    .af-row { display: flex; gap: 8px; margin-bottom: 8px; }
    .af-row > * { flex: 1; min-width: 0; }
    .af-input { width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; }
    .af-label { display: block; font-weight: bold; margin: 10px 0 4px; font-size: 12px; color: #475569; }
    .af-btn { width: 100%; padding: 8px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; margin-top: 8px; }
    .af-btn-primary { background: #2563eb; color: #fff; }
    .af-btn-primary:hover { background: #1d4ed8; }
    .af-btn-outline { background: #fff; border: 1px solid #cbd5e1; color: #333; }
    .af-msg { margin-top: 8px; font-size: 12px; color: #059669; text-align: center; min-height: 1.5em; }
    .af-btn-running { background: #0f172a !important; color: #fff !important; animation: pulse 0.8s infinite; }
    .af-btn-done { background: #16a34a !important; color: #fff !important; }
    @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }
  `);

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'af-toggle';
  toggleBtn.textContent = '🖊';
  document.body.appendChild(toggleBtn);

  const panel = document.createElement('div');
  panel.id = 'af-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="af-header">
      <h3>AutoFill Panel v0.4.1</h3>
      <button id="af-close" style="background:none;border:none;cursor:pointer;font-size:16px;">×</button>
    </div>
    <div class="af-tabs">
      <div class="af-tab active" data-target="tab-fill">実行 / パターン</div>
      <div class="af-tab" data-target="tab-profile">プロフィール設定</div>
      <div class="af-tab" data-target="tab-manage">パターン管理</div>
    </div>
    <div id="tab-fill" class="af-content active">
      <div class="af-label">適用するパターン</div>
      <select id="af-pattern-select" class="af-input">
        <option value="default">Default (Generic/Axol)</option>
      </select>
      <button id="act-fill" class="af-btn af-btn-primary">自動入力 (Fill)</button>
      <hr style="margin: 15px 0; border-color: #eee;">
      <div class="af-label">⚡ 新しいフォームを学習</div>
      <p style="font-size:11px; color:#666; margin-bottom:8px;">1. 手入力で埋める<br>2. 名前を付けて学習<br>3. 構造が保存されます</p>
      <input id="af-new-pattern-name" class="af-input" placeholder="例: MyNavi_Standard">
      <button id="act-learn" class="af-btn af-btn-outline">このページを学習して保存</button>
      <div id="af-status-msg" class="af-msg"></div>
    </div>
    <div id="tab-profile" class="af-content">
      <div class="af-label">氏名</div>
      <div class="af-row"><input id="p-kanji-sei" class="af-input" placeholder="姓"><input id="p-kanji-na" class="af-input" placeholder="名"></div>
      <div class="af-row"><input id="p-kana-sei" class="af-input" placeholder="セイ"><input id="p-kana-na" class="af-input" placeholder="メイ"></div>
      <div class="af-label">基本情報</div>
      <div class="af-row">
        <select id="p-sex" class="af-input"><option value="">性別</option><option value="1">男</option><option value="2">女</option></select>
        <input id="p-birth-y" class="af-input" placeholder="YYYY">
        <input id="p-birth-m" class="af-input" placeholder="MM">
        <input id="p-birth-d" class="af-input" placeholder="DD">
      </div>
      <div class="af-label">メール / 電話</div>
      <div class="af-row"><input id="p-email" class="af-input" placeholder="Email"><input id="p-email2" class="af-input" placeholder="予備Email"></div>
      <div class="af-row"><input id="p-tel-home" class="af-input" placeholder="自宅 03-0000-0000"><input id="p-tel-mobile" class="af-input" placeholder="携帯 090-0000-0000"></div>
      <div class="af-label">現住所</div>
      <div class="af-row"><input id="p-postal" class="af-input" placeholder="123-4567"><input id="p-pref" class="af-input" placeholder="都道府県"></div>
      <input id="p-city" class="af-input" placeholder="市区町村">
      <input id="p-street" class="af-input" placeholder="番地">
      <input id="p-bldg" class="af-input" placeholder="建物">
      <div class="af-label">休暇中の住所・連絡先</div>
      <label style="display:flex; align-items:center; gap:6px; margin:6px 0;">
        <input id="p-vac-same" type="checkbox" checked> <span>現住所と同じ</span>
      </label>
      <div id="p-vac-fields">
        <div class="af-row"><input id="p-vac-postal" class="af-input" placeholder="休暇中 郵便番号"><input id="p-vac-pref" class="af-input" placeholder="休暇中 都道府県"></div>
        <input id="p-vac-city" class="af-input" placeholder="休暇中 市区町村">
        <input id="p-vac-street" class="af-input" placeholder="休暇中 番地">
        <input id="p-vac-bldg" class="af-input" placeholder="休暇中 建物">
        <input id="p-vac-tel" class="af-input" placeholder="休暇中 電話">
      </div>
      <div class="af-label">学校情報</div>
      <div class="af-row"><input id="p-dname" class="af-input" placeholder="大学名"><input id="p-bname" class="af-input" placeholder="学部名"></div>
      <div class="af-row"><input id="p-kname" class="af-input" placeholder="学科名"></div>
      <button id="act-save-profile" class="af-btn af-btn-primary">プロフィール保存</button>
      <button id="act-export-json" class="af-btn af-btn-outline">JSON書き出し(Console)</button>
    </div>
    <div id="tab-manage" class="af-content">
      <div class="af-label">保存済みパターン一覧</div>
      <select id="af-manage-select" class="af-input"></select>
      <button id="act-delete-pattern" class="af-btn af-btn-outline">選択パターンを削除</button>
      <div class="af-label">内容（JSON編集可）</div>
      <textarea id="af-pattern-json" class="af-input" style="min-height:160px; font-family:monospace;"></textarea>
      <button id="act-save-pattern" class="af-btn af-btn-primary">JSONを保存（上書き）</button>
      <div class="af-msg" id="af-manage-msg"></div>
    </div>
  `;
  document.body.appendChild(panel);

  const togglePanel = () => { panel.style.display = panel.style.display === 'none' ? 'flex' : 'none'; };
  toggleBtn.addEventListener('click', togglePanel);
  el('#af-close').addEventListener('click', togglePanel);

  els('.af-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      els('.af-tab').forEach(t => t.classList.remove('active'));
      els('.af-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      el(`#${tab.dataset.target}`).classList.add('active');
      if (tab.dataset.target === 'tab-manage') {
        (async () => {
          const data = await loadData();
          refreshManagePanel(data, data.savedSettings?.lastPattern);
        })();
      }
    });
  });

  el('#af-pattern-select').addEventListener('change', async () => {
    const data = await loadData();
    data.savedSettings.lastPattern = el('#af-pattern-select').value;
    await saveData(data);
  });

  function updateVacationPanelVisibility() {
    const vacSame = el('#p-vac-same');
    const vacFields = el('#p-vac-fields');
    if (!vacSame || !vacFields) return;
    vacFields.style.display = vacSame.checked ? 'none' : 'block';
  }

  const vacSameCheckbox = el('#p-vac-same');
  if (vacSameCheckbox) {
    vacSameCheckbox.addEventListener('change', updateVacationPanelVisibility);
    updateVacationPanelVisibility();
  }

  function bindProfileToUI(p) {
    el('#p-kanji-sei').value = p.kanji_sei; el('#p-kanji-na').value = p.kanji_na;
    el('#p-kana-sei').value = p.kana_sei; el('#p-kana-na').value = p.kana_na;
    el('#p-sex').value = p.sex;
    el('#p-birth-y').value = p.birth.Y; el('#p-birth-m').value = p.birth.m; el('#p-birth-d').value = p.birth.d;
    el('#p-email').value = p.email.primary;
    el('#p-email2').value = p.email.secondary;
    el('#p-tel-home').value = p.tel.home;
    el('#p-tel-mobile').value = p.tel.mobile;
    el('#p-postal').value = p.address.current.postal;
    el('#p-pref').value = p.address.current.pref;
    el('#p-city').value = p.address.current.city;
    el('#p-street').value = p.address.current.street;
    el('#p-bldg').value = p.address.current.building;
    const vacSame = el('#p-vac-same');
    if (vacSame) vacSame.checked = p.address.vacation.sameAsCurrent;
    const vac = p.address.vacation;
    const vacPostal = el('#p-vac-postal'); if (vacPostal) vacPostal.value = vac.postal;
    const vacPref = el('#p-vac-pref'); if (vacPref) vacPref.value = vac.pref;
    const vacCity = el('#p-vac-city'); if (vacCity) vacCity.value = vac.city;
    const vacStreet = el('#p-vac-street'); if (vacStreet) vacStreet.value = vac.street;
    const vacBldg = el('#p-vac-bldg'); if (vacBldg) vacBldg.value = vac.building;
    const vacTel = el('#p-vac-tel'); if (vacTel) vacTel.value = vac.tel;
    updateVacationPanelVisibility();
    el('#p-dname').value = p.school.dname;
    el('#p-bname').value = p.school.bname;
    el('#p-kname').value = p.school.kname;
  }

  function getProfileFromUI() {
    const p = defaultProfile();
    p.kanji_sei = el('#p-kanji-sei').value; p.kanji_na = el('#p-kanji-na').value;
    p.kana_sei = el('#p-kana-sei').value; p.kana_na = el('#p-kana-na').value;
    p.sex = el('#p-sex').value;
    p.birth.Y = el('#p-birth-y').value; p.birth.m = el('#p-birth-m').value; p.birth.d = el('#p-birth-d').value;
    p.email.primary = el('#p-email').value;
    p.email.secondary = el('#p-email2').value;
    p.email.primaryConfirm = true;
    p.email.secondaryConfirm = !!p.email.secondary;
    p.tel.home = el('#p-tel-home').value;
    p.tel.mobile = el('#p-tel-mobile').value;
    p.address.current.postal = el('#p-postal').value;
    p.address.current.pref = el('#p-pref').value;
    p.address.current.city = el('#p-city').value;
    p.address.current.street = el('#p-street').value;
    p.address.current.building = el('#p-bldg').value;
    const vacSame = el('#p-vac-same');
    p.address.vacation.sameAsCurrent = vacSame ? vacSame.checked : true;
    p.address.vacation.postal = el('#p-vac-postal')?.value || '';
    p.address.vacation.pref = el('#p-vac-pref')?.value || '';
    p.address.vacation.city = el('#p-vac-city')?.value || '';
    p.address.vacation.street = el('#p-vac-street')?.value || '';
    p.address.vacation.building = el('#p-vac-bldg')?.value || '';
    p.address.vacation.tel = el('#p-vac-tel')?.value || '';
    p.school.dname = el('#p-dname').value;
    p.school.bname = el('#p-bname').value;
    p.school.kname = el('#p-kname').value;
    return p;
  }

  el('#act-save-profile').addEventListener('click', async () => {
    const currentData = await loadData();
    currentData.profile = { ...currentData.profile, ...getProfileFromUI() };
    await saveData(currentData);
    el('#af-status-msg').textContent = '✅ プロフィールを保存しました';
    // 修正箇所: アロー関数の書き方を { } ブロックに変更
    setTimeout(() => { el('#af-status-msg').textContent = ''; }, 2000);
  });

  el('#act-learn').addEventListener('click', async () => {
    const name = el('#af-new-pattern-name').value.trim();
    if (!name) { alert('パターン名を入力してください'); return; }

    const data = await loadData();
    if (data.patterns[name] && !confirm(`${name} は既に存在します。上書きしますか？`)) return;
    const result = learnPage(data.profile);

    if (result.count === 0) {
      alert('一致する項目が見つかりませんでした。\nまずフォームを手入力で埋めてください。');
      return;
    }

    data.patterns[name] = { mapping: result.mapping, learnedFields: result.learnedFields };
    await saveData(data);

    updatePatternSelect(data);
    el('#af-pattern-select').value = name;
    el('#af-status-msg').textContent = `✅ ${result.count}項目を学習し "${name}" に保存しました`;
    // 修正箇所: アロー関数の書き方を { } ブロックに変更
    setTimeout(() => { el('#af-status-msg').textContent = ''; }, 2000);
    refreshManagePanel(data, name);
  });

  el('#act-fill').addEventListener('click', async () => {
    const data = await loadData();
    const patternKey = el('#af-pattern-select').value;

    el('#act-fill').classList.add('af-btn-running');
    el('#act-fill').textContent = '自動入力中...';

    let filledCount = 0;
    if (patternKey === 'default') {
      filledCount = fillDefault(data.profile);
    } else {
      const pattern = data.patterns[patternKey];
      if (pattern) {
        filledCount = await fillByPattern(data.profile, pattern, patternKey);
      }
    }
    el('#af-status-msg').textContent = `✨ ${filledCount} 箇所に入力しました`;
    el('#act-fill').classList.remove('af-btn-running');
    el('#act-fill').classList.add('af-btn-done');
    el('#act-fill').textContent = '自動入力 完了!';
    setTimeout(() => {
      el('#af-status-msg').textContent = '';
      el('#act-fill').classList.remove('af-btn-done');
      el('#act-fill').textContent = '自動入力 (Fill)';
    }, FILL_FEEDBACK_MS);
  });

  el('#act-export-json').addEventListener('click', async () => {
      const data = await loadData();
      console.log(JSON.stringify(data, null, 2));
      alert('開発者ツールのConsoleに出力しました');
  });

  el('#af-manage-select')?.addEventListener('change', async () => {
    const data = await loadData();
    refreshManagePanel(data, el('#af-manage-select').value);
  });

  el('#act-delete-pattern')?.addEventListener('click', async () => {
    const key = el('#af-manage-select').value;
    if (!key) return;
    if (!confirm(`${key} を削除しますか？`)) return;
    const data = await loadData();
    delete data.patterns[key];
    await saveData(data);
    refreshManagePanel(data);
    el('#af-manage-msg').textContent = '🗑️ 削除しました';
    setTimeout(() => { el('#af-manage-msg').textContent = ''; }, 2000);
  });

  el('#act-save-pattern')?.addEventListener('click', async () => {
    const key = el('#af-manage-select').value;
    if (!key) { el('#af-manage-msg').textContent = 'パターンを選択してください'; return; }
    try {
      const parsed = JSON.parse(el('#af-pattern-json').value || '{}');
      const data = await loadData();
      data.patterns[key] = parsed;
      await saveData(data);
      refreshManagePanel(data, key);
      el('#af-manage-msg').textContent = '💾 上書き保存しました';
      setTimeout(() => { el('#af-manage-msg').textContent = ''; }, 2000);
    } catch (e) {
      el('#af-manage-msg').textContent = 'JSONの形式が正しくありません';
    }
  });

  function updatePatternSelect(data) {
    const sel = el('#af-pattern-select');
    sel.innerHTML = '<option value="default">Default (Generic/Axol)</option>';
    Object.keys(data.patterns).forEach(key => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      sel.appendChild(opt);
    });

    const manageSel = el('#af-manage-select');
    if (manageSel) {
      manageSel.innerHTML = '';
      Object.keys(data.patterns).forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key;
        manageSel.appendChild(opt);
      });
    }
  }

  function refreshManagePanel(data, selected) {
    updatePatternSelect(data);
    const manageSel = el('#af-manage-select');
    if (!manageSel) return;
    if (selected && data.patterns[selected]) manageSel.value = selected;
    const currentKey = manageSel.value || Object.keys(data.patterns)[0];
    if (currentKey && data.patterns[currentKey]) {
      el('#af-pattern-json').value = JSON.stringify(data.patterns[currentKey], null, 2);
    } else {
      el('#af-pattern-json').value = '';
    }
  }

  (async () => {
    const data = await loadData();
    bindProfileToUI(data.profile);
    updatePatternSelect(data);
    refreshManagePanel(data, data.savedSettings?.lastPattern);
  })();

})();
