/* Grade Runway prototype v1 — ตัวช่วยโต้ตอบ (ไม่มี library ภายนอก)
   - สร้าง proto-bar / header / sidebar ให้ทุกหน้า (ยกเว้น index.html)
   - สลับภาษา TH/EN: องค์ประกอบที่มี data-en จะสลับข้อความ ค่าเริ่มต้นคือไทย
   - ตัวจำลองสถานะต่าง ๆ ของแต่ละหน้า (data-show, ปุ่มจำลอง) */
(function () {
  'use strict';

  var PAGES = [
    { id: 'a01-integration', role: 'admin', j: 'J1', th: 'การเชื่อมต่อและซิงก์', en: 'Integration & Sync', codes: 'FR-01 FR-19 FR-23 NFR-03' },
    { id: 'a02-thresholds', role: 'admin', j: 'J1', th: 'ตั้งค่า threshold', en: 'Risk thresholds', codes: 'FR-08 FR-03' },
    { id: 's01-dashboard', role: 'student', j: 'J2', th: 'แดชบอร์ดผู้เรียน', en: 'Student dashboard', codes: 'FR-02 FR-03 FR-05 FR-06 FR-19 NFR-01' },
    { id: 's02-waiting-data', role: 'student', j: 'J2', th: 'รอข้อมูลซิงก์', en: 'Waiting for data', codes: 'FR-23' },
    { id: 's03-alert-detail', role: 'student', j: 'J2', th: 'รายละเอียดแจ้งเตือน', en: 'Alert detail', codes: 'FR-04 NFR-02' },
    { id: 's04-history', role: 'student', j: 'J2', th: 'ประวัติแจ้งเตือน/คำแนะนำ', en: 'History', codes: 'FR-09 NFR-01' },
    { id: 't01-advisees', role: 'teacher', j: 'J3', th: 'ผู้เรียนในความดูแล', en: 'My advisees', codes: 'FR-07 NFR-01' },
    { id: 't02-advisee-detail', role: 'teacher', j: 'J3', th: 'รายละเอียดผู้เรียน', en: 'Advisee detail', codes: 'FR-07 NFR-02 FR-09 FR-19' },
    { id: 'c01-chat-room', role: 'student', j: 'J7 J4', th: 'ห้องรวมแชทแนะนำ', en: 'Shared advice room', codes: 'FR-20 FR-11 NFR-04 NFR-06' },
    { id: 'c02-compose', role: 'student', j: 'J4', th: 'เขียนข้อความแนะนำ', en: 'Compose advice', codes: 'FR-10 FR-16 FR-20 FR-11 FR-22' },
    { id: 'c03-my-messages', role: 'student', j: 'J4', th: 'ข้อความของฉัน', en: 'My messages', codes: 'FR-11 NFR-04 FR-15 FR-22' },
    { id: 'r01-queue', role: 'teacher', j: 'J5 J6', th: 'คิวรออนุมัติ', en: 'Approval queue', codes: 'FR-13 FR-18 FR-21 NFR-04' },
    { id: 'r02-review', role: 'teacher', j: 'J5', th: 'ตรวจข้อความ', en: 'Review message', codes: 'FR-12 FR-13 FR-14 FR-15 FR-17 FR-18 FR-21 FR-24 NFR-05' },
    { id: 'r03-audit', role: 'teacher', j: 'J5', th: 'ประวัติการตรวจ', en: 'Audit trail', codes: 'NFR-05 FR-15 FR-21 FR-22 FR-24' }
  ];

  var ICONS = {
    home: 'M3 11l9-8 9 8M5 10v10h14V10',
    bell: 'M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 004 0',
    clock: 'M12 7v5l3 2M3 12a9 9 0 1018 0 9 9 0 10-18 0',
    chat: 'M4 5h16v11H9l-5 4z',
    edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5',
    users: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 010 6M18 15c2 1 3 3 3 5',
    user: 'M12 11a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6',
    gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1',
    link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    audit: 'M9 4h6v3H9zM6 5h3M15 5h3v16H6V5M9 12h6M9 16h6',
    hourglass: 'M7 3h10M7 21h10M8 3c0 5 4 6 4 9s-4 4-4 9M16 3c0 5-4 6-4 9s4 4 4 9',
    check: 'M5 12l5 5 9-10'
  };

  var MENUS = {
    student: [
      { th: 'การเรียนของฉัน', en: 'My studies', items: [['s01-dashboard', 'home'], ['s03-alert-detail', 'bell'], ['s04-history', 'clock'], ['s02-waiting-data', 'hourglass']] },
      { th: 'แชทแนะนำแนวทางการเรียน', en: 'Peer advice chat', items: [['c01-chat-room', 'chat'], ['c02-compose', 'edit'], ['c03-my-messages', 'inbox']] }
    ],
    teacher: [
      { th: 'ติดตามผู้เรียน', en: 'Advisees', items: [['t01-advisees', 'users'], ['t02-advisee-detail', 'user']] },
      { th: 'ตรวจข้อความ (อาจารย์/Admin)', en: 'Review messages (Teacher/Admin)', items: [['r01-queue', 'list'], ['r02-review', 'check'], ['r03-audit', 'audit']] }
    ],
    admin: [
      { th: 'ผู้ดูแลระบบ', en: 'Administration', items: [['a01-integration', 'link'], ['a02-thresholds', 'gear']] },
      { th: 'ตรวจข้อความ (อาจารย์/Admin)', en: 'Review messages (Teacher/Admin)', items: [['r01-queue', 'list'], ['r02-review', 'check'], ['r03-audit', 'audit']] }
    ]
  };

  var USERS = {
    student: { id: '6X-00001', th: 'สมใจ ตัวอย่าง', en: 'Somjai Example', who: ['ผู้เรียน', 'Student'], ini: 'SJ' },
    teacher: { id: 'T-0101', th: 'อ.สมชาย ตัวอย่าง', en: 'Aj. Somchai Example', who: ['อาจารย์ที่ปรึกษา / ผู้ตรวจ', 'Advisor / Reviewer'], ini: 'SC' },
    admin: { id: 'A-0001', th: 'ผู้ดูแลระบบ ตัวอย่าง', en: 'Admin Example', who: ['ผู้ดูแลระบบ', 'Administrator'], ini: 'AD' }
  };

  var lang = 'th';
  try { lang = localStorage.getItem('gr-lang') || 'th'; } catch (e) { lang = 'th'; }

  function tr(th, en) { return lang === 'en' ? en : th; }
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; }
  function t(th, en) { return '<span data-en="' + en + '">' + th + '</span>'; }
  function pageById(id) { for (var i = 0; i < PAGES.length; i++) { if (PAGES[i].id === id) return PAGES[i]; } return null; }

  function applyLang(root) {
    root = root || document;
    var nodes = root.querySelectorAll('[data-en]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.getAttribute('data-th') === null) n.setAttribute('data-th', n.textContent);
      n.textContent = lang === 'en' ? n.getAttribute('data-en') : n.getAttribute('data-th');
    }
    var phs = root.querySelectorAll('[data-en-ph]');
    for (var j = 0; j < phs.length; j++) {
      var p = phs[j];
      if (p.getAttribute('data-th-ph') === null) p.setAttribute('data-th-ph', p.getAttribute('placeholder') || '');
      p.setAttribute('placeholder', lang === 'en' ? p.getAttribute('data-en-ph') : p.getAttribute('data-th-ph'));
    }
    if (root === document) {
      document.documentElement.lang = lang;
      var btns = document.querySelectorAll('[data-lang]');
      for (var k = 0; k < btns.length; k++) btns[k].setAttribute('aria-pressed', btns[k].getAttribute('data-lang') === lang ? 'true' : 'false');
      var pg = pageById(document.body.getAttribute('data-page'));
      if (pg) document.title = 'Grade Runway — ' + (lang === 'en' ? pg.en : pg.th);
    }
  }

  function setLang(l) {
    lang = l;
    try { localStorage.setItem('gr-lang', l); } catch (e) { /* file:// อาจใช้ไม่ได้ */ }
    applyLang(document);
  }

  function svg(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONS[name] + '"/></svg>';
  }

  function buildShell() {
    var id = document.body.getAttribute('data-page');
    var page = pageById(id);
    var main = document.getElementById('content');
    if (!page || !main) return;
    var role = page.role;
    var user = USERS[role];

    // proto-bar
    var pb = el('div', 'proto-bar');
    var links = '<span class="pb-tag">PROTOTYPE v1</span><a href="index.html">index</a>';
    PAGES.forEach(function (p) {
      links += '<a href="' + p.id + '.html" title="' + p.th + ' / ' + p.en + '"' + (p.id === id ? ' aria-current="page"' : '') + '>' + p.id.split('-')[0] + '</a>';
    });
    pb.innerHTML = '<nav class="pb-links" aria-label="Prototype navigation">' + links + '</nav>' +
      '<div class="pb-codes"><b>' + page.id + '</b> · ' + t('ครอบคลุม', 'Covers') + ': ' + page.codes + ' · Journey ' + page.j + '</div>';

    // header
    var hd = el('header', 'app-header');
    hd.innerHTML =
      '<div class="row"><button class="menu-btn" type="button" aria-label="Menu" data-menu>&#9776;</button>' +
      '<a class="brand" href="index.html">Grade Runway <small>' + t('(ชื่อชั่วคราว)', '(temporary name)') + '</small></a></div>' +
      '<div class="header-right">' +
      '<button class="icon-btn" type="button" aria-label="Notifications" data-toast="' + (role === 'student' ? 'มีแจ้งเตือนใหม่ 2 รายการ (ดูที่ s03)' : 'มีรายการใหม่ 1 รายการ') + '" data-toast-en="' + (role === 'student' ? '2 new notifications (see s03)' : '1 new item') + '">' +
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18v12H3zM3 7l9 7 9-7"/></svg><span class="count">' + (role === 'student' ? '2' : '1') + '</span></button>' +
      '<div class="lang" role="group" aria-label="Language"><button type="button" data-lang="en" lang="en" aria-pressed="false">EN</button><span class="sep">|</span><button type="button" data-lang="th" lang="th" aria-pressed="true">TH</button></div>' +
      '<div class="profile"><span class="avatar" aria-hidden="true">' + user.ini + '</span><div class="ptext"><div class="pid">' + user.id + '</div><div class="pname">' +
      '<span data-en="' + user.en + '">' + user.th + '</span></div><div class="pwho"><span data-en="' + user.who[1] + '">' + user.who[0] + '</span> <span class="ph" data-en="sample">ตัวอย่าง</span></div></div></div>' +
      '</div>';

    // sidebar
    var sb = el('nav', 'sidebar');
    sb.setAttribute('aria-label', 'Main menu');
    sb.id = 'sidebar';
    var html = '';
    MENUS[role].forEach(function (g) {
      html += '<div class="group-title">' + t(g.th, g.en) + '</div>';
      g.items.forEach(function (it) {
        var p = pageById(it[0]);
        html += '<a href="' + p.id + '.html"' + (p.id === id ? ' aria-current="page"' : '') + '><span class="mi">' + svg(it[1]) + '</span>' + t(p.th, p.en) + '</a>';
      });
    });
    sb.innerHTML = html;

    var scrim = el('div', 'scrim');
    scrim.setAttribute('data-menu', '');

    var layout = el('div', 'layout');
    var col = el('div', 'col');
    var ft = el('footer', 'app-footer',
      t('Grade Runway (ชื่อชั่วคราว) · Prototype v1 ไม่ใช่ระบบจริง · ข้อมูล/ค่าตัวเลขทั้งหมดเป็นตัวอย่าง · ปีในวันที่ใช้ ค.ศ. ชั่วคราว (ยังไม่กำหนด พ.ศ./ค.ศ.)',
        'Grade Runway (temporary name) · Prototype v1, not a real system · all data and numbers are samples · dates use CE temporarily (BE/CE undecided)'));

    main.parentNode.insertBefore(layout, main);
    col.appendChild(main);
    col.appendChild(ft);
    layout.appendChild(sb);
    layout.appendChild(col);
    document.body.insertBefore(hd, layout);
    document.body.insertBefore(pb, hd);
    document.body.appendChild(scrim);
  }

  function toast(msg) {
    var old = document.querySelector('.toast');
    if (old) old.parentNode.removeChild(old);
    var n = el('div', 'toast');
    n.setAttribute('role', 'status');
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 3200);
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function show(id, on) { var n = document.getElementById(id); if (n) n.hidden = (on === false); }

  /* ---------- ตัวจัดการคลิกทั่วไป ---------- */
  document.addEventListener('click', function (e) {
    var b;
    if ((b = e.target.closest('[data-lang]'))) { setLang(b.getAttribute('data-lang')); return; }
    if ((b = e.target.closest('[data-menu]'))) {
      var sb = document.getElementById('sidebar'), sc = $('.scrim');
      if (sb) { sb.classList.toggle('open'); if (sc) sc.classList.toggle('open'); }
      return;
    }
    if ((b = e.target.closest('[data-show]'))) {
      var tg = document.getElementById(b.getAttribute('data-show'));
      if (tg) {
        var g = tg.getAttribute('data-g');
        if (g) {
          var grp = document.querySelectorAll('[data-g="' + g + '"]');
          for (var i = 0; i < grp.length; i++) grp[i].hidden = (grp[i] !== tg);
        } else { tg.hidden = false; }
        var seg = b.closest('.seg');
        if (seg) {
          var bs = seg.querySelectorAll('button');
          for (var j = 0; j < bs.length; j++) { bs[j].classList.toggle('active', bs[j] === b); bs[j].setAttribute('aria-pressed', bs[j] === b ? 'true' : 'false'); }
        }
      }
      return;
    }
    if ((b = e.target.closest('[data-toggle]'))) {
      var tt = document.getElementById(b.getAttribute('data-toggle'));
      if (tt) tt.hidden = !tt.hidden;
      return;
    }
    if ((b = e.target.closest('[data-open]'))) { show(b.getAttribute('data-open'), true); return; }
    if ((b = e.target.closest('[data-close]'))) { var m = b.closest('.modal-back'); if (m) m.hidden = true; return; }
    if ((b = e.target.closest('[data-dismiss]'))) { var a = b.closest('.alert'); if (a) a.hidden = true; return; }
    if ((b = e.target.closest('[data-toast]'))) { toast(lang === 'en' && b.getAttribute('data-toast-en') ? b.getAttribute('data-toast-en') : b.getAttribute('data-toast')); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var ms = document.querySelectorAll('.modal-back');
      for (var i = 0; i < ms.length; i++) ms[i].hidden = true;
    }
  });

  /* ---------- สคริปต์เฉพาะหน้า ---------- */
  var PAGE = {};

  PAGE['a02-thresholds'] = function () {
    $('#btn-save').addEventListener('click', function () {
      var ok = true;
      var inputs = document.querySelectorAll('input[data-min]');
      for (var i = 0; i < inputs.length; i++) {
        var f = inputs[i].closest('.field');
        var v = parseFloat(inputs[i].value);
        var bad = isNaN(v) || v < parseFloat(inputs[i].getAttribute('data-min')) || v > parseFloat(inputs[i].getAttribute('data-max'));
        f.classList.toggle('error', bad);
        if (bad) ok = false;
      }
      show('saved-note', ok);
      if (ok) toast(tr('บันทึกแล้ว การประเมินรอบถัดไปใช้ค่าใหม่', 'Saved. The next evaluation round uses the new values'));
    });
  };

  PAGE['c01-chat-room'] = function () {
    var room = document.getElementById('room');
    var bs = document.querySelectorAll('[data-policy]');
    for (var i = 0; i < bs.length; i++) {
      bs[i].addEventListener('click', function () {
        var anon = this.getAttribute('data-policy') === 'anon';
        room.classList.toggle('anon', anon);
        var all = document.querySelectorAll('[data-policy]');
        for (var k = 0; k < all.length; k++) { all[k].classList.toggle('active', all[k] === this); all[k].setAttribute('aria-pressed', all[k] === this ? 'true' : 'false'); }
      });
    }
  };

  PAGE['c02-compose'] = function () {
    var ta = document.getElementById('msg-text'), cnt = document.getElementById('msg-count'), fld = document.getElementById('msg-field');
    var MAX = 500;
    function upd() { var n = ta.value.length; cnt.textContent = n + ' / ' + MAX; cnt.classList.toggle('over', n > MAX); }
    ta.addEventListener('input', upd);
    upd();
    document.getElementById('btn-send').addEventListener('click', function () {
      var n = ta.value.trim().length;
      var bad = n === 0 || ta.value.length > MAX;
      fld.classList.toggle('error', bad);
      if (bad) return;
      show('compose-form', false);
      show('sent-panel', true);
    });
    if (location.hash === '#resubmit') show('resubmit-note', true);
  };

  PAGE['r01-queue'] = function () {
    var target = null;
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-unlock]');
      if (b) { target = b.closest('tr'); show('m-unlock', true); return; }
      if (e.target.closest('#btn-unlock-confirm') && target) {
        var st = target.querySelector('.st'), ac = target.querySelector('.ac');
        st.innerHTML = '<span class="badge info">' + t('รอตรวจ', 'Waiting') + '</span><div class="caption">' + t('ปลดล็อกด้วยมือแล้ว (ไม่ถือเป็นการตัดสิน)', 'Manually unlocked (not a decision)') + '</div>';
        ac.innerHTML = '<a class="btn btn-sm btn-primary" href="r02-review.html">' + t('เปิดตรวจ', 'Review') + '</a>';
        applyLang(target);
        show('m-unlock', false);
        toast(tr('ปลดล็อกแล้ว ข้อความกลับเข้าคิวรออนุมัติ', 'Unlocked. The message is back in the queue'));
        target = null;
      }
    });
  };

  PAGE['r02-review'] = function () {
    var expired = false;
    var secs = 29 * 60 + 59;
    var cd = document.getElementById('countdown');
    var timer = setInterval(function () {
      if (expired) return;
      secs = Math.max(0, secs - 1);
      var m = Math.floor(secs / 60), s = secs % 60;
      cd.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      if (secs === 0) expire();
    }, 1000);

    function expire() {
      expired = true;
      clearInterval(timer);
      show('lock-active', false);
      show('lock-expired', true);
    }
    function blocked() {
      show('fr24-alert', true);
      show('decision-area', false);
      show('reject-box', false);
      var f = document.getElementById('review-form');
      var inputs = f.querySelectorAll('input,button,textarea');
      for (var i = 0; i < inputs.length; i++) inputs[i].disabled = true;
    }
    document.getElementById('btn-expire').addEventListener('click', expire);

    var radios = document.querySelectorAll('input[name=cls]');
    function onCls() {
      var v = ($('input[name=cls]:checked') || {}).value;
      document.getElementById('btn-approve').disabled = !v;
      show('neg-note', v === 'neg');
      show('cls-hint', !v);
    }
    for (var i = 0; i < radios.length; i++) radios[i].addEventListener('change', onCls);

    document.getElementById('btn-ai').addEventListener('click', function () { show('ai-result', true); });
    document.getElementById('btn-ai-use').addEventListener('click', function () {
      var r = document.getElementById('cls-non'); r.checked = true; onCls();
    });

    document.getElementById('btn-approve').addEventListener('click', function () {
      if (expired) { blocked(); return; }
      show('decision-area', false);
      show('result-approve', true);
    });
    document.getElementById('btn-reject').addEventListener('click', function () {
      if (expired) { blocked(); return; }
      show('reject-box', true);
    });
    document.getElementById('btn-reject-confirm').addEventListener('click', function () {
      var ta = document.getElementById('reason-text');
      var bad = ta.value.trim().length === 0;
      document.getElementById('reason-field').classList.toggle('error', bad);
      if (bad) return;
      if (expired) { blocked(); return; }
      show('decision-area', false);
      show('reject-box', false);
      show('result-reject', true);
    });
  };

  PAGE['r03-audit'] = function () {
    var sel = document.getElementById('f-type');
    sel.addEventListener('change', function () {
      var rows = document.querySelectorAll('#audit-body tr');
      var shown = 0;
      for (var i = 0; i < rows.length; i++) {
        var ok = sel.value === 'all' || rows[i].getAttribute('data-type') === sel.value;
        rows[i].hidden = !ok;
        if (ok) shown++;
      }
      document.getElementById('audit-count').textContent = shown;
    });
  };

  PAGE['t01-advisees'] = function () {
    var q = document.getElementById('q'), sel = document.getElementById('f-level');
    function f() {
      var rows = document.querySelectorAll('#adv-body tr'), n = 0;
      for (var i = 0; i < rows.length; i++) {
        var okq = rows[i].textContent.toLowerCase().indexOf(q.value.toLowerCase()) !== -1;
        var okl = sel.value === 'all' || rows[i].getAttribute('data-level') === sel.value;
        rows[i].hidden = !(okq && okl);
        if (okq && okl) n++;
      }
      document.getElementById('adv-count').textContent = n;
    }
    q.addEventListener('input', f);
    sel.addEventListener('change', f);
  };

  /* ---------- เริ่มทำงาน ---------- */
  function init() {
    var id = document.body.getAttribute('data-page');
    if (id && id !== 'index') buildShell();
    applyLang(document);
    if (PAGE[id]) PAGE[id]();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
