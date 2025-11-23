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

  // ===== ユーティリティ =====
  const log = (...a) => DEBUG && console.log('[Autofill]', ...a);
  const el = (sel, root = document) => root.querySelector(sel);
  const els = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // React/Vueなどのフレームワーク対策
  function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value').set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;

    if (valueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else {
      valueSetter.call(element, value);
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
      return { ...defaultData, ...data, profile: { ...defaultData.profile, ...data.profile } };
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
      email: { primary: "", secondary: "" },
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
    const inputs = document.querySelectorAll('input, select, textarea');

    let learnedCount = 0;

    // for...of ループに変更（警告対策）
    for (const node of inputs) {
      if (!isInteractive(node)) continue;

      let val = node.value;
      if (node.type === 'radio' || node.type === 'checkbox') {
        if (!node.checked) continue;
        val = node.value;
      }
      val = String(val || '').trim();
      if (!val) continue;

      for (const [key, profVal] of Object.entries(flatProfile)) {
        const isShort = String(profVal).length <= 1;
        const isSafeKey = key.includes('sex') || key.includes('kubun') || key.includes('kokushi');
        if (isShort && !isSafeKey) continue;

        if (String(profVal).trim() === val) {
          let selector = '';
          if (node.id) {
            selector = `#${CSS.escape(node.id)}`;
          } else if (node.name) {
            selector = `[name="${CSS.escape(node.name)}"]`;
          }

          if (selector) {
            mapping[key] = selector;
            learnedCount++;
          }
        }
      }
    }
    return { mapping, count: learnedCount };
  }

  // ===== コアロジック 2: 適用 (Fill) =====
  function fillByPattern(profile, pattern) {
    let count = 0;

    for (const [key, selector] of Object.entries(pattern)) {
      const val = getValueByPath(profile, key);
      if (val === undefined || val === "") continue;

      const nodes = document.querySelectorAll(selector);

      // for...of ループに変更（警告対策）
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
      <input id="p-email" class="af-input" placeholder="Email">
      <div class="af-row"><input id="p-tel-mobile" class="af-input" placeholder="携帯 090-0000-0000"></div>
      <div class="af-label">現住所</div>
      <div class="af-row"><input id="p-postal" class="af-input" placeholder="123-4567"><input id="p-pref" class="af-input" placeholder="都道府県"></div>
      <input id="p-city" class="af-input" placeholder="市区町村">
      <input id="p-street" class="af-input" placeholder="番地">
      <input id="p-bldg" class="af-input" placeholder="建物">
      <div class="af-label">学校情報</div>
      <div class="af-row"><input id="p-dname" class="af-input" placeholder="大学名"><input id="p-bname" class="af-input" placeholder="学部名"></div>
      <div class="af-row"><input id="p-kname" class="af-input" placeholder="学科名"></div>
      <button id="act-save-profile" class="af-btn af-btn-primary">プロフィール保存</button>
      <button id="act-export-json" class="af-btn af-btn-outline">JSON書き出し(Console)</button>
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
    });
  });

  function bindProfileToUI(p) {
    el('#p-kanji-sei').value = p.kanji_sei; el('#p-kanji-na').value = p.kanji_na;
    el('#p-kana-sei').value = p.kana_sei; el('#p-kana-na').value = p.kana_na;
    el('#p-sex').value = p.sex;
    el('#p-birth-y').value = p.birth.Y; el('#p-birth-m').value = p.birth.m; el('#p-birth-d').value = p.birth.d;
    el('#p-email').value = p.email.primary;
    el('#p-tel-mobile').value = p.tel.mobile;
    el('#p-postal').value = p.address.current.postal;
    el('#p-pref').value = p.address.current.pref;
    el('#p-city').value = p.address.current.city;
    el('#p-street').value = p.address.current.street;
    el('#p-bldg').value = p.address.current.building;
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
    p.tel.mobile = el('#p-tel-mobile').value;
    p.address.current.postal = el('#p-postal').value;
    p.address.current.pref = el('#p-pref').value;
    p.address.current.city = el('#p-city').value;
    p.address.current.street = el('#p-street').value;
    p.address.current.building = el('#p-bldg').value;
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
    const result = learnPage(data.profile);

    if (result.count === 0) {
      alert('一致する項目が見つかりませんでした。\nまずフォームを手入力で埋めてください。');
      return;
    }

    data.patterns[name] = result.mapping;
    await saveData(data);

    updatePatternSelect(data);
    el('#af-pattern-select').value = name;
    el('#af-status-msg').textContent = `✅ ${result.count}項目を学習し "${name}" に保存しました`;
    // 修正箇所: アロー関数の書き方を { } ブロックに変更
    setTimeout(() => { el('#af-status-msg').textContent = ''; }, 2000);
  });

  el('#act-fill').addEventListener('click', async () => {
    const data = await loadData();
    const patternKey = el('#af-pattern-select').value;

    let filledCount = 0;
    if (patternKey === 'default') {
      filledCount = fillDefault(data.profile);
    } else {
      const pattern = data.patterns[patternKey];
      if (pattern) {
        filledCount = fillByPattern(data.profile, pattern);
      }
    }
    el('#af-status-msg').textContent = `✨ ${filledCount} 箇所に入力しました`;
    setTimeout(() => { el('#af-status-msg').textContent = ''; }, 2000);
  });

  el('#act-export-json').addEventListener('click', async () => {
      const data = await loadData();
      console.log(JSON.stringify(data, null, 2));
      alert('開発者ツールのConsoleに出力しました');
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
  }

  (async () => {
    const data = await loadData();
    bindProfileToUI(data.profile);
    updatePatternSelect(data);
  })();

})();
