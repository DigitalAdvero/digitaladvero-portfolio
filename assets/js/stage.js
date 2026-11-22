/* =========================================================================
   DigitalAdvero — 3D zoetrop (WebGL2) s filmskom obradom slike
   Vertikalni cilindar od ekrana (okno + soba s plavim podom), čestice
   "vjetra" koje struje uvis i post-obrada: sjaj ekrana (bloom), zamućenje
   pokreta, razdvajanje boja, filmsko tonsko mapiranje, vinjeta i zrno.
   Kameru i intenzitet efekata pokreće main.js na osnovu skrolanja.
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
    ry: function (a) { var c = Math.cos(a), s = Math.sin(a), m = M.ident(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
    rz: function (a) { var c = Math.cos(a), s = Math.sin(a), m = M.ident(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
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

  /* ---------------- shaderi: scena ---------------- */
  var PANEL_VS = [
    '#version 300 es',
    'in vec3 aParam; in vec2 aUV; in vec4 aCell; in vec2 aExtra;',
    'uniform mat4 uProj; uniform mat4 uView; uniform float uR;',
    'out vec2 vUV; out vec4 vCell; out float vRand; out float vDepth; out float vY; out vec3 vWorld; flat out float vIndex;',
    'void main(){',
    '  vec3 p = vec3(uR * sin(aParam.x), aParam.y, -uR * cos(aParam.x));',
    '  vec4 vp = uView * vec4(p, 1.0);',
    '  vDepth = -vp.z; vY = aParam.z; vUV = aUV; vCell = aCell; vRand = aExtra.x; vIndex = aExtra.y; vWorld = p;',
    '  gl_Position = uProj * vp;',
    '}'
  ].join('\n');

  // Ekrani kao TV: sken-linije, treperenje, pokretna traka, prigušeni/ugašeni ekrani,
  // tamnjenje pod oštrim uglom i u dubini okna.
  var PANEL_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUV; in vec4 vCell; in float vRand; in float vDepth; in float vY; in vec3 vWorld; flat in float vIndex;',
    'uniform sampler2D uAtlas; uniform vec2 uPanel; uniform float uRadius; uniform float uBright; uniform float uTime;',
    'uniform float uSrcIndex; uniform vec4 uSrcCell; uniform float uSrcHide; uniform vec3 uFloor; uniform vec3 uCam; uniform float uScan;',
    'out vec4 outColor;',
    'float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }',
    'float hash(float n){ return fract(sin(n) * 43758.5453); }',
    'void main(){',
    '  vec2 p = (vUV - 0.5) * uPanel;',
    '  float d = sdRR(p, uPanel * 0.5, uRadius);',
    '  float aa = max(fwidth(d), 1e-4) * 1.2;',
    '  float inside = 1.0 - smoothstep(-aa, aa, d);',
    '  if (inside < 0.002) discard;',
    '  bool src = abs(vIndex - uSrcIndex) < 0.5;',
    '  vec4 cell = src ? uSrcCell : vCell;',
    '  vec2 uv = vUV;',
    '  float jit = step(0.985, hash(floor(uTime * 12.0) + vIndex * 7.13)) * 0.012;',
    '  uv.x += jit * sin(uv.y * 80.0);',
    '  vec3 col = texture(uAtlas, cell.xy + clamp(uv, 0.004, 0.996) * cell.zw).rgb;',
    '  col = pow(col, vec3(1.18)) * 1.32;',
    '  float cls = vRand < 0.07 ? 0.12 : (vRand < 0.2 ? 0.45 : mix(0.7, 1.08, (vRand - 0.2) / 0.8));',
    '  if (src) cls = 1.0;',
    '  col *= cls * uBright;',
    '  float sl = 0.9 + 0.1 * sin(vUV.y * uScan * 6.2831 + uTime * 3.0);',
    '  col *= sl;',
    '  float fl = 0.93 + 0.07 * sin(uTime * (11.0 + vRand * 9.0) + vRand * 40.0) * sin(uTime * 6.7 + vRand * 17.0);',
    '  col *= fl;',
    '  float rb = smoothstep(0.06, 0.0, abs(fract(vUV.y * 0.6 - uTime * (0.12 + vRand * 0.1) + vRand * 5.0) - 0.5));',
    '  col += col * rb * 0.22;',
    '  vec2 e = min(vUV, 1.0 - vUV);',
    '  col *= mix(0.45, 1.0, smoothstep(0.0, 0.18, min(e.x, e.y * 1.5)));',
    '  vec3 n = normalize(vec3(-vWorld.x, 0.0, -vWorld.z));',
    '  vec3 v = normalize(uCam - vWorld);',
    '  col *= mix(0.22, 1.0, pow(clamp(dot(n, v), 0.0, 1.0), 0.7));',
    '  col *= mix(1.0, 0.06, smoothstep(8.0, 70.0, vDepth));',
    '  col += uFloor * (1.0 - smoothstep(0.0, 4.0, vY)) * 0.07;',
    '  float bez = smoothstep(-uRadius * 0.9, -uRadius * 0.2, d);',
    '  col *= 1.0 - bez * 0.85;',
    '  if (src && uSrcHide > 0.5) {',
    '    float edge = smoothstep(-0.07, 0.0, d);',
    '    col = vec3(0.006, 0.007, 0.016) + uFloor * (0.02 + edge * 0.9);',
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

  // Pod: tamnoplava bina sa svjetlom u sredini, odsjajem ekrana uz rub i bojom aktivnog projekta.
  // uLightOnly = 1: samo jezgro svjetla (izvor za zrake).
  var FLOOR_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vXZ; uniform vec3 uFloor; uniform float uTime; uniform vec3 uSpill; uniform float uSpillAmt; uniform float uLightOnly;',
    'out vec4 outColor;',
    'void main(){',
    '  float r = length(vXZ);',
    '  if (r > 1.0) discard;',
    '  float spot = exp(-r * r * 4.0);',
    '  float edge = 1.0 - smoothstep(0.985, 1.0, r);',
    '  if (uLightOnly > 0.5) { outColor = vec4(mix(uFloor, uSpill, uSpillAmt * 0.6) * spot * spot * 0.9 * edge, edge); return; }',
    '  float hl = exp(-length(vXZ - vec2(-0.24, -0.3)) * 3.4);',
    '  vec3 col = uFloor * (0.035 + 0.5 * spot) + vec3(0.5, 0.62, 1.0) * hl * 0.06;',
    '  float ring = smoothstep(0.72, 1.0, r);',
    '  vec3 rc = mix(vec3(0.16, 0.2, 0.5), uSpill * 0.75, uSpillAmt);',
    '  col += rc * ring * (0.6 + 0.4 * sin(uTime * 1.7 + atan(vXZ.y, vXZ.x) * 3.0)) * (0.22 + uSpillAmt * 0.3);',
    '  col += uSpill * uSpillAmt * spot * 0.12;',
    '  col *= 0.92 + 0.08 * sin(r * 60.0 - uTime * 0.6) * spot;',
    '  outColor = vec4(col * edge, edge);',
    '}'
  ].join('\n');

  // Čestice "vjetra": tragovi u prostoru ekrana, struje uvis kroz okno
  var DUST_VS = [
    '#version 300 es',
    'in vec4 aSeed; in vec2 aCorner;',
    'uniform mat4 uProj; uniform mat4 uView; uniform vec2 uRes; uniform float uTime; uniform float uWind; uniform float uRise; uniform float uStreak;',
    'uniform float uH; uniform float uR; uniform vec3 uCamVel; uniform float uWidth;',
    'out float vAlpha; out float vAcross; out vec3 vTint;',
    'vec3 pos(float t){',
    '  float sp = 0.55 + aSeed.w;',
    '  float ang = aSeed.x * 6.2831 + t * 0.22 * (aSeed.w - 0.4);',
    '  float rad = sqrt(aSeed.y) * uR * 0.93;',
    '  float y = mod(aSeed.z * (uH + 30.0) + uRise * sp, uH + 30.0) - 6.0;',
    '  return vec3(sin(ang) * rad, y, -cos(ang) * rad);',
    '}',
    'void main(){',
    '  float sp = 0.55 + aSeed.w;',
    '  vec3 head = pos(uTime);',
    '  vec3 vel = vec3(0.0, uWind * sp, 0.0) - uCamVel;',
    '  vec3 tail = head - vel * uStreak;',
    '  vec4 c0 = uProj * uView * vec4(head, 1.0);',
    '  vec4 c1 = uProj * uView * vec4(tail, 1.0);',
    '  float behind = step(c0.w, 0.15) + step(c1.w, 0.15);',
    '  c0.w = max(c0.w, 0.15); c1.w = max(c1.w, 0.15);',
    '  vec2 s0 = c0.xy / c0.w * uRes * 0.5, s1 = c1.xy / c1.w * uRes * 0.5;',
    '  vec2 dir = s1 - s0; float len = length(dir);',
    '  dir = len > 0.001 ? dir / len : vec2(0.0, 1.0);',
    '  if (len < uWidth * 1.5) { s1 = s0 + dir * uWidth * 1.5; }',
    '  vec2 perp = vec2(-dir.y, dir.x);',
    '  vec2 sp2 = (aCorner.x < 0.5 ? s0 : s1) + perp * aCorner.y * uWidth * (0.6 + aSeed.w);',
    '  vec4 c = aCorner.x < 0.5 ? c0 : c1;',
    '  gl_Position = vec4(sp2 / (uRes * 0.5) * c.w, c.z, c.w);',
    '  float depth = c0.w;',
    '  vAlpha = (1.0 - min(behind, 1.0)) * smoothstep(0.6, 3.0, depth) * (1.0 - smoothstep(26.0, 70.0, depth)) * (aCorner.x < 0.5 ? 1.0 : 0.15) * (0.35 + aSeed.w * 0.65);',
    '  vAcross = aCorner.y;',
    '  vTint = mix(vec3(0.62, 0.72, 1.0), vec3(1.0, 0.86, 0.72), step(0.8, aSeed.x));',
    '}'
  ].join('\n');

  var DUST_FS = [
    '#version 300 es',
    'precision highp float;',
    'in float vAlpha; in float vAcross; in vec3 vTint; uniform float uDust;',
    'out vec4 outColor;',
    'void main(){',
    '  float a = vAlpha * (1.0 - smoothstep(0.2, 1.0, abs(vAcross))) * uDust;',
    '  outColor = vec4(vTint * a, 0.0);',
    '}'
  ].join('\n');

  /* ---------------- shaderi: post-obrada ---------------- */
  var QUAD_VS = [
    '#version 300 es',
    'in vec2 aPos; out vec2 vUv;',
    'void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var DOWN_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThreshold; uniform float uKnee; uniform float uPrefilter;',
    'out vec4 outColor;',
    'vec3 s(vec2 o){ return texture(uTex, vUv + o * uTexel).rgb; }',
    'void main(){',
    '  vec3 a = s(vec2(-2.0, 2.0)), b = s(vec2(0.0, 2.0)), c = s(vec2(2.0, 2.0));',
    '  vec3 d = s(vec2(-2.0, 0.0)), e = s(vec2(0.0, 0.0)), f = s(vec2(2.0, 0.0));',
    '  vec3 g = s(vec2(-2.0, -2.0)), h = s(vec2(0.0, -2.0)), i = s(vec2(2.0, -2.0));',
    '  vec3 j = s(vec2(-1.0, 1.0)), k = s(vec2(1.0, 1.0)), l = s(vec2(-1.0, -1.0)), m = s(vec2(1.0, -1.0));',
    '  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;',
    '  if (uPrefilter > 0.5) {',
    '    float br = max(col.r, max(col.g, col.b));',
    '    float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee); rq = rq * rq / (4.0 * uKnee + 1e-4);',
    '    col *= max(rq, br - uThreshold) / max(br, 1e-4);',
    '  }',
    '  outColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var UP_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uScale;',
    'out vec4 outColor;',
    'vec3 s(vec2 o){ return texture(uTex, vUv + o * uTexel * uScale).rgb; }',
    'void main(){',
    '  vec3 col = s(vec2(0.0)) * 4.0 + (s(vec2(-1.0, 0.0)) + s(vec2(1.0, 0.0)) + s(vec2(0.0, -1.0)) + s(vec2(0.0, 1.0))) * 2.0',
    '    + s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0));',
    '  outColor = vec4(col / 16.0, 1.0);',
    '}'
  ].join('\n');

  // Zrake svjetla: radijalno razvlačenje sjaja poda prema izvoru (volumetrijski efekat)
  var RAYS_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv; uniform sampler2D uTex; uniform vec2 uLight; uniform float uDensity; uniform float uDecay;',
    'out vec4 outColor;',
    'void main(){',
    '  vec2 uv = vUv; vec2 delta = (uv - uLight) * uDensity / 36.0;',
    '  float ill = 1.0; vec3 c = vec3(0.0);',
    '  for (int i = 0; i < 36; i++) { uv -= delta; c += texture(uTex, uv).rgb * ill; ill *= uDecay; }',
    '  outColor = vec4(c / 36.0, 1.0);',
    '}'
  ].join('\n');

  // Anamorfni odsjaj: vodoravno razvučeni najsvjetliji dijelovi (filmski "lens flare")
  var FLARE_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv; uniform sampler2D uTex; uniform float uStep;',
    'out vec4 outColor;',
    'void main(){',
    '  vec3 c = vec3(0.0); float tot = 0.0;',
    '  for (int k = -20; k <= 20; k++) { float fk = float(k); float w = exp(-abs(fk) / 7.0); c += texture(uTex, vUv + vec2(fk * uStep, 0.0)).rgb * w; tot += w; }',
    '  c /= tot;',
    '  float l = max(c.r, max(c.g, c.b));',
    '  outColor = vec4(c * smoothstep(0.05, 0.5, l), 1.0);',
    '}'
  ].join('\n');

  var COMP_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv;',
    'uniform sampler2D uScene; uniform sampler2D uBloom; uniform sampler2D uRays; uniform sampler2D uFlare;',
    'uniform vec2 uRes; uniform vec2 uCenter;',
    'uniform float uBloomStr; uniform float uRaysStr; uniform float uFlareStr; uniform float uExposure;',
    'uniform float uBlur; uniform float uSpin; uniform vec2 uPan; uniform float uCA; uniform float uVignette; uniform float uGlitch;',
    'uniform float uGrain; uniform float uTime; uniform float uFlash; uniform vec3 uFlashCol; uniform int uTaps; uniform vec3 uBgA; uniform vec3 uBgB;',
    'out vec4 outColor;',
    'vec3 bg(vec2 uv){ vec2 q = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0); return mix(uBgA, uBgB, smoothstep(0.0, 1.1, length(q))); }',
    'vec3 scene(vec2 uv){ vec4 s = texture(uScene, uv); return s.rgb + bg(uv) * (1.0 - s.a); }',
    'float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }',
    'float h1(float n){ return fract(sin(n * 12.9898) * 43758.5453); }',
    'void main(){',
    '  vec2 uv = vUv;',
    '  if (uGlitch > 0.002) {',
    '    float band = floor(uv.y * 26.0) + floor(uTime * 24.0) * 5.3;',
    '    float on = step(1.0 - uGlitch * 0.32, h1(band));',
    '    uv.x += on * (h1(band + 3.7) - 0.5) * 0.08 * uGlitch;',
    '  }',
    '  float asp = uRes.x / uRes.y;',
    '  vec2 dir = uv - uCenter;',
    '  vec2 off = dir * (uCA + uGlitch * 0.012);',
    '  vec3 col = vec3(0.0); float tot = 0.0;',
    '  for (int i = 0; i < 12; i++) {',
    '    if (i >= uTaps) break;',
    '    float t = uTaps > 1 ? float(i) / float(uTaps - 1) - 0.5 : 0.0;',
    '    float w = 1.0 - abs(t) * 0.9;',
    '    vec2 q = dir * vec2(asp, 1.0); float a = uSpin * t, ca = cos(a), sa = sin(a);',
    '    q = vec2(ca * q.x - sa * q.y, sa * q.x + ca * q.y);',
    '    vec2 su = uCenter + q / vec2(asp, 1.0) - dir * uBlur * t - uPan * t;',
    '    col.r += scene(su - off).r * w; col.g += scene(su).g * w; col.b += scene(su + off).b * w;',
    '    tot += w;',
    '  }',
    '  col /= tot;',
    '  col += texture(uBloom, uv).rgb * uBloomStr;',
    '  col += texture(uRays, uv).rgb * uRaysStr;',
    '  vec3 fl = texture(uFlare, uv).rgb;',
    '  col += vec3(0.38, 0.56, 1.0) * dot(fl, vec3(0.3, 0.45, 0.25)) * uFlareStr;',
    '  col *= uExposure;',
    '  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);',
    '  vec2 vq = (vUv - 0.5) * vec2(asp, 1.0);',
    '  float vig = smoothstep(1.05, 0.2, length(vq) * 1.05);',
    '  col *= mix(1.0 - uVignette, 1.0, vig);',
    '  col += uFlash * uFlashCol * (0.55 + 0.45 * vig);',
    '  col += (hash(vUv * uRes + fract(uTime * 7.31) * 1000.0) - 0.5) * uGrain;',
    '  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
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
    var gl = canvas.getContext('webgl2', { alpha: false, premultipliedAlpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    if (!gl) throw new Error('WebGL2 nije dostupan');
    this.gl = gl; this.canvas = canvas; this.lost = false;
    this.small = Math.min(window.innerWidth, window.innerHeight) < 700;
    this.maxDpr = opts.maxDpr || (this.small ? 1.5 : 1.75);
    this.cam = { x: 0, y: CYL.H + 18, z: 0, yaw: 0, pitch: Math.PI / 2, pan: 0, roll: 0, fov: 55 };
    this.prevCam = null; this.camVel = [0, 0, 0];
    this.floorColor = hexToRgb(opts.floor || '#1f4dff');
    this.src = { index: -1, cell: [0, 0, 0.25, 1 / 6], hide: 0 };
    this.bright = 1;
    // efekti (main.js ih mijenja prema brzini i događajima)
    this.fx = { blur: 0, spin: 0, pan: [0, 0], ca: 0.0012, bloom: 0.35, rays: 0.45, flare: 0.22, exposure: 1.0, vignette: 0.6, grain: 0.04,
      flash: 0, flashCol: [0.55, 0.66, 1.0], glitch: 0, wind: 6, streak: 0.045, dust: 1, width: 1.6, spill: [0.3, 0.4, 1.0], spillAmt: 0 };
    this.rise = 0;

    var hf = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
    this.hdr = !!hf;
    gl.getExtension('OES_texture_float_linear');

    this.pPanel = program(gl, PANEL_VS, PANEL_FS, ['aParam', 'aUV', 'aCell', 'aExtra']);
    this.pFloor = program(gl, FLOOR_VS, FLOOR_FS, ['aPos']);
    this.pDust = program(gl, DUST_VS, DUST_FS, ['aSeed', 'aCorner']);
    this.pDown = program(gl, QUAD_VS, DOWN_FS, ['aPos']);
    this.pUp = program(gl, QUAD_VS, UP_FS, ['aPos']);
    this.pComp = program(gl, QUAD_VS, COMP_FS, ['aPos']);
    this.pRays = program(gl, QUAD_VS, RAYS_FS, ['aPos']);
    this.pFlare = program(gl, QUAD_VS, FLARE_FS, ['aPos']);

    var maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.atlas = new Atlas(Math.min(opts.atlas || (this.small ? 1024 : 2048), maxTex));
    this.atlas.drawProcedural();
    this.tex = gl.createTexture();
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.upload();

    // ekrani
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
    // pod
    this.floorVao = gl.createVertexArray(); gl.bindVertexArray(this.floorVao);
    var fb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, fb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // čestice
    var nDust = opts.dust || (this.small ? 900 : 1800), dr = rng(77), dArr = [];
    var corners = [[0, -1], [0, 1], [1, 1], [0, -1], [1, 1], [1, -1]];
    for (var di = 0; di < nDust; di++) {
      var sd = [dr(), dr(), dr(), dr()];
      for (var ck = 0; ck < 6; ck++) dArr.push(sd[0], sd[1], sd[2], sd[3], corners[ck][0], corners[ck][1]);
    }
    this.dustCount = dArr.length / 6;
    this.dustVao = gl.createVertexArray(); gl.bindVertexArray(this.dustVao);
    var db = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, db); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dArr), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16);
    // ekranski trougao
    this.triVao = gl.createVertexArray(); gl.bindVertexArray(this.triVao);
    var tb2 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tb2);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.panelSize = [CYL.R * CYL.step * (1 - CYL.gapA), CYL.rowH * (1 - CYL.gapY)];

    gl.disable(gl.DEPTH_TEST);
    var self = this;
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); self.lost = true; if (opts.onLost) opts.onLost(); });
    this.targets = null;
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

  function makeTarget(gl, w, h, hdr) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return ok ? { tex: tex, fbo: fbo, w: w, h: h } : null;
  }
  function freeTarget(gl, t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } }

  Zoetrope.prototype.resize = function () {
    var gl = this.gl;
    var dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    var w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.cssW = window.innerWidth; this.cssH = window.innerHeight; this.aspect = this.cssW / this.cssH;
    if (this.targets && this.targets.w === w && this.targets.h === h) return;
    if (this.targets) { var old = this.targets; [old.scene, old.light, old.rays, old.flare].concat(old.blur).forEach(function (t) { freeTarget(gl, t); }); }
    var hdr = this.hdr, scene = makeTarget(gl, w, h, hdr);
    if (!scene && hdr) { this.hdr = hdr = false; scene = makeTarget(gl, w, h, false); }
    var blur = [], bw = w, bh = h, levels = this.small ? 4 : 5;
    for (var i = 0; i < levels; i++) { bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); blur.push(makeTarget(gl, bw, bh, hdr)); }
    var qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
    this.targets = { w: w, h: h, scene: scene, blur: blur, light: makeTarget(gl, qw, qh, hdr), rays: makeTarget(gl, qw, qh, hdr), flare: makeTarget(gl, qw, qh, hdr) };
  };

  Zoetrope.prototype.matrices = function () {
    var c = this.cam;
    this.proj = M.persp(c.fov * Math.PI / 180, this.aspect, 0.1, 260);
    this.view = M.mul(M.mul(M.mul(M.mul(M.rz(c.roll || 0), M.ry(c.pan || 0)), M.rx(c.pitch)), M.ry(c.yaw)), M.trans(-c.x, -c.y, -c.z));
    this.vp = M.mul(this.proj, this.view);
  };

  Zoetrope.prototype.project = function (x, y, z) {
    var m = this.vp, cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.05) return null;
    return [(cx / cw * 0.5 + 0.5) * this.cssW, (1 - (cy / cw * 0.5 + 0.5)) * this.cssH];
  };
  Zoetrope.prototype.panelQuad = function (index) {
    var p = this.panels[index]; if (!p) return null;
    var R = CYL.R, self = this;
    var pt = function (t, y) { return self.project(R * Math.sin(t), y, -R * Math.cos(t)); };
    var q = [pt(p.t0, p.y1), pt(p.t1, p.y1), pt(p.t1, p.y0), pt(p.t0, p.y0)];
    return q.every(Boolean) ? q : null;
  };
  Zoetrope.prototype.panelAt = function (row, theta) {
    var off = (row % 2) * CYL.step * 0.5;
    var col = Math.round((theta - off - CYL.step / 2) / CYL.step);
    col = ((col % CYL.cols) + CYL.cols) % CYL.cols;
    return row * CYL.cols + col;
  };

  Zoetrope.prototype.pass = function (prog, target) {
    var gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : this.canvas.width, target ? target.h : this.canvas.height);
    gl.useProgram(prog.p);
    gl.bindVertexArray(this.triVao);
  };

  Zoetrope.prototype.drawFloor = function (time, lightOnly) {
    var gl = this.gl, F = this.pFloor, fx = this.fx;
    gl.useProgram(F.p);
    gl.uniformMatrix4fv(F.u.uProj, false, this.proj); gl.uniformMatrix4fv(F.u.uView, false, this.view);
    gl.uniform1f(F.u.uR, CYL.R * 0.998); gl.uniform3fv(F.u.uFloor, this.floorColor); gl.uniform1f(F.u.uTime, time);
    gl.uniform3fv(F.u.uSpill, fx.spill); gl.uniform1f(F.u.uSpillAmt, fx.spillAmt); gl.uniform1f(F.u.uLightOnly, lightOnly ? 1 : 0);
    gl.bindVertexArray(this.floorVao); gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  // time: sekunde, dt: sekunde od prošlog kadra
  Zoetrope.prototype.render = function (time, dt) {
    if (this.lost || !this.targets || !this.targets.scene) return;
    var gl = this.gl, c = this.cam, fx = this.fx, T = this.targets;
    time = time || 0; dt = dt || 0;
    this.matrices();
    if (this.prevCam && dt > 0) {
      var k = 1 - Math.exp(-dt * 10);
      for (var a = 0; a < 3; a++) {
        var v = ([c.x, c.y, c.z][a] - this.prevCam[a]) / dt;
        this.camVel[a] += (Math.max(-160, Math.min(160, v)) - this.camVel[a]) * k;
      }
    }
    this.prevCam = [c.x, c.y, c.z];
    this.rise += (fx.wind || 0) * dt;

    // 1) scena: pod, ekrani, čestice
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene.fbo);
    gl.viewport(0, 0, T.w, T.h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.drawFloor(time);
    var P = this.pPanel;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uProj, false, this.proj); gl.uniformMatrix4fv(P.u.uView, false, this.view);
    gl.uniform1f(P.u.uR, CYL.R);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(P.u.uAtlas, 0);
    gl.uniform2fv(P.u.uPanel, this.panelSize); gl.uniform1f(P.u.uRadius, 0.1); gl.uniform1f(P.u.uBright, this.bright);
    gl.uniform1f(P.u.uSrcIndex, this.src.index); gl.uniform4fv(P.u.uSrcCell, this.src.cell); gl.uniform1f(P.u.uSrcHide, this.src.hide);
    gl.uniform3fv(P.u.uFloor, this.floorColor); gl.uniform3f(P.u.uCam, c.x, c.y, c.z);
    gl.uniform1f(P.u.uTime, time); gl.uniform1f(P.u.uScan, 64);
    gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, this.count);
    if (fx.dust > 0.001) {
      gl.blendFunc(gl.ONE, gl.ONE);
      var D = this.pDust;
      gl.useProgram(D.p);
      gl.uniformMatrix4fv(D.u.uProj, false, this.proj); gl.uniformMatrix4fv(D.u.uView, false, this.view);
      gl.uniform2f(D.u.uRes, T.w, T.h); gl.uniform1f(D.u.uTime, time); gl.uniform1f(D.u.uWind, fx.wind); gl.uniform1f(D.u.uRise, this.rise);
      gl.uniform1f(D.u.uStreak, fx.streak); gl.uniform1f(D.u.uH, CYL.H); gl.uniform1f(D.u.uR, CYL.R);
      gl.uniform3fv(D.u.uCamVel, this.camVel); gl.uniform1f(D.u.uWidth, fx.width * (T.h / 900));
      gl.uniform1f(D.u.uDust, fx.dust);
      gl.bindVertexArray(this.dustVao); gl.drawArrays(gl.TRIANGLES, 0, this.dustCount);
    }

    // 2) izvor zraka: samo svjetleći pod (u četvrtini rezolucije)
    var rays = fx.rays > 0.001 && T.light && T.rays;
    if (rays) {
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.light.fbo);
      gl.viewport(0, 0, T.light.w, T.light.h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.drawFloor(time, true);
    }
    gl.disable(gl.BLEND);

    // 3) sjaj (bloom): prefilter + spuštanje
    var B = T.blur, Dn = this.pDown, Up = this.pUp, i;
    var srcTex = T.scene.tex, srcW = T.w, srcH = T.h;
    for (i = 0; i < B.length; i++) {
      this.pass(Dn, B[i]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex); gl.uniform1i(Dn.u.uTex, 0);
      gl.uniform2f(Dn.u.uTexel, 1 / srcW, 1 / srcH);
      gl.uniform1f(Dn.u.uPrefilter, i === 0 ? 1 : 0); gl.uniform1f(Dn.u.uThreshold, this.hdr ? 0.62 : 0.5); gl.uniform1f(Dn.u.uKnee, 0.3);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      srcTex = B[i].tex; srcW = B[i].w; srcH = B[i].h;
    }
    // 4) anamorfni odsjaj iz 1/4 nivoa (prije podizanja, da ostane tanak)
    var flare = fx.flare > 0.001 && T.flare && B.length > 1;
    if (flare) {
      var Fl = this.pFlare;
      this.pass(Fl, T.flare);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, B[1].tex); gl.uniform1i(Fl.u.uTex, 0);
      gl.uniform1f(Fl.u.uStep, 0.0085);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // 5) zrake svjetla prema izvoru (centar poda na ekranu)
    if (rays) {
      var Rp = this.pRays, lp = this.projectUv(0, 0, 0);
      this.pass(Rp, T.rays);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.light.tex); gl.uniform1i(Rp.u.uTex, 0);
      gl.uniform2f(Rp.u.uLight, lp[0], lp[1]); gl.uniform1f(Rp.u.uDensity, 0.9); gl.uniform1f(Rp.u.uDecay, 0.965);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // 6) sjaj: podizanje
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    for (i = B.length - 1; i > 0; i--) {
      this.pass(Up, B[i - 1]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, B[i].tex); gl.uniform1i(Up.u.uTex, 0);
      gl.uniform2f(Up.u.uTexel, 1 / B[i].w, 1 / B[i].h); gl.uniform1f(Up.u.uScale, 1.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);

    // 7) kompozit na ekran
    var C = this.pComp;
    this.pass(C, null);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.scene.tex); gl.uniform1i(C.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, B[0].tex); gl.uniform1i(C.u.uBloom, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, rays ? T.rays.tex : B[0].tex); gl.uniform1i(C.u.uRays, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, flare ? T.flare.tex : B[0].tex); gl.uniform1i(C.u.uFlare, 3);
    gl.uniform2f(C.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform2f(C.u.uCenter, 0.5, 0.5);
    gl.uniform1f(C.u.uBloomStr, fx.bloom); gl.uniform1f(C.u.uRaysStr, rays ? fx.rays : 0); gl.uniform1f(C.u.uFlareStr, flare ? fx.flare : 0);
    gl.uniform1f(C.u.uExposure, fx.exposure);
    gl.uniform1f(C.u.uBlur, fx.blur); gl.uniform1f(C.u.uSpin, fx.spin); gl.uniform2f(C.u.uPan, fx.pan[0], fx.pan[1]);
    gl.uniform1f(C.u.uCA, fx.ca); gl.uniform1f(C.u.uVignette, fx.vignette); gl.uniform1f(C.u.uGlitch, fx.glitch);
    gl.uniform1f(C.u.uGrain, fx.grain); gl.uniform1f(C.u.uTime, time); gl.uniform1f(C.u.uFlash, fx.flash); gl.uniform3fv(C.u.uFlashCol, fx.flashCol);
    var moving = Math.abs(fx.blur) + Math.abs(fx.spin) + Math.abs(fx.pan[0]) + Math.abs(fx.pan[1]) > 0.002;
    gl.uniform1i(C.u.uTaps, moving ? (this.small ? 7 : 11) : 1);
    gl.uniform3f(C.u.uBgA, 0.022, 0.016, 0.03); gl.uniform3f(C.u.uBgB, 0.003, 0.002, 0.005);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  };

  // tačka u prostoru → uv koordinate ekrana (0..1, y prema gore), ograničeno
  Zoetrope.prototype.projectUv = function (x, y, z) {
    var m = this.vp, cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.05) return [0.5, -1.5];
    var u = cx / cw * 0.5 + 0.5, v = cy / cw * 0.5 + 0.5;
    return [Math.max(-1.5, Math.min(2.5, u)), Math.max(-1.5, Math.min(2.5, v))];
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
