/* =========================================================================
   DigitalAdvero — WebGL scena
   Jedno fiksno platno (canvas) koje crta više "pogleda" (views):
   - tunnel   : 3D tunel od ekrana sa svjetlećim jezgrom (sekcija 01)
   - wall     : zakrivljeni zid projekata s osvijetljenim podom (sekcija 04)
   - zoetrope : kružni mini-tunel iza poziva na kontakt (sekcija 07)
   Bez vanjskih biblioteka (WebGL2). Ako WebGL2 nije dostupan, stranica
   koristi CSS rezervne pozadine (klasa .no-webgl).
   ========================================================================= */
(function () {
  'use strict';

  var TAU = Math.PI * 2;

  /* ---------------- Matematika (column-major mat4) ---------------- */
  var M = {
    ident: function () { var m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    persp: function (fovy, aspect, near, far) {
      var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far), m = new Float32Array(16);
      m[0] = f / aspect; m[5] = f; m[10] = (far + near) * nf; m[11] = -1; m[14] = 2 * far * near * nf; return m;
    },
    mul: function (a, b) {
      var o = new Float32Array(16), i, j, k, s;
      for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) { s = 0; for (k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; }
      return o;
    },
    trans: function (x, y, z) { var m = M.ident(); m[12] = x; m[13] = y; m[14] = z; return m; },
    rx: function (a) { var c = Math.cos(a), s = Math.sin(a), m = M.ident(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
    ry: function (a) { var c = Math.cos(a), s = Math.sin(a), m = M.ident(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
    rz: function (a) { var c = Math.cos(a), s = Math.sin(a), m = M.ident(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
  };

  function rng(seed) { var s = seed >>> 0 || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function hexToRgb(h) {
    h = (h || '#8fa6ff').replace('#', ''); if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
    var n = parseInt(h, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  /* ---------------- Shaderi ---------------- */
  var PANEL_VS = [
    '#version 300 es',
    'in vec3 aParam; in vec2 aUV; in vec4 aCell; in float aRand;',
    'uniform mat4 uProj; uniform mat4 uView; uniform float uMode; uniform float uR; uniform float uTravel; uniform float uLen;',
    'out vec2 vUV; out vec4 vCell; out float vRand; out float vDepth;',
    'void main(){',
    '  float th = aParam.x; float ax = aParam.y; float axc = aParam.z; vec3 p;',
    '  if (uMode < 0.5) {',
    '    float zc = mod(axc - uTravel, uLen) - uLen;',
    '    p = vec3(uR * cos(th), uR * sin(th), zc + (ax - axc));',
    '  } else {',
    '    p = vec3(uR * sin(th), ax, -uR * cos(th));',
    '  }',
    '  vec4 vp = uView * vec4(p, 1.0);',
    '  vDepth = -vp.z; vUV = aUV; vCell = aCell; vRand = aRand;',
    '  gl_Position = uProj * vp;',
    '}'
  ].join('\n');

  var PANEL_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUV; in vec4 vCell; in float vRand; in float vDepth;',
    'uniform sampler2D uAtlas; uniform vec3 uFog; uniform vec2 uFogRange; uniform float uBright; uniform float uTime;',
    'uniform vec2 uPanel; uniform float uRadius; uniform float uNearFade; uniform vec4 uMask; uniform vec2 uOrigin;',
    'out vec4 outColor;',
    'float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }',
    'void main(){',
    '  vec2 p = (vUV - 0.5) * uPanel;',
    '  float d = sdRR(p, uPanel * 0.5, uRadius);',
    '  float aa = max(fwidth(d), 1e-4) * 1.25;',
    '  float inside = 1.0 - smoothstep(-aa, aa, d);',
    '  if (inside < 0.002) discard;',
    '  vec2 uv = vCell.xy + clamp(vUV, 0.004, 0.996) * vCell.zw;',
    '  vec3 col = texture(uAtlas, uv).rgb;',
    '  col *= (0.74 + 0.36 * vRand) * uBright * mix(0.42, 1.0, smoothstep(2.5, 11.0, vDepth));',
    '  vec2 e = min(vUV, 1.0 - vUV);',
    '  col *= mix(0.5, 1.0, smoothstep(0.0, 0.2, min(e.x, e.y * 1.4)));',
    '  float sw = fract(vUV.x * 0.32 + vUV.y * 0.22 - uTime * 0.05 + vRand * 3.7);',
    '  col += smoothstep(0.07, 0.0, abs(sw - 0.5)) * 0.07 * uBright;',
    '  float bez = smoothstep(-uRadius * 0.55, -uRadius * 0.15, d);',
    '  col = mix(col, vec3(0.015, 0.018, 0.04), bez * 0.9);',
    '  float f = smoothstep(uFogRange.x, uFogRange.y, vDepth);',
    '  col = mix(col, uFog, f);',
    '  float a = inside * (1.0 - smoothstep(uFogRange.y * 0.94, uFogRange.y * 1.02, vDepth));',
    '  a *= smoothstep(uNearFade * 0.3, uNearFade, vDepth);',
    '  if (uMask.w > 0.5) { float md = length(gl_FragCoord.xy - uOrigin - uMask.xy); a *= 1.0 - smoothstep(uMask.z * 0.84, uMask.z, md); }',
    '  outColor = vec4(col * a, a);',
    '}'
  ].join('\n');

  var QUAD_VS = [
    '#version 300 es',
    'in vec2 aPos; out vec2 vPos;',
    'void main(){ vPos = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var BG_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vPos;',
    'uniform vec2 uRes; uniform vec2 uOrigin; uniform vec2 uCenter; uniform vec3 uCore; uniform vec3 uBase; uniform vec3 uAccent;',
    'uniform float uIntensity; uniform float uMode; uniform vec4 uMask; uniform float uCoreR; uniform float uTime;',
    'out vec4 outColor;',
    'void main(){',
    '  vec2 fc = gl_FragCoord.xy - uOrigin;',
    '  float s = min(uRes.x, uRes.y);',
    '  vec2 p = (fc - uCenter) / s;',
    '  float r = length(p);',
    '  vec3 col = uBase;',
    '  if (uMode < 0.5) {',
    '    float halo = exp(-r * 6.5) * 0.85 + exp(-r * 2.1) * 0.22 + exp(-r * 18.0) * 0.6;',
    '    col += uCore * halo * uIntensity;',
    '    float disc = 1.0 - smoothstep(uCoreR * 0.96, uCoreR, r);',
    '    vec2 sp = p / max(uCoreR, 1e-3);',
    '    float shade = clamp(1.0 - length(sp - vec2(-0.32, 0.36)) * 0.62, 0.0, 1.0);',
    '    vec3 sphere = mix(uCore * 0.55, mix(uCore, vec3(1.0), 0.35), shade);',
    '    col = mix(col, sphere, disc * uIntensity);',
    '  } else {',
    '    float v = fc.y / uRes.y;',
    '    col += uAccent * 0.16 * smoothstep(0.55, 0.0, v) * uIntensity;',
    '    col += vec3(0.02, 0.03, 0.08) * smoothstep(0.3, 1.0, v);',
    '  }',
    '  float a = 1.0;',
    '  if (uMask.w > 0.5) { float md = length(fc - uMask.xy); a = 1.0 - smoothstep(uMask.z * 0.84, uMask.z, md); }',
    '  outColor = vec4(col * a, a);',
    '}'
  ].join('\n');

  var FLOOR_VS = [
    '#version 300 es',
    'in vec2 aPos; uniform mat4 uProj; uniform mat4 uView; uniform float uR; uniform float uY;',
    'out vec2 vXZ; out float vDepth;',
    'void main(){ vec3 p = vec3(aPos.x * uR, uY, aPos.y * uR); vXZ = aPos; vec4 vp = uView * vec4(p, 1.0); vDepth = -vp.z; gl_Position = uProj * vp; }'
  ].join('\n');

  var FLOOR_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vXZ; in float vDepth;',
    'uniform vec3 uAccent; uniform float uIntensity; uniform float uTime;',
    'out vec4 outColor;',
    'void main(){',
    '  float r = length(vXZ);',
    '  if (r > 1.0) discard;',
    '  float edge = 1.0 - smoothstep(0.965, 1.0, r);',
    '  float glow = pow(1.0 - r, 1.35);',
    '  float ring = smoothstep(0.02, 0.0, abs(fract(r * 6.0 - uTime * 0.05) - 0.5) - 0.48) * 0.08;',
    '  vec3 col = uAccent * (0.28 + 1.25 * glow) + vec3(0.9, 0.95, 1.0) * pow(glow, 6.0) * 0.35 + uAccent * ring;',
    '  float a = edge * uIntensity;',
    '  outColor = vec4(col * a, a);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { var log = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error(log); }
    return sh;
  }
  function program(gl, vs, fs, attribs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    attribs.forEach(function (name, i) { gl.bindAttribLocation(p, i, name); });
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p: p, u: u };
  }

  /* ---------------- Geometrija ---------------- */
  // Svaki vrh: theta, axial, axialCenter | u, v | cell x,y,w,h | rand  => 10 floatova
  function pushQuad(arr, t0, t1, a0, a1, ac, flipU, cell, rnd, seg) {
    for (var s = 0; s < seg; s++) {
      var u0 = s / seg, u1 = (s + 1) / seg;
      var ta = t0 + (t1 - t0) * u0, tb = t0 + (t1 - t0) * u1;
      var ua = flipU ? 1 - u0 : u0, ub = flipU ? 1 - u1 : u1;
      var v = [
        [ta, a0, ua, 0], [tb, a0, ub, 0], [tb, a1, ub, 1],
        [ta, a0, ua, 0], [tb, a1, ub, 1], [ta, a1, ua, 1]
      ];
      for (var k = 0; k < 6; k++) arr.push(v[k][0], v[k][1], ac, v[k][2], v[k][3], cell[0], cell[1], cell[2], cell[3], rnd);
    }
  }

  function buildTunnel(cfg, cellFor) {
    var arr = [], step = TAU / cfg.perRing, r = rng(cfg.seed || 7);
    for (var ring = 0; ring < cfg.rings; ring++) {
      var zc = -(ring + 0.5) * cfg.depth;
      var off = (ring % 2) * step * 0.5;
      var half = cfg.depth * (1 - cfg.gapZ) / 2;
      for (var k = 0; k < cfg.perRing; k++) {
        var t0 = k * step + off + step * cfg.gapA / 2, t1 = t0 + step * (1 - cfg.gapA);
        pushQuad(arr, t0, t1, zc + half, zc - half, zc, true, cellFor(ring * cfg.perRing + k, r), r(), cfg.seg);
      }
    }
    return { data: new Float32Array(arr), count: arr.length / 10, len: cfg.rings * cfg.depth };
  }

  function buildWall(cfg, cellFor) {
    var arr = [], step = TAU / cfg.cols, r = rng(cfg.seed || 11);
    for (var row = 0; row < cfg.rows; row++) {
      var yc = (row - (cfg.rows - 1) / 2) * cfg.rowH + cfg.yOff;
      var half = cfg.rowH * (1 - cfg.gapY) / 2;
      var off = (row % 2) * step * 0.5;
      for (var c = 0; c < cfg.cols; c++) {
        var t0 = c * step + off + step * cfg.gapA / 2, t1 = t0 + step * (1 - cfg.gapA);
        pushQuad(arr, t0, t1, yc + half, yc - half, yc, false, cellFor(row * cfg.cols + c + 3, r), r(), cfg.seg);
      }
    }
    return { data: new Float32Array(arr), count: arr.length / 10 };
  }

  /* ---------------- Atlas tekstura ---------------- */
  var ATLAS_COLS = 4, ATLAS_ROWS = 6;

  var PANELS = [
    { bg: ['#0a1a6e', '#2f5bff'], kick: '01 — Izrada', title: 'Web\nstranice', deco: 'browser' },
    { bg: ['#16083a', '#7a3cff'], kick: 'Brend', title: 'Vizuelni\nidentitet', italic: true, deco: 'rings' },
    { bg: ['#03231c', '#10b391'], kick: 'Rast', title: 'Digitalni\nmarketing', deco: 'chart' },
    { bg: ['#2a0c05', '#ff7a3d'], kick: 'Procesi', title: 'Automa-\ntizacija', deco: 'flow' },
    { bg: ['#f3f0e8', '#e3ddcf'], ink: '#14141a', kick: 'Ideje', title: 'Ideje koje\nrastu.', italic: true, deco: 'line' },
    { bg: ['#05060b', '#141a3d'], kick: 'Obavijesti', title: 'SMS', deco: 'chat' },
    { bg: ['#0b1240', '#3d6bff'], kick: 'Sistemi', title: 'Digitali-\nzacija', deco: 'grid' },
    { bg: ['#efe9ff', '#d9ccff'], ink: '#1b1240', kick: 'Dizajn', title: 'Grafički\ndizajn', deco: 'swatch' },
    { bg: ['#05060b', '#0c1130'], kick: 'Digital Advero', title: 'Vaš brend,\nnaš fokus.', italic: true, deco: 'core' },
    { bg: ['#2b0a2e', '#ff4f9a'], kick: 'Kreativa', title: 'Kreativnost', italic: true, deco: 'line' },
    { bg: ['#07130f', '#1f5a46'], kick: 'Sadržaj', title: 'Promotivni\nsadržaj', deco: 'play' },
    { bg: ['#080a14', '#1b2142'], kick: 'Kod', title: 'Tehnologija', deco: 'code' }
  ];

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawPanel(ctx, x, y, w, h, spec, seed) {
    var S = w / 512, ink = spec.ink || '#ffffff', r = rng(seed + 3);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    var g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, spec.bg[0]); g.addColorStop(1, spec.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    var rg = ctx.createRadialGradient(x + w * 0.85, y + h * 0.05, 0, x + w * 0.85, y + h * 0.05, w * 0.9);
    rg.addColorStop(0, 'rgba(255,255,255,.20)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ink; ctx.strokeStyle = ink;
    // mini navigacija
    ctx.globalAlpha = 0.9; ctx.font = '500 ' + (14 * S) + 'px Geist, sans-serif'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(spec.kick, x + 24 * S, y + 34 * S);
    ctx.globalAlpha = 0.45;
    for (var i = 0; i < 3; i++) { roundRect(ctx, x + w - (100 - i * 26) * S, y + 26 * S, 18 * S, 4 * S, 2 * S); ctx.fill(); }
    ctx.globalAlpha = 1;
    // dekoracija
    ctx.lineWidth = 2 * S; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var cx = x + w * 0.74, cy = y + h * 0.42;
    switch (spec.deco) {
      case 'browser':
        ctx.globalAlpha = 0.9; ctx.fillStyle = 'rgba(255,255,255,.12)'; roundRect(ctx, x + w * 0.56, y + h * 0.2, w * 0.36, h * 0.46, 10 * S); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.75)'; for (i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + w * 0.59 + i * 11 * S, y + h * 0.25, 3 * S, 0, TAU); ctx.fill(); }
        ctx.fillStyle = 'rgba(255,255,255,.35)'; roundRect(ctx, x + w * 0.59, y + h * 0.33, w * 0.2, 8 * S, 4 * S); ctx.fill();
        roundRect(ctx, x + w * 0.59, y + h * 0.4, w * 0.28, 6 * S, 3 * S); ctx.fill(); roundRect(ctx, x + w * 0.59, y + h * 0.46, w * 0.24, 6 * S, 3 * S); ctx.fill();
        ctx.fillStyle = '#fff'; roundRect(ctx, x + w * 0.59, y + h * 0.54, w * 0.12, 16 * S, 8 * S); ctx.fill();
        break;
      case 'rings':
        for (i = 1; i <= 5; i++) { ctx.globalAlpha = 0.5 - i * 0.07; ctx.beginPath(); ctx.arc(cx, cy, i * 22 * S, 0, TAU); ctx.stroke(); }
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(cx, cy, 14 * S, 0, TAU); ctx.fill();
        break;
      case 'chart':
        ctx.globalAlpha = 0.85; for (i = 0; i < 7; i++) { var bh = (24 + i * 12 + r() * 20) * S; roundRect(ctx, x + w * 0.55 + i * 22 * S, y + h * 0.66 - bh, 13 * S, bh, 3 * S); ctx.fill(); }
        ctx.globalAlpha = 1; ctx.lineWidth = 3 * S; ctx.beginPath(); ctx.moveTo(x + w * 0.55, y + h * 0.5); ctx.lineTo(x + w * 0.68, y + h * 0.42); ctx.lineTo(x + w * 0.76, y + h * 0.46); ctx.lineTo(x + w * 0.9, y + h * 0.2); ctx.stroke();
        break;
      case 'flow':
        ctx.globalAlpha = 0.9; var nodes = [[0.56, 0.2], [0.8, 0.34], [0.56, 0.5], [0.8, 0.64]];
        ctx.beginPath(); ctx.moveTo(x + w * 0.66, y + h * 0.26); ctx.lineTo(x + w * 0.8, y + h * 0.34); ctx.moveTo(x + w * 0.66, y + h * 0.56); ctx.lineTo(x + w * 0.8, y + h * 0.64); ctx.moveTo(x + w * 0.85, y + h * 0.4); ctx.lineTo(x + w * 0.62, y + h * 0.5); ctx.stroke();
        nodes.forEach(function (n) { ctx.fillStyle = 'rgba(255,255,255,.9)'; roundRect(ctx, x + w * n[0], y + h * n[1], 56 * S, 26 * S, 7 * S); ctx.fill(); });
        break;
      case 'line':
        ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(x + 24 * S, y + h * 0.3); ctx.lineTo(x + w - 24 * S, y + h * 0.3); ctx.stroke();
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x + w * 0.82, y + h * 0.48, 26 * S, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + w * 0.79, y + h * 0.48); ctx.lineTo(x + w * 0.85, y + h * 0.48); ctx.moveTo(x + w * 0.83, y + h * 0.45); ctx.lineTo(x + w * 0.85, y + h * 0.48); ctx.lineTo(x + w * 0.83, y + h * 0.51); ctx.stroke();
        break;
      case 'chat':
        var bubbles = [[0.5, 0.2, 0.42, 'Podsjetnik: vaš termin je'], [0.5, 0.36, 0.34, 'sutra u 10:30.'], [0.72, 0.52, 0.18, 'DA']];
        bubbles.forEach(function (b, n) {
          ctx.fillStyle = n === 2 ? '#3d6bff' : 'rgba(255,255,255,.14)'; roundRect(ctx, x + w * b[0], y + h * b[1], w * b[2], 30 * S, 14 * S); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = '500 ' + (12 * S) + 'px Geist, sans-serif'; ctx.fillText(b[3], x + w * b[0] + 12 * S, y + h * b[1] + 19 * S);
        });
        break;
      case 'grid':
        ctx.globalAlpha = 0.18; for (i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(x + i * w / 8, y + 50 * S); ctx.lineTo(x + i * w / 8, y + h); ctx.stroke(); }
        for (i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x, y + 50 * S + i * h / 5); ctx.lineTo(x + w, y + 50 * S + i * h / 5); ctx.stroke(); }
        ctx.globalAlpha = 0.9; ctx.fillStyle = 'rgba(255,255,255,.85)';
        roundRect(ctx, x + w * 0.56, y + h * 0.22, w * 0.15, h * 0.16, 6 * S); ctx.fill(); roundRect(ctx, x + w * 0.74, y + h * 0.22, w * 0.15, h * 0.16, 6 * S); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.35)'; roundRect(ctx, x + w * 0.56, y + h * 0.42, w * 0.33, h * 0.2, 6 * S); ctx.fill();
        break;
      case 'swatch':
        ['#ff6b4a', '#2f5bff', '#14141a', '#ffd166'].forEach(function (c, n) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + w * 0.6 + n * 34 * S, y + h * 0.28, 15 * S, 0, TAU); ctx.fill(); });
        ctx.fillStyle = ink; ctx.font = '400 ' + (88 * S) + 'px "Instrument Serif", serif'; ctx.fillText('Aa', x + w * 0.6, y + h * 0.66);
        break;
      case 'core':
        var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70 * S); cg.addColorStop(0, '#8fa6ff'); cg.addColorStop(0.35, '#2346ff'); cg.addColorStop(1, 'rgba(35,70,255,0)');
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, 70 * S, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.35; for (i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(cx, cy, (40 + i * 22) * S, 0, TAU); ctx.stroke(); }
        break;
      case 'play':
        ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(cx, cy, 40 * S, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx - 12 * S, cy - 18 * S); ctx.lineTo(cx + 20 * S, cy); ctx.lineTo(cx - 12 * S, cy + 18 * S); ctx.closePath(); ctx.fill();
        break;
      case 'code':
        var cols = ['#7aa2ff', '#c792ea', '#2ee6c5', '#ffcb6b', 'rgba(255,255,255,.5)'];
        for (i = 0; i < 7; i++) { var xo = x + w * 0.5 + (i % 3) * 14 * S; var len = (50 + r() * 120) * S; ctx.fillStyle = cols[i % cols.length]; roundRect(ctx, xo, y + h * 0.18 + i * 16 * S, len, 7 * S, 3 * S); ctx.fill(); }
        break;
    }
    ctx.globalAlpha = 1;
    // naslov
    var lines = spec.title.split('\n'), size = (lines.length > 1 ? 58 : 70) * S;
    ctx.fillStyle = ink; ctx.font = (spec.italic ? 'italic ' : '') + '400 ' + size + 'px "Instrument Serif", serif';
    for (i = 0; i < lines.length; i++) ctx.fillText(lines[i], x + 24 * S, y + h - 28 * S - (lines.length - 1 - i) * size * 0.92);
    ctx.restore();
  }

  function drawImageCover(ctx, img, x, y, w, h) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) * 0.15, sw, sh, x, y, w, h);
  }

  function Atlas(size) {
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
    this.cellW = size / ATLAS_COLS; this.cellH = size / ATLAS_ROWS;
    this.count = ATLAS_COLS * ATLAS_ROWS;
    this.imageCells = 12; // prvih 12 ćelija rezervisano za slike projekata
  }
  Atlas.prototype.rect = function (i) {
    var c = i % ATLAS_COLS, r = Math.floor(i / ATLAS_COLS);
    return [c / ATLAS_COLS, r / ATLAS_ROWS, 1 / ATLAS_COLS, 1 / ATLAS_ROWS];
  };
  Atlas.prototype.drawProcedural = function () {
    var ctx = this.ctx, pad = Math.round(this.size / 512);
    ctx.fillStyle = '#05060b'; ctx.fillRect(0, 0, this.size, this.size);
    for (var i = 0; i < this.count; i++) {
      var c = i % ATLAS_COLS, r = Math.floor(i / ATLAS_COLS);
      drawPanel(ctx, c * this.cellW + pad, r * this.cellH + pad, this.cellW - pad * 2, this.cellH - pad * 2, PANELS[i % PANELS.length], i * 17 + 5);
    }
  };
  Atlas.prototype.drawImages = function (imgs) {
    var ctx = this.ctx, pad = Math.round(this.size / 512);
    for (var i = 0; i < Math.min(imgs.length, this.imageCells); i++) {
      var c = i % ATLAS_COLS, r = Math.floor(i / ATLAS_COLS);
      ctx.fillStyle = '#05060b'; ctx.fillRect(c * this.cellW, r * this.cellH, this.cellW, this.cellH);
      drawImageCover(ctx, imgs[i], c * this.cellW + pad, r * this.cellH + pad, this.cellW - pad * 2, this.cellH - pad * 2);
    }
  };

  /* ---------------- Scena ---------------- */
  function Stage(canvas, opts) {
    opts = opts || {};
    var gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    if (!gl) throw new Error('WebGL2 nije dostupan');
    this.gl = gl; this.canvas = canvas; this.views = {}; this.dpr = 1; this.lost = false;
    this.small = Math.min(window.innerWidth, window.innerHeight) < 700;
    this.maxDpr = opts.maxDpr || (this.small ? 1.5 : 1.75);

    this.pPanel = program(gl, PANEL_VS, PANEL_FS, ['aParam', 'aUV', 'aCell', 'aRand']);
    this.pBg = program(gl, QUAD_VS, BG_FS, ['aPos']);
    this.pFloor = program(gl, FLOOR_VS, FLOOR_FS, ['aPos']);

    // atlas
    var maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.atlas = new Atlas(Math.min(opts.atlas || (this.small ? 1024 : 2048), maxTex));
    this.atlas.drawProcedural();
    this.tex = gl.createTexture();
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.upload();

    var atlas = this.atlas, imageCells = atlas.imageCells;
    // raspored ćelija: miješaju se slike projekata i tipografski paneli
    var cellFor = function (i, r) {
      var useImage = r() < 0.55;
      var idx = useImage ? Math.floor(r() * imageCells) : imageCells + Math.floor(r() * (atlas.count - imageCells));
      return atlas.rect(idx);
    };

    this.tunnelCfg = { rings: 16, perRing: 12, radius: 6.2, depth: 3.35, gapA: 0.05, gapZ: 0.07, seg: 8, seed: 21 };
    this.wallCfg = { cols: 22, rows: 5, radius: 10, rowH: 1.72, gapY: 0.1, gapA: 0.045, yOff: 0.55, seg: 6, seed: 5 };
    var tunnel = buildTunnel(this.tunnelCfg, cellFor);
    var wall = buildWall(this.wallCfg, cellFor);
    this.tunnelLen = tunnel.len;
    this.tunnelGeo = this.makePanelVao(tunnel); this.wallGeo = this.makePanelVao(wall);
    var stepT = TAU / this.tunnelCfg.perRing;
    this.tunnelPanel = [this.tunnelCfg.radius * stepT * (1 - this.tunnelCfg.gapA), this.tunnelCfg.depth * (1 - this.tunnelCfg.gapZ)];
    var stepW = TAU / this.wallCfg.cols;
    this.wallPanel = [this.wallCfg.radius * stepW * (1 - this.wallCfg.gapA), this.wallCfg.rowH * (1 - this.wallCfg.gapY)];

    // pomoćni pravougaonik (fullscreen / pod)
    this.quadVao = gl.createVertexArray(); gl.bindVertexArray(this.quadVao);
    var qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    var self = this;
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); self.lost = true; if (opts.onLost) opts.onLost(); });
    this.resize();
  }

  Stage.prototype.makePanelVao = function (geo) {
    var gl = this.gl, vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, geo.data, gl.STATIC_DRAW);
    var st = 40;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, st, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 36);
    gl.bindVertexArray(null);
    return { vao: vao, count: geo.count };
  };

  Stage.prototype.upload = function () {
    var gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas.canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  };

  // Učitava slike projekata u atlas (iste domene; na file:// se preskače zbog sigurnosnih pravila preglednika)
  Stage.prototype.loadImages = function (urls) {
    var self = this;
    if (!urls.length || location.protocol === 'file:') return Promise.resolve(false);
    var loads = urls.slice(0, this.atlas.imageCells).map(function (u) {
      return new Promise(function (res) {
        var img = new Image(); img.decoding = 'async';
        img.onload = function () { (img.decode ? img.decode() : Promise.resolve()).then(function () { res(img); }, function () { res(img); }); };
        img.onerror = function () { res(null); };
        img.src = u;
      });
    });
    return Promise.all(loads).then(function (imgs) {
      imgs = imgs.filter(Boolean);
      if (!imgs.length || self.lost) return false;
      // popuni svih 12 ćelija (ponavlja slike ako ih je manje)
      var list = []; for (var i = 0; i < self.atlas.imageCells; i++) list.push(imgs[i % imgs.length]);
      try { self.atlas.drawImages(list); self.upload(); return true; } catch (e) { return false; }
    });
  };

  Stage.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    var w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.dpr = dpr;
  };

  Stage.prototype.addView = function (name, el, type, params) {
    this.views[name] = { el: el, type: type, params: params || {} };
    return this.views[name];
  };

  Stage.prototype.drawBg = function (mode, vw, vh, ox, oy, center, core, base, accent, intensity, coreR, mask, time) {
    var gl = this.gl, P = this.pBg;
    gl.useProgram(P.p);
    gl.uniform2f(P.u.uRes, vw, vh); gl.uniform2f(P.u.uOrigin, ox, oy); gl.uniform2f(P.u.uCenter, center[0], center[1]);
    gl.uniform3fv(P.u.uCore, core); gl.uniform3fv(P.u.uBase, base); gl.uniform3fv(P.u.uAccent, accent);
    gl.uniform1f(P.u.uIntensity, intensity); gl.uniform1f(P.u.uMode, mode); gl.uniform4fv(P.u.uMask, mask); gl.uniform1f(P.u.uCoreR, coreR);
    if (P.u.uTime) gl.uniform1f(P.u.uTime, time);
    gl.bindVertexArray(this.quadVao); gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  Stage.prototype.drawPanels = function (geo, mode, proj, view, panel, radius, fog, fogRange, bright, nearFade, mask, ox, oy, time, travel) {
    var gl = this.gl, P = this.pPanel;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uProj, false, proj); gl.uniformMatrix4fv(P.u.uView, false, view);
    gl.uniform1f(P.u.uMode, mode);
    gl.uniform1f(P.u.uR, mode < 0.5 ? this.tunnelCfg.radius : this.wallCfg.radius);
    gl.uniform1f(P.u.uTravel, travel || 0); gl.uniform1f(P.u.uLen, this.tunnelLen);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(P.u.uAtlas, 0);
    gl.uniform3fv(P.u.uFog, fog); gl.uniform2fv(P.u.uFogRange, fogRange); gl.uniform1f(P.u.uBright, bright);
    gl.uniform1f(P.u.uTime, time); gl.uniform2fv(P.u.uPanel, panel); gl.uniform1f(P.u.uRadius, radius);
    gl.uniform1f(P.u.uNearFade, nearFade); gl.uniform4fv(P.u.uMask, mask); gl.uniform2f(P.u.uOrigin, ox, oy);
    gl.bindVertexArray(geo.vao); gl.drawArrays(gl.TRIANGLES, 0, geo.count);
  };

  // Crta sve vidljive poglede. Vraća true ako je nešto nacrtano.
  Stage.prototype.render = function (time) {
    if (this.lost) return false;
    var gl = this.gl, cw = this.canvas.width, ch = this.canvas.height, dpr = this.dpr;
    var vwCss = window.innerWidth, vhCss = window.innerHeight, list = [];
    for (var name in this.views) {
      var v = this.views[name], p = v.params;
      if (p.hidden || (p.intensity !== undefined && p.intensity <= 0.001)) continue;
      var r = v.el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vhCss || r.right <= 0 || r.left >= vwCss || r.width < 2 || r.height < 2) continue;
      var x = Math.round(r.left * dpr), y = Math.round(ch - r.bottom * dpr), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      var sx = Math.max(0, x), sy = Math.max(0, y), sw = Math.min(cw, x + w) - sx, sh = Math.min(ch, y + h) - sy;
      if (sw <= 0 || sh <= 0) continue;
      list.push([v, x, y, w, h, sx, sy, sw, sh]);
    }
    if (!list.length && !this.drew) return false; // ništa vidljivo i platno je već prazno
    gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    for (var i = 0; i < list.length; i++) {
      var it = list[i], vw = it[0];
      gl.enable(gl.SCISSOR_TEST); gl.scissor(it[5], it[6], it[7], it[8]); gl.viewport(it[1], it[2], it[3], it[4]);
      if (vw.type === 'tunnel' || vw.type === 'zoetrope') this.renderTunnel(vw, it[1], it[2], it[3], it[4], time);
      else if (vw.type === 'wall') this.renderWall(vw, it[1], it[2], it[3], it[4], time);
    }
    gl.disable(gl.SCISSOR_TEST);
    this.drew = list.length > 0;
    return this.drew;
  };

  Stage.prototype.renderTunnel = function (v, x, y, w, h, time) {
    var p = v.params, aspect = w / h, zo = v.type === 'zoetrope';
    var intensity = p.intensity === undefined ? 1 : p.intensity;
    var fov = (p.fov || 72) * Math.PI / 180;
    // za uske (portretne) ekrane šire vidno polje kako bi tunel ispunio ekran
    if (aspect < 1 && !zo) fov = 2 * Math.atan(Math.tan(fov / 2) / Math.max(aspect, 0.5) * 0.8);
    var proj = M.persp(fov, aspect, 0.1, 120);
    var camZ = zo ? (p.camZ !== undefined ? p.camZ : 7.5) : (p.camZ || 0);
    var view = M.mul(M.mul(M.rx(p.tiltX || 0), M.ry(p.tiltY || 0)), M.mul(M.rz(p.roll || 0), M.trans(-(p.camX || 0), -(p.camY || 0), -camZ)));
    var mask = zo ? [w / 2, h / 2, Math.min(w, h) / 2, 1] : [0, 0, 0, 0];
    var core = p.core || [0.16, 0.33, 1.0];
    // svjetleće jezgro u središtu (projekcija dalekog kraja tunela)
    var fz = -this.tunnelLen * 0.98;
    var fpx = view[8] * fz + view[12], fpy = view[9] * fz + view[13], fpz = view[10] * fz + view[14];
    var cxN = (proj[0] * fpx) / (-fpz), cyN = (proj[5] * fpy) / (-fpz);
    var cx = (cxN * 0.5 + 0.5) * w, cy = (cyN * 0.5 + 0.5) * h;
    var coreR = (zo ? 0.085 : 0.075) * (p.coreScale || 1);
    this.drawBg(0, w, h, x, y, [cx, cy], core.map(function (c) { return c * intensity; }), [0.012, 0.014, 0.03], [0, 0, 0], intensity, coreR, mask, time);
    this.drawPanels(this.tunnelGeo, 0, proj, view, this.tunnelPanel, 0.16, core.map(function (c) { return c * 0.85; }),
      [zo ? 10 : 9, this.tunnelLen * 0.97], (p.bright === undefined ? 1 : p.bright) * intensity, zo ? 0.5 : 2.2, mask, x, y, time, p.travel || 0);
  };

  Stage.prototype.renderWall = function (v, x, y, w, h, time) {
    var p = v.params, aspect = w / h, intensity = p.intensity === undefined ? 1 : p.intensity;
    var fovDeg = aspect < 1 ? 74 : 50;
    var proj = M.persp(fovDeg * Math.PI / 180, aspect, 0.1, 80);
    var R = this.wallCfg.radius;
    var camZ = aspect < 1 ? R * 0.18 : R * 0.42, camY = p.camY !== undefined ? p.camY : 0.35;
    var view = M.mul(M.rx(p.pitch !== undefined ? p.pitch : 0.07), M.mul(M.ry(-(p.yaw || 0)), M.trans(-(p.camX || 0), -camY, -camZ)));
    var accent = p.accent || [0.25, 0.42, 1.0];
    var mask = [0, 0, 0, 0];
    this.drawBg(1, w, h, x, y, [w / 2, h / 2], [0, 0, 0], [0.012, 0.014, 0.03], accent, intensity, 0, mask, time);
    // pod
    var gl = this.gl, F = this.pFloor;
    gl.useProgram(F.p);
    gl.uniformMatrix4fv(F.u.uProj, false, proj); gl.uniformMatrix4fv(F.u.uView, false, view);
    gl.uniform1f(F.u.uR, R * 0.985); gl.uniform1f(F.u.uY, -(this.wallCfg.rows / 2) * this.wallCfg.rowH + this.wallCfg.yOff - 0.12);
    gl.uniform3fv(F.u.uAccent, accent); gl.uniform1f(F.u.uIntensity, intensity * 0.95); gl.uniform1f(F.u.uTime, time);
    gl.bindVertexArray(this.quadVao); gl.drawArrays(gl.TRIANGLES, 0, 6);
    // zid
    this.drawPanels(this.wallGeo, 1, proj, view, this.wallPanel, 0.12, [0.02, 0.025, 0.06], [R * 1.3, R * 3.2],
      (p.bright === undefined ? 0.74 : p.bright) * intensity, 0.2, mask, x, y, time, 0);
  };

  window.DAStage = {
    supported: function () {
      try { var c = document.createElement('canvas'); return !!(window.WebGL2RenderingContext && c.getContext('webgl2')); } catch (e) { return false; }
    },
    create: function (canvas, opts) { return new Stage(canvas, opts); },
    hexToRgb: hexToRgb
  };
})();
