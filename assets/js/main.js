/* =========================================================================
   DigitalAdvero — glavna skripta
   Uvod, glatko skrolanje, animacije, projekti, modal, meni i kontakt.
   ========================================================================= */
(function () {
  'use strict';

  var doc = document, root = doc.documentElement, body = doc.body;
  var CFG = window.DIGITALADVERO_CONFIG || {};
  var query = new URLSearchParams(location.search);
  var CAPTURE = query.has('capture');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------------- Pomoćne funkcije ---------------- */
  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function damp(a, b, k, dt) { return lerp(a, b, 1 - Math.exp(-k * dt)); }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function easeOutExpo(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  function easeOutCubic(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function absTop(el) { return el.getBoundingClientRect().top + window.scrollY; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  body.classList.add('at-hero');
  if (finePointer && !CAPTURE && !reduced) root.classList.add('has-cursor');
  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------------- Dijeljenje teksta za animacije ---------------- */
  function splitChars(el, start) {
    var text = el.textContent, i = start || 0; el.textContent = '';
    text.split(/(\s+)/).forEach(function (part) {
      if (!part) return;
      if (/^\s+$/.test(part)) { el.appendChild(doc.createTextNode(' ')); return; }
      var w = doc.createElement('span'); w.className = 'word';
      Array.from(part).forEach(function (ch) {
        var s = doc.createElement('span'); s.className = 'char'; s.textContent = ch; s.style.setProperty('--i', i++); w.appendChild(s);
      });
      el.appendChild(w);
    });
    return i;
  }
  function splitWords(el, cls) {
    var idx = 0;
    (function walk(node) {
      Array.from(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = doc.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(doc.createTextNode(' ')); return; }
            if (cls === 'w') {
              var s = doc.createElement('span'); s.className = 'w' + (n.parentNode.nodeName === 'EM' ? ' hl' : ''); s.textContent = p; frag.appendChild(s);
            } else {
              var o = doc.createElement('span'); o.className = 'split-word';
              var inner = doc.createElement('span'); inner.textContent = p; inner.style.setProperty('--i', idx++);
              o.appendChild(inner); frag.appendChild(o);
            }
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1) walk(n);
      });
    })(el);
  }
  var ci = 0; $$('[data-split-chars]').forEach(function (el) { ci = splitChars(el, ci); });
  $$('[data-split-words]').forEach(function (el) { splitWords(el); });
  var statement = $('[data-words]');
  if (statement) splitWords(statement, 'w');
  var statementWords = statement ? $$('.w', statement) : [];

  /* ---------------- Projekti: priprema ---------------- */
  var workEl = $('[data-work]');
  var projects = $$('[data-project]').map(function (el, i) {
    var accent = el.getAttribute('data-accent') || '#8fa6ff';
    el.style.setProperty('--accent', accent);
    var screen = $('.project__screen', el);
    if (el.getAttribute('data-frame') === 'browser' && screen) {
      var bar = doc.createElement('div'); bar.className = 'project__bar'; bar.setAttribute('aria-hidden', 'true');
      bar.innerHTML = '<i></i><i></i><i></i><span>' + esc(el.getAttribute('data-url') || '') + '</span>';
      screen.insertBefore(bar, screen.firstChild);
    }
    var title = $('.project__title', el);
    var titleText = title.textContent.trim();
    splitChars(title, 0);
    var meta = $('.project__meta', el);
    return { el: el, i: i, accent: accent, rgb: window.DAStage ? window.DAStage.hexToRgb(accent) : [0.5, 0.6, 1], title: titleText, metaHTML: meta ? meta.innerHTML : '', isDemo: !!$('.badge', el), tpl: $('template.project__details', el) };
  });

  /* ---------------- Kontakt podaci iz config.js ---------------- */
  var ICON = {
    email: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    web: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>'
  };
  var SOCIAL = {
    instagram: ['Instagram', '<svg viewBox="0 0 24 24"><path d="M12 7.3A4.7 4.7 0 1 0 16.7 12 4.7 4.7 0 0 0 12 7.3zm0 7.8A3.1 3.1 0 1 1 15.1 12 3.1 3.1 0 0 1 12 15.1zM17 5.9a1.1 1.1 0 1 0 1.1 1.1A1.1 1.1 0 0 0 17 5.9zM21 7.1a5.4 5.4 0 0 0-1.5-3.8A5.4 5.4 0 0 0 15.7 2C14.2 2 9.8 2 8.3 2a5.4 5.4 0 0 0-3.8 1.5A5.4 5.4 0 0 0 3 7.1C3 8.6 3 15.4 3 16.9a5.4 5.4 0 0 0 1.5 3.8A5.4 5.4 0 0 0 8.3 22c1.5.1 5.9.1 7.4 0a5.4 5.4 0 0 0 3.8-1.5 5.4 5.4 0 0 0 1.5-3.8c.1-1.5.1-8.3 0-9.6zm-2 11.5a3.1 3.1 0 0 1-1.8 1.8c-1.2.5-4.1.4-5.2.4s-4 .1-5.2-.4a3.1 3.1 0 0 1-1.8-1.8c-.5-1.2-.4-4.1-.4-5.4s-.1-4.2.4-5.4a3.1 3.1 0 0 1 1.8-1.8c1.2-.5 4.1-.4 5.2-.4s4-.1 5.2.4a3.1 3.1 0 0 1 1.8 1.8c.5 1.2.4 4.1.4 5.4s.1 4.2-.4 5.4z"/></svg>'],
    facebook: ['Facebook', '<svg viewBox="0 0 24 24"><path d="M14 8.5V6.6c0-.9.6-1.1 1-1.1h2.7V2h-3.7C10 2 9.6 4.9 9.6 6.6v1.9H7v3.7h2.6V22h4.4v-9.8h3l.4-3.7z"/></svg>'],
    linkedin: ['LinkedIn', '<svg viewBox="0 0 24 24"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3zM9.5 9.5h3.8v1.6h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.1c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V21h-4z"/></svg>'],
    tiktok: ['TikTok', '<svg viewBox="0 0 24 24"><path d="M16.6 5.8A4.5 4.5 0 0 1 15.5 3h-3.2v12.5a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.9 5.9 0 0 0-.8-.1 5.8 5.8 0 1 0 5.8 5.8V9.1a7.6 7.6 0 0 0 4.5 1.4V7.3a4.5 4.5 0 0 1-3.4-1.5z"/></svg>'],
    youtube: ['YouTube', '<svg viewBox="0 0 24 24"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.8 15.1V8.9l5.8 3.1z"/></svg>'],
    behance: ['Behance', '<svg viewBox="0 0 24 24"><path d="M8.2 11.4c.9-.4 1.5-1.2 1.5-2.4C9.7 6.6 8 6 6 6H0v12h6.2c2.3 0 4.5-1.1 4.5-3.7 0-1.6-.8-2.6-2.5-2.9zM2.7 8h2.6c1 0 1.9.3 1.9 1.4S6.5 11 5.6 11H2.7zm2.9 7.9H2.7v-3.2h3c1.2 0 2 .5 2 1.8s-.9 1.4-2.1 1.4zM20.4 7.1h-5.2V5.8h5.2zm1.3 6.6c0-2.6-1.5-4.7-4.2-4.7s-4.4 2-4.4 4.6 1.6 4.6 4.4 4.6c2.1 0 3.5-.9 4.1-2.9h-2.1c-.2.7-1.2 1.1-1.9 1.1-1.4 0-2.1-.8-2.1-2.2h6.2zm-6.2-1.1c.1-1.1.8-1.8 2-1.8s1.7.7 1.8 1.8z"/></svg>']
  };
  function digits(s) { return String(s || '').replace(/[^\d]/g, ''); }
  function safeUrl(u) { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; }
  if (CFG.website) CFG.website = safeUrl(CFG.website);
  if (CFG.social) Object.keys(CFG.social).forEach(function (k) { CFG.social[k] = safeUrl(CFG.social[k]); });
  if (CFG.form && CFG.form.endpoint) CFG.form.endpoint = safeUrl(CFG.form.endpoint);
  var contactItems = [];
  if (CFG.email) contactItems.push({ k: 'E-mail', icon: 'email', label: CFG.email, href: 'mailto:' + CFG.email });
  if (CFG.phone) contactItems.push({ k: 'Telefon', icon: 'phone', label: CFG.phone, href: 'tel:+' + digits(CFG.phone).replace(/^0+/, '') });
  if (CFG.whatsapp) contactItems.push({ k: 'WhatsApp', icon: 'chat', label: '+' + digits(CFG.whatsapp), href: 'https://wa.me/' + digits(CFG.whatsapp), ext: true });
  if (CFG.viber) contactItems.push({ k: 'Viber', icon: 'chat', label: '+' + digits(CFG.viber), href: 'viber://chat?number=%2B' + digits(CFG.viber) });
  if (CFG.location) contactItems.push({ k: 'Lokacija', icon: 'pin', label: CFG.location });
  if (CFG.workingHours) contactItems.push({ k: 'Radno vrijeme', icon: 'clock', label: CFG.workingHours });
  if (CFG.website) contactItems.push({ k: 'Web stranica', icon: 'web', label: CFG.website.replace(/^https?:\/\//, '').replace(/\/$/, ''), href: CFG.website, ext: true });
  var socials = Object.keys(SOCIAL).filter(function (k) { return CFG.social && CFG.social[k]; });

  $$('[data-contact-list]').forEach(function (box) {
    var full = box.getAttribute('data-contact-list') === 'full';
    box.innerHTML = contactItems.map(function (it) {
      var val = it.href ? '<a href="' + esc(it.href) + '"' + (it.ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(it.label) + '</a>' : '<span>' + esc(it.label) + '</span>';
      if (!full) return it.href ? val : '';
      return '<div class="contact-item"><span class="contact-item__icon" aria-hidden="true">' + ICON[it.icon] + '</span><div><small>' + esc(it.k) + '</small>' + val + '</div></div>';
    }).join('');
  });
  $$('[data-socials]').forEach(function (box) {
    box.innerHTML = socials.map(function (k) {
      return '<a href="' + esc(CFG.social[k]) + '" target="_blank" rel="noopener" aria-label="' + SOCIAL[k][0] + '">' + SOCIAL[k][1] + '</a>';
    }).join('');
  });
  var hasContact = contactItems.length > 0 || socials.length > 0;
  var contactBlock = $('[data-contact-block]');
  if (contactBlock) contactBlock.hidden = !hasContact;
  var actions = $('[data-contact-actions]');
  if (actions) {
    if (CFG.phone) actions.insertAdjacentHTML('beforeend', '<a class="btn btn--ghost btn--lg" href="tel:+' + digits(CFG.phone).replace(/^0+/, '') + '"><span>Pozovite nas</span></a>');
    if (CFG.whatsapp) actions.insertAdjacentHTML('beforeend', '<a class="btn btn--ghost btn--lg" href="https://wa.me/' + digits(CFG.whatsapp) + '" target="_blank" rel="noopener"><span>WhatsApp</span></a>');
  }
  if (!hasContact && !CFG.form) console.warn('[DigitalAdvero] Kontakt podaci nisu podešeni — uredite assets/js/config.js');
  if (!hasContact && !CAPTURE && /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname)) {
    var note = doc.createElement('div');
    note.setAttribute('style', 'position:fixed;left:16px;bottom:16px;z-index:150;max-width:340px;padding:12px 16px;border-radius:14px;background:#2a1f05;border:1px solid #ffb547;color:#ffe3b0;font:500 13px/1.45 var(--sans)');
    note.textContent = 'Napomena (vidljivo samo lokalno): upišite svoje kontakt podatke i društvene mreže u assets/js/config.js.';
    body.appendChild(note);
  }

  /* ---------------- Kontakt forma ---------------- */
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
      var lines = [
        'Ime i prezime: ' + fd.get('ime'),
        fd.get('firma') ? 'Firma: ' + fd.get('firma') : '',
        'E-mail: ' + fd.get('email'),
        fd.get('telefon') ? 'Telefon: ' + fd.get('telefon') : '',
        fd.get('usluga') ? 'Usluga: ' + fd.get('usluga') : '',
        '', String(fd.get('poruka'))
      ].filter(function (l, i) { return l !== '' || i === 5; }).join('\n');
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

  /* ---------------- Glatko skrolanje (Lenis) ---------------- */
  var lenis = null;
  if (!reduced && !CAPTURE && window.Lenis) {
    try {
      lenis = new window.Lenis({ duration: 1.15, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }, smoothWheel: true, wheelMultiplier: 1, touchMultiplier: 1.5 });
    } catch (e) { lenis = null; }
  }
  function scrollToY(y, immediate) {
    if (lenis) lenis.scrollTo(y, { duration: immediate ? 0 : 1.6, immediate: !!immediate, force: true });
    else window.scrollTo({ top: y, behavior: immediate || reduced ? 'auto' : 'smooth' });
  }
  function scrollToEl(el) {
    if (!el) return;
    var y = el.id === 'pocetak' ? 0 : absTop(el);
    scrollToY(y);
  }
  doc.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    var target = id ? doc.getElementById(id) : null;
    if (!target) return;
    e.preventDefault();
    if (body.classList.contains('menu-open')) toggleMenu(false);
    if (!modal.hidden) closeModal(true);
    scrollToEl(target);
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  });

  /* ---------------- Meni ---------------- */
  var menuBtn = $('[data-menu-toggle]'), menu = $('[data-menu]');
  function toggleMenu(open) {
    open = open === undefined ? !body.classList.contains('menu-open') : open;
    body.classList.toggle('menu-open', open);
    root.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', open ? 'Zatvori meni' : 'Otvori meni');
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (lenis) { if (open) lenis.stop(); else lenis.start(); }
    if (open) setTimeout(function () { var l = $('a', menu); if (l) l.focus({ preventScroll: true }); }, 350);
  }
  menuBtn.addEventListener('click', function () { toggleMenu(); });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && body.classList.contains('menu-open')) { toggleMenu(false); menuBtn.focus(); } });

  /* ---------------- Otkrivanje elemenata ---------------- */
  var revealTargets = $$('[data-reveal], [data-split-words]');
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    revealTargets.forEach(function (el) { io.observe(el); });
  } else revealTargets.forEach(function (el) { el.classList.add('is-in'); });

  /* ---------------- Aktivna sekcija ---------------- */
  var sections = $$('[data-section]');
  var sideLinks = $$('[data-index]'), menuLinks = $$('[data-menu-link]');
  function setActiveSection(id) {
    if (body.getAttribute('data-active') === id) return;
    body.setAttribute('data-active', id);
    sideLinks.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('data-index') === id); });
    menuLinks.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + id); });
  }
  setActiveSection('pocetak');

  /* ---------------- Mjerenja ---------------- */
  var hero = $('.hero'), heroSticky = $('.hero__sticky'), heroContent = $('.hero__content'), heroFoot = $('.hero__foot');
  var header = $('[data-header]');
  var timeline = $('[data-timeline]'), steps = $$('[data-step]');
  var orb = $('.contact__orb'), contact = $('#kontakt');
  var counterEl = $('[data-work-current]'), totalEl = $('[data-work-total]');
  var L = {};
  function measure() {
    L.vh = window.innerHeight; L.vw = window.innerWidth;
    L.heroTop = absTop(hero); L.heroH = hero.offsetHeight;
    if (workEl) { L.workTop = absTop(workEl); L.workH = workEl.offsetHeight; }
    L.secs = sections.map(function (s) { return { id: s.id, top: absTop(s), h: s.offsetHeight }; });
    if (timeline) { L.tlTop = absTop(timeline); L.tlH = timeline.offsetHeight; L.stepTops = steps.map(function (s) { return absTop(s) - L.tlTop; }); }
    if (contact) { L.contactTop = absTop(contact); }
    if (stage) stage.resize();
  }

  /* ---------------- WebGL scena ---------------- */
  var stage = null, canvas = $('[data-stage]');
  var tunnelView, wallView, zoeView;
  function initStage() {
    if (!canvas || !window.DAStage || !window.DAStage.supported()) { root.classList.add('no-webgl'); return; }
    try {
      var opts = { preserve: CAPTURE, onLost: function () { root.classList.add('no-webgl'); canvas.style.display = 'none'; } };
      if (CAPTURE) { opts.maxDpr = parseFloat(query.get('dpr')) || undefined; opts.atlas = parseInt(query.get('atlas'), 10) || undefined; }
      stage = window.DAStage.create(canvas, opts);
    } catch (e) {
      console.warn('[DigitalAdvero] WebGL scena nije pokrenuta:', e && e.message);
      stage = null; root.classList.add('no-webgl'); canvas.style.display = 'none'; return;
    }
    tunnelView = stage.addView('tunnel', heroSticky, 'tunnel', { travel: -40, fov: 118, intensity: 0, bright: 1 });
    if (workEl) wallView = stage.addView('wall', $('.work__stage'), 'wall', { yaw: 0, intensity: 0, accent: projects[0] ? projects[0].rgb.slice() : [0.3, 0.45, 1] });
    if (orb) zoeView = stage.addView('zoetrope', orb, 'zoetrope', { intensity: 0, fov: 64, camZ: 7.6, coreScale: 1.15 });
    // slike projekata za panele: male naslovnice + ostale pejzažne slike iz galerija
    var urls = [];
    projects.forEach(function (p) { var img = $('img[data-gallery-thumb]', p.el); if (img) urls.push(img.getAttribute('data-gallery-thumb')); });
    projects.forEach(function (p) {
      if (!p.tpl) return;
      $$('img', p.tpl.content).forEach(function (img, k) { if (k > 0 && !img.classList.contains('is-phone')) urls.push(img.getAttribute('src')); });
    });
    stage.imagesReady = stage.loadImages(urls);
  }

  /* ---------------- Projekti: pozornica ---------------- */
  var activeProject = -1, leaveTimer = null;
  var indexList = $('[data-work-index]'), barsBox = $('[data-work-bars]');
  if (workEl && projects.length) {
    workEl.style.setProperty('--count', projects.length);
    if (totalEl) totalEl.textContent = String(projects.length).padStart(2, '0');
    projects.forEach(function (p, i) {
      var li = doc.createElement('li');
      li.innerHTML = '<button type="button" aria-label="Projekat ' + (i + 1) + ': ' + esc(p.title) + '"><span>' + String(i + 1).padStart(2, '0') + '</span>' + esc(p.title) + '</button>';
      li.firstChild.addEventListener('click', function () { goToProject(i); });
      indexList.appendChild(li);
      barsBox.appendChild(doc.createElement('i'));
      var open = $('[data-project-open]', p.el);
      if (open) open.addEventListener('click', function () { openModal(i); });
      var media = $('.project__media', p.el);
      if (media) {
        media.style.cursor = 'pointer';
        media.addEventListener('click', function () { if (p.el.classList.contains('is-active') || !root.classList.contains('js')) openModal(i); });
        media.setAttribute('data-cursor-label', 'Detalji');
      }
    });
  }
  function goToProject(i) {
    if (!workEl) return;
    var span = L.workH - L.vh, n = projects.length;
    scrollToY(L.workTop + span * ((i + 0.5) / n));
  }
  function setProject(i) {
    if (i === activeProject) return;
    var prev = activeProject; activeProject = i;
    projects.forEach(function (p, j) {
      p.el.classList.toggle('is-active', j === i);
      p.el.classList.toggle('is-leaving', j === prev);
      p.el.setAttribute('aria-hidden', j === i ? 'false' : 'true');
    });
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(function () { projects.forEach(function (p, j) { if (j !== activeProject) p.el.classList.remove('is-leaving'); }); }, 1300);
    $$('button', indexList).forEach(function (b, j) { b.classList.toggle('is-active', j === i); b.setAttribute('aria-current', j === i ? 'true' : 'false'); });
    $$('i', barsBox).forEach(function (b, j) { b.classList.toggle('is-active', j === i); b.classList.toggle('is-done', j < i); });
    if (counterEl) counterEl.textContent = String(i + 1).padStart(2, '0');
    body.style.setProperty('--accent', projects[i].accent);
    workEl.style.setProperty('--accent', projects[i].accent);
  }

  /* ---------------- Modal s detaljima ---------------- */
  var modal = $('[data-modal]'), modalIndex = 0, lastFocus = null;
  function fillModal(i) {
    var p = projects[i]; modalIndex = i;
    modal.style.setProperty('--accent', p.accent);
    $('[data-modal-title]', modal).textContent = p.title;
    $('[data-modal-meta]', modal).innerHTML = p.metaHTML;
    var content = $('[data-modal-content]', modal); content.innerHTML = '';
    if (p.tpl) content.appendChild(p.tpl.content.cloneNode(true));
    $$('img', content).forEach(function (img) { img.loading = 'lazy'; img.decoding = 'async'; });
    $('[data-modal-demo]', modal).hidden = !p.isDemo;
    var panel = $('.modal__panel', modal); panel.scrollTop = 0;
  }
  function openModal(i) {
    if (!modal) return;
    lastFocus = doc.activeElement;
    fillModal(i);
    modal.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { modal.classList.add('is-open'); }); });
    if (lenis) lenis.stop(); else root.style.overflow = 'hidden';
    setTimeout(function () { $('.modal__close', modal).focus({ preventScroll: true }); }, 60);
  }
  function closeModal(instant) {
    if (!modal || modal.hidden) return;
    modal.classList.remove('is-open');
    if (lenis) lenis.start(); else root.style.overflow = '';
    setTimeout(function () { modal.hidden = true; }, instant ? 0 : 450);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  if (modal) {
    $$('[data-modal-close]', modal).forEach(function (b) { b.addEventListener('click', function () { closeModal(); }); });
    $('[data-modal-prev]', modal).addEventListener('click', function () { fillModal((modalIndex - 1 + projects.length) % projects.length); });
    $('[data-modal-next]', modal).addEventListener('click', function () { fillModal((modalIndex + 1) % projects.length); });
    $('[data-modal-cta]', modal).addEventListener('click', function () {
      var msg = form && form.elements.poruka;
      if (msg && !msg.value) msg.value = 'Zanima me projekat sličan konceptu „' + projects[modalIndex].title + '“.';
    });
    doc.addEventListener('keydown', function (e) {
      if (modal.hidden) return;
      if (e.key === 'Escape') closeModal();
      else if (e.key === 'ArrowRight') fillModal((modalIndex + 1) % projects.length);
      else if (e.key === 'ArrowLeft') fillModal((modalIndex - 1 + projects.length) % projects.length);
      else if (e.key === 'Tab') {
        var f = $$('button, a[href], [tabindex]:not([tabindex="-1"])', modal).filter(function (el) { return el.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && doc.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && doc.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
  }

  /* ---------------- Interakcije mišem ---------------- */
  var mouse = { x: 0, y: 0, px: -100, py: -100, active: false };
  window.addEventListener('pointermove', function (e) {
    mouse.px = e.clientX; mouse.py = e.clientY; mouse.active = true;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });
  $$('[data-spotlight]').forEach(function (el) {
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px'); el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });
  if (finePointer && !reduced) {
    $$('[data-magnetic]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / r.width, dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        el.style.transform = 'translate(' + (dx * 10).toFixed(1) + 'px,' + (dy * 8).toFixed(1) + 'px)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }
  var cursor = $('[data-cursor]'), cursorLabel = $('[data-cursor-label]');
  var cur = { x: -100, y: -100 };
  if (cursor && root.classList.contains('has-cursor')) {
    doc.addEventListener('pointerover', function (e) {
      var labelEl = e.target.closest('[data-cursor-label]');
      var hov = e.target.closest('a, button, input, select, textarea, label, [data-spotlight]');
      cursor.classList.toggle('is-label', !!labelEl);
      cursorLabel.textContent = labelEl ? labelEl.getAttribute('data-cursor-label') : '';
      cursor.classList.toggle('is-hover', !!hov && !labelEl);
    });
  }

  /* ---------------- Glavna petlja ---------------- */
  var introStart = 0, started = false, last = 0, clock = 0;
  var hs = { camX: 0, camY: 0, tiltX: 0, tiltY: 0 };
  var ws = { yaw: 0, accent: projects[0] ? projects[0].rgb.slice() : [0.3, 0.45, 1] };
  var heroWasVisible = true;

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
    if (lenis) lenis.raf(now);
    if (!started) return;
    clock += reduced ? 0 : dt;
    var sy = window.scrollY, vh = L.vh;
    var t = (now - introStart) / 1000;

    /* Hero */
    var hp = clamp((sy - L.heroTop) / Math.max(1, L.heroH - vh), 0, 1);
    var heroVisible = sy < L.heroTop + L.heroH;
    var intro = reduced ? 1 : easeOutExpo(clamp(t / 2.8, 0, 1));
    if (heroVisible || heroWasVisible) {
      var fade = 1 - smooth((hp - 0.55) / 0.45);
      heroContent.style.opacity = (1 - smooth(hp * 1.7)).toFixed(3);
      heroContent.style.transform = 'translate3d(0,' + (-hp * 16).toFixed(2) + 'vh,0) scale(' + (1 + hp * 0.14).toFixed(4) + ')';
      heroFoot.style.opacity = hp > 0.001 ? (1 - smooth(hp * 5)).toFixed(3) : '';
      if (tunnelView) {
        var mx = finePointer && !CAPTURE ? mouse.x : 0, my = finePointer && !CAPTURE ? mouse.y : 0;
        hs.camX = damp(hs.camX, mx * 0.9, 2.2, dt); hs.camY = damp(hs.camY, -my * 0.6, 2.2, dt);
        hs.tiltY = damp(hs.tiltY, -mx * 0.05, 2.2, dt); hs.tiltX = damp(hs.tiltX, my * 0.035, 2.2, dt);
        var p = tunnelView.params;
        p.travel = -40 * (1 - intro) + clock * 0.9 + smooth(hp) * 34;
        p.roll = clock * 0.04 + hp * 1.1 + (1 - intro) * -0.8;
        p.fov = lerp(118, 72, intro) + smooth(hp) * 30;
        p.intensity = intro * fade;
        p.camX = hs.camX; p.camY = hs.camY; p.tiltX = hs.tiltX; p.tiltY = hs.tiltY;
        p.hidden = !heroVisible;
      }
      body.classList.toggle('at-hero', hp < 0.42);
    }
    heroWasVisible = heroVisible;

    /* O nama: riječ po riječ */
    if (statementWords.length) {
      var sr = statement.getBoundingClientRect();
      var sp = clamp((vh * 0.88 - sr.top) / (sr.height + vh * 0.42), 0, 1);
      var on = Math.round(sp * statementWords.length);
      if (on !== statement._on) {
        statement._on = on;
        for (var w = 0; w < statementWords.length; w++) statementWords[w].classList.toggle('is-on', w < on);
      }
    }

    /* Projekti */
    if (workEl && projects.length) {
      var span = Math.max(1, L.workH - vh);
      var wp = (sy - L.workTop) / span;
      var idx = clamp(Math.floor(clamp(wp, 0, 0.9999) * projects.length), 0, projects.length - 1);
      if (wp > -0.6) setProject(idx);
      body.classList.toggle('in-work', wp > -0.25 && wp < 1.05);
      if (wallView) {
        var enter = smooth((sy - (L.workTop - vh * 0.9)) / (vh * 0.9));
        var exit = 1 - smooth((sy - (L.workTop + span - vh * 0.05)) / (vh * 0.75));
        var targetYaw = (activeProject < 0 ? 0 : activeProject) * (Math.PI * 2 / 22) * 2.4 + clamp(wp, -0.3, 1.2) * 0.5;
        ws.yaw = damp(ws.yaw, targetYaw, 2.6, dt);
        var tgt = projects[Math.max(0, activeProject)].rgb;
        for (var c = 0; c < 3; c++) ws.accent[c] = damp(ws.accent[c], tgt[c], 2.5, dt);
        var wpv = wallView.params;
        wpv.yaw = ws.yaw + Math.sin(clock * 0.15) * 0.03 + (finePointer && !CAPTURE ? mouse.x * 0.04 : 0);
        wpv.pitch = 0.07 + (finePointer && !CAPTURE ? mouse.y * 0.02 : 0);
        wpv.accent = ws.accent; wpv.intensity = enter * exit;
        wpv.hidden = enter * exit <= 0.001;
      }
    }

    /* Vremenska linija */
    if (timeline) {
      var tp = clamp((sy + vh * 0.62 - L.tlTop) / L.tlH, 0, 1);
      if (Math.abs(tp - (timeline._tp || 0)) > 0.0005) {
        timeline._tp = tp; timeline.style.setProperty('--tp', tp.toFixed(4));
        var head = tp * L.tlH;
        for (var s = 0; s < steps.length; s++) {
          steps[s].classList.toggle('is-active', head >= L.stepTops[s] + 30);
          if (head >= L.stepTops[s] - vh * 0.3) steps[s].classList.add('is-seen');
        }
      }
    }

    /* Kontakt: zoetrop */
    if (zoeView) {
      var orbTop = orb.getBoundingClientRect().top;
      var zv = smooth((vh - orbTop) / (vh * 0.8));
      zoeView.params.intensity = zv;
      zoeView.params.hidden = zv <= 0.001;
      zoeView.params.roll = clock * 0.09;
      zoeView.params.travel = 0;
    }

    /* Aktivna sekcija */
    var mid = sy + vh * 0.45, act = 'pocetak';
    for (var k = 0; k < L.secs.length; k++) if (mid >= L.secs[k].top) act = L.secs[k].id;
    setActiveSection(act);
    header.classList.toggle('is-scrolled', sy > 40);

    /* Kursor */
    if (cursor && root.classList.contains('has-cursor')) {
      cur.x = damp(cur.x, mouse.px, 18, dt); cur.y = damp(cur.y, mouse.py, 18, dt);
      cursor.style.transform = 'translate3d(' + cur.x.toFixed(1) + 'px,' + cur.y.toFixed(1) + 'px,0)';
    }

    if (stage && !doc.hidden) stage.render(clock);
  }

  /* ---------------- Pokretanje ---------------- */
  var preloader = $('[data-preloader]'), preBar = $('[data-preloader-bar]');
  function setPre(v) { if (preBar) preBar.style.setProperty('--p', v); }
  setPre(0.15);
  var fontsReady = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
  var fontLoads = doc.fonts && doc.fonts.load ? Promise.all([
    doc.fonts.load('400 64px "Instrument Serif"'), doc.fonts.load('italic 400 64px "Instrument Serif"'),
    doc.fonts.load('500 16px "Geist"'), doc.fonts.load('400 16px "Geist Mono"')
  ]).catch(function () {}) : Promise.resolve();
  var minTime = CAPTURE || reduced ? 0 : 900;
  var t0 = performance.now();

  Promise.race([Promise.all([fontsReady, fontLoads]), wait(2600)]).then(function () {
    setPre(0.6);
    initStage();
    measure();
    setPre(1);
    var elapsed = performance.now() - t0;
    return wait(Math.max(0, minTime - elapsed));
  }).then(function () {
    if (preloader) preloader.classList.add('is-done');
    introStart = performance.now(); started = true;
    hero.classList.add('is-ready');
    if (stage && stage.imagesReady) stage.imagesReady.then(function () { window.__DA.imagesLoaded = true; });
  });
  requestAnimationFrame(frame);

  var resizeT;
  window.addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(measure, 120); });
  window.addEventListener('load', function () { measure(); });
  if ('ResizeObserver' in window) { var ro = new ResizeObserver(function () { clearTimeout(resizeT); resizeT = setTimeout(measure, 120); }); ro.observe(body); }

  /* ---------------- API za snimanje promo videa (?capture) ---------------- */
  window.__DA = {
    capture: CAPTURE,
    imagesLoaded: false,
    isStarted: function () { return started; },
    layout: function () { measure(); return { heroTop: L.heroTop, heroH: L.heroH, workTop: L.workTop, workH: L.workH, vh: L.vh, secs: L.secs, tlTop: L.tlTop, tlH: L.tlH, contactTop: L.contactTop }; },
    openProject: openModal, closeProject: closeModal, toggleMenu: toggleMenu,
    setMouse: function (x, y) { mouse.x = x; mouse.y = y; }
  };
})();
