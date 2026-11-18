/* ആയിരം രാവുകൾ — app logic
   - Reads content/library.json (which texts, in which order, from which launch date)
   - Loads each text from content/texts/<id>.txt
   - Keeps the reader's ticks and start date in this browser only (localStorage)
   You normally don't need to edit this file. To add texts, see README.md. */
(() => {
  'use strict';

  const TZ = 'Asia/Kolkata';
  const KEY_READ = 'ar:read';    // { "2026-11-18": ["poem","essay"], ... }
  const KEY_START = 'ar:start';  // "2026-11-18"
  const KEY_PREFS = 'ar:reader-prefs';
  const DEFAULT_PREFS = { size: 1.16, leading: 2.05, theme: 'paper' };
  const TYPES = ['poem', 'essay', 'story'];
  const LABEL = { poem: 'കവിത', essay: 'ലേഖനം', story: 'കഥ' };
  const ARCHIVE_PAGE = 14;

  const main = document.getElementById('main');
  let LIB = null;
  let ALANKARAM = [];
  const cache = new Map();
  let archiveShown = ARCHIVE_PAGE;
  let renderedFor = null;

  /* ---------- storage (never throws) ---------- */
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, value) {
      try {
        if (value === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
      } catch { /* storage unavailable: the site still works, it just won't remember */ }
    }
  };
  const getRead = () => { const r = store.get(KEY_READ, {}); return r && typeof r === 'object' ? r : {}; };
  const getStart = () => { const s = store.get(KEY_START, null); return /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null; };

  /* ---------- dates (all as YYYY-MM-DD, Indian time) ---------- */
  const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const ms = iso => Date.parse(iso + 'T12:00:00Z');
  const addDays = (iso, n) => new Date(ms(iso) + n * 864e5).toISOString().slice(0, 10);
  const diff = (a, b) => Math.round((ms(b) - ms(a)) / 864e5);
  const fmt = (iso, opts) => { try { return new Intl.DateTimeFormat('ml-IN', { timeZone: 'UTC', ...opts }).format(new Date(ms(iso))); } catch { return iso; } };
  const fmtLong = iso => fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtShort = iso => fmt(iso, { day: 'numeric', month: 'long', year: 'numeric' });
  const num = n => Number(n).toLocaleString('en-IN');

  /* ---------- schedule ---------- */
  const dayIndex = iso => diff(LIB.launchDate, iso);
  function idsFor(iso) {
    const i = dayIndex(iso);
    if (i < 0) return null;
    const out = {};
    for (const t of TYPES) { const list = LIB[t] || []; if (!list.length) return null; out[t] = list[i % list.length]; }
    return out;
  }

  /* ---------- texts ---------- */
  function parseText(raw) {
    raw = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const cut = raw.indexOf('\n---\n');
    const head = cut >= 0 ? raw.slice(0, cut) : '';
    const meta = {};
    head.split('\n').forEach(line => { const m = line.match(/^([a-z_]+):\s*(.*)$/); if (m) meta[m[1]] = m[2].trim(); });
    meta.body = (cut >= 0 ? raw.slice(cut + 5) : raw).trim();
    return meta;
  }

  /* ---------- reader preferences ---------- */
  function getPrefs() {
    const p = store.get(KEY_PREFS, {});
    return {
      size: Math.min(1.5, Math.max(.95, Number(p.size) || DEFAULT_PREFS.size)),
      leading: Math.min(2.5, Math.max(1.6, Number(p.leading) || DEFAULT_PREFS.leading)),
      theme: ['paper', 'dark'].includes(p.theme) ? p.theme : 'paper'
    };
  }
  function applyPrefs() {
    const p = getPrefs();
    document.documentElement.style.setProperty('--read-size', p.size + 'rem');
    document.documentElement.style.setProperty('--read-leading', p.leading);
    document.body.dataset.theme = p.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = p.theme === 'dark' ? '#191a17' : '#f4efe4';
  }
  function updatePrefs(change) {
    store.set(KEY_PREFS, { ...getPrefs(), ...change });
    applyPrefs();
  }
  function updateReadingProgress() {
    const bar = document.getElementById('readingProgress');
    if (!bar) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (max > 0 ? Math.min(100, Math.max(0, window.scrollY / max * 100)) : 0) + '%';
  }

  function loadText(id) {
    if (!cache.has(id)) {
      cache.set(id, fetch('/content/texts/' + encodeURIComponent(id) + '.txt', { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error('missing ' + id); return r.text(); })
        .then(t => ({ id, ...parseText(t) }))
        .catch(() => ({ id, title: id, author: '', type: '', body: 'ഈ പാഠം കണ്ടെത്താനായില്ല (content/texts/' + id + '.txt).' })));
    }
    return cache.get(id);
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const minutes = t => Math.max(1, Math.round((t.body || '').length / 900));

  function bodyHTML(t) {
    return t.body.split(/\n\s*\n/).map(block => {
      const lines = block.split('\n');
      const verse = t.type === 'poem' || (lines.length > 1 && lines.every(l => l.length < 80));
      if (!verse) return '<p>' + esc(block) + '</p>';
      let n = '';
      const clean = lines.map(l => { const m = l.match(/^(.*?)[ \t]{3,}(\d+)[ \t]*$/); if (m) { n = m[2]; return m[1]; } return l; });
      return '<p class="stanza">' + (n ? '<span class="vn">' + n + '</span>' : '') + esc(clean.join('\n')) + '</p>';
    }).join('');
  }

  /* ---------- progress maths ---------- */
  // A day counts toward the streak only when all three are read.
  // Today never breaks the streak (the day isn't over yet).
  // One missed day per 7 days is forgiven as a rest day.
  function stats(today) {
    const read = getRead();
    const from = LIB.launchDate;
    const totals = { poem: 0, essay: 0, story: 0 };
    let full = 0;
    for (const [d, arr] of Object.entries(read)) {
      if (d < from || d > today) continue;
      const s = new Set(arr);
      for (const t of s) if (t in totals) totals[t]++;
      if (s.size >= 3) full++;
    }
    let run = 0, best = 0, rest;
    for (let d = from; d <= today; d = addDays(d, 1)) {
      const done = new Set(read[d] || []).size >= 3;
      if (done) { run++; best = Math.max(best, run); }
      else if (d === today) { /* still time today */ }
      else if (run > 0 && (!rest || diff(rest, d) >= 7)) { rest = d; }
      else { run = 0; rest = undefined; }
    }
    return { totals, full, streak: run, best, resting: !!rest && diff(rest, today) < 7 };
  }
  function tickedSince(start, today) {
    const read = getRead();
    const from = start > LIB.launchDate ? start : LIB.launchDate;
    let ticked = 0;
    for (const [d, arr] of Object.entries(read)) if (d >= from && d <= today) ticked += new Set(arr).size;
    return { ticked, total: Math.max(0, diff(from, today) + 1) * 3 };
  }
  function setRead(date, type, on) {
    const read = getRead();
    const s = new Set(read[date] || []);
    on ? s.add(type) : s.delete(type);
    if (s.size) read[date] = [...s]; else delete read[date];
    store.set(KEY_READ, read);
  }
  const isRead = (date, type) => (getRead()[date] || []).includes(type);
  function dayState(date) {
    const n = new Set(getRead()[date] || []).size;
    return n >= 3 ? 'full' : n > 0 ? 'partial' : '';
  }

  /* ---------- views ---------- */
  function setNav(name) {
    document.querySelectorAll('[data-nav]').forEach(a => {
      if (a.dataset.nav === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  async function renderDay(date, isToday) {
    const today = todayISO();
    const ids = idsFor(date);
    setNav(isToday ? 'today' : 'archive');
    if (!ids || date > today) {
      main.innerHTML = '<h1 class="date">' + esc(fmtLong(date)) + '</h1><p class="muted">ഈ ദിവസത്തേക്ക് വായനകളില്ല.</p><p><a href="#today">ഇന്നത്തെ വായനയിലേക്ക്</a></p>';
      return;
    }
    const texts = await Promise.all(TYPES.map(t => loadText(ids[t])));
    const idx = dayIndex(date);

    let html = '<h1 class="date">' + esc(fmtLong(date)) + '</h1>';
    html += '<p class="dayline">' + (isToday ? 'ഇന്നത്തെ വായന' : 'പഴയ ദിവസത്തെ വായന') + ' · പ്രസിദ്ധീകരണത്തിന്റെ ' + num(idx + 1) + '-ാം ദിവസം</p>';
    html += '<section class="reader-tools" aria-label="വായനാ ക്രമീകരണങ്ങൾ"><div class="tool-group"><span class="tool-label">അക്ഷരവലുപ്പം</span><button type="button" data-size-down aria-label="അക്ഷരം ചെറുതാക്കുക">A−</button><button type="button" data-size-up aria-label="അക്ഷരം വലുതാക്കുക">A+</button><button type="button" data-leading>വരി അകലം</button></div><div class="tool-group"><button type="button" data-theme>നിറം മാറ്റുക</button><button type="button" data-focus>ശ്രദ്ധയോടെ വായിക്കുക</button><button type="button" data-focus-exit hidden>സാധാരണ കാഴ്ച</button></div></section>';
    if (isToday) html += '<section class="panel" id="panel" aria-live="polite"></section>';
    html += '<ol class="readings">';
    TYPES.forEach((type, i) => {
      const t = texts[i];
      const by = [t.author, t.year].filter(Boolean).join(' · ');
      html += '<li class="reading" id="r-' + type + '">'
        + '<p class="kind ' + type + '">' + LABEL[type] + '</p>'
        + '<h2>' + esc(t.title) + '</h2>'
        + '<p class="byline">' + esc(by) + ' · ഏകദേശം ' + num(minutes(t)) + ' മിനിറ്റ്</p>'
        + '<div class="row-actions">'
        + '<button class="btn ghost" type="button" data-open="' + type + '" aria-expanded="false" aria-controls="text-' + type + '">വായിക്കാം</button>'
        + '<label class="tick"><input type="checkbox" data-date="' + date + '" data-type="' + type + '"' + (isRead(date, type) ? ' checked' : '') + '> വായിച്ചു</label>'
        + '</div>'
        + '<div id="text-' + type + '" hidden>'
        + '<div class="text ' + type + '" lang="ml">' + (t.note ? '<p class="note">' + esc(t.note) + '</p>' : '') + bodyHTML(t) + '</div>'
        + '<p class="source">ഉറവിടം: ' + (t.source_url ? '<a href="' + esc(t.source_url) + '">' + esc(t.source || 'ഉറവിടം') + '</a>' : esc(t.source || '')) + (t.author_died ? ' · രചയിതാവ് അന്തരിച്ചത് ' + esc(t.author_died) : '') + '</p>'
        + '<div class="endbar"><button class="btn" type="button" data-finish="' + type + '">വായിച്ചു തീർന്നു ✓</button>'
        + '<button class="linkbtn" type="button" data-close="' + type + '">അടയ്ക്കുക</button></div>'
        + '</div>'
        + '</li>';
    });
    html += '</ol>';

    if (ALANKARAM.length) {
      const a = ALANKARAM[idx % ALANKARAM.length];
      html += '<section class="extra"><h2>ഇന്നത്തെ അലങ്കാരം</h2><h3>' + esc(a.name) + '</h3>'
        + '<p>' + esc(a.definition) + '</p>'
        + '<blockquote>' + esc(a.example) + '<cite>— ' + esc(a.exampleSource) + '</cite></blockquote>'
        + '<p class="muted">' + esc(a.explanation) + '</p></section>';
    }

    html += '<div class="share"><button class="btn ghost" type="button" data-share>ഈ ദിവസത്തെ വായന പങ്കിടാം</button><span class="status" data-share-status></span></div>';

    const prev = addDays(date, -1), next = addDays(date, 1);
    html += '<p class="muted" style="margin-top:2rem">';
    if (prev >= LIB.launchDate) html += '<a href="#d-' + prev + '">← തലേദിവസം</a>';
    if (!isToday && next <= today) html += (prev >= LIB.launchDate ? ' · ' : '') + '<a href="' + (next === today ? '#today' : '#d-' + next) + '">അടുത്ത ദിവസം →</a>';
    html += ' · <a href="#archive">എല്ലാ ദിവസങ്ങളും</a></p>';

    main.innerHTML = html;
    renderedFor = today;
    if (isToday) renderPanel();
    wireDay(date, texts);
  }

  function wireDay(date, texts) {
    const toolbar=main.querySelector('.reader-tools');
    toolbar.querySelector('[data-size-down]').addEventListener('click',()=>updatePrefs({size:Math.max(.95,getPrefs().size-.08)}));
    toolbar.querySelector('[data-size-up]').addEventListener('click',()=>updatePrefs({size:Math.min(1.5,getPrefs().size+.08)}));
    toolbar.querySelector('[data-leading]').addEventListener('click',()=>updatePrefs({leading:getPrefs().leading>=2.3?1.8:+(getPrefs().leading+.15).toFixed(2)}));
    toolbar.querySelector('[data-theme]').addEventListener('click',()=>updatePrefs({theme:getPrefs().theme==='paper'?'dark':'paper'}));
    const focusOff=()=>{document.body.classList.remove('focus-mode');main.querySelectorAll('.reading').forEach(el=>el.classList.remove('is-focused'));toolbar.querySelector('[data-focus]').hidden=false;toolbar.querySelector('[data-focus-exit]').hidden=true;};
    toolbar.querySelector('[data-focus]').addEventListener('click',()=>{
      document.body.classList.add('focus-mode');
      toolbar.querySelector('[data-focus]').hidden=true;
      toolbar.querySelector('[data-focus-exit]').hidden=false;
      open(TYPES[0],true);
    });
    toolbar.querySelector('[data-focus-exit]').addEventListener('click',focusOff);
    const open = (type, show) => {
      const box = document.getElementById('text-' + type);
      const btn = main.querySelector('[data-open="' + type + '"]');
      box.hidden = !show;
      btn.setAttribute('aria-expanded', String(show));
      btn.textContent = show ? 'ചുരുക്കുക' : 'വായിക്കാം';
      if(show&&document.body.classList.contains('focus-mode'))main.querySelectorAll('.reading').forEach(el=>el.classList.toggle('is-focused',el.id==='r-'+type));
      if(!show&&document.body.classList.contains('focus-mode'))focusOff();
    };
    main.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => open(b.dataset.open, b.getAttribute('aria-expanded') !== 'true')));
    main.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
      open(b.dataset.close, false);
      document.getElementById('r-' + b.dataset.close).scrollIntoView({ block: 'start' });
    }));
    main.querySelectorAll('input[data-type]').forEach(cb => cb.addEventListener('change', () => {
      setRead(cb.dataset.date, cb.dataset.type, cb.checked);
      renderPanel();
    }));
    main.querySelectorAll('[data-finish]').forEach(b => b.addEventListener('click', () => {
      const type = b.dataset.finish;
      const cb = main.querySelector('input[data-type="' + type + '"]');
      if (!cb.checked) { cb.checked = true; setRead(date, type, true); renderPanel(); }
      open(type, false);
      const nextType = TYPES.find(t => !isRead(date, t));
      document.getElementById('r-' + (nextType || type)).scrollIntoView({ block: 'start' });
    }));
    const shareBtn = main.querySelector('[data-share]');
    shareBtn.addEventListener('click', async () => {
      const status = main.querySelector('[data-share-status]');
      const url = location.href.split('#')[0];
      const text = LIB.siteName + ' — ' + fmtLong(date) + '\n'
        + TYPES.map((t, i) => LABEL[t] + ': ' + texts[i].title + (texts[i].author ? ' (' + texts[i].author + ')' : '')).join('\n')
        + '\n' + url;
      try { await navigator.clipboard.writeText(text); status.textContent = 'പകർത്തി. WhatsApp-ലോ മറ്റെവിടെയെങ്കിലുമോ ഒട്ടിക്കാം.'; }
      catch { status.textContent = text; }
    });
  }

  function renderPanel() {
    const panel = document.getElementById('panel');
    if (!panel) return;
    const today = todayISO();
    const start = getStart();
    const s = stats(today);
    const anyTicks = s.totals.poem + s.totals.essay + s.totals.story > 0;
    const todayCount = new Set(getRead()[today] || []).size;
    let h = '';

    if (!start) {
      h += '<h2>വെല്ലുവിളി ഏറ്റെടുക്കുന്നോ?</h2>'
        + '<p>നിങ്ങളുടെ ' + num(LIB.challengeDays) + ' ദിവസം എണ്ണിത്തുടങ്ങാം. എണ്ണം ഈ ബ്രൗസറിൽ മാത്രമാണ് സൂക്ഷിക്കുന്നത്.</p>'
        + '<button class="btn" type="button" data-start>ഇന്നുതന്നെ തുടങ്ങാം</button>'
        + '<details style="margin-top:.8rem"><summary>മുമ്പൊരു ദിവസം തുടങ്ങിയതാണോ?</summary>'
        + '<form data-start-form><input type="date" name="start" max="' + today + '" required aria-label="തുടങ്ങിയ തീയതി"><button class="btn ghost" type="submit">ആ ദിവസം മുതൽ എണ്ണാം</button></form></details>';
    } else {
      const day = Math.max(1, diff(start, today) + 1);
      const p = tickedSince(start, today);
      h += '<p class="big">' + (day <= LIB.challengeDays
        ? 'നിങ്ങളുടെ ' + num(LIB.challengeDays) + '-ൽ ' + num(day) + '-ാം ദിവസം'
        : 'നിങ്ങളുടെ വെല്ലുവിളിയുടെ ' + num(day) + '-ാം ദിവസം') + '</p>'
        + '<p>' + esc(fmtShort(start)) + '-ന് തുടങ്ങി. അന്നുമുതൽ ' + num(p.total) + '-ൽ ' + num(p.ticked) + ' വായനകൾ പൂർത്തിയാക്കി.</p>';
    }

    if (anyTicks || start) {
      h += '<div class="stats">'
        + '<div class="stat"><b>' + num(s.totals.poem) + '</b><span>കവിതകൾ</span></div>'
        + '<div class="stat"><b>' + num(s.totals.essay) + '</b><span>ലേഖനങ്ങൾ</span></div>'
        + '<div class="stat"><b>' + num(s.totals.story) + '</b><span>കഥകൾ</span></div>'
        + '<div class="stat"><b>' + num(s.full) + '</b><span>പൂർണ്ണ ദിനങ്ങൾ</span></div>'
        + '</div>';
      const extra = [
        'ഇന്ന് ' + todayCount + '/3',
        s.best > s.streak ? 'മികച്ചത്: ' + num(s.best) + ' ദിവസം' : '',
        s.resting ? 'ഈ ആഴ്ചയിലെ വിശ്രമദിനം എടുത്തു' : ''
      ].filter(Boolean).join(' · ');
      h += '<p class="streakline">' + (s.streak > 0 ? 'തുടർച്ചയായി ' + num(s.streak) + ' ദിവസം' : 'മൂന്നും വായിച്ചാൽ തുടർച്ച തുടങ്ങും')
        + ' <small>· ' + esc(extra) + '</small></p>';
    }

    if (start) {
      h += '<div class="panel-actions">'
        + '<button class="linkbtn" type="button" data-backup>പുരോഗതി പകർത്തിവയ്ക്കുക</button>'
        + '<button class="linkbtn" type="button" data-restore>പുനഃസ്ഥാപിക്കുക</button>'
        + '<button class="linkbtn" type="button" data-stop>എണ്ണം നിർത്തുക</button>'
        + '</div><div data-slot></div>';
    }
    panel.innerHTML = h;
    wirePanel(panel);
  }

  function wirePanel(panel) {
    const slot = panel.querySelector('[data-slot]');
    panel.querySelector('[data-start]')?.addEventListener('click', () => { store.set(KEY_START, todayISO()); renderPanel(); });
    panel.querySelector('[data-start-form]')?.addEventListener('submit', e => {
      e.preventDefault();
      const v = e.target.elements.start.value;
      if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= todayISO()) { store.set(KEY_START, v); renderPanel(); }
    });
    panel.querySelector('[data-stop]')?.addEventListener('click', () => {
      slot.innerHTML = '<div class="confirm"><p>എണ്ണം നിർത്തണോ? വായിച്ചതായി അടയാളപ്പെടുത്തിയവ നഷ്ടപ്പെടില്ല.</p>'
        + '<div class="row"><button class="btn" type="button" data-yes>അതെ, നിർത്താം</button><button class="btn ghost" type="button" data-no>വേണ്ട</button></div></div>';
      slot.querySelector('[data-yes]').addEventListener('click', () => { store.set(KEY_START, undefined); renderPanel(); });
      slot.querySelector('[data-no]').addEventListener('click', () => { slot.innerHTML = ''; });
    });
    panel.querySelector('[data-backup]')?.addEventListener('click', async () => {
      const code = JSON.stringify({ start: getStart(), read: getRead() });
      try { await navigator.clipboard.writeText(code); slot.innerHTML = '<p class="status">പകർത്തി. ഫോണിലോ മറ്റൊരു ബ്രൗസറിലോ “പുനഃസ്ഥാപിക്കുക” വഴി ഒട്ടിച്ചാൽ മതി.</p>'; }
      catch { slot.innerHTML = '<p class="status">താഴെയുള്ളത് മുഴുവൻ പകർത്തി സൂക്ഷിക്കുക:</p><textarea readonly>' + esc(code) + '</textarea>'; }
    });
    panel.querySelector('[data-restore]')?.addEventListener('click', () => {
      slot.innerHTML = '<div class="confirm"><p>പകർത്തിവച്ച പുരോഗതി ഇവിടെ ഒട്ടിക്കുക:</p><textarea data-code></textarea>'
        + '<div class="row" style="margin-top:.5rem"><button class="btn" type="button" data-apply>പുനഃസ്ഥാപിക്കുക</button><button class="btn ghost" type="button" data-no>വേണ്ട</button></div><p class="status" data-msg></p></div>';
      slot.querySelector('[data-no]').addEventListener('click', () => { slot.innerHTML = ''; });
      slot.querySelector('[data-apply]').addEventListener('click', () => {
        try {
          const o = JSON.parse(slot.querySelector('[data-code]').value);
          if (!o || typeof o.read !== 'object') throw 0;
          store.set(KEY_READ, o.read);
          if (o.start) store.set(KEY_START, o.start);
          route();
        } catch { slot.querySelector('[data-msg]').textContent = 'ഇത് ശരിയായ പുരോഗതി-കോഡ് അല്ല.'; }
      });
    });
  }

  async function renderArchive() {
    setNav('archive');
    const today = todayISO();
    const days = [];
    for (let d = today; d >= LIB.launchDate && days.length < archiveShown; d = addDays(d, -1)) days.push(d);
    const totalDays = diff(LIB.launchDate, today) + 1;
    const rows = await Promise.all(days.map(async d => {
      const ids = idsFor(d);
      const ts = await Promise.all(TYPES.map(t => loadText(ids[t])));
      const st = dayState(d);
      const label = st === 'full' ? 'മൂന്നും വായിച്ചു' : st === 'partial' ? 'ഭാഗികമായി വായിച്ചു' : 'വായിച്ചിട്ടില്ല';
      return '<li><a href="' + (d === today ? '#today' : '#d-' + d) + '">'
        + '<span class="dot ' + st + '" role="img" aria-label="' + label + '"></span>'
        + '<span class="d">' + esc(fmtLong(d)) + (d === today ? ' · ഇന്ന്' : '') + '</span>'
        + '<span class="t">' + TYPES.map((t, i) => LABEL[t] + ': ' + esc(ts[i].title)).join(' · ') + '</span>'
        + '</a></li>';
    }));
    let h = '<h1 class="date">ശേഖരം</h1><p class="dayline">ഓരോ ദിവസത്തെ വായനയും ഇവിടെ എന്നും ഉണ്ടാകും. വിട്ടുപോയത് എപ്പോൾ വേണമെങ്കിലും വായിക്കാം.</p>'
      + '<p class="legend"><span><span class="dot full"></span>മൂന്നും വായിച്ചു</span><span><span class="dot partial"></span>ഭാഗികമായി</span><span><span class="dot"></span>വായിച്ചിട്ടില്ല</span></p>'
      + '<ul class="archive">' + rows.join('') + '</ul>';
    if (totalDays > days.length) h += '<button class="btn ghost" type="button" data-more>കൂടുതൽ ദിവസങ്ങൾ</button>';
    main.innerHTML = h;
    renderedFor = today;
    main.querySelector('[data-more]')?.addEventListener('click', () => { archiveShown += ARCHIVE_PAGE; renderArchive(); });
  }

  function renderAbout() {
    setNav('about');
    main.innerHTML = '<article class="prose">'
      + '<h1>എന്താണ് ' + esc(LIB.siteName) + '?</h1>'
      + '<p>എഴുത്തുകാരനാകാൻ ആഗ്രഹിക്കുന്നവർക്ക് റേ ബ്രാഡ്ബറി ഒരിക്കൽ ഒരു ലളിതമായ ഉപദേശം നൽകി: ആയിരം രാത്രികൾ, ഉറങ്ങുന്നതിനു മുമ്പ് ഒരു കവിതയും ഒരു ലേഖനവും ഒരു കഥയും വായിക്കുക. ആയിരം രാത്രി കഴിയുമ്പോൾ മനസ്സ് നിറയെ വാക്കുകളും ആശയങ്ങളും ആയിരിക്കും.</p>'
      + '<p>ആ ശീലം മലയാളത്തിൽ ചെയ്യാനുള്ള ഒരിടമാണിത്. എല്ലാ ദിവസവും ഇവിടെ ഒരു കവിതയും ഒരു ലേഖനവും ഒരു കഥയും ഉണ്ടാകും — ആശാൻ മുതൽ ഐതിഹ്യമാല വരെ.</p>'
      + '<h2>എങ്ങനെ?</h2>'
      + '<ul><li>മൂന്നും ഏതു ക്രമത്തിലും വായിക്കാം; ഒറ്റയിരിപ്പിലോ ദിവസം മുഴുവൻ കൊണ്ടോ.</li>'
      + '<li>വായിച്ചു കഴിഞ്ഞാൽ “വായിച്ചു” എന്ന് അടയാളപ്പെടുത്തുക.</li>'
      + '<li>മൂന്നും വായിച്ച ദിവസമാണ് പൂർണ്ണ ദിനം. പൂർണ്ണ ദിനങ്ങൾ ചേർന്നാണ് തുടർച്ച.</li>'
      + '<li>ഇന്നത്തെ ദിവസം കഴിയുന്നതുവരെ തുടർച്ച മുറിയില്ല. ആഴ്ചയിൽ ഒരു ദിവസം വിശ്രമിക്കാം.</li>'
      + '<li>ഇടവേളയ്ക്ക് ശിക്ഷയില്ല. പഴയ ദിവസങ്ങൾ ശേഖരത്തിൽ എന്നും ഉണ്ടാകും.</li></ul>'
      + '<h2>സ്വകാര്യത</h2>'
      + '<p>അക്കൗണ്ടോ ഇമെയിലോ വേണ്ട. നിങ്ങളുടെ വായനയുടെ കണക്ക് ഈ ബ്രൗസറിൽ മാത്രമാണ്. ഫോൺ മാറുമ്പോൾ “പുരോഗതി പകർത്തിവയ്ക്കുക” ഉപയോഗിക്കുക.</p>'
      + '<h2>കൃതികൾ</h2>'
      + '<p>ഇപ്പോൾ ഇവിടെയുള്ള എല്ലാ കൃതികളും പകർപ്പവകാശ കാലാവധി കഴിഞ്ഞവയാണ് (ഇന്ത്യയിൽ, രചയിതാവ് മരിച്ച് 60 വർഷം). പാഠങ്ങൾ മലയാളം വിക്കിഗ്രന്ഥശാലയിൽ നിന്ന്; ഓരോ കൃതിക്കും താഴെ ഉറവിടം കൊടുത്തിട്ടുണ്ട്.</p>'
      + '<blockquote>ഒരു കവിത, ഒരു ലേഖനം, ഒരു കഥ. ആയിരം രാവുകൾ.</blockquote>'
      + '</article>';
    renderedFor = todayISO();
  }

  /* ---------- router ---------- */
  async function route() {
    const h = location.hash.slice(1) || 'today';
    const m = h.match(/^d-(\d{4}-\d{2}-\d{2})$/);
    try {
      if (h === 'archive') await renderArchive();
      else if (h === 'about') renderAbout();
      else if (m) await renderDay(m[1], m[1] === todayISO());
      else await renderDay(todayISO(), true);
    } catch (e) {
      main.innerHTML = '<p class="muted">പേജ് ലോഡ് ചെയ്യാനായില്ല. ഒന്നുകൂടി ശ്രമിക്കുക.</p>';
      console.error(e);
    }
    if (h !== 'today' && document.activeElement === document.body) main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  async function init() {
    try {
      LIB = await fetch('/content/library.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('library.json HTTP ' + r.status); return r.json(); });
      ALANKARAM = await fetch('/content/alankaram.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : []).catch(() => []);
    } catch (e) {
      main.innerHTML = '<p class="muted">content/library.json വായിക്കാനായില്ല. README.md നോക്കുക.</p>';
      return;
    }
    document.getElementById('siteName').textContent = LIB.siteName;
    document.getElementById('tagline').textContent = LIB.tagline;
    document.title = LIB.siteName;
    applyPrefs();
    window.addEventListener('scroll', updateReadingProgress, {passive:true});
    window.addEventListener('resize', updateReadingProgress);
    window.addEventListener('hashchange',()=>{document.body.classList.remove('focus-mode');route();});
    // If the tab stays open past midnight, show the new day's readings when the reader comes back.
    document.addEventListener('visibilitychange', () => { if (!document.hidden && renderedFor && renderedFor !== todayISO()) route(); });
    route().then(updateReadingProgress);
  }

  init();
})();
