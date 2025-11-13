// ==UserScript==
// @name syukatsu Entry Autofill Panel
// @namespace https://github.com/Nagi-Inaba/syukatsu-autofill
// @version 0.2.0
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

  // ===== Select操作（テキスト or 値一致） =====
  function selectByTextOrValue(selectEl, desired) {
    if (!selectEl) return false;
    const want = String(desired ?? '').trim();
    if (!want) return false;

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

  function fillFieldByName(name, value) {
    const node = el(`[name="${CSS.escape(name)}"]`);
    if (!node) return false;

    if (node.type === 'radio') {
      const r = el(`input[type="radio"][name="${CSS.escape(name)}"][value="${CSS.escape(String(value))}"]`);
      if (r) { r.checked = true; triggerInput(r); return true; }
      return false;
    }
    if (node.type === 'checkbox') {
      node.checked = !!value;
      triggerInput(node);
      return true;
    }
    node.value = value ?? '';
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

  function fillProfilesyukatsu(profile) {
    if (!issyukatsuEntryPage()) return;

    // --- 基本情報 ---
    fillFieldByName('kanji_sei', profile.kanji_sei);
    fillFieldByName('kanji_na', profile.kanji_na);
    fillFieldByName('kana_sei', profile.kana_sei);
    fillFieldByName('kana_na', profile.kana_na);

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
      if (same) { same.checked = true; triggerInput(same); }
    } else {
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
    const sch = profile.school || {};
    if (sch.kubun) fillFieldByName('kubun', sch.kubun);
    if (sch.kokushi) fillFieldByName('kokushi', sch.kokushi);
    if (sch.initial) fillFieldByName('initial', sch.initial);

    if (sch.dcd) fillFieldByName('dcd', sch.dcd);
    if (sch.dname) fillFieldByName('dname', sch.dname);
    if (sch.bcd) fillFieldByName('bcd', sch.bcd);
    if (sch.bname) fillFieldByName('bname', sch.bname);
    if (sch.paxcd) fillFieldByName('paxcd', sch.paxcd);
    if (sch.kname) fillFieldByName('kname', sch.kname);

    if (sch.from) {
      fillFieldByName('school_from_Y', sch.from.Y);
      fillFieldByName('school_from_m', sch.from.m);
    }
    if (sch.to) {
      fillFieldByName('school_to_Y', sch.to.Y);
      fillFieldByName('school_to_m', sch.to.m);
    }

    if (sch.zemi) fillFieldByName('zemi', sch.zemi);
    if (sch.club) fillFieldByName('club', sch.club);

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

    <h4>氏名 / カナ / 性別</h4>
    <div class="row">
      <input id="p-kanji-sei" type="text" placeholder="漢字姓">
      <input id="p-kanji-na" type="text" placeholder="漢字名">
    </div>
    <div class="row">
      <input id="p-kana-sei" type="text" placeholder="カナ姓（全角）">
      <input id="p-kana-na" type="text" placeholder="カナ名（全角）">
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

    <h4>電話/メール</h4>
    <input id="p-tel-home" type="text" placeholder="自宅 例: 03-1234-5678">
    <input id="p-tel-mobile" type="text" placeholder="携帯 例: 090-1234-5678">
    <input id="p-email" type="email" placeholder="メールアドレス">
    <input id="p-email2" type="email" placeholder="メールアドレス2（任意）">

    <h4>学校情報（主なもの）</h4>
    <div class="row">
      <select id="p-kubun">
        <option value="">学校区分</option>
        <option value="1">大学院</option><option value="2">大学</option>
        <option value="3">短大</option><option value="4">高専</option><option value="5">専門</option>
      </select>
      <select id="p-kokushi">
        <option value="">設置区分</option>
        <option value="1">国立</option><option value="2">公立</option>
        <option value="3">私立</option><option value="4">国外</option>
      </select>
    </div>
    <input id="p-initial" type="text" placeholder="学校名の頭文字（全角カナ1文字）">
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

  const togglePanelVisibility = () => {
    const visible = window.getComputedStyle(panel).display !== 'none';
    panel.style.display = visible ? 'none' : 'block';
  };

  toggle.addEventListener('click', togglePanelVisibility);

  // ===== UI <-> プロフィール =====
  function defaultProfile() {
    return {
      kanji_sei: "", kanji_na: "", kana_sei: "", kana_na: "", sex: "",
      birth: { Y: "", m: "", d: "" },
      address: {
        current: { postal: "", pref: "", city: "", street: "", building: "" },
        vacation: { sameAsCurrent: false, postal: "", pref: "", city: "", street: "", building: "", tel: "" }
      },
      tel: { home: "", mobile: "" },
      email: { primary: "", primaryConfirm: true, secondary: "", secondaryConfirm: false },
      school: {
        kubun: "", kokushi: "", initial: "", dcd: "", dname: "",
        bcd: "", bname: "", paxcd: "", kname: "",
        from: { Y: "", m: "" }, to: { Y: "", m: "" },
        zemi: "", club: ""
      }
    };
  }

  function uiToProfile() {
    return {
      kanji_sei: document.querySelector('#p-kanji-sei').value,
      kanji_na: document.querySelector('#p-kanji-na').value,
      kana_sei: document.querySelector('#p-kana-sei').value,
      kana_na: document.querySelector('#p-kana-na').value,
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
        vacation: { sameAsCurrent: false, postal: "", pref: "", city: "", street: "", building: "", tel: "" }
      },
      tel: { home: document.querySelector('#p-tel-home').value, mobile: document.querySelector('#p-tel-mobile').value },
      email: { primary: document.querySelector('#p-email').value, primaryConfirm: true, secondary: document.querySelector('#p-email2').value, secondaryConfirm: !!document.querySelector('#p-email2').value },
      school: {
        kubun: document.querySelector('#p-kubun').value,
        kokushi: document.querySelector('#p-kokushi').value,
        initial: document.querySelector('#p-initial').value,
        from: { Y: document.querySelector('#p-from-y').value, m: document.querySelector('#p-from-m').value },
        to: { Y: document.querySelector('#p-to-y').value, m: document.querySelector('#p-to-m').value },
        zemi: document.querySelector('#p-zemi').value,
        club: document.querySelector('#p-club').value
      }
    };
  }

  function profileToUI(p) {
    const prof = Object.assign(defaultProfile(), p || {});
    document.querySelector('#p-kanji-sei').value = prof.kanji_sei;
    document.querySelector('#p-kanji-na').value = prof.kanji_na;
    document.querySelector('#p-kana-sei').value = prof.kana_sei;
    document.querySelector('#p-kana-na').value = prof.kana_na;
    document.querySelector('#p-sex').value = prof.sex;
    document.querySelector('#p-birth-y').value = prof.birth.Y;
    document.querySelector('#p-birth-m').value = prof.birth.m;
    document.querySelector('#p-birth-d').value = prof.birth.d;
    const cur = prof.address.current;
    document.querySelector('#p-postal').value = cur.postal;
    document.querySelector('#p-pref').value = cur.pref;
    document.querySelector('#p-city').value = cur.city;
    document.querySelector('#p-street').value = cur.street;
    document.querySelector('#p-bldg').value = cur.building;
    document.querySelector('#p-tel-home').value = prof.tel.home;
    document.querySelector('#p-tel-mobile').value = prof.tel.mobile;
    document.querySelector('#p-email').value = prof.email.primary;
    document.querySelector('#p-email2').value = prof.email.secondary;
    document.querySelector('#p-kubun').value = prof.school.kubun;
    document.querySelector('#p-kokushi').value = prof.school.kokushi;
    document.querySelector('#p-initial').value = prof.school.initial;
    document.querySelector('#p-from-y').value = prof.school.from.Y;
    document.querySelector('#p-from-m').value = prof.school.from.m;
    document.querySelector('#p-to-y').value = prof.school.to.Y;
    document.querySelector('#p-to-m').value = prof.school.to.m;
    document.querySelector('#p-zemi').value = prof.school.zemi;
    document.querySelector('#p-club').value = prof.school.club;
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

})();
