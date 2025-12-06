// ==UserScript==
// @name syukatsu Entry Autofill Panel
// @namespace https://github.com/Nagi-Inaba/syukatsu-autofill
// @version 0.3.0
// @description 浮かぶ操作パネルに入力→保存→ワンクリック自動入力（個人情報は保存先のブラウザにのみ保持）
// @author you
// @match https://job.axol.jp/bx/s/*/entry/input*
// @match https://job.axol.jp/bx/s/*/navi/input*
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_addStyle
// @run-at document-idle
// @install https://github.com/Nagi-Inaba/syukatsu-mypage/raw/refs/heads/main/syukatsu-autofill.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ===== 設定 =====
  const STORAGE_KEY = 'syukatsu_autofill_profile';
  const AUTO_SUBMIT = false; // 入力後に送信を自動実行するなら true
  const DEBUG = false;
  const PREFECTURES = [
    '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
    '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
    '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
    '熊本県','大分県','宮崎県','鹿児島県','沖縄県'
  ];
  const SCHOOL_TYPES = ['大学院', '学部', '短大', '専門学校', '高専'];

  // ===== 汎用ユーティリティ =====
  const gmHas = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  const saveJSON = async (key, data) => {
    const str = JSON.stringify(data);
    if (gmHas) return GM_setValue(key, str);
    localStorage.setItem(key, str);
  };
  const loadJSON = async (key, fallback = {}) => {
    const str = gmHas ? GM_getValue(key, '') : localStorage.getItem(key) || '';
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
  };
  const el = (sel, root=document) => root.querySelector(sel);
  const els = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const triggerInput = (node) => {
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const log = (...a) => DEBUG && console.log('[autofill]', ...a);

  function isElementInteractive(node) {
    if (!node || !(node instanceof Element)) return false;
    if (node.hasAttribute('aria-hidden') && node.getAttribute('aria-hidden') === 'true') return false;
    if (node.disabled) return false;
    const style = window.getComputedStyle(node);
    if (!style) return false;
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    if (node.type === 'hidden') return false;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  function getInteractiveFieldByName(name) {
    const field = el(`[name="${CSS.escape(name)}"]`);
    if (!field) return null;
    if (!isElementInteractive(field)) return null;
    return field;
  }

  // ===== Select操作（テキスト or 値一致） =====
  function selectByTextOrValue(selectEl, desired) {
    if (!selectEl) return false;
    const want = String(desired ?? '').trim();
    if (!want) return false;

    const currentValue = String(selectEl.value ?? '');
    if (currentValue !== '') {
      if (currentValue === want) return true;
      const selectedOption = selectEl.selectedOptions && selectEl.selectedOptions[0];
      if (selectedOption) {
        const norm = (s) => String(s || '').replace(/\s+/g, '');
        if (norm(selectedOption.textContent) === norm(want)) return true;
      }
      return false;
    }

    // value一致
    for (const opt of selectEl.options) {
      if (String(opt.value) === want) {
        selectEl.value = opt.value;
        triggerInput(selectEl);
        return true;
      }
    }
    // テキスト一致（空白無視）
    const norm = (s) => String(s).replace(/\s+/g, '');
    for (const opt of selectEl.options) {
      if (norm(opt.textContent) === norm(want)) {
        selectEl.value = opt.value;
        triggerInput(selectEl);
        return true;
      }
    }
    return false;
  }

  // ===== 分割入力（郵便・電話） =====
  function parsePostal(str) {
    const s = String(str || '').replace(/[^\d]/g, '');
    if (!s) return ['', ''];
    if (s.length >= 7) return [s.slice(0, 3), s.slice(3, 7)];
    const hy = String(str || '');
    if (hy.includes('-')) {
      const [h, l] = hy.split('-');
      return [h || '', l || ''];
    }
    return [s.slice(0, 3), s.slice(3)];
  }
  function parsePhone(str) {
    const raw = String(str || '').trim();
    if (!raw) return ['', '', ''];
    if (raw.includes('-')) {
      const p = raw.split('-').map(s => s.trim());
      return [p[0] || '', p[1] || '', p[2] || ''];
    }
    const d = raw.replace(/[^\d]/g, '');
    if (d.length >= 10) return [d.slice(0, 3), d.slice(3, 7), d.slice(7)];
    return [d, '', ''];
  }

  function issyukatsuEntryPage() {
    const b = document.body;
    return b && (b.id === 'entry_input' || /(\/entry\/input|\/navi\/input)/.test(location.pathname));
  }

  const generateSchoolId = () => `school-${Math.random().toString(36).slice(2, 8)}`;

  function defaultSchoolEntry(category = '学部') {
    return {
      id: generateSchoolId(),
      category,
      kubun: '私立',
      kokushi: '私立',
      pref: '',
      initial: '',
      dcd: '', dname: '',
      bcd: '', bname: '',
      paxcd: '', kname: '',
      from: { Y: '', m: '' }, to: { Y: '', m: '' },
      zemi: '', club: ''
    };
  }

  function fillFieldByName(name, value) {
    const node = el(`[name="${CSS.escape(name)}"]`);
    if (!node) return false;

    const desired = value == null ? '' : String(value);

    if (node.tagName === 'SELECT') {
      const currentValue = String(node.value ?? '');
      if (currentValue !== '') {
        return currentValue === desired;
      }
      if (!desired) return false;
      if (!selectByTextOrValue(node, desired)) {
        node.value = desired;
        triggerInput(node);
      }
      return true;
    }

    if (node.type === 'radio') {
      const radios = els(`input[type="radio"][name="${CSS.escape(name)}"]`);
      if (!radios.length || !desired) return false;
      const existing = radios.find(r => r.checked);
      if (existing) {
        return existing.value === desired;
      }
      const target = radios.find(r => String(r.value) === desired);
      if (target) {
        target.checked = true;
        triggerInput(target);
        return true;
      }
      return false;
    }
    if (node.type === 'checkbox') {
      if (desired) {
        if (!node.checked) {
          node.checked = true;
          triggerInput(node);
        }
        return true;
      }
      return node.checked === false;
    }

    const current = String(node.value ?? '');
    if (current.trim() !== '') {
      return current === desired;
    }
    if (!desired) return false;
    node.value = desired;
    triggerInput(node);
    return true;
  }

  function fillSplitPhone(prefix, value) {
    const [h, m, l] = parsePhone(value);
    const ok1 = fillFieldByName(`${prefix}_h`, h);
    const ok2 = fillFieldByName(`${prefix}_m`, m);
    const ok3 = fillFieldByName(`${prefix}_l`, l);
    return ok1 || ok2 || ok3;
  }

  function fillSplitPostal(prefix, value) {
    const [h, l] = parsePostal(value);
    const ok1 = fillFieldByName(`${prefix}_h`, h);
    const ok2 = fillFieldByName(`${prefix}_l`, l);
    return ok1 || ok2;
  }

  function selectManualEntryOption(selectEl) {
    if (!selectEl || String(selectEl.value ?? '') !== '') return false;
    const fallback = Array.from(selectEl.options || []).find(opt => /リストにない/.test(opt.textContent));
    if (!fallback) return false;
    selectEl.value = fallback.value;
    triggerInput(selectEl);
    return true;
  }

  function fillSchoolChoice({ selectName, textName, code, text }) {
    const normalizedText = (text ?? '').trim();
    const selectEl = selectName ? el(`select[name="${CSS.escape(selectName)}"]`) : null;
    const textTargets = textName ? els(`[name="${CSS.escape(textName)}"]`) : [];

    if (selectEl && !isElementInteractive(selectEl)) {
      return 'pending';
    }

    let status = 'none';
    if (selectEl) {
      if (code && selectByTextOrValue(selectEl, code)) {
        status = 'match';
      } else if (normalizedText && selectByTextOrValue(selectEl, normalizedText)) {
        status = 'match';
      } else if (normalizedText && selectManualEntryOption(selectEl)) {
        status = 'fallback';
      } else {
        status = 'available';
      }
    } else {
      status = 'missing';
    }

    if (normalizedText && textTargets.length) {
      const filledText = textTargets.some((field) => {
        if (!isElementInteractive(field)) return false;
        if (String(field.value || '').trim()) return false;
        field.value = normalizedText;
        triggerInput(field);
        return true;
      });
      if (filledText && status !== 'match' && status !== 'fallback') {
        status = 'text';
      }
    }

    return status;
  }

  function findSchoolSearchButton(initialInput) {
    const searchTextMatcher = (node) => {
      const label = (node.textContent || node.value || '').trim();
      return /学校検索/.test(label);
    };

    if (initialInput) {
      const container = initialInput.closest('form') || initialInput.closest('div, section, td, tr, table');
      if (container) {
        const btn = Array.from(container.querySelectorAll('button, input[type="button"], input[type="submit"], a'))
          .find(searchTextMatcher);
        if (btn && isElementInteractive(btn)) return btn;
      }
    }

    const fallback = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a'))
      .find((node) => searchTextMatcher(node) && isElementInteractive(node));
    return fallback || null;
  }

  let schoolAutomationTimer = null;

  function startSchoolAutomation(schoolProfile) {
    if (!schoolProfile) return;

    if (schoolAutomationTimer) {
      clearInterval(schoolAutomationTimer);
      schoolAutomationTimer = null;
    }

    const state = {
      kubun: !schoolProfile.kubun,
      kokushi: !schoolProfile.kokushi,
      initial: !schoolProfile.initial,
      searched: !schoolProfile.initial && (!schoolProfile.dcd && !schoolProfile.dname),
      school: !schoolProfile.dcd && !schoolProfile.dname,
      faculty: !schoolProfile.bcd && !schoolProfile.bname,
      department: !schoolProfile.paxcd && !schoolProfile.kname,
      searchAttempts: 0,
    };

    const hasSchoolOptions = () => {
      const selectEl = getInteractiveFieldByName('dcd');
      if (!selectEl) return false;
      return Array.from(selectEl.options || []).length > 0;
    };

    const ensureKubun = () => {
      if (state.kubun && state.kokushi) return true;
      let allHandled = true;
      if (!state.kubun && schoolProfile.kubun) {
        const field = getInteractiveFieldByName('kubun');
        if (!field) {
          allHandled = false;
        } else if (selectByTextOrValue(field, schoolProfile.kubun)) {
          state.kubun = true;
        } else {
          allHandled = false;
        }
      } else {
        state.kubun = true;
      }

      if (!state.kokushi && schoolProfile.kokushi) {
        const field = getInteractiveFieldByName('kokushi');
        if (!field) {
          allHandled = false;
        } else if (selectByTextOrValue(field, schoolProfile.kokushi)) {
          state.kokushi = true;
        } else {
          allHandled = false;
        }
      } else {
        state.kokushi = true;
      }

      return allHandled && state.kubun && state.kokushi;
    };

    const ensureInitialAndSearch = () => {
      if (state.initial && state.searched) return true;

      if (!state.initial && schoolProfile.initial) {
        const input = getInteractiveFieldByName('initial');
        if (!input) {
          return false;
        }
        const desired = String(schoolProfile.initial);
        if (String(input.value || '') !== desired) {
          input.value = desired;
          triggerInput(input);
        }
        state.initial = true;
      } else {
        state.initial = true;
      }

      if (!state.searched) {
        if (!schoolProfile.dcd && !schoolProfile.dname) {
          state.searched = true;
          return true;
        }
        if (hasSchoolOptions()) {
          state.searched = true;
          return true;
        }
        const input = getInteractiveFieldByName('initial');
        const button = findSchoolSearchButton(input);
        if (!button) {
          return false;
        }
        button.click();
        state.searchAttempts += 1;
        state.searched = true;
        return true;
      }

      if ((schoolProfile.dcd || schoolProfile.dname) && !hasSchoolOptions() && state.searchAttempts > 0 && state.searchAttempts < 3) {
        const input = getInteractiveFieldByName('initial');
        const button = findSchoolSearchButton(input);
        if (!button) return false;
        button.click();
        state.searchAttempts += 1;
        return false;
      }

      return state.initial && state.searched;
    };

    const ensureSchoolSelection = () => {
      if (state.school) return true;
      const result = fillSchoolChoice({ selectName: 'dcd', textName: 'dname', code: schoolProfile.dcd, text: schoolProfile.dname });
      if (result === 'match' || result === 'fallback' || result === 'text') {
        state.school = true;
        return true;
      }
      if (result === 'pending') return false;
      if (result === 'missing' || result === 'available') return false;
      return false;
    };

    const ensureFaculty = () => {
      if (state.faculty) return true;
      const result = fillSchoolChoice({ selectName: 'bcd', textName: 'bname', code: schoolProfile.bcd, text: schoolProfile.bname });
      if (result === 'match' || result === 'fallback' || result === 'text') {
        state.faculty = true;
        return true;
      }
      if (result === 'pending') return false;
      return false;
    };

    const ensureDepartment = () => {
      if (state.department) return true;
      const result = fillSchoolChoice({ selectName: 'paxcd', textName: 'kname', code: schoolProfile.paxcd, text: schoolProfile.kname });
      if (result === 'match' || result === 'fallback' || result === 'text') {
        state.department = true;
        return true;
      }
      if (result === 'pending') return false;
      return false;
    };

    const run = () => {
      let allDone = true;
      if (!ensureKubun()) allDone = false;
      if (!ensureInitialAndSearch()) allDone = false;
      if (!ensureSchoolSelection()) allDone = false;
      if (!ensureFaculty()) allDone = false;
      if (!ensureDepartment()) allDone = false;

      if (allDone) {
        clearInterval(schoolAutomationTimer);
        schoolAutomationTimer = null;
      }
    };

    run();
    schoolAutomationTimer = setInterval(run, 600);
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
      if (opt.value === value || (opt.textContent || '').trim() === value) {
        select.value = opt.value;
        triggerInput(select);
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
      const hasCandidate = Array.from(sel.options || []).some(opt => candidates.some(c => (opt.textContent || '').includes(c)));
      if (!hasCandidate || !isElementInteractive(sel)) continue;
      if (setSelectValueByText(sel, value)) count++;
    }
    return count;
  }

  function isSchoolPrefTarget(select) {
    const label = ((select?.closest('label')?.textContent || select?.getAttribute('aria-label') || select?.name || '') || '').toLowerCase();
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
      if (!isElementInteractive(btn)) continue;
      const text = (btn.value || btn.textContent || '').trim();
      if (!text) continue;
      if (text.toLowerCase() === initial.toLowerCase()) {
        btn.click();
        triggerInput(btn);
        return true;
      }
    }
    return false;
  }

  function fillSchoolSequence(school) {
    if (!school) return;
    fillSelectsByOptionCandidates(SCHOOL_TYPES, school.category);
    fillSelectsByOptionCandidates(['私立', '公立'], school.kubun);
    fillSelectsByOptionCandidates(PREFECTURES, school.pref, isSchoolPrefTarget);

    const steps = [
      { key: 'initial', query: 'input[name*="initial"], input[id*="initial"], input[name*="initials"], input[name*="kibana"]' },
      { key: 'dname', query: 'select[name*="dname"], select[id*="dname"], select[name*="school"], select[name*="daigaku"], input[name*="school"], input[name*="daigaku"]' },
      { key: 'bname', query: 'select[name*="bname"], select[id*="bname"], select[name*="gakubu"], input[name*="gakubu"], input[name*="course"]' },
      { key: 'kname', query: 'select[name*="kname"], select[id*="kname"], select[name*="gakka"], input[name*="gakka"], input[name*="senkou"]' }
    ];

    steps.forEach(step => {
      const val = school[step.key];
      if (!val) return;
      let node = null;
      try {
        node = document.querySelector(step.query);
      } catch (error) {
        log('school step selector error', step.query, error);
      }
      if (!node || !isElementInteractive(node)) return;

      if (node.tagName === 'SELECT') {
        setSelectValueByText(node, val);
      } else {
        node.value = val;
        triggerInput(node);
      }
    });

    if (school.initial) clickInitialButton(school.initial);
  }

  function setVacationAddressVisibility(visible) {
    const nodes = document.querySelectorAll('.jusho_k');
    nodes.forEach((node) => {
      if (!node.dataset.originalDisplay && node.style.display && node.style.display !== 'none') {
        node.dataset.originalDisplay = node.style.display;
      }
      if (visible) {
        if (node.dataset.originalDisplay) {
          node.style.display = node.dataset.originalDisplay;
        } else {
          node.style.removeProperty('display');
          if (getComputedStyle(node).display === 'none') {
            node.style.display = 'block';
          }
        }
      } else {
        node.style.display = 'none';
      }
    });
  }

  function setupVacationSameCheckbox() {
    if (!issyukatsuEntryPage()) return;
    const vacationNodes = document.querySelectorAll('.jusho_k');
    if (!vacationNodes.length) return;

    let checkbox = document.querySelector('input[name="jushosame"]');
    if (!checkbox) {
      const firstNode = vacationNodes[0];
      if (!firstNode || !firstNode.parentElement) return;
      const wrap = document.createElement('div');
      wrap.className = 'notice__wrap';
      wrap.dataset.autofill = 'jushosame-toggle';

      const notice = document.createElement('p');
      notice.className = 'notice__example';
      notice.textContent = '現在の連絡先と同じ場合はチェックしてください。';
      wrap.appendChild(notice);

      const label = document.createElement('label');
      checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'jushosame';
      checkbox.value = '1';
      checkbox.checked = true;
      label.appendChild(checkbox);

      const text = document.createElement('span');
      text.textContent = '現在の連絡先と同じ';
      label.appendChild(text);
      wrap.appendChild(label);

      const alert = document.createElement('div');
      alert.className = 'fb_ownAlertStrs';
      wrap.appendChild(alert);

      firstNode.parentElement.insertBefore(wrap, firstNode);
    }

    if (!checkbox) return;
    checkbox.checked = true;
    if (!checkbox.dataset.autofillBound) {
      checkbox.addEventListener('change', () => {
        setVacationAddressVisibility(!checkbox.checked);
      });
      checkbox.dataset.autofillBound = '1';
    }
    setVacationAddressVisibility(!checkbox.checked);
  }

  function fillProfilesyukatsu(profile) {
    if (!issyukatsuEntryPage()) return;

    // --- 基本情報 ---
    fillFieldByName('kanji_sei', profile.kanji_sei);
    fillFieldByName('kanji_na', profile.kanji_na);
    fillFieldByName('kana_sei', profile.kana_sei);
    fillFieldByName('kana_na', profile.kana_na);
    fillFieldByName('roma_sei', profile.roma_sei);
    fillFieldByName('roma_na', profile.roma_na);

    if (profile.sex) fillFieldByName('sex', profile.sex);

    if (profile.birth) {
      fillFieldByName('birth_Y', profile.birth.Y);
      fillFieldByName('birth_m', profile.birth.m);
      fillFieldByName('birth_d', profile.birth.d);
    }

    // --- 現住所 ---
    const cur = profile.address?.current || {};
    if (cur.postal) fillSplitPostal('yubing', cur.postal);
    const selKeng = document.querySelector('#keng');
    if (selKeng) selectByTextOrValue(selKeng, cur.pref);
    fillFieldByName('jushog1', cur.city);
    fillFieldByName('jushog2', cur.street);
    fillFieldByName('jushog3', cur.building);

    // --- 電話 ---
    if (profile.tel?.home) fillSplitPhone('telg', profile.tel.home);
    if (profile.tel?.mobile) fillSplitPhone('keitai', profile.tel.mobile);

    // --- 休暇中連絡先 ---
    const vac = profile.address?.vacation || {};
    if (vac.sameAsCurrent) {
      const same = document.querySelector('input[name="jushosame"]');
      if (same && !same.checked) {
        same.checked = true;
        triggerInput(same);
      }
      setVacationAddressVisibility(false);
    } else {
      const same = document.querySelector('input[name="jushosame"]');
      if (same) {
        const vacationFieldNames = [
          'yubink_h', 'yubink_l', 'jushok1', 'jushok2', 'jushok3',
          'telk_h', 'telk_m', 'telk_l',
        ];
        const needsVacationFill = vacationFieldNames.some((fieldName) => {
          const field = el(`[name="${CSS.escape(fieldName)}"]`);
          if (!field) return false;
          return !String(field.value || '').trim();
        });
        if (same.checked && needsVacationFill) {
          same.checked = false;
          triggerInput(same);
        }
      }
      setVacationAddressVisibility(true);
      if (vac.postal) fillSplitPostal('yubink', vac.postal);
      const selKenk = document.querySelector('#kenk');
      if (selKenk) selectByTextOrValue(selKenk, vac.pref);
      fillFieldByName('jushok1', vac.city);
      fillFieldByName('jushok2', vac.street);
      fillFieldByName('jushok3', vac.building);
      if (vac.tel) fillSplitPhone('telk', vac.tel);
    }

    // --- メール ---
    if (profile.email) {
      if (profile.email.primary) {
        fillFieldByName('email', profile.email.primary);
        if (profile.email.primaryConfirm) fillFieldByName('email2', profile.email.primary);
      }
      if (profile.email.secondary) {
        fillFieldByName('kmail', profile.email.secondary);
        if (profile.email.secondaryConfirm) fillFieldByName('kmail2', profile.email.secondary);
      }
    }

    // --- 学校情報 ---
    const selectedSchool = pickSchoolEntry(profile) || profile.school || defaultSchoolEntry('学部');
    profile.school = selectedSchool;
    fillSchoolSequence(selectedSchool);
    startSchoolAutomation(selectedSchool);

    if (selectedSchool.from) {
      fillFieldByName('school_from_Y', selectedSchool.from.Y);
      fillFieldByName('school_from_m', selectedSchool.from.m);
    }
    if (selectedSchool.to) {
      fillFieldByName('school_to_Y', selectedSchool.to.Y);
      fillFieldByName('school_to_m', selectedSchool.to.m);
    }

    if (selectedSchool.zemi) fillFieldByName('zemi', selectedSchool.zemi);
    if (selectedSchool.club) fillFieldByName('club', selectedSchool.club);

    if (AUTO_SUBMIT) {
      const submit = document.querySelector('#submit');
      if (submit) submit.click();
    }
  }

  // ===== UI（右下パネル） =====
  GM_addStyle(`
    #autofill-toggle {
      position: fixed; right: 16px; bottom: 16px; z-index: 999999;
      padding: 10px 12px; border-radius: 10px; cursor: pointer;
      background: #111; color: #fff; font-size: 14px; box-shadow: 0 6px 16px rgba(0,0,0,.25);
    }
    #autofill-panel {
      position: fixed; right: 16px; bottom: 64px; z-index: 999999;
      width: 320px; max-height: 70vh; overflow: auto;
      background: #fff; color: #111; border-radius: 12px; padding: 12px;
      box-shadow: 0 12px 28px rgba(0,0,0,.25); display: none;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans JP", sans-serif;
    }
    #autofill-panel input[type="text"], #autofill-panel input[type="email"], #autofill-panel select, #autofill-panel textarea {
      width: 100%; padding: 6px 8px; margin: 4px 0 8px; border-radius: 8px; border: 1px solid #ddd;
    }
    #autofill-panel .row { display: flex; gap: 8px; }
    #autofill-panel .row > * { flex: 1; }
    #autofill-panel .school-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; margin: 6px 0; background: #f8fafc; }
    #autofill-panel .school-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; font-weight:600; }
    #autofill-panel .school-remove { background: none; border: none; cursor: pointer; color: #64748b; font-size: 14px; }
    #autofill-panel .school-remove:hover { color: #ef4444; }
    #autofill-panel .btn { padding: 8px 10px; border-radius: 8px; border: 1px solid #bbb; cursor: pointer; background: #e5e7eb; color: #111; }
    #autofill-panel .btn.primary { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
    #autofill-panel h4 { margin: 8px 0 4px; font-size: 13px; color: #333; }
    #autofill-panel small { color: #666; }
    #autofill-panel .muted { color: #666; font-size: 12px; }
    #autofill-panel .actions { display:flex; gap:8px; margin-top: 8px; }
    #autofill-panel textarea { height: 80px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
  `);

  const toggle = document.createElement('button');
  toggle.id = 'autofill-toggle';
  toggle.textContent = '🧩 Autofill';
  document.body.appendChild(toggle);

  const panel = document.createElement('div');
  panel.id = 'autofill-panel';
  panel.innerHTML = `
    <h3 style="margin:0 0 6px">syukatsu Autofill</h3>
    <div class="muted">このパネルに入力して保存 → Fill で自動入力（個人情報はブラウザに保存）</div>

    <h4>氏名 / カナ / ローマ字 / 性別</h4>
    <div class="row">
      <input id="p-kanji-sei" type="text" placeholder="漢字姓">
      <input id="p-kanji-na" type="text" placeholder="漢字名">
    </div>
    <div class="row">
      <input id="p-kana-sei" type="text" placeholder="カナ姓（全角）">
      <input id="p-kana-na" type="text" placeholder="カナ名（全角）">
    </div>
    <div class="row">
      <input id="p-roma-sei" type="text" placeholder="ローマ字姓 (例: YAMADA)">
      <input id="p-roma-na" type="text" placeholder="ローマ字名 (例: TARO)">
    </div>
    <div class="row">
      <select id="p-sex">
        <option value="">性別</option>
        <option value="1">男性</option>
        <option value="2">女性</option>
      </select>
      <input id="p-birth-y" type="text" placeholder="生年(YYYY)">
    </div>
    <div class="row">
      <input id="p-birth-m" type="text" placeholder="月(1-12)">
      <input id="p-birth-d" type="text" placeholder="日(1-31)">
    </div>

    <h4>現住所</h4>
    <div class="row">
      <input id="p-postal" type="text" placeholder="郵便番号 例: 530-0001">
      <input id="p-pref" type="text" placeholder="都道府県（名前 or 値）">
    </div>
    <input id="p-city" type="text" placeholder="市区郡町村">
    <input id="p-street" type="text" placeholder="町域・番地">
    <input id="p-bldg" type="text" placeholder="建物名・部屋番号">

    <h4>休暇中の連絡先</h4>
    <label style="display:flex; align-items:center; gap:6px; margin:6px 0;">
      <input id="p-vac-same" type="checkbox" checked> <span>現住所と同じ</span>
    </label>
    <div id="p-vac-fields">
      <div class="row">
        <input id="p-vac-postal" type="text" placeholder="休暇中 郵便番号 例: 530-0001">
        <input id="p-vac-pref" type="text" placeholder="休暇中 都道府県">
      </div>
      <input id="p-vac-city" type="text" placeholder="休暇中 市区郡町村">
      <input id="p-vac-street" type="text" placeholder="休暇中 町域・番地">
      <input id="p-vac-bldg" type="text" placeholder="休暇中 建物名・部屋番号 (任意)">
      <input id="p-vac-tel" type="text" placeholder="休暇中 電話番号 例: 03-1234-XXXX">
    </div>

    <h4>電話/メール</h4>
    <input id="p-tel-home" type="text" placeholder="自宅 例: 03-1234-5678">
    <input id="p-tel-mobile" type="text" placeholder="携帯 例: 090-1234-5678">
    <input id="p-email" type="email" placeholder="メールアドレス">
    <input id="p-email2" type="email" placeholder="メールアドレス2（任意）">

    <h4>現在/直近の学校情報</h4>
    <div id="p-school-container"></div>
    <button id="p-add-school" class="btn" style="display:flex;align-items:center;justify-content:center;gap:6px;">
      <span>＋</span><span>学校を追加</span>
    </button>
    <small class="muted">区分・所在地・頭文字はドロップダウン/ボタンを自動選択します。</small>
    <div class="row">
      <input id="p-from-y" type="text" placeholder="入学年">
      <input id="p-from-m" type="text" placeholder="入学月">
    </div>
    <div class="row">
      <input id="p-to-y" type="text" placeholder="卒業年">
      <input id="p-to-m" type="text" placeholder="卒業月">
    </div>
    <input id="p-zemi" type="text" placeholder="ゼミ・研究室（任意）">
    <input id="p-club" type="text" placeholder="クラブ・サークル（任意）">

    <div class="actions">
      <button id="act-save" class="btn primary">Save</button>
      <button id="act-fill" class="btn">Fill Current Page</button>
    </div>
    <div class="actions">
      <button id="act-export" class="btn">Export JSON</button>
      <button id="act-import" class="btn">Import JSON</button>
      <button id="act-clear" class="btn">Clear</button>
    </div>

    <h4>JSON（インポート/エクスポート）</h4>
    <textarea id="p-json" placeholder='ここにJSONを貼るか、Exportで内容を確認'></textarea>
    <div class="muted">保存先：Tampermonkey ストレージ（無ければ localStorage）</div>
  `;
  document.body.appendChild(panel);
  panel.style.display = 'none';

  const panelRefs = {
    vacSame: panel.querySelector('#p-vac-same'),
    vacFields: panel.querySelector('#p-vac-fields'),
  };

  function buildPrefectureOptions(selected = '') {
    const opts = ['<option value="">所在地</option>'];
    PREFECTURES.forEach(p => {
      const sel = p === selected ? 'selected' : '';
      opts.push(`<option value="${p}" ${sel}>${p}</option>`);
    });
    return opts.join('');
  }

  function renderSchoolEntries(entries = []) {
    const container = panel.querySelector('#p-school-container');
    if (!container) return;
    const normalized = entries.length ? entries : [defaultSchoolEntry('学部')];
    container.innerHTML = '';

    normalized.forEach((entry, idx) => {
      const card = document.createElement('div');
      card.className = 'school-card';
      card.dataset.schoolId = entry.id || generateSchoolId();
      card.dataset.dcd = entry.dcd || '';
      card.dataset.bcd = entry.bcd || '';
      card.dataset.paxcd = entry.paxcd || '';

      const typeOptions = SCHOOL_TYPES.map(t => `<option value="${t}" ${t === entry.category ? 'selected' : ''}>${t}</option>`).join('');
      const prefOptions = buildPrefectureOptions(entry.pref || '');
      const canRemove = normalized.length > 1;

      card.innerHTML = `
        <div class="school-head">
          <span>${entry.category || '学校情報'}</span>
          ${canRemove ? '<button class="school-remove" title="削除">×</button>' : ''}
        </div>
        <div class="row">
          <select data-field="category">${typeOptions}</select>
          <select data-field="kubun">
            <option value="">区分</option>
            <option value="私立" ${entry.kubun === '私立' ? 'selected' : ''}>私立</option>
            <option value="公立" ${entry.kubun === '公立' ? 'selected' : ''}>公立</option>
          </select>
        </div>
        <div class="row">
          <input data-field="initial" type="text" placeholder="頭文字" value="${entry.initial || ''}">
          <select data-field="pref">${prefOptions}</select>
        </div>
        <div class="row">
          <input data-field="dname" type="text" placeholder="学校名" value="${entry.dname || ''}">
          <input data-field="bname" type="text" placeholder="学部 / コース" value="${entry.bname || ''}">
        </div>
        <div class="row">
          <input data-field="kname" type="text" placeholder="学科 / 専攻" value="${entry.kname || ''}">
        </div>
      `;

      const typeSelect = card.querySelector('[data-field="category"]');
      const title = card.querySelector('.school-head span');
      if (typeSelect && title) {
        typeSelect.addEventListener('change', () => { title.textContent = typeSelect.value || '学校情報'; });
      }
      const removeBtn = card.querySelector('.school-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          card.remove();
          if (!els('.school-card', container).length) renderSchoolEntries([defaultSchoolEntry('学部')]);
        });
      }
      container.appendChild(card);
    });
  }

  function readSchoolEntriesFromUI() {
    const container = panel.querySelector('#p-school-container');
    if (!container) return [];
    return els('.school-card', container).map(card => {
      const getField = sel => el(sel, card)?.value || '';
      return {
        id: card.dataset.schoolId || generateSchoolId(),
        category: getField('[data-field="category"]') || '学部',
        kubun: getField('[data-field="kubun"]'),
        kokushi: getField('[data-field="kubun"]'),
        pref: getField('[data-field="pref"]'),
        initial: getField('[data-field="initial"]'),
        dcd: card.dataset.dcd || '',
        dname: getField('[data-field="dname"]'),
        bcd: card.dataset.bcd || '',
        bname: getField('[data-field="bname"]'),
        paxcd: card.dataset.paxcd || '',
        kname: getField('[data-field="kname"]'),
        from: { Y: '', m: '' },
        to: { Y: '', m: '' },
        zemi: '',
        club: ''
      };
    });
  }

  const addSchoolBtn = panel.querySelector('#p-add-school');
  if (addSchoolBtn) {
    addSchoolBtn.addEventListener('click', () => {
      const entries = readSchoolEntriesFromUI();
      const nextCategory = entries.length ? entries[entries.length - 1].category : SCHOOL_TYPES[0];
      entries.push(defaultSchoolEntry(nextCategory));
      renderSchoolEntries(entries);
    });
  }

  function updateVacationPanelVisibility() {
    if (!panelRefs.vacFields) return;
    if (panelRefs.vacSame && panelRefs.vacSame.checked) {
      panelRefs.vacFields.style.display = 'none';
    } else {
      panelRefs.vacFields.style.display = 'block';
    }
  }

  if (panelRefs.vacSame) {
    panelRefs.vacSame.addEventListener('change', updateVacationPanelVisibility);
  }
  updateVacationPanelVisibility();

  const togglePanelVisibility = () => {
    const visible = window.getComputedStyle(panel).display !== 'none';
    panel.style.display = visible ? 'none' : 'block';
  };

  toggle.addEventListener('click', togglePanelVisibility);

  // ===== UI <-> プロフィール =====
  function defaultProfile() {
    const baseSchool = defaultSchoolEntry('学部');
    return {
      kanji_sei: "", kanji_na: "", kana_sei: "", kana_na: "", roma_sei: "", roma_na: "", sex: "",
      birth: { Y: "", m: "", d: "" },
      address: {
        current: { postal: "", pref: "", city: "", street: "", building: "" },
        vacation: { sameAsCurrent: true, postal: "", pref: "", city: "", street: "", building: "", tel: "" }
      },
      tel: { home: "", mobile: "" },
      email: { primary: "", primaryConfirm: true, secondary: "", secondaryConfirm: false },
      school: { ...baseSchool },
      schoolEntries: [{ ...baseSchool }]
    };
  }

  function uiToProfile() {
    return {
      kanji_sei: document.querySelector('#p-kanji-sei').value,
      kanji_na: document.querySelector('#p-kanji-na').value,
      kana_sei: document.querySelector('#p-kana-sei').value,
      kana_na: document.querySelector('#p-kana-na').value,
      roma_sei: document.querySelector('#p-roma-sei').value,
      roma_na: document.querySelector('#p-roma-na').value,
      sex: document.querySelector('#p-sex').value,
      birth: { Y: document.querySelector('#p-birth-y').value, m: document.querySelector('#p-birth-m').value, d: document.querySelector('#p-birth-d').value },
      address: {
        current: {
          postal: document.querySelector('#p-postal').value,
          pref: document.querySelector('#p-pref').value,
          city: document.querySelector('#p-city').value,
          street: document.querySelector('#p-street').value,
          building: document.querySelector('#p-bldg').value,
        },
        vacation: {
          sameAsCurrent: panelRefs.vacSame ? panelRefs.vacSame.checked : true,
          postal: document.querySelector('#p-vac-postal').value,
          pref: document.querySelector('#p-vac-pref').value,
          city: document.querySelector('#p-vac-city').value,
          street: document.querySelector('#p-vac-street').value,
          building: document.querySelector('#p-vac-bldg').value,
          tel: document.querySelector('#p-vac-tel').value,
        }
      },
      tel: { home: document.querySelector('#p-tel-home').value, mobile: document.querySelector('#p-tel-mobile').value },
      email: { primary: document.querySelector('#p-email').value, primaryConfirm: true, secondary: document.querySelector('#p-email2').value, secondaryConfirm: !!document.querySelector('#p-email2').value },
      ...(() => {
        const entries = readSchoolEntriesFromUI();
        const normalized = entries.length ? entries : [defaultSchoolEntry('学部')];
        const enrichedFirst = {
          ...normalized[0],
          from: { Y: document.querySelector('#p-from-y').value, m: document.querySelector('#p-from-m').value },
          to: { Y: document.querySelector('#p-to-y').value, m: document.querySelector('#p-to-m').value },
          zemi: document.querySelector('#p-zemi').value,
          club: document.querySelector('#p-club').value
        };
        const merged = [...normalized];
        merged[0] = enrichedFirst;
        return { school: enrichedFirst, schoolEntries: merged };
      })()
    };
  }

  function profileToUI(p) {
    const defaults = defaultProfile();
    const prof = {
      ...defaults,
      ...(p || {}),
      birth: { ...defaults.birth, ...((p && p.birth) || {}) },
      address: {
        current: {
          ...defaults.address.current,
          ...((p && p.address && p.address.current) || {}),
        },
        vacation: {
          ...defaults.address.vacation,
          ...((p && p.address && p.address.vacation) || {}),
        },
      },
      tel: { ...defaults.tel, ...((p && p.tel) || {}) },
      email: { ...defaults.email, ...((p && p.email) || {}) },
      school: {
        ...defaults.school,
        ...((p && p.school) || {}),
        from: {
          ...defaults.school.from,
          ...((p && p.school && p.school.from) || {}),
        },
        to: {
          ...defaults.school.to,
          ...((p && p.school && p.school.to) || {}),
        },
      },
    };

    document.querySelector('#p-kanji-sei').value = prof.kanji_sei ?? '';
    document.querySelector('#p-kanji-na').value = prof.kanji_na ?? '';
    document.querySelector('#p-kana-sei').value = prof.kana_sei ?? '';
    document.querySelector('#p-kana-na').value = prof.kana_na ?? '';
    document.querySelector('#p-roma-sei').value = prof.roma_sei ?? '';
    document.querySelector('#p-roma-na').value = prof.roma_na ?? '';
    document.querySelector('#p-sex').value = prof.sex ?? '';
    document.querySelector('#p-birth-y').value = prof.birth.Y ?? '';
    document.querySelector('#p-birth-m').value = prof.birth.m ?? '';
    document.querySelector('#p-birth-d').value = prof.birth.d ?? '';
    const cur = prof.address.current;
    document.querySelector('#p-postal').value = cur.postal ?? '';
    document.querySelector('#p-pref').value = cur.pref ?? '';
    document.querySelector('#p-city').value = cur.city ?? '';
    document.querySelector('#p-street').value = cur.street ?? '';
    document.querySelector('#p-bldg').value = cur.building ?? '';
    const vac = prof.address.vacation;
    if (panelRefs.vacSame) panelRefs.vacSame.checked = vac.sameAsCurrent;
    const vacPostal = document.querySelector('#p-vac-postal');
    if (vacPostal) vacPostal.value = vac.postal ?? '';
    const vacPref = document.querySelector('#p-vac-pref');
    if (vacPref) vacPref.value = vac.pref ?? '';
    const vacCity = document.querySelector('#p-vac-city');
    if (vacCity) vacCity.value = vac.city ?? '';
    const vacStreet = document.querySelector('#p-vac-street');
    if (vacStreet) vacStreet.value = vac.street ?? '';
    const vacBldg = document.querySelector('#p-vac-bldg');
    if (vacBldg) vacBldg.value = vac.building ?? '';
    const vacTel = document.querySelector('#p-vac-tel');
    if (vacTel) vacTel.value = vac.tel ?? '';
    updateVacationPanelVisibility();
    document.querySelector('#p-tel-home').value = prof.tel.home ?? '';
    document.querySelector('#p-tel-mobile').value = prof.tel.mobile ?? '';
    document.querySelector('#p-email').value = prof.email.primary ?? '';
    document.querySelector('#p-email2').value = prof.email.secondary ?? '';
    const schools = (prof.schoolEntries && prof.schoolEntries.length ? prof.schoolEntries : [prof.school || defaultSchoolEntry('学部')])
      .map(s => ({ ...defaultSchoolEntry(s.category || '学部'), ...s }));
    renderSchoolEntries(schools);
    const topSchool = schools[0] || defaultSchoolEntry('学部');
    document.querySelector('#p-from-y').value = topSchool.from.Y ?? '';
    document.querySelector('#p-from-m').value = topSchool.from.m ?? '';
    document.querySelector('#p-to-y').value = topSchool.to.Y ?? '';
    document.querySelector('#p-to-m').value = topSchool.to.m ?? '';
    document.querySelector('#p-zemi').value = topSchool.zemi ?? '';
    document.querySelector('#p-club').value = topSchool.club ?? '';
  }

  // ===== ボタン動作 =====
  document.addEventListener('click', async (e) => {
    const id = e.target && e.target.id;
    if (id === 'act-save') {
      const profile = uiToProfile();
      await saveJSON(STORAGE_KEY, profile);
      const ta = document.querySelector('#p-json');
      ta.value = JSON.stringify(profile, null, 2);
      alert('プロフィールを保存しました（ブラウザ内）。');
    }
    if (id === 'act-fill') {
      const p = await loadJSON(STORAGE_KEY, null);
      if (!p) {
        alert('保存されたプロフィールがありません。先に Save してください。');
        return;
      }
      fillProfilesyukatsu(p);
      alert('入力を試行しました。');
    }
    if (id === 'act-export') {
      const p = await loadJSON(STORAGE_KEY, defaultProfile());
      const ta = document.querySelector('#p-json');
      ta.value = JSON.stringify(p, null, 2);
    }
    if (id === 'act-import') {
      const ta = document.querySelector('#p-json');
      try {
        const obj = JSON.parse(ta.value || '{}');
        await saveJSON(STORAGE_KEY, obj);
        profileToUI(obj);
        alert('JSONを読み込み、プロフィールに反映しました。');
      } catch (e) {
        alert('JSONの形式が不正です。');
      }
    }
    if (id === 'act-clear') {
      await saveJSON(STORAGE_KEY, defaultProfile());
      profileToUI(defaultProfile());
      const ta = document.querySelector('#p-json');
      ta.value = '';
      alert('プロフィールをクリアしました。');
    }
  });

  // 初期ロード
  (async () => {
    const p = await loadJSON(STORAGE_KEY, defaultProfile());
    profileToUI(p);
  })();

  setupVacationSameCheckbox();

})();
