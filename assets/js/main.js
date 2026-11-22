/* =========================================================================
   DigitalAdvero — putovanje kroz zoetrop
   Skrolanje pokreće kameru: otvaranje → spuštanje niz okno → soba sa zidom
   ekrana (projekti se skidaju sa zida) → penjanje → završni ekran (kontakt).
   ========================================================================= */
(function () {
  'use strict';

  var doc = document, root = doc.documentElement, body = doc.body;
  var CFG = window.DIGITALADVERO_CONFIG || {};
  var query = new URLSearchParams(location.search);
  var CAPTURE = query.has('capture');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var Z = window.DAZoetrope;

  /* ---------------- pomoćne funkcije ---------------- */
  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function damp(a, b, k, dt) { return lerp(a, b, 1 - Math.exp(-k * dt)); }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function eio(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function eo3(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function prog(v, a, b) { return b > a ? clamp((v - a) / (b - a), 0, 1) : (v >= b ? 1 : 0); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function absTop(el) { return el.getBoundingClientRect().top + window.scrollY; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var DEG = Math.PI / 180;

  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
  body.classList.add('at-open');

  /* ---------------- dijeljenje teksta ---------------- */
  function splitChars(el, start) {
    var text = el.textContent, i = start || 0; el.textContent = '';
    text.split(/(\s+)/).forEach(function (part) {
      if (!part) return;
      if (/^\s+$/.test(part)) { el.appendChild(doc.createTextNode(' ')); return; }
      var w = doc.createElement('span'); w.className = 'word';
      Array.from(part).forEach(function (ch) { var s = doc.createElement('span'); s.className = 'char'; s.textContent = ch; s.style.setProperty('--i', i++); w.appendChild(s); });
      el.appendChild(w);
    });
    return i;
  }
  var ci = 0; $$('[data-split-chars]').forEach(function (el) { ci = splitChars(el, ci); });
  var titleChars = $$('.j-title .char');

  /* ---------------- kontakt podaci (config.js) ---------------- */
  function digits(s) { return String(s || '').replace(/[^\d]/g, ''); }
  function safeUrl(u) { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; }
  if (CFG.website) CFG.website = safeUrl(CFG.website);
  if (CFG.social) Object.keys(CFG.social).forEach(function (k) { CFG.social[k] = safeUrl(CFG.social[k]); });
  if (CFG.form && CFG.form.endpoint) CFG.form.endpoint = safeUrl(CFG.form.endpoint);
  var SOCIAL = {
    instagram: ['Instagram', '<svg viewBox="0 0 24 24"><path d="M12 7.3A4.7 4.7 0 1 0 16.7 12 4.7 4.7 0 0 0 12 7.3zm0 7.8A3.1 3.1 0 1 1 15.1 12 3.1 3.1 0 0 1 12 15.1zM17 5.9a1.1 1.1 0 1 0 1.1 1.1A1.1 1.1 0 0 0 17 5.9zM21 7.1a5.4 5.4 0 0 0-1.5-3.8A5.4 5.4 0 0 0 15.7 2C14.2 2 9.8 2 8.3 2a5.4 5.4 0 0 0-3.8 1.5A5.4 5.4 0 0 0 3 7.1C3 8.6 3 15.4 3 16.9a5.4 5.4 0 0 0 1.5 3.8A5.4 5.4 0 0 0 8.3 22c1.5.1 5.9.1 7.4 0a5.4 5.4 0 0 0 3.8-1.5 5.4 5.4 0 0 0 1.5-3.8c.1-1.5.1-8.3 0-9.6zm-2 11.5a3.1 3.1 0 0 1-1.8 1.8c-1.2.5-4.1.4-5.2.4s-4 .1-5.2-.4a3.1 3.1 0 0 1-1.8-1.8c-.5-1.2-.4-4.1-.4-5.4s-.1-4.2.4-5.4a3.1 3.1 0 0 1 1.8-1.8c1.2-.5 4.1-.4 5.2-.4s4-.1 5.2.4a3.1 3.1 0 0 1 1.8 1.8c.5 1.2.4 4.1.4 5.4s.1 4.2-.4 5.4z"/></svg>'],
    facebook: ['Facebook', '<svg viewBox="0 0 24 24"><path d="M14 8.5V6.6c0-.9.6-1.1 1-1.1h2.7V2h-3.7C10 2 9.6 4.9 9.6 6.6v1.9H7v3.7h2.6V22h4.4v-9.8h3l.4-3.7z"/></svg>'],
    linkedin: ['LinkedIn', '<svg viewBox="0 0 24 24"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3zM9.5 9.5h3.8v1.6h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.1c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V21h-4z"/></svg>'],
    tiktok: ['TikTok', '<svg viewBox="0 0 24 24"><path d="M16.6 5.8A4.5 4.5 0 0 1 15.5 3h-3.2v12.5a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.9 5.9 0 0 0-.8-.1 5.8 5.8 0 1 0 5.8 5.8V9.1a7.6 7.6 0 0 0 4.5 1.4V7.3a4.5 4.5 0 0 1-3.4-1.5z"/></svg>'],
    youtube: ['YouTube', '<svg viewBox="0 0 24 24"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.8 15.1V8.9l5.8 3.1z"/></svg>'],
    behance: ['Behance', '<svg viewBox="0 0 24 24"><path d="M8.2 11.4c.9-.4 1.5-1.2 1.5-2.4C9.7 6.6 8 6 6 6H0v12h6.2c2.3 0 4.5-1.1 4.5-3.7 0-1.6-.8-2.6-2.5-2.9zM2.7 8h2.6c1 0 1.9.3 1.9 1.4S6.5 11 5.6 11H2.7zm2.9 7.9H2.7v-3.2h3c1.2 0 2 .5 2 1.8s-.9 1.4-2.1 1.4zM20.4 7.1h-5.2V5.8h5.2zm1.3 6.6c0-2.6-1.5-4.7-4.2-4.7s-4.4 2-4.4 4.6 1.6 4.6 4.4 4.6c2.1 0 3.5-.9 4.1-2.9h-2.1c-.2.7-1.2 1.1-1.9 1.1-1.4 0-2.1-.8-2.1-2.2h6.2zm-6.2-1.1c.1-1.1.8-1.8 2-1.8s1.7.7 1.8 1.8z"/></svg>']
  };
  var items = [];
  if (CFG.email) items.push({ k: 'E-mail', label: CFG.email, href: 'mailto:' + CFG.email });
  if (CFG.phone) items.push({ k: 'Telefon', label: CFG.phone, href: 'tel:+' + digits(CFG.phone).replace(/^0+/, '') });
  if (CFG.whatsapp) items.push({ k: 'WhatsApp', label: '+' + digits(CFG.whatsapp), href: 'https://wa.me/' + digits(CFG.whatsapp), ext: true });
  if (CFG.viber) items.push({ k: 'Viber', label: '+' + digits(CFG.viber), href: 'viber://chat?number=%2B' + digits(CFG.viber) });
  if (CFG.location) items.push({ k: 'Lokacija', label: CFG.location });
  if (CFG.workingHours) items.push({ k: 'Radno vrijeme', label: CFG.workingHours });
  if (CFG.website) items.push({ k: 'Web', label: CFG.website.replace(/^https?:\/\//, '').replace(/\/$/, ''), href: CFG.website, ext: true });
  var socials = Object.keys(SOCIAL).filter(function (k) { return CFG.social && CFG.social[k]; });
  function linkHtml(it) { return it.href ? '<a href="' + esc(it.href) + '"' + (it.ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(it.label) + '</a>' : '<span>' + esc(it.label) + '</span>'; }
  var socialHtml = socials.map(function (k) { return '<a href="' + esc(CFG.social[k]) + '" target="_blank" rel="noopener" aria-label="' + SOCIAL[k][0] + '">' + SOCIAL[k][1] + '</a>'; }).join('');
  $$('[data-contact-list]').forEach(function (b) { b.innerHTML = items.map(function (it) { return '<div class="contact-item"><small>' + esc(it.k) + '</small>' + linkHtml(it) + '</div>'; }).join(''); });
  $$('[data-socials]').forEach(function (b) { b.innerHTML = socialHtml; });
  var inline = $('[data-contact-inline]');
  if (inline) inline.innerHTML = items.filter(function (it) { return it.href; }).slice(0, 3).map(linkHtml).join('') + (socialHtml ? '<span class="socials">' + socialHtml + '</span>' : '');
  if (!items.length && !socials.length && !CAPTURE && /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname)) {
    var note = doc.createElement('div');
    note.setAttribute('style', 'position:fixed;left:16px;bottom:16px;z-index:150;max-width:330px;padding:12px 16px;border-radius:12px;background:#2a1f05;border:1px solid #ffb547;color:#ffe3b0;font:500 13px/1.45 var(--sans)');
    note.textContent = 'Napomena (vidljivo samo lokalno): upišite svoje kontakt podatke i društvene mreže u assets/js/config.js.';
    body.appendChild(note);
  }

  /* ---------------- forma ---------------- */
  var form = $('[data-contact-form]');
  if (form) {
    var status = $('[data-form-status]', form);
    var setStatus = function (msg, type) { status.textContent = msg; status.className = 'form-status' + (type ? ' is-' + type : ''); };
    form.addEventListener('input', function (e) { var f = e.target.closest('.field'); if (f) f.classList.remove('is-invalid'); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form), ok = true;
      ['ime', 'email', 'poruka'].forEach(function (n) {
        var input = form.elements[n], v = (input.value || '').trim();
        var bad = !v || (n === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v));
        input.closest('.field').classList.toggle('is-invalid', bad); if (bad) ok = false;
      });
      if (!ok) { setStatus('Molimo ispravno popunite označena polja.', 'err'); return; }
      if (fd.get('_gotcha')) { setStatus('Hvala! Vaš upit je poslan.', 'ok'); form.reset(); return; }
      var lines = ['Ime i prezime: ' + fd.get('ime'), fd.get('firma') ? 'Firma: ' + fd.get('firma') : '', 'E-mail: ' + fd.get('email'),
        fd.get('telefon') ? 'Telefon: ' + fd.get('telefon') : '', fd.get('usluga') ? 'Usluga: ' + fd.get('usluga') : '', '', String(fd.get('poruka'))]
        .filter(function (l, i) { return l !== '' || i === 5; }).join('\n');
      var subject = 'Upit s portfolija' + (fd.get('usluga') ? ' — ' + fd.get('usluga') : '');
      var btn = $('button[type="submit"]', form);
      if (CFG.form && CFG.form.endpoint) {
        btn.disabled = true; setStatus('Šaljemo vaš upit…');
        fd.delete('_gotcha'); fd.append('_subject', subject);
        fetch(CFG.form.endpoint, { method: 'POST', body: fd, headers: { Accept: 'application/json' } })
          .then(function (r) { if (!r.ok) throw new Error(r.status); setStatus('Hvala! Vaš upit je uspješno poslan — javit ćemo vam se uskoro.', 'ok'); form.reset(); })
          .catch(function () { setStatus('Slanje nije uspjelo. Molimo pokušajte ponovo ili nas kontaktirajte direktno.', 'err'); })
          .then(function () { btn.disabled = false; });
      } else if (CFG.email) {
        location.href = 'mailto:' + CFG.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines);
        setStatus('Otvaramo vaš e-mail program s pripremljenom porukom…', 'ok');
      } else if (CFG.whatsapp) {
        window.open('https://wa.me/' + digits(CFG.whatsapp) + '?text=' + encodeURIComponent(subject + '\n\n' + lines), '_blank', 'noopener');
        setStatus('Otvaramo WhatsApp s pripremljenom porukom…', 'ok');
      } else {
        setStatus('Slanje trenutno nije dostupno. Molimo pokušajte ponovo kasnije.', 'err');
        console.warn('[DigitalAdvero] Forma nema odredište: postavite "email" ili "form.endpoint" u assets/js/config.js');
      }
    });
  }

  /* ---------------- projekti ---------------- */
  var wall = $('[data-wall]');
  var stageEl = $('.j-wall__stage');
  var projects = $$('[data-project]').map(function (el, i) {
    var accent = el.getAttribute('data-accent') || '#b9c4ff';
    el.style.setProperty('--accent', accent);
    var t = $('.project__title', el), title = t.textContent.trim();
    splitChars(t, 0);
    var meta = $('.project__meta', el);
    return { el: el, i: i, accent: accent, title: title, cover: el.getAttribute('data-cover'), coverSm: el.getAttribute('data-cover-sm') || el.getAttribute('data-cover'),
      metaHTML: meta ? meta.innerHTML : '', isDemo: !!$('.badge', el), tpl: $('template.project__details', el) };
  });
  var N = projects.length;
  if (wall) wall.style.setProperty('--count', N);
  var idxList = $('[data-wall-index]'), idxSub = $('[data-index-projects]');
  var curEl = $('[data-wall-current]'), totEl = $('[data-wall-total]');
  if (totEl) totEl.textContent = String(N).padStart(2, '0');
  projects.forEach(function (p, i) {
    var li = doc.createElement('li');
    li.innerHTML = '<button type="button">' + esc(p.title) + '</button>';
    li.firstChild.addEventListener('click', function () { goToProject(i); });
    idxList.appendChild(li);
    var sli = doc.createElement('li');
    sli.innerHTML = '<a href="#' + esc(p.el.id) + '" data-project-link="' + i + '">' + esc(p.title) + '</a>';
    idxSub.appendChild(sli);
    var open = $('[data-project-open]', p.el); if (open) open.addEventListener('click', function () { openModal(i); });
  });

  /* ---------------- glatko skrolanje ---------------- */
  var lenis = null;
  if (!reduced && !CAPTURE && window.Lenis) {
    try { lenis = new window.Lenis({ duration: 1.3, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }, smoothWheel: true, touchMultiplier: 1.4 }); } catch (e) { lenis = null; }
  }
  function scrollToY(y, fast) {
    if (lenis) lenis.scrollTo(y, { duration: fast ? 1.2 : 2.4, force: true });
    else window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
  }

  /* ---------------- mjerenja (granice faza) ---------------- */
  var openSec = $('#pocetak'), wallIntro = $('.j-wall__intro'), endSec = $('#kontakt'), whySec = $('#zasto');
  var openTitle = $('[data-open-title]'), cue = $('[data-cue]'), endInner = $('[data-end]');
  var header = $('[data-header]');
  var caps = $$('[data-cap]');
  var L = {};
  function measure() {
    L.vw = window.innerWidth; L.vh = window.innerHeight;
    var vh = L.vh;
    L.A0 = absTop(openSec); L.A1 = L.A0 + openSec.offsetHeight - vh;
    L.C0 = absTop(wallIntro); L.D0 = wall ? absTop(wall) : L.C0 + vh;
    L.D1 = L.D0 + (wall ? wall.offsetHeight : vh) - vh;
    L.E1 = absTop(endSec);
    L.F1 = L.E1 + vh * 0.95;
    L.why = absTop(whySec);
    L.caps = caps.map(function (c) { return { el: c, top: absTop(c), h: c.offsetHeight }; });
    // otvaranje: veličina naslova
    openTitle.style.transform = 'none';
    L.tw = openTitle.offsetWidth; L.th = openTitle.offsetHeight;
    // visina kamere iznad otvora: krug ~72% visine (desktop) ili ~86% širine (mobitel)
    L.fov = L.vw < L.vh ? 62 : 55;
    L.fovRoom = L.vw < L.vh ? 76 : 68;
    var t = Math.tan(L.fov * DEG / 2), a = L.vw / L.vh;
    L.c0 = Math.max(Z.CYL.R / (0.72 * t), Z.CYL.R / (0.98 * t * a));
    L.c1 = L.c0 * 1.75;
    if (stage) stage.resize();
  }

  /* ---------------- 3D scena ---------------- */
  var stage = null, canvas = $('[data-zoe]');
  function initStage() {
    if (!canvas || !Z || !Z.supported()) { root.classList.add('no-webgl'); return; }
    try {
      var opts = { preserve: CAPTURE, onLost: function () { root.classList.add('no-webgl'); } };
      if (CAPTURE) { opts.maxDpr = parseFloat(query.get('dpr')) || undefined; opts.atlas = parseInt(query.get('atlas'), 10) || undefined; }
      stage = Z.create(canvas, opts);
    } catch (e) { console.warn('[DigitalAdvero] 3D scena nije pokrenuta:', e && e.message); stage = null; root.classList.add('no-webgl'); return; }
    var urls = projects.map(function (p) { return p.coverSm; });
    projects.forEach(function (p) { if (p.tpl) $$('img', p.tpl.content).forEach(function (img, k) { if (k > 0 && !img.classList.contains('is-phone')) urls.push(img.getAttribute('src')); }); });
    stage.imagesReady = stage.loadImages(urls);
  }

  /* ---------------- kartica koja se skida sa zida ---------------- */
  var card = $('[data-zcard]'), cardImg = $('[data-zcard-img]'), strips = $('[data-zcard-strips]');
  var STRIPS = 12, stripEls = [];
  for (var s = 0; s < STRIPS; s++) { var st = doc.createElement('i'); strips.appendChild(st); stripEls.push(st); }
  var cardShown = -1, stripTimer = null, srcPanel = -1, retPanel = -1;
  function coverFor(p) { return (L.vw < 860 ? p.coverSm : p.cover); }
  function cardRect() {
    var vw = L.vw, vh = L.vh, mobile = vw < 860;
    var w = mobile ? vw * 0.84 : Math.min(vw * 0.36, 760), h = w / 1.6;
    return { x: (vw - w) / 2, y: mobile ? vh * 0.16 : vh * 0.12, w: w, h: h };
  }
  function quadMatrix(w, h, q) {
    var x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1], x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
    var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    var den = dx1 * dy2 - dx2 * dy1, g = 0, hh = 0;
    if (Math.abs(den) > 1e-9) { g = (dx3 * dy2 - dx2 * dy3) / den; hh = (dx1 * dy3 - dx3 * dy1) / den; }
    var a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3;
    return 'matrix3d(' + [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, x0, y0, 0, 1].map(function (v) { return +v.toFixed(6); }).join(',') + ')';
  }
  function showOnCard(i, animate) {
    if (i === cardShown) return;
    var url = coverFor(projects[i]);
    card.style.setProperty('--accent', projects[i].accent);
    if (!animate || cardShown < 0) { cardImg.style.backgroundImage = 'url("' + url + '")'; cardShown = i; return; }
    cardShown = i;
    var r = cardRect();
    clearTimeout(stripTimer);
    strips.classList.remove('is-run');
    stripEls.forEach(function (el, k) {
      el.style.transition = 'none';
      el.style.backgroundImage = 'url("' + url + '")';
      el.style.backgroundSize = r.w + 'px ' + r.h + 'px';
      el.style.backgroundPosition = (-k * r.w / STRIPS) + 'px 0';
    });
    void strips.offsetWidth;
    stripEls.forEach(function (el, k) { el.style.transition = ''; el.style.transitionDelay = (((k * 7) % STRIPS) * 26) + 'ms'; });
    strips.classList.add('is-run');
    stripTimer = setTimeout(function () {
      cardImg.style.backgroundImage = 'url("' + url + '")';
      stripEls.forEach(function (el) { el.style.transition = 'none'; });
      strips.classList.remove('is-run');
      void strips.offsetWidth;
      stripEls.forEach(function (el) { el.style.transition = ''; });
    }, 820);
  }

  /* ---------------- aktivni projekat ---------------- */
  var active = -1, leaveT = null;
  function setProject(i) {
    if (i === active) return;
    var prev = active; active = i;
    projects.forEach(function (p, j) {
      p.el.classList.toggle('is-active', j === i);
      p.el.classList.toggle('is-leaving', j === prev);
    });
    clearTimeout(leaveT);
    leaveT = setTimeout(function () { projects.forEach(function (p, j) { if (j !== active) p.el.classList.remove('is-leaving'); }); }, 900);
    $$('button', idxList).forEach(function (b, j) { b.classList.toggle('is-active', j === i); });
    if (curEl) curEl.textContent = String(i + 1).padStart(2, '0');
    showOnCard(i, cardOut > 0.5);
  }
  function goToProject(i) { scrollToY(L.D0 + (L.D1 - L.D0) * ((i + 0.5) / N)); }

  /* ---------------- modali ---------------- */
  var modal = $('[data-modal]'), cmodal = $('[data-contact-modal]'), modalIndex = 0, lastFocus = null;
  function lockScroll(on) { if (lenis) { if (on) lenis.stop(); else lenis.start(); } else root.style.overflow = on ? 'hidden' : ''; }
  function showModal(m) { lastFocus = doc.activeElement; m.hidden = false; requestAnimationFrame(function () { requestAnimationFrame(function () { m.classList.add('is-open'); }); }); lockScroll(true); setTimeout(function () { var c = $('.modal__close', m); if (c) c.focus({ preventScroll: true }); }, 60); }
  function hideModal(m, instant) { if (!m || m.hidden) return; m.classList.remove('is-open'); lockScroll(false); setTimeout(function () { m.hidden = true; }, instant ? 0 : 420); if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); }
  function fillModal(i) {
    var p = projects[i]; modalIndex = i;
    modal.style.setProperty('--accent', p.accent);
    $('[data-modal-title]', modal).textContent = p.title;
    $('[data-modal-meta]', modal).innerHTML = p.metaHTML;
    var c = $('[data-modal-content]', modal); c.innerHTML = '';
    if (p.tpl) c.appendChild(p.tpl.content.cloneNode(true));
    $('[data-modal-demo]', modal).hidden = !p.isDemo;
    $('.modal__panel', modal).scrollTop = 0;
  }
  function openModal(i) { fillModal(i); showModal(modal); }
  function openContact(interest) {
    if (interest && form && !form.elements.poruka.value) form.elements.poruka.value = 'Zanima me projekat sličan konceptu „' + interest + '“.';
    showModal(cmodal);
  }
  $$('[data-modal-close]', modal).forEach(function (b) { b.addEventListener('click', function () { hideModal(modal); }); });
  $$('[data-contact-close]', cmodal).forEach(function (b) { b.addEventListener('click', function () { hideModal(cmodal); }); });
  $('[data-modal-prev]', modal).addEventListener('click', function () { fillModal((modalIndex - 1 + N) % N); });
  $('[data-modal-next]', modal).addEventListener('click', function () { fillModal((modalIndex + 1) % N); });
  doc.addEventListener('click', function (e) {
    var b = e.target.closest('[data-contact-open]');
    if (b) { e.preventDefault(); if (!modal.hidden) hideModal(modal, true); openContact(b.getAttribute('data-interest')); }
  });
  card.addEventListener('click', function () { if (active >= 0) openModal(active); });
  doc.addEventListener('keydown', function (e) {
    var m = !modal.hidden ? modal : (!cmodal.hidden ? cmodal : null);
    if (e.key === 'Escape') { if (m) hideModal(m); else if (body.classList.contains('index-open')) toggleIndex(false); return; }
    if (!m) return;
    if (m === modal && e.key === 'ArrowRight') fillModal((modalIndex + 1) % N);
    if (m === modal && e.key === 'ArrowLeft') fillModal((modalIndex - 1 + N) % N);
    if (e.key === 'Tab') {
      var f = $$('button, a[href], input, select, textarea', m).filter(function (el) { return el.offsetParent !== null && !el.disabled; });
      if (!f.length) return;
      if (e.shiftKey && doc.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && doc.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------------- indeks i navigacija ---------------- */
  var idxBtn = $('[data-index-toggle]'), idxPanel = $('[data-index-panel]');
  function toggleIndex(open) {
    open = open === undefined ? !body.classList.contains('index-open') : open;
    body.classList.toggle('index-open', open); root.classList.toggle('index-open', open);
    idxBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    idxPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    idxBtn.textContent = open ? 'Zatvori' : 'Indeks';
    if (lenis) { if (open) lenis.stop(); else lenis.start(); }
  }
  idxBtn.addEventListener('click', function () { toggleIndex(); });
  function capCenter(sec) { var c = $('[data-cap]', sec); return c ? absTop(c) + c.offsetHeight / 2 - L.vh / 2 : absTop(sec); }
  function targetFor(id) {
    if (id === 'pocetak') return 0;
    if (id === 'kontakt') return L.F1 + L.vh * 0.1;
    var el = doc.getElementById(id); if (!el) return null;
    if (id === 'projekti') return capCenter(wallIntro);
    var pi = projects.findIndex(function (p) { return p.el.id === id; });
    if (pi >= 0) return L.D0 + (L.D1 - L.D0) * ((pi + 0.5) / N);
    return capCenter(el);
  }
  doc.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]'); if (!a) return;
    var id = a.getAttribute('href').slice(1), y = targetFor(id);
    if (y === null) return;
    e.preventDefault();
    if (body.classList.contains('index-open')) toggleIndex(false);
    scrollToY(y);
  });

  /* ---------------- kamera: putanja po skrolu ---------------- */
  var cam = { yawBase: 0, drift: 0, projSmooth: 0 };
  var cardOut = 0, started = false, introStart = 0, last = 0;
  function cameraAt(sy, dt) {
    var H = Z.CYL.H, pitch = 90 * DEG, back = 0, y, yawB, wallW = 0, fov = L.fov;
    var d = prog(sy, L.A0, L.A1);
    if (sy <= L.A1) { y = H + L.c0 - (L.c0 + 5) * d * d; yawB = 0.5 * d * d; }
    else if (sy <= L.C0) { var q = prog(sy, L.A1, L.C0); y = (H - 5) - (H - 14) * (q * (2 - q)); yawB = 0.5 + 2.4 * q; }
    else if (sy <= L.D0) { var r = prog(sy, L.C0, L.D0), e = eio(r); y = lerp(9, 2.6, e); pitch = lerp(90, 4, eio((r - 0.08) / 0.92)) * DEG; back = 3.6 * e; yawB = 2.9 + 0.5 * e; wallW = r; fov = lerp(L.fov, L.fovRoom, e); }
    else if (sy <= L.D1) { y = 2.6; pitch = 4 * DEG; back = 3.6; yawB = 3.4 + cam.projSmooth * 0.42; wallW = 1; fov = L.fovRoom; }
    else if (sy <= L.E1) { var s = prog(sy, L.D1, L.E1), k = eio(s / 0.4); pitch = lerp(4, 90, k) * DEG; back = 3.6 * (1 - k); y = lerp(2.6, H - 5, eio(s)); yawB = 3.4 + cam.projSmooth * 0.42 + 2.4 * eio(s); wallW = 1 - k; fov = lerp(L.fovRoom, L.fov, k); }
    else { var f = prog(sy, L.E1, L.F1); y = lerp(H - 5, H + L.c1, eo3(f)); yawB = 3.4 + cam.projSmooth * 0.42 + 2.4 + 0.4 * f; }
    if (!reduced) cam.drift += dt * 0.035 * (1 - clamp(wallW, 0, 1));
    var yaw = yawB + cam.drift;
    return { x: -back * Math.sin(yaw), y: y, z: back * Math.cos(yaw), yaw: yaw, pitch: pitch, fov: fov };
  }

  /* ---------------- glavna petlja ---------------- */
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
    if (lenis) lenis.raf(now);
    if (!started) return;
    var sy = window.scrollY, vh = L.vh, vw = L.vw;

    // projekti: aktivni indeks
    var wp = (sy - L.D0) / Math.max(1, L.D1 - L.D0);
    var idx = clamp(Math.floor(clamp(wp, 0, 0.9999) * N), 0, N - 1);
    if (sy < L.D0) idx = 0; else if (sy > L.D1) idx = N - 1;
    setProject(idx);
    cam.projSmooth = damp(cam.projSmooth, idx, 3.2, dt);

    // kamera
    var c = cameraAt(sy, dt);
    if (stage) { stage.cam.x = c.x; stage.cam.y = c.y; stage.cam.z = c.z; stage.cam.yaw = c.yaw; stage.cam.pitch = c.pitch; stage.cam.fov = c.fov; stage.matrices(); }

    // kartica: izlazi sa zida na početku zida, vraća se na kraju
    var seg = 1 / N, popIn = eio(prog(wp, -0.02, seg * 0.55)), popOut = eio(prog(wp, 1 - seg * 0.5, 1.0));
    cardOut = popIn * (1 - popOut);
    if (stage && cardOut <= 0.001 && wp < 0.5) srcPanel = stage.panelAt(1, 3.4 + cam.drift - Z.CYL.step * 1.2);
    if (stage && popOut <= 0.001) retPanel = stage.panelAt(1, c.yaw + Z.CYL.step * 1.0);
    var tgtPanel = wp > 0.5 ? retPanel : srcPanel;
    if (stage) { stage.src.index = tgtPanel; stage.src.cell = stage.cellOf(active); stage.src.hide = cardOut > 0.015 ? 1 : 0; }
    if (cardOut > 0.001 && sy > L.C0) {
      var R = cardRect();
      var F = [[R.x, R.y], [R.x + R.w, R.y], [R.x + R.w, R.y + R.h], [R.x, R.y + R.h]];
      var Q = stage && !root.classList.contains('no-webgl') ? stage.panelQuad(tgtPanel) : null;
      var lift = Math.sin(Math.PI * cardOut) * vh * 0.05;
      var corners = F.map(function (f, k) { var from = Q ? Q[k] : f; return [lerp(from[0], f[0], cardOut), lerp(from[1], f[1], cardOut) - lift]; });
      if (cardOut > 0.999) { var fl = Math.sin(now / 1400) * 4; corners = corners.map(function (p) { return [p[0], p[1] + fl]; }); }
      card.style.width = R.w + 'px'; card.style.height = R.h + 'px';
      card.style.transform = quadMatrix(R.w, R.h, corners);
      card.style.opacity = Q ? 1 : cardOut;
      card.classList.toggle('is-out', cardOut > 0.9);
      if (cardShown < 0) showOnCard(active, false);
    } else { card.style.opacity = 0; card.classList.remove('is-out'); }
    stageEl.classList.toggle('is-live', cardOut > 0.6);

    // otvaranje: naslov putuje dolje lijevo i nestaje
    var d = prog(sy, L.A0, L.A1);
    var m = eio(d / 0.6), sc = lerp(1, vw < 860 ? 0.5 : 0.36, m);
    var x0 = (vw - L.tw) / 2, y0 = (vh - L.th) / 2, x1 = vw < 860 ? 20 : vw * 0.034, y1 = vh - L.th * sc - vh * 0.08;
    openTitle.style.transform = 'translate3d(' + lerp(x0, x1, m).toFixed(1) + 'px,' + lerp(y0, y1, m).toFixed(1) + 'px,0) scale(' + sc.toFixed(4) + ')';
    var fadeP = prog(d, 0.3, 0.8), n = titleChars.length;
    for (var i = 0; i < n; i++) titleChars[i].style.opacity = d > 0.001 ? (1 - smooth((fadeP * (n + 4) - i) / 4)).toFixed(3) : '';
    var sub = $('.j-sub', openTitle); sub.style.opacity = d > 0.001 ? (1 - smooth(d / 0.25)).toFixed(3) : '';
    cue.style.opacity = d > 0.001 ? (1 - smooth(d / 0.1)).toFixed(3) : '';
    body.classList.toggle('at-open', d < 0.45);
    header.classList.toggle('is-dim', d > 0.3);

    // natpisi: vidljivi kad su blizu sredine ekrana
    for (var k2 = 0; k2 < L.caps.length; k2++) {
      var cp = L.caps[k2], center = cp.top + cp.h / 2 - sy;
      cp.el.style.opacity = (1 - smooth((Math.abs(center - vh * 0.5) - vh * 0.22) / (vh * 0.26))).toFixed(3);
    }

    // završni ekran
    var ep = prog(sy, L.E1 + vh * 0.45, L.F1);
    endInner.style.opacity = ep.toFixed(3);
    endInner.style.transform = 'translate3d(0,' + ((1 - eo3(ep)) * 40).toFixed(1) + 'px,0)';

    if (stage && !doc.hidden) stage.render();
  }

  /* ---------------- pokretanje ---------------- */
  var fontsReady = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
  var fontLoads = doc.fonts && doc.fonts.load ? Promise.all([doc.fonts.load('400 64px "Instrument Serif"'), doc.fonts.load('italic 400 64px "Instrument Serif"'), doc.fonts.load('500 16px "Geist"')]).catch(function () {}) : Promise.resolve();
  Promise.race([Promise.all([fontsReady, fontLoads]), wait(2500)]).then(function () {
    initStage();
    measure();
    if (stage && stage.imagesReady) stage.imagesReady.then(function () { window.__DA.imagesLoaded = true; });
    else window.__DA.imagesLoaded = true;
    return wait(CAPTURE ? 0 : 60);
  }).then(function () {
    started = true; introStart = performance.now();
    openSec.classList.add('is-ready');
    if (canvas) canvas.classList.add('is-ready');
  });
  requestAnimationFrame(frame);
  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(measure, 120); });
  window.addEventListener('load', function () { if (started) measure(); });

  /* ---------------- API za snimanje promo videa (?capture) ---------------- */
  window.__DA = {
    capture: CAPTURE, imagesLoaded: false,
    isStarted: function () { return started; },
    layout: function () { measure(); return { A0: L.A0, A1: L.A1, C0: L.C0, D0: L.D0, D1: L.D1, E1: L.E1, F1: L.F1, why: L.why, vh: L.vh, caps: L.caps.map(function (c) { return { top: c.top, h: c.h }; }), n: N }; },
    openProject: openModal, closeProject: function () { hideModal(modal, true); }
  };
})();
