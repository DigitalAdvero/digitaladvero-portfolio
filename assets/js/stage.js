/* =========================================================================
   DigitalAdvero — 3D zoetrop (WebGL2)
   Jedan vertikalni cilindar od ekrana: gornji dio je okno (tunel) kroz koje
   se kamera spušta, donji dio je zakrivljeni zid sobe s plavim podom.
   Kameru (pozicija, nagib, rotacija) pokreće main.js na osnovu skrolanja.
   ========================================================================= */
(function () {
  'use strict';

  var TAU = Math.PI * 2;

  /* ---------------- mat4 (column-major) ---------------- */
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
    ry: function (a) { var c = Math.cos(a), s = Math.sin(a), m = M.ident(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
  };
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function hexToRgb(h) {
    h = (h || '#8fa6ff').replace('#', ''); if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
    var n = parseInt(h, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  /* ---------------- geometrija cilindra ---------------- */
  var CYL = { R: 6, cols: 12, rows: 48, rowH: 2.0, gapA: 0.05, gapY: 0.075, seg: 6 };
  CYL.H = CYL.rows * CYL.rowH;
  CYL.step = TAU / CYL.cols;

  /* ---------------- shaderi ---------------- */
  var PANEL_VS = [
    '#version 300 es',
    'in vec3 aParam; in vec2 aUV; in vec4 aCell; in vec2 aExtra;',
    'uniform mat4 uProj; uniform mat4 uView; uniform float uR;',
    'out vec2 vUV; out vec4 vCell; out float vRand; out float vDepth; out float vY; flat out float vIndex;',
    'void main(){',
    '  vec3 p = vec3(uR * sin(aParam.x), aParam.y, -uR * cos(aParam.x));',
    '  vec4 vp = uView * vec4(p, 1.0);',
    '  vDepth = -vp.z; vY = aParam.z; vUV = aUV; vCell = aCell; vRand = aExtra.x; vIndex = aExtra.y;',
    '  gl_Position = uProj * vp;',
    '}'
  ].join('\n');

  var PANEL_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUV; in vec4 vCell; in float vRand; in float vDepth; in float vY; flat in float vIndex;',
    'uniform sampler2D uAtlas; uniform vec2 uPanel; uniform float uRadius; uniform float uBright;',
    'uniform float uSrcIndex; uniform vec4 uSrcCell; uniform float uSrcHide; uniform vec3 uFloor; uniform float uFar;',
    'out vec4 outColor;',
    'float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }',
    'void main(){',
    '  vec2 p = (vUV - 0.5) * uPanel;',
    '  float d = sdRR(p, uPanel * 0.5, uRadius);',
    '  float aa = max(fwidth(d), 1e-4) * 1.2;',
    '  float inside = 1.0 - smoothstep(-aa, aa, d);',
    '  if (inside < 0.002) discard;',
    '  bool src = abs(vIndex - uSrcIndex) < 0.5;',
    '  vec4 cell = src ? uSrcCell : vCell;',
    '  vec3 col = texture(uAtlas, cell.xy + clamp(vUV, 0.004, 0.996) * cell.zw).rgb;',
    '  col *= (0.82 + 0.26 * vRand) * uBright;',
    '  vec2 e = min(vUV, 1.0 - vUV);',
    '  col *= mix(0.62, 1.0, smoothstep(0.0, 0.16, min(e.x, e.y * 1.5)));',
    '  col *= mix(1.0, 0.5, smoothstep(14.0, uFar, vDepth));',
    '  col += uFloor * (1.0 - smoothstep(0.0, 4.5, vY)) * 0.16;',
    '  if (src && uSrcHide > 0.5) {',
    '    float edge = smoothstep(-0.07, 0.0, d);',
    '    col = vec3(0.012, 0.014, 0.03) + uFloor * (0.05 + edge * 0.75);',
    '  }',
    '  outColor = vec4(col * inside, inside);',
    '}'
  ].join('\n');

  var FLOOR_VS = [
    '#version 300 es',
    'in vec2 aPos; uniform mat4 uProj; uniform mat4 uView; uniform float uR;',
    'out vec2 vXZ;',
    'void main(){ vXZ = aPos; gl_Position = uProj * uView * vec4(aPos.x * uR, 0.0, aPos.y * uR, 1.0); }'
  ].join('\n');

  var FLOOR_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vXZ; uniform vec3 uFloor; uniform float uGlow;',
    'out vec4 outColor;',
    'void main(){',
    '  float r = length(vXZ);',
    '  if (r > 1.0) discard;',
    '  float hl = exp(-length(vXZ - vec2(-0.28, -0.32)) * 2.6);',
    '  vec3 col = uFloor * (0.62 + 0.55 * pow(1.0 - r, 0.9)) + vec3(0.55, 0.65, 1.0) * hl * 0.22 * uGlow;',
    '  col *= 0.72 + 0.28 * smoothstep(1.0, 0.86, r);',
    '  float edge = 1.0 - smoothstep(0.985, 1.0, r);',
    '  outColor = vec4(col * edge, edge);',
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

  /* ---------------- atlas (tipografski paneli + slike projekata) ---------------- */
  var ATLAS_COLS = 4, ATLAS_ROWS = 6, IMAGE_CELLS = 12;
  var PANELS = [
    { bg: ['#0a1a6e', '#2f5bff'], kick: 'Izrada', title: 'Web\nstranice', deco: 'browser' },
    { bg: ['#16083a', '#7a3cff'], kick: 'Brend', title: 'Vizuelni\nidentitet', italic: true, deco: 'rings' },
    { bg: ['#03231c', '#10b391'], kick: 'Rast', title: 'Digitalni\nmarketing', deco: 'chart' },
    { bg: ['#2a0c05', '#ff7a3d'], kick: 'Procesi', title: 'Automa-\ntizacija', deco: 'flow' },
    { bg: ['#f3f0e8', '#e3ddcf'], ink: '#14141a', kick: 'Ideje', title: 'Ideje koje\nrastu.', italic: true, deco: 'line' },
    { bg: ['#05060b', '#141a3d'], kick: 'Obavijesti', title: 'SMS', deco: 'chat' },
    { bg: ['#0b1240', '#3d6bff'], kick: 'Sistemi', title: 'Digitali-\nzacija', deco: 'grid' },
    { bg: ['#efe9ff', '#d9ccff'], ink: '#1b1240', kick: 'Dizajn', title: 'Grafički\ndizajn', deco: 'swatch' },
    { bg: ['#05060b', '#0c1130'], kick: 'DigitalAdvero', title: 'Vaš brend,\nnaš fokus.', italic: true, deco: 'core' },
    { bg: ['#2b0a2e', '#ff4f9a'], kick: 'Kreativa', title: 'Kreativnost', italic: true, deco: 'line' },
    { bg: ['#07130f', '#1f5a46'], kick: 'Sadržaj', title: 'Promotivni\nsadržaj', deco: 'play' },
    { bg: ['#080a14', '#1b2142'], kick: 'Kod', title: 'Tehnologija', deco: 'code' }
  ];
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawPanel(ctx, x, y, w, h, spec, seed) {
    var S = w / 512, ink = spec.ink || '#ffffff', r = rng(seed + 3), i;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    var g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, spec.bg[0]); g.addColorStop(1, spec.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    var rg = ctx.createRadialGradient(x + w * 0.85, y + h * 0.05, 0, x + w * 0.85, y + h * 0.05, w * 0.9);
    rg.addColorStop(0, 'rgba(255,255,255,.20)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ink; ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.9; ctx.font = '500 ' + (14 * S) + 'px Geist, sans-serif';
    ctx.fillText(spec.kick, x + 24 * S, y + 34 * S);
    ctx.globalAlpha = 0.45;
    for (i = 0; i < 3; i++) { roundRect(ctx, x + w - (100 - i * 26) * S, y + 26 * S, 18 * S, 4 * S, 2 * S); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.lineWidth = 2 * S; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var cx = x + w * 0.74, cy = y + h * 0.42;
    switch (spec.deco) {
      case 'browser':
        ctx.fillStyle = 'rgba(255,255,255,.12)'; roundRect(ctx, x + w * 0.56, y + h * 0.2, w * 0.36, h * 0.46, 10 * S); ctx.fill();
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
        ctx.beginPath(); ctx.moveTo(x + w * 0.66, y + h * 0.26); ctx.lineTo(x + w * 0.8, y + h * 0.34); ctx.moveTo(x + w * 0.66, y + h * 0.56); ctx.lineTo(x + w * 0.8, y + h * 0.64); ctx.moveTo(x + w * 0.85, y + h * 0.4); ctx.lineTo(x + w * 0.62, y + h * 0.5); ctx.stroke();
        [[0.56, 0.2], [0.8, 0.34], [0.56, 0.5], [0.8, 0.64]].forEach(function (n) { ctx.fillStyle = 'rgba(255,255,255,.9)'; roundRect(ctx, x + w * n[0], y + h * n[1], 56 * S, 26 * S, 7 * S); ctx.fill(); });
        break;
      case 'line':
        ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(x + 24 * S, y + h * 0.3); ctx.lineTo(x + w - 24 * S, y + h * 0.3); ctx.stroke();
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x + w * 0.82, y + h * 0.48, 26 * S, 0, TAU); ctx.stroke();
        break;
      case 'chat':
        [[0.5, 0.2, 0.42, 'Podsjetnik: vaš termin je'], [0.5, 0.36, 0.34, 'sutra u 10:30.'], [0.72, 0.52, 0.18, 'DA']].forEach(function (b, n) {
          ctx.fillStyle = n === 2 ? '#3d6bff' : 'rgba(255,255,255,.14)'; roundRect(ctx, x + w * b[0], y + h * b[1], w * b[2], 30 * S, 14 * S); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = '500 ' + (12 * S) + 'px Geist, sans-serif'; ctx.fillText(b[3], x + w * b[0] + 12 * S, y + h * b[1] + 19 * S);
        });
        break;
      case 'grid':
        ctx.globalAlpha = 0.18; for (i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(x + i * w / 8, y + 50 * S); ctx.lineTo(x + i * w / 8, y + h); ctx.stroke(); }
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
        break;
      case 'play':
        ctx.beginPath(); ctx.arc(cx, cy, 40 * S, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx - 12 * S, cy - 18 * S); ctx.lineTo(cx + 20 * S, cy); ctx.lineTo(cx - 12 * S, cy + 18 * S); ctx.closePath(); ctx.fill();
        break;
      case 'code':
        var cols = ['#7aa2ff', '#c792ea', '#2ee6c5', '#ffcb6b', 'rgba(255,255,255,.5)'];
        for (i = 0; i < 7; i++) { ctx.fillStyle = cols[i % cols.length]; roundRect(ctx, x + w * 0.5 + (i % 3) * 14 * S, y + h * 0.18 + i * 16 * S, (50 + r() * 120) * S, 7 * S, 3 * S); ctx.fill(); }
        break;
    }
    var lines = spec.title.split('\n'), size = (lines.length > 1 ? 58 : 70) * S;
    ctx.fillStyle = ink; ctx.font = (spec.italic ? 'italic ' : '') + '400 ' + size + 'px "Instrument Serif", serif';
    for (i = 0; i < lines.length; i++) ctx.fillText(lines[i], x + 24 * S, y + h - 28 * S - (lines.length - 1 - i) * size * 0.92);
    ctx.restore();
  }
  function drawImageCover(ctx, img, x, y, w, h) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) * 0.12, sw, sh, x, y, w, h);
  }
  function Atlas(size) {
    this.size = size; this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d'); this.cw = size / ATLAS_COLS; this.ch = size / ATLAS_ROWS;
  }
  Atlas.prototype.rect = function (i) { return [(i % ATLAS_COLS) / ATLAS_COLS, Math.floor(i / ATLAS_COLS) / ATLAS_ROWS, 1 / ATLAS_COLS, 1 / ATLAS_ROWS]; };
  Atlas.prototype.drawProcedural = function () {
    var pad = Math.round(this.size / 512);
    this.ctx.fillStyle = '#05060b'; this.ctx.fillRect(0, 0, this.size, this.size);
    for (var i = 0; i < ATLAS_COLS * ATLAS_ROWS; i++) {
      drawPanel(this.ctx, (i % ATLAS_COLS) * this.cw + pad, Math.floor(i / ATLAS_COLS) * this.ch + pad, this.cw - pad * 2, this.ch - pad * 2, PANELS[i % PANELS.length], i * 17 + 5);
    }
  };
  Atlas.prototype.drawImages = function (imgs) {
    var pad = Math.round(this.size / 512);
    for (var i = 0; i < Math.min(imgs.length, IMAGE_CELLS); i++) {
      var x = (i % ATLAS_COLS) * this.cw, y = Math.floor(i / ATLAS_COLS) * this.ch;
      this.ctx.fillStyle = '#05060b'; this.ctx.fillRect(x, y, this.cw, this.ch);
      drawImageCover(this.ctx, imgs[i], x + pad, y + pad, this.cw - pad * 2, this.ch - pad * 2);
    }
  };

  /* ---------------- scena ---------------- */
  function Zoetrope(canvas, opts) {
    opts = opts || {};
    var gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    if (!gl) throw new Error('WebGL2 nije dostupan');
    this.gl = gl; this.canvas = canvas; this.lost = false;
    this.small = Math.min(window.innerWidth, window.innerHeight) < 700;
    this.maxDpr = opts.maxDpr || (this.small ? 1.5 : 1.75);
    this.cam = { x: 0, y: CYL.H + 18, z: 0, yaw: 0, pitch: Math.PI / 2, fov: 55 };
    this.floorColor = hexToRgb(opts.floor || '#1f4dff');
    this.src = { index: -1, cell: [0, 0, 0.25, 1 / 6], hide: 0 };
    this.bright = 1;

    this.pPanel = program(gl, PANEL_VS, PANEL_FS, ['aParam', 'aUV', 'aCell', 'aExtra']);
    this.pFloor = program(gl, FLOOR_VS, FLOOR_FS, ['aPos']);

    var maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.atlas = new Atlas(Math.min(opts.atlas || (this.small ? 1024 : 2048), maxTex));
    this.atlas.drawProcedural();
    this.tex = gl.createTexture();
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.upload();

    // geometrija: svaki panel = seg traka; vrh: theta, y, yCentar | u, v | ćelija | rand, indeks
    var arr = [], r = rng(31), atlas = this.atlas, cellCount = ATLAS_COLS * ATLAS_ROWS;
    this.panels = [];
    for (var row = 0; row < CYL.rows; row++) {
      var yc = (row + 0.5) * CYL.rowH, half = CYL.rowH * (1 - CYL.gapY) / 2;
      var off = (row % 2) * CYL.step * 0.5;
      for (var col = 0; col < CYL.cols; col++) {
        var t0 = col * CYL.step + off + CYL.step * CYL.gapA / 2, t1 = t0 + CYL.step * (1 - CYL.gapA);
        var idx = row * CYL.cols + col;
        var useImg = r() < 0.7;
        var cellIdx = useImg ? Math.floor(r() * IMAGE_CELLS) : IMAGE_CELLS + Math.floor(r() * (cellCount - IMAGE_CELLS));
        var cell = atlas.rect(cellIdx), rnd = r();
        this.panels.push({ t0: t0, t1: t1, y0: yc - half, y1: yc + half });
        for (var s = 0; s < CYL.seg; s++) {
          var u0 = s / CYL.seg, u1 = (s + 1) / CYL.seg, ta = t0 + (t1 - t0) * u0, tb = t0 + (t1 - t0) * u1;
          var V = [[ta, yc + half, u0, 0], [tb, yc + half, u1, 0], [tb, yc - half, u1, 1], [ta, yc + half, u0, 0], [tb, yc - half, u1, 1], [ta, yc - half, u0, 1]];
          for (var k = 0; k < 6; k++) arr.push(V[k][0], V[k][1], yc, V[k][2], V[k][3], cell[0], cell[1], cell[2], cell[3], rnd, idx);
        }
      }
    }
    this.count = arr.length / 11;
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
    var st = 44;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, st, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, st, 36);
    this.floorVao = gl.createVertexArray(); gl.bindVertexArray(this.floorVao);
    var fb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, fb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.panelSize = [CYL.R * CYL.step * (1 - CYL.gapA), CYL.rowH * (1 - CYL.gapY)];

    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    var self = this;
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); self.lost = true; if (opts.onLost) opts.onLost(); });
    this.resize();
  }

  Zoetrope.prototype.upload = function () {
    var gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas.canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  };

  // Slike projekata (iste domene). Na file:// se preskaču zbog sigurnosnih pravila preglednika.
  Zoetrope.prototype.loadImages = function (urls) {
    var self = this;
    if (!urls.length || location.protocol === 'file:') return Promise.resolve(false);
    return Promise.all(urls.slice(0, IMAGE_CELLS).map(function (u) {
      return new Promise(function (res) {
        var img = new Image(); img.decoding = 'async';
        img.onload = function () { (img.decode ? img.decode() : Promise.resolve()).then(function () { res(img); }, function () { res(img); }); };
        img.onerror = function () { res(null); };
        img.src = u;
      });
    })).then(function (imgs) {
      imgs = imgs.filter(Boolean);
      if (!imgs.length || self.lost) return false;
      var list = []; for (var i = 0; i < IMAGE_CELLS; i++) list.push(imgs[i % imgs.length]);
      try { self.atlas.drawImages(list); self.upload(); return true; } catch (e) { return false; }
    });
  };

  Zoetrope.prototype.cellOf = function (imageIndex) { return this.atlas.rect(imageIndex % IMAGE_CELLS); };

  Zoetrope.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    var w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.cssW = window.innerWidth; this.cssH = window.innerHeight; this.aspect = this.cssW / this.cssH;
  };

  Zoetrope.prototype.matrices = function () {
    var c = this.cam;
    this.proj = M.persp(c.fov * Math.PI / 180, this.aspect, 0.1, 260);
    this.view = M.mul(M.mul(M.rx(c.pitch), M.ry(c.yaw)), M.trans(-c.x, -c.y, -c.z));
    this.vp = M.mul(this.proj, this.view);
  };

  // Projekcija tačke svijeta u CSS piksele ekrana (null ako je iza kamere)
  Zoetrope.prototype.project = function (x, y, z) {
    var m = this.vp, cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.05) return null;
    return [(cx / cw * 0.5 + 0.5) * this.cssW, (1 - (cy / cw * 0.5 + 0.5)) * this.cssH];
  };
  // Uglovi panela na ekranu: [gore-lijevo, gore-desno, dolje-desno, dolje-lijevo]
  Zoetrope.prototype.panelQuad = function (index) {
    var p = this.panels[index]; if (!p) return null;
    var R = CYL.R, self = this;
    var pt = function (t, y) { return self.project(R * Math.sin(t), y, -R * Math.cos(t)); };
    var q = [pt(p.t0, p.y1), pt(p.t1, p.y1), pt(p.t1, p.y0), pt(p.t0, p.y0)];
    return q.every(Boolean) ? q : null;
  };
  // Indeks panela u redu `row` najbliži uglu theta
  Zoetrope.prototype.panelAt = function (row, theta) {
    var off = (row % 2) * CYL.step * 0.5;
    var col = Math.round((theta - off - CYL.step / 2) / CYL.step);
    col = ((col % CYL.cols) + CYL.cols) % CYL.cols;
    return row * CYL.cols + col;
  };

  Zoetrope.prototype.render = function () {
    if (this.lost) return;
    var gl = this.gl;
    this.matrices();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    var F = this.pFloor;
    gl.useProgram(F.p);
    gl.uniformMatrix4fv(F.u.uProj, false, this.proj); gl.uniformMatrix4fv(F.u.uView, false, this.view);
    gl.uniform1f(F.u.uR, CYL.R * 0.998); gl.uniform3fv(F.u.uFloor, this.floorColor); gl.uniform1f(F.u.uGlow, 1);
    gl.bindVertexArray(this.floorVao); gl.drawArrays(gl.TRIANGLES, 0, 6);
    var P = this.pPanel;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uProj, false, this.proj); gl.uniformMatrix4fv(P.u.uView, false, this.view);
    gl.uniform1f(P.u.uR, CYL.R);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(P.u.uAtlas, 0);
    gl.uniform2fv(P.u.uPanel, this.panelSize); gl.uniform1f(P.u.uRadius, 0.1); gl.uniform1f(P.u.uBright, this.bright);
    gl.uniform1f(P.u.uSrcIndex, this.src.index); gl.uniform4fv(P.u.uSrcCell, this.src.cell); gl.uniform1f(P.u.uSrcHide, this.src.hide);
    gl.uniform3fv(P.u.uFloor, this.floorColor); gl.uniform1f(P.u.uFar, 120);
    gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, this.count);
  };

  window.DAZoetrope = {
    CYL: CYL,
    supported: function () {
      try { var c = document.createElement('canvas'); return !!(window.WebGL2RenderingContext && c.getContext('webgl2')); } catch (e) { return false; }
    },
    create: function (canvas, opts) { return new Zoetrope(canvas, opts); },
    hexToRgb: hexToRgb
  };
})();
