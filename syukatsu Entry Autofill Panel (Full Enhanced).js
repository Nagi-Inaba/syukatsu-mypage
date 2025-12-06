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
  const PREFECTURES = [
    '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
    '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
    '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
    '熊本県','大分県','宮崎県','鹿児島県','沖縄県'
  ];
  const SCHOOL_TYPES = ['大学院', '学部', '短大', '専門学校', '高専'];

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
  function defaultPattern() {
    return {
      mapping: {
        kanji_sei: '[name="kanji_sei"], #kanji_sei',
        kanji_na: '[name="kanji_na"], #kanji_na',
        kana_sei: '[name="kana_sei"], #kana_sei',
        kana_na: '[name="kana_na"], #kana_na',
        roma_sei: '[name="roma_sei"], #roma_sei',
        roma_na: '[name="roma_na"], #roma_na',
        sex: 'input[name="sex"]',
        bunkeiRikei: 'select[name*="bunkei"], select[id*="bunkei"]',
        'birth.Y': '[name="birth_Y"], #birth_Y',
        'birth.m': '[name="birth_m"], #birth_m',
        'birth.d': '[name="birth_d"], #birth_d',
        'address.current.pref': '#keng, select[name*="pref"], select[id*="pref"]',
        'address.current.city': '[name="jushog1"], #jushog1',
        'address.current.street': '[name="jushog2"], #jushog2',
        'address.current.building': '[name="jushog3"], #jushog3',
        'address.vacation.sameAsCurrent': 'input[name="jushosame"]',
        'address.vacation.pref': '#kenk, select[name*="kenk"], select[id*="kenk"]',
        'address.vacation.city': '[name="jushok1"], #jushok1',
        'address.vacation.street': '[name="jushok2"], #jushok2',
        'address.vacation.building': '[name="jushok3"], #jushok3',
        'tel.home': 'input[name^="telg"], #telg_h',
        'tel.mobile': 'input[name^="keitai"], #keitai_h',
        'email.primary': '[name="email"], #email',
        'email.secondary': '[name="kmail"], #kmail',
        'school.kubun': '[name="kubun"], #kubun',
        'school.kokushi': '[name="kokushi"], #kokushi',
        'school.initial': '[name="initial"], #initial',
        'school.dname': '[name="dname"], select[name="dcd"], #dname',
        'school.bname': '[name="bname"], select[name="bcd"], #bname',
        'school.kname': '[name="kname"], select[name="paxcd"], #kname',
        'school.from.Y': '[name="school_from_Y"], #school_from_Y',
        'school.from.m': '[name="school_from_m"], #school_from_m',
        'school.to.Y': '[name="school_to_Y"], #school_to_Y',
        'school.to.m': '[name="school_to_m"], #school_to_m',
        'school.zemi': '[name="zemi"], #zemi',
        'school.club': '[name="club"], #club'
      },
      learnedFields: [
        { label: '郵便番号(現住所)上3桁', selector: 'input[name="yubing_h"]', value: '' },
        { label: '郵便番号(現住所)下4桁', selector: 'input[name="yubing_l"]', value: '' },
        { label: '郵便番号(休暇中)上3桁', selector: 'input[name="yubink_h"]', value: '' },
        { label: '郵便番号(休暇中)下4桁', selector: 'input[name="yubink_l"]', value: '' },
        { label: 'メール確認', selector: 'input[name="email2"]', value: '' },
        { label: '予備メール確認', selector: 'input[name="kmail2"]', value: '' }
      ]
    };
  }

  async function loadData() {
    const defaultData = {
      profile: defaultProfile(),
      patterns: { default: defaultPattern() },
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
      const mergedProfile = { ...defaultData.profile, ...data.profile };
      mergedProfile.schoolEntries = Array.isArray(data.profile?.schoolEntries) && data.profile.schoolEntries.length
        ? data.profile.schoolEntries.map(s => ({ ...defaultSchoolEntry(s.category || '学部'), ...s, id: s.id || generateSchoolId() }))
        : [
            data.profile?.school
              ? { ...defaultSchoolEntry(data.profile.school.category || '学部'), ...data.profile.school, id: generateSchoolId() }
              : { ...defaultSchoolEntry('学部') }
          ];
      mergedProfile.school = { ...mergedProfile.schoolEntries[0] };

      return {
        ...defaultData,
        ...data,
        profile: mergedProfile,
        patterns: { ...defaultData.patterns, ...normalizedPatterns }
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

  const generateSchoolId = () => `school-${Math.random().toString(36).slice(2, 8)}`;

  function defaultSchoolEntry(category = '学部') {
    return {
      id: generateSchoolId(),
      category,
      kubun: '私立',
      kokushi: '',
      initial: '',
      pref: '',
      dname: '', dcd: '',
      bname: '', bcd: '',
      kname: '', paxcd: '',
      from: { Y: '', m: '' }, to: { Y: '', m: '' },
      zemi: '', club: ''
    };
  }

  function defaultProfile() {
    const baseSchool = defaultSchoolEntry('学部');
    return {
      kanji_sei: "", kanji_na: "",
      kana_sei: "", kana_na: "",
      roma_sei: "", roma_na: "",
      sex: "1",
      bunkeiRikei: "1",
      birth: { Y: "", m: "", d: "" },
      address: {
        current: { postal: "", pref: "", city: "", street: "", building: "" },
        vacation: { sameAsCurrent: true, postal: "", pref: "", city: "", street: "", building: "", tel: "" }
      },
      tel: { home: "", mobile: "" },
      email: { primary: "", primaryConfirm: true, secondary: "", secondaryConfirm: false },
      school: { ...baseSchool },
      schoolEntries: [{ ...baseSchool }],
      highSchool: {
        name: "", pref: "", initial: "", department: "", major: "",
        from: { Y: "", m: "" }, to: { Y: "", m: "" }
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
        const isSafeKey = key.includes('sex') || key.includes('kubun') || key.includes('kokushi') || key.includes('initial');
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
            if (node.type === 'checkbox' && typeof val === 'boolean') {
                if (node.checked !== val) {
                    node.checked = val;
                    node.dispatchEvent(new Event('change', { bubbles: true }));
                    node.dispatchEvent(new Event('click', { bubbles: true }));
                    count++;
                }
                continue;
            }
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
        if (!target || !isInteractive(target)) continue;

        const stringVal = typeof val === 'boolean' ? String(val) : String(val || '');

        if (target.tagName === 'SELECT') {
            if (!stringVal) continue;
            let matched = false;
            for (const opt of target.options) {
                if (opt.value === stringVal || opt.textContent.trim() === stringVal) {
                    target.value = opt.value;
                    matched = true;
                    break;
                }
            }
            if (matched) {
                setNativeValue(target, target.value);
                count++;
            }
        } else if (target.type === 'radio') {
            const name = target.name;
            const radios = name ? document.querySelectorAll(`input[type="radio"][name="${name}"]`) : [target];
            for (const radio of radios) {
                if (!isInteractive(radio)) continue;
                if (radio.value === stringVal && !radio.checked) {
                    radio.checked = true;
                    radio.dispatchEvent(new Event('change', { bubbles: true }));
                    radio.dispatchEvent(new Event('click', { bubbles: true }));
                    count++;
                    break;
                }
            }
        } else if (target.type === 'checkbox') {
            const shouldCheck = typeof val === 'boolean' ? val : target.value === stringVal;
            if (target.checked !== shouldCheck) {
                target.checked = shouldCheck;
                target.dispatchEvent(new Event('change', { bubbles: true }));
                target.dispatchEvent(new Event('click', { bubbles: true }));
                count++;
            }
        } else if (stringVal) {
            setNativeValue(target, stringVal);
            count++;
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

  function detectSchoolCategoryFromForm() {
    const textNodes = [];
    document.querySelectorAll('label, legend, h1, h2, h3, th, td, p').forEach(elm => {
      if (elm && elm.textContent) textNodes.push(elm.textContent);
    });
    const allText = textNodes.join(' ');
    for (const type of SCHOOL_TYPES) {
      if (allText.includes(type)) return type;
    }
    return '学部';
  }

  function pickSchoolEntry(profile) {
    const entries = (profile.schoolEntries && profile.schoolEntries.length ? profile.schoolEntries : [])
      .map(e => ({ ...defaultSchoolEntry(e.category || '学部'), ...e }));
    if (!entries.length && profile.school) entries.push({ ...defaultSchoolEntry(profile.school.category || '学部'), ...profile.school });
    const requested = detectSchoolCategoryFromForm();
    return entries.find(e => e.category === requested) || entries[0] || null;
  }

  function setSelectValueByText(select, value) {
    if (!select || !value) return false;
    for (const opt of select.options) {
      if (opt.value === value || opt.textContent.trim() === value) {
        select.value = opt.value;
        setNativeValue(select, select.value);
        return true;
      }
    }
    return false;
  }

  function fillSelectsByOptionCandidates(candidates, value, filterFn = () => true) {
    if (!value) return 0;
    let count = 0;
    const selects = Array.from(document.querySelectorAll('select')).filter(filterFn);
    for (const sel of selects) {
      const hasCandidate = Array.from(sel.options).some(opt => candidates.some(c => (opt.textContent || '').includes(c)));
      if (!hasCandidate || !isInteractive(sel)) continue;
      if (setSelectValueByText(sel, value)) count++;
    }
    return count;
  }

  function isSchoolPrefTarget(select) {
    const label = (getLabelText(select) || '').toLowerCase();
    if (label.includes('現住所') || label.includes('休暇') || label.includes('連絡')) return false;
    if (label.includes('学校') || label.includes('所在地') || label.includes('キャンパス') || label.includes('最終学歴')) return true;
    const areaText = (select.closest('div, tr, section, label')?.textContent || '').toLowerCase();
    if (areaText.includes('学校') || areaText.includes('学歴') || areaText.includes('キャンパス')) return true;
    return !label;
  }

  function clickInitialButton(initial) {
    if (!initial) return false;
    const candidates = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a'));
    for (const btn of candidates) {
      if (!isInteractive(btn)) continue;
      const text = (btn.value || btn.textContent || '').trim();
      if (!text) continue;
      if (text.toLowerCase() === initial.toLowerCase()) {
        btn.click();
        btn.dispatchEvent(new Event('change', { bubbles: true }));
        btn.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  async function fillSchoolSequence(profile) {
    const school = pickSchoolEntry(profile);
    if (!school) return 0;
    profile.school = { ...school };

    let count = 0;
    count += fillSelectsByOptionCandidates(SCHOOL_TYPES, school.category);
    count += fillSelectsByOptionCandidates(['私立', '公立'], school.kubun);
    count += fillSelectsByOptionCandidates(PREFECTURES, school.pref, isSchoolPrefTarget);

    const steps = [
      { key: 'initial', query: 'input[name*="initial"], input[id*="initial"], input[name*="initials"], input[name*="kibana"]' },
      { key: 'dname', query: 'select[name*="dname"], select[id*="dname"], select[name*="school"], select[name*="daigaku"], input[name*="school"], input[name*="daigaku"]' },
      { key: 'bname', query: 'select[name*="bname"], select[id*="bname"], select[name*="gakubu"], input[name*="gakubu"], input[name*="course"]' },
      { key: 'kname', query: 'select[name*="kname"], select[id*="kname"], select[name*="gakka"], input[name*="gakka"], input[name*="senkou"]' }
    ];

    for (const step of steps) {
      const val = school[step.key];
      if (!val) continue;
      let node = null;
      try {
        node = document.querySelector(step.query);
      } catch (error) {
        log('school step selector error', step.query, error);
      }
      if (!node || !isInteractive(node)) continue;

      if (node.tagName === 'SELECT') {
        if (setSelectValueByText(node, val)) count++;
      } else {
        setNativeValue(node, val);
        count++;
        node.dispatchEvent(new Event('keyup', { bubbles: true }));
        await waitForCondition(() => true, 350);
      }
    }

    if (school.initial && clickInitialButton(school.initial)) count++;
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
    .af-label-inline { display:flex; align-items:center; gap:8px; margin: 8px 0 4px; }
    .af-school-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; margin-bottom: 10px; background:#f8fafc; }
    .af-school-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
    .af-school-title { font-weight:700; font-size:12px; color:#1e293b; }
    .af-remove-btn { background:none; border:none; color:#64748b; cursor:pointer; font-size:14px; }
    .af-remove-btn:hover { color:#ef4444; }
    .af-btn { width: 100%; padding: 8px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; margin-top: 8px; }
    .af-btn-primary { background: #2563eb; color: #fff; }
    .af-btn-primary:hover { background: #1d4ed8; }
    .af-btn-outline { background: #fff; border: 1px solid #cbd5e1; color: #333; }
    .af-btn-icon { display:flex; align-items:center; justify-content:center; gap:6px; }
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
      <div class="af-row"><input id="p-roma-sei" class="af-input" placeholder="ROMA-SEI"><input id="p-roma-na" class="af-input" placeholder="ROMA-MEI"></div>
      <div class="af-label">基本情報</div>
      <div class="af-row">
        <select id="p-sex" class="af-input"><option value="">性別</option><option value="1">男</option><option value="2">女</option></select>
        <input id="p-birth-y" class="af-input" placeholder="YYYY">
        <input id="p-birth-m" class="af-input" placeholder="MM">
        <input id="p-birth-d" class="af-input" placeholder="DD">
      </div>
      <div class="af-row" style="margin-top:4px;">
        <label class="af-label" style="margin:0; flex:1;">文理区分</label>
        <select id="p-bunkei-rikei" class="af-input">
          <option value="">選択</option>
          <option value="文系">文系</option>
          <option value="理系">理系</option>
        </select>
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
      <div class="af-label">現在/直近の学校情報</div>
      <div id="p-school-container"></div>
      <button id="p-add-school" class="af-btn af-btn-outline af-btn-icon"><span>＋</span><span>学校を追加</span></button>
      <div class="af-label">高校情報</div>
      <div class="af-row"><input id="p-hs-name" class="af-input" placeholder="高校名"><input id="p-hs-initial" class="af-input" placeholder="略称/イニシャル"></div>
      <div class="af-row"><input id="p-hs-pref" class="af-input" placeholder="都道府県"><input id="p-hs-department" class="af-input" placeholder="学科"></div>
      <div class="af-row"><input id="p-hs-major" class="af-input" placeholder="専攻 / コース"></div>
      <div class="af-row"><input id="p-hs-from-y" class="af-input" placeholder="入学年 YYYY"><input id="p-hs-from-m" class="af-input" placeholder="入学月 MM"></div>
      <div class="af-row"><input id="p-hs-to-y" class="af-input" placeholder="卒業年 YYYY"><input id="p-hs-to-m" class="af-input" placeholder="卒業月 MM"></div>
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

  function buildPrefectureOptions(selected = '') {
    return '<option value="">都道府県</option>' + PREFECTURES.map(p => `<option value="${p}" ${p === selected ? 'selected' : ''}>${p}</option>`).join('');
  }

  function renderSchoolEntries(entries = []) {
    const container = el('#p-school-container');
    if (!container) return;
    const normalized = entries.length ? entries : [defaultSchoolEntry('学部')];
    container.innerHTML = '';

    normalized.forEach((entry, idx) => {
      const card = document.createElement('div');
      card.className = 'af-school-card';
      card.dataset.schoolId = entry.id || generateSchoolId();
      card.dataset.fromY = entry.from?.Y || '';
      card.dataset.fromM = entry.from?.m || '';
      card.dataset.toY = entry.to?.Y || '';
      card.dataset.toM = entry.to?.m || '';
      card.dataset.zemi = entry.zemi || '';
      card.dataset.club = entry.club || '';

      const typeOptions = SCHOOL_TYPES.map(t => `<option value="${t}" ${t === entry.category ? 'selected' : ''}>${t}</option>`).join('');
      const prefOptions = buildPrefectureOptions(entry.pref || '');
      const canRemove = normalized.length > 1;

      card.innerHTML = `
        <div class="af-school-header">
          <span class="af-school-title">${entry.category || '学校情報'}</span>
          ${canRemove ? '<button class="af-remove-btn" title="削除">×</button>' : ''}
        </div>
        <div class="af-row">
          <select class="af-input" data-field="category">${typeOptions}</select>
          <select class="af-input" data-field="kubun">
            <option value="">区分</option>
            <option value="私立" ${entry.kubun === '私立' ? 'selected' : ''}>私立</option>
            <option value="公立" ${entry.kubun === '公立' ? 'selected' : ''}>公立</option>
          </select>
        </div>
        <div class="af-row">
          <input class="af-input" data-field="initial" placeholder="頭文字" value="${entry.initial || ''}">
          <select class="af-input" data-field="pref">${prefOptions}</select>
        </div>
        <div class="af-row"><input class="af-input" data-field="dname" placeholder="学校名" value="${entry.dname || ''}"><input class="af-input" data-field="bname" placeholder="学部 / コース" value="${entry.bname || ''}"></div>
        <div class="af-row"><input class="af-input" data-field="kname" placeholder="学科 / 専攻" value="${entry.kname || ''}"></div>
      `;

      const typeSelect = card.querySelector('[data-field="category"]');
      const headerTitle = card.querySelector('.af-school-title');
      if (typeSelect && headerTitle) {
        typeSelect.addEventListener('change', () => {
          headerTitle.textContent = typeSelect.value || '学校情報';
        });
      }
      const removeBtn = card.querySelector('.af-remove-btn');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          card.remove();
          if (!els('.af-school-card', container).length) renderSchoolEntries([defaultSchoolEntry('学部')]);
        });
      }
      container.appendChild(card);
    });
  }

  function readSchoolEntriesFromUI() {
    const container = el('#p-school-container');
    if (!container) return [];
    return els('.af-school-card', container).map(card => {
      const getField = sel => el(sel, card)?.value || '';
      return {
        id: card.dataset.schoolId || generateSchoolId(),
        category: getField('[data-field="category"]') || '学部',
        kubun: getField('[data-field="kubun"]'),
        kokushi: getField('[data-field="kubun"]'),
        initial: getField('[data-field="initial"]'),
        pref: getField('[data-field="pref"]'),
        dname: getField('[data-field="dname"]'),
        bname: getField('[data-field="bname"]'),
        kname: getField('[data-field="kname"]'),
        from: { Y: card.dataset.fromY || '', m: card.dataset.fromM || '' },
        to: { Y: card.dataset.toY || '', m: card.dataset.toM || '' },
        zemi: card.dataset.zemi || '',
        club: card.dataset.club || ''
      };
    });
  }

  const addSchoolBtn = el('#p-add-school');
  if (addSchoolBtn) {
    addSchoolBtn.addEventListener('click', () => {
      const entries = readSchoolEntriesFromUI();
      const nextCategory = entries.length ? entries[entries.length - 1].category : SCHOOL_TYPES[0];
      entries.push(defaultSchoolEntry(nextCategory));
      renderSchoolEntries(entries);
    });
  }

  function bindProfileToUI(p) {
    el('#p-kanji-sei').value = p.kanji_sei; el('#p-kanji-na').value = p.kanji_na;
    el('#p-kana-sei').value = p.kana_sei; el('#p-kana-na').value = p.kana_na;
    const romaSei = el('#p-roma-sei'); if (romaSei) romaSei.value = p.roma_sei;
    const romaNa = el('#p-roma-na'); if (romaNa) romaNa.value = p.roma_na;
    el('#p-sex').value = p.sex;
    el('#p-bunkei-rikei').value = p.bunkeiRikei;
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
    renderSchoolEntries(p.schoolEntries && p.schoolEntries.length ? p.schoolEntries : (p.school ? [p.school] : []));
    el('#p-hs-name').value = p.highSchool.name;
    el('#p-hs-initial').value = p.highSchool.initial;
    el('#p-hs-pref').value = p.highSchool.pref;
    el('#p-hs-department').value = p.highSchool.department;
    el('#p-hs-major').value = p.highSchool.major;
    el('#p-hs-from-y').value = p.highSchool.from.Y;
    el('#p-hs-from-m').value = p.highSchool.from.m;
    el('#p-hs-to-y').value = p.highSchool.to.Y;
    el('#p-hs-to-m').value = p.highSchool.to.m;
  }

  function getProfileFromUI() {
    const p = defaultProfile();
    p.kanji_sei = el('#p-kanji-sei').value; p.kanji_na = el('#p-kanji-na').value;
    p.kana_sei = el('#p-kana-sei').value; p.kana_na = el('#p-kana-na').value;
    p.roma_sei = el('#p-roma-sei')?.value || '';
    p.roma_na = el('#p-roma-na')?.value || '';
    p.sex = el('#p-sex').value;
    p.bunkeiRikei = el('#p-bunkei-rikei').value;
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
    p.schoolEntries = readSchoolEntriesFromUI();
    if (!p.schoolEntries.length) p.schoolEntries = [defaultSchoolEntry('学部')];
    p.school = { ...p.schoolEntries[0] };
    p.highSchool.name = el('#p-hs-name').value;
    p.highSchool.initial = el('#p-hs-initial').value;
    p.highSchool.pref = el('#p-hs-pref').value;
    p.highSchool.department = el('#p-hs-department').value;
    p.highSchool.major = el('#p-hs-major').value;
    p.highSchool.from.Y = el('#p-hs-from-y').value;
    p.highSchool.from.m = el('#p-hs-from-m').value;
    p.highSchool.to.Y = el('#p-hs-to-y').value;
    p.highSchool.to.m = el('#p-hs-to-m').value;
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
      const preset = data.patterns?.default;
      if (preset && preset.mapping) {
        filledCount = await fillByPattern(data.profile, preset, 'default');
      } else {
        filledCount = fillDefault(data.profile);
      }
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
