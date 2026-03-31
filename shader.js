const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl', {
  antialias: false,
  preserveDrawingBuffer: true
});

if (!gl) {
  document.body.innerHTML = '<pre style="color:#f66;padding:2rem">WebGL not supported.</pre>';
  throw new Error('No WebGL');
}
window._glRef = gl;

/* ── Dirty-flag rendering ─────────────────────────────────────────
   Only re-draw when something actually changed.  The UI sets
   window.shaderDirty = true whenever a param changes.  The render
   loop checks once per rAF and skips the draw if clean.           */
window.shaderDirty = true;

// Mobile detection and render quality
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
                 || (window.innerWidth <= 768 && 'ontouchstart' in window);
window.isMobile = isMobile;

function isFast() { return isMobile || (window.shaderParams && window.shaderParams.fastMode); }

const renderScale = isMobile ? 0.5 : 1.0;
let currentRenderScale = renderScale;

let curW = 0, curH = 0;
let sceneW = 0, sceneH = 0;
function syncSize() {
  const dpr = (window.devicePixelRatio || 1) * currentRenderScale;
  const w = (canvas.clientWidth  * dpr) | 0;
  const h = (canvas.clientHeight * dpr) | 0;
  if (w === curW && h === curH) return false;
  canvas.width  = w;
  canvas.height = h;
  curW = w;
  curH = h;
  return true;
}
syncSize();
sceneW = canvas.width;
sceneH = canvas.height;
gl.viewport(0, 0, canvas.width, canvas.height);

// Use parallel shader compile extension if available to avoid main-thread stall
const parallelExt = gl.getExtension('KHR_parallel_shader_compile');
const COMPLETION_STATUS = parallelExt ? parallelExt.COMPLETION_STATUS_KHR : null;

function compileShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  // Don't check status here — defer to checkProgram to avoid blocking
  return s;
}

function buildProgram(vert, frag) {
  const p = gl.createProgram();
  gl.attachShader(p, vert);
  gl.attachShader(p, frag);
  gl.linkProgram(p);
  // Don't check link status here — defer to checkProgram
  return p;
}

// Check a compiled shader for errors (called after parallel compile finishes)
function checkShader(s) {
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(s);
    document.body.innerHTML = `<pre style="color:#f66;padding:2rem;font-size:13px;">Shader compile error:\n${err}</pre>`;
    throw new Error(err);
  }
}

// Poll until all programs are linked (non-blocking via rAF), then call onReady()
function waitForPrograms(programs, shaders, onReady) {
  // If the parallel compile extension is available, poll non-blocking via rAF.
  // Otherwise (mobile, older drivers) just check synchronously — the brief stall
  // is unavoidable without the extension and is better than an infinite loop.
  if (COMPLETION_STATUS === null) {
    // Synchronous path: check compile/link status immediately
    for (const s of shaders) { try { checkShader(s); } catch(e) { return; } }
    for (const prog of programs) {
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const err = gl.getProgramInfoLog(prog);
        document.body.innerHTML = `<pre style="color:#f66;padding:2rem;font-size:13px;">Shader link error:\n${err}</pre>`;
        return;
      }
    }
    onReady();
    return;
  }
  function check() {
    for (const prog of programs) {
      if (!gl.getProgramParameter(prog, COMPLETION_STATUS)) {
        requestAnimationFrame(check);
        return; // not ready yet — come back next frame
      }
    }
    // All done compiling — now check for errors
    for (const prog of programs) {
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const err = gl.getProgramInfoLog(prog);
        document.body.innerHTML = `<pre style="color:#f66;padding:2rem;font-size:13px;">Shader link error:\n${err}</pre>`;
        return;
      }
    }
    for (const s of shaders) { try { checkShader(s); } catch(e) { return; } }
    onReady();
  }
  requestAnimationFrame(check);
}

const VERT_SRC = `
  attribute vec2 aPos;
  void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
  -1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1
]), gl.STATIC_DRAW);

function bindQuad(prog) {
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
}

function hexToRgb01(hex) {
  return [
    parseInt(hex.slice(1,3),16)/255,
    parseInt(hex.slice(3,5),16)/255,
    parseInt(hex.slice(5,7),16)/255
  ];
}

let fbo = null;
let sceneTex = null;
// ── Blur FBOs (ping-pong for separable Gaussian) ─────────────────
let blurFBO_H = null, blurTex_H = null; // after horizontal pass
let blurFBO_V = null, blurTex_V = null; // after vertical pass (final blur result)

function rebuildFBO() {
  const sw = sceneW || canvas.width;
  const sh = sceneH || canvas.height;

  if (sceneTex) { gl.deleteTexture(sceneTex); sceneTex = null; }
  if (fbo)      { gl.deleteFramebuffer(fbo);  fbo = null; }

  sceneTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sceneTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
    sw, sh,
    0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D, sceneTex, 0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  // Rebuild blur ping-pong FBOs at same resolution as scene
  function makeBlurTex(w, h) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { tex: t, fbo: fb };
  }
  if (blurTex_H) gl.deleteTexture(blurTex_H);
  if (blurFBO_H) gl.deleteFramebuffer(blurFBO_H);
  if (blurTex_V) gl.deleteTexture(blurTex_V);
  if (blurFBO_V) gl.deleteFramebuffer(blurFBO_V);
  const bh = makeBlurTex(sw, sh);
  blurTex_H = bh.tex; blurFBO_H = bh.fbo;
  const bv = makeBlurTex(sw, sh);
  blurTex_V = bv.tex; blurFBO_V = bv.fbo;

  // Invalidate precompute buffer on resize
  precomputeBuffer = [];
  precomputePlayIdx = 0;
}

// ── Per-instance FBOs (intermediate pixelate chain) ─────────────
// One FBO per instance except the last; rebuilt when canvas resizes or
// instance list changes.  instanceFBOs[i] holds the output of instance i.
let instanceFBOs = [];   // { tex, fbo, w, h }

function resolveFBOSize(W, H, res) {
  // res: numeric divisor 1,2,4,8,16
  const d = parseInt(res) || 1;
  return [Math.max(1, W/d|0), Math.max(1, H/d|0)];
}

function makeFBOSlot(w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { tex, fbo: fb, w, h };
}

function destroyFBOSlot(slot) {
  if (!slot) return;
  if (slot.tex) gl.deleteTexture(slot.tex);
  if (slot.fbo) gl.deleteFramebuffer(slot.fbo);
}

// Rebuild instanceFBOs to match current instances and canvas size.
// Call after resize or after instance list changes.
function rebuildInstanceFBOs() {
  const W = canvas.width, H = canvas.height;
  const insts = (window.shaderParams && window.shaderParams.pixelateInstances) || [];
  const N = insts.length;
  // We need N-1 intermediate FBOs (instances 0..N-2 each write into one).
  const needed = Math.max(0, N - 1);

  // Free surplus
  while (instanceFBOs.length > needed) destroyFBOSlot(instanceFBOs.pop());

  // Create / resize
  for (let i = 0; i < needed; i++) {
    // Override instances use canvas (full) dims; others use scene dims
    const baseW = insts[i].overrideResolution ? W : (sceneW || W);
    const baseH = insts[i].overrideResolution ? H : (sceneH || H);
    const [fw, fh] = resolveFBOSize(baseW, baseH, insts[i].resolution);
    if (!instanceFBOs[i] || instanceFBOs[i].w !== fw || instanceFBOs[i].h !== fh) {
      destroyFBOSlot(instanceFBOs[i]);
      instanceFBOs[i] = makeFBOSlot(fw, fh);
    }
  }
}

window.rebuildInstanceFBOs = rebuildInstanceFBOs;

// ── Per-instance image-pixel textures ───────────────────────────
// imgPixelTexes[i] is the GL texture for pixelate instance i.
// The global imgPixelTex (below) is kept for backwards compat / single-instance.
const imgPixelTexes = [];   // lazily allocated

function getImgPixelTex(i) {
  if (!imgPixelTexes[i]) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    imgPixelTexes[i] = t;
  }
  return imgPixelTexes[i];
}

// ── Per-instance layer 2 image-pixel textures (Oct diamond) ────
const imgPixel2Texes = [];

function getImgPixel2Tex(i) {
  if (!imgPixel2Texes[i]) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    imgPixel2Texes[i] = t;
  }
  return imgPixel2Texes[i];
}

// ── Precompute frame buffer ──
let precomputeBuffer = [];   // array of {tex, fbo} for final composited frames
let precomputePlayIdx = 0;
let precomputeFillRot = null; // tracks the rotation we've precomputed up to

function ensurePrecomputeFBOs(count, w, h) {
  // Grow or shrink the buffer to match count
  while (precomputeBuffer.length > count) {
    const old = precomputeBuffer.pop();
    gl.deleteTexture(old.tex);
    gl.deleteFramebuffer(old.fbo);
  }
  for (let i = 0; i < count; i++) {
    if (!precomputeBuffer[i] ||
        precomputeBuffer[i].w !== w || precomputeBuffer[i].h !== h) {
      // (Re)create this slot
      if (precomputeBuffer[i]) {
        gl.deleteTexture(precomputeBuffer[i].tex);
        gl.deleteFramebuffer(precomputeBuffer[i].fbo);
      }
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      precomputeBuffer[i] = { tex, fbo: fb, w, h, ready: false };
    }
  }
}

window.resetPrecomputeBuffer = function() {
  for (const slot of precomputeBuffer) { slot.ready = false; }
  precomputePlayIdx = 0;
  precomputeFillRot = null;
};

// ── Gradient 1D texture ──
let gradientTex = null;
const GRAD_WIDTH = 256;

function createGradientTex() {
  gradientTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, gradientTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

window.uploadGradient = function(stops) {
  if (!gradientTex) return;
  const data = new Uint8Array(GRAD_WIDTH * 4);
  for (let x = 0; x < GRAD_WIDTH; x++) {
    const t = x / (GRAD_WIDTH - 1);
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i].pos && t <= stops[i+1].pos) {
        lo = stops[i]; hi = stops[i+1]; break;
      }
    }
    const range = hi.pos - lo.pos;
    const f = range < 0.0001 ? 0 : (t - lo.pos) / range;
    data[x*4+0] = Math.round(lo.r + (hi.r - lo.r) * f);
    data[x*4+1] = Math.round(lo.g + (hi.g - lo.g) * f);
    data[x*4+2] = Math.round(lo.b + (hi.b - lo.b) * f);
    data[x*4+3] = 255;
  }
  gl.bindTexture(gl.TEXTURE_2D, gradientTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GRAD_WIDTH, 1, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.bindTexture(gl.TEXTURE_2D, null);
  window.shaderDirty = true;
};

// ── Shape gradient 1D texture ──
let shapeGradTex = null;

function createShapeGradTex() {
  shapeGradTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shapeGradTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

window.uploadShapeGradient = function(stops) {
  if (!shapeGradTex) return;
  const data = new Uint8Array(GRAD_WIDTH * 4);
  for (let x = 0; x < GRAD_WIDTH; x++) {
    const t = x / (GRAD_WIDTH - 1);
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i].pos && t <= stops[i+1].pos) {
        lo = stops[i]; hi = stops[i+1]; break;
      }
    }
    const range = hi.pos - lo.pos;
    const f = range < 0.0001 ? 0 : (t - lo.pos) / range;
    data[x*4+0] = Math.round(lo.r + (hi.r - lo.r) * f);
    data[x*4+1] = Math.round(lo.g + (hi.g - lo.g) * f);
    data[x*4+2] = Math.round(lo.b + (hi.b - lo.b) * f);
    data[x*4+3] = 255;
  }
  gl.bindTexture(gl.TEXTURE_2D, shapeGradTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GRAD_WIDTH, 1, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.bindTexture(gl.TEXTURE_2D, null);
  window.shaderDirty = true;
};

const FRAGMENT_GLSL_SRC = `precision highp float;
precision highp int;

invariant gl_FragColor;

uniform vec2  iResolution;
uniform int   uMode;
uniform int   uNumPoints;
uniform float uSeed;
uniform float uRotation;
uniform vec2  uDisplace;
uniform vec2  uScale;
uniform int   uMirrorX;
uniform int   uMirrorY;
uniform int   uFlipX;
uniform int   uFlipY;
uniform int   uShowDots;
uniform float uDotRadius;
uniform float uColorSeed;
uniform float uHueOffset;
uniform float uHueRadius;
uniform float uSatSeed;
uniform float uSatMin;
uniform float uSatMax;
uniform float uBrightSeed;
uniform float uGradientSeed;
uniform float uValueMin;
uniform float uValueMax;
uniform float uSpring;
uniform vec3      uBgColor;
uniform int       uColorMode;
uniform int       uColorize;
uniform int       uPreProcess;
uniform float     uCamHue;
uniform float     uCamSat;
uniform float     uCamVal;
uniform float     uCamContrast;
uniform sampler2D uGradientTex;
uniform float uSnapGrid;  // 0=off, >0 = grid cell size in pixels

// Banding (applied here, before pixelation)
uniform int   uBanding;
uniform int   uBandAngleMode;   // 0=all sides, 1=random directional
uniform float uBandAngleSeed;  // seed for random angle assignment
uniform int   uBandRandCount;  // 0=fixed count, 1=random per cell
uniform float uBandRandCountMin; // min fraction of bandCount
uniform float uBandRandCountMax; // max fraction of bandCount
uniform float uBandRandCountSeed;
uniform float uBandCount;
uniform float uBandLumMin;
uniform float uBandLumMax;
uniform float uBandStrength;
uniform int   uBandRandomize;
uniform int   uBandBlendMode;  // 0=overlay,1=multiply,2=screen,3=soft light,4=hard light,5=color dodge,6=color burn,7=linear light,8=normal,9=hue shift
uniform float uBandHueStrength;
uniform float uBandHueRadius;
uniform float uBandHueOffset;  // 0-1: max hue rotation for hue-shift blend mode

uniform int   uGroupCount;
uniform int   uGroupActive[8];
uniform vec2  uGroupDisplace[8];
uniform float uGroupThreshold[8];
uniform float uGroupSeed[8];
uniform float uGroupScale[8];

float manhattan(vec2 a, vec2 b) { return abs(a.x-b.x)+abs(a.y-b.y); }
float chebyshev(vec2 a, vec2 b) { return max(abs(a.x-b.x),abs(a.y-b.y)); }
float euclidean(vec2 a, vec2 b) { return length(a-b); }
float hash(float n) { return fract(sin(mod(n, 6283.0))*43758.5453); }

float dist(vec2 a, vec2 b) {
    if(uMode==0) return chebyshev(a,b);
    if(uMode==1) return manhattan(a,b);
    return euclidean(a,b);
}

/* ── Noise uniforms ───────────────────────────────────────── */
uniform int   uNoiseType;        // 0-15
uniform float uNoiseElementSize; // 0.01-2.0
uniform float uNoiseOffsetX;     // 0-1
uniform float uNoiseOffsetY;     // 0-1
uniform int   uNoiseOctaves;     // 1-16
uniform float uNoiseLacunarity;  // 0-4
uniform float uNoiseRoughness;   // 0-1

/* ── Flow mode uniforms ───────────────────────────────────── */
uniform float iTime;          // accumulated play time (seconds)
uniform float uFlowScale;     // spatial zoom (replaces hard-coded 2.0)
uniform float uFlowSpeed;     // time multiplier
uniform float uFlowDistort1;  // first warp strength (was 8.1)
uniform float uFlowDistort2;  // second warp strength (was 4.13)
uniform float uFlowSmoothLo;  // smoothstep low edge (was 0.15)
uniform float uFlowSmoothHi;  // smoothstep high edge (was 0.85)
uniform int   uFlowType;      // 0=flow1, 1=flow2
uniform int   uFlow1Style;    // 0=default 3D simplex, 1-15=2D noise types
uniform float uFlowHueOffset; // 0-1 hue shift applied to raw flow output (flow1)
uniform float uFlowHueRadius; // 0-1 hue range compression (flow1)
uniform int   uFlowHueEnabled; // 0=skip hue remap for flow1
uniform float uF2HueOffset;   // 0-1 hue shift for flow2
uniform float uF2HueRadius;   // 0-1 hue range compression for flow2
uniform int   uF2HueEnabled;  // 0=skip hue remap for flow2

/* ── Flow 2 uniforms ──────────────────────────────────────── */
uniform float uF2Scale;       // spatial scale, default 6.0
uniform float uF2VelX;        // f() velocity x, default 0.1
uniform float uF2VelY;        // f() velocity y, default 0.2
uniform float uF2Speed;       // mode_2_speed, default 2.5
uniform float uF2Detail;      // mode_1_detail, default 200.0
uniform float uF2Twist;       // mode_1_twist, default 50.0
uniform int   uF2Iter1;       // gradient iterations, default 20
uniform int   uF2Iter2;       // curve iterations (mode C/D), default 20
uniform int   uF2Mode;        // 0=A,1=B,2=C,3=D (encodes fieldMode*2+colorMode)

/* ── Noise building blocks ────────────────────────────────── */
vec2 hash2(vec2 p){
    p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));
    return fract(sin(p)*43758.5453123);
}
vec3 hash3(vec2 p){
    vec3 q=vec3(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)),dot(p,vec2(419.2,371.9)));
    return fract(sin(q)*43758.5453);
}
float hash21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
vec2 grad2(vec2 i){
    float a=hash21(i)*6.2831853;
    return vec2(cos(a),sin(a));
}

// Value noise (Fast)
float valueNoise(vec2 p){
    vec2 i=floor(p),f=fract(p);
    f=f*f*f*(f*(f*6.0-15.0)+10.0);
    float a=hash21(i),b=hash21(i+vec2(1,0)),c=hash21(i+vec2(0,1)),d=hash21(i+vec2(1,1));
    return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}

// Perlin gradient noise
float perlinNoise(vec2 p){
    vec2 i=floor(p),f=fract(p);
    vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0);
    float a=dot(grad2(i),f);
    float b=dot(grad2(i+vec2(1,0)),f-vec2(1,0));
    float c=dot(grad2(i+vec2(0,1)),f-vec2(0,1));
    float d=dot(grad2(i+vec2(1,1)),f-vec2(1,1));
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y)*0.5+0.5;
}

// Simplex noise (2D)
float simplexNoise(vec2 p){
    const float K1=0.366025404;
    const float K2=0.211324865;
    vec2 i=floor(p+(p.x+p.y)*K1);
    vec2 a=p-i+(i.x+i.y)*K2;
    float m=step(a.y,a.x);
    vec2 o=vec2(m,1.0-m);
    vec2 b=a-o+K2;
    vec2 cc=a-1.0+2.0*K2;
    vec3 h=max(0.5-vec3(dot(a,a),dot(b,b),dot(cc,cc)),0.0);
    h=h*h*h*h;
    vec3 n=h*vec3(dot(a,grad2(i)),dot(b,grad2(i+o)),dot(cc,grad2(i+1.0)));
    return dot(n,vec3(70.0))*0.5+0.5;
}

// Worley cellular noise — returns (F1, F2)
vec2 worleyEuc(vec2 p){
    vec2 i=floor(p); float d1=1e9,d2=1e9;
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
        vec2 nb=vec2(float(x),float(y));
        vec2 pt=hash2(i+nb)+nb-fract(p);
        float d=dot(pt,pt);
        if(d<d1){d2=d1;d1=d;}else if(d<d2){d2=d;}
    }
    return sqrt(vec2(d1,d2));
}
vec2 worleyMan(vec2 p){
    vec2 i=floor(p); float d1=1e9,d2=1e9;
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
        vec2 nb=vec2(float(x),float(y));
        vec2 pt=hash2(i+nb)+nb-fract(p);
        float d=abs(pt.x)+abs(pt.y);
        if(d<d1){d2=d1;d1=d;}else if(d<d2){d2=d;}
    }
    return vec2(d1,d2);
}
vec2 worleyCheb(vec2 p){
    vec2 i=floor(p); float d1=1e9,d2=1e9;
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
        vec2 nb=vec2(float(x),float(y));
        vec2 pt=hash2(i+nb)+nb-fract(p);
        float d=max(abs(pt.x),abs(pt.y));
        if(d<d1){d2=d1;d1=d;}else if(d<d2){d2=d;}
    }
    return vec2(d1,d2);
}

// Alligator noise: abs of Perlin
float alligatorNoise(vec2 p){
    float v=0.0,amp=1.0,freq=1.0,tot=0.0;
    float lac=max(uNoiseLacunarity,0.01);
    for(int i=0;i<16;i++){
        if(i>=uNoiseOctaves)break;
        v+=abs(perlinNoise(p*freq)*2.0-1.0)*amp;
        tot+=amp; freq*=lac; amp*=uNoiseRoughness;
    }
    return v/tot;
}

// Sparse convolution noise
float sparseConvNoise(vec2 p){
    vec2 i=floor(p),f=fract(p);
    float v=0.0;
    for(int y=-2;y<=2;y++) for(int x=-2;x<=2;x++){
        vec2 nb=vec2(float(x),float(y));
        vec2 r=hash2(i+nb);
        vec2 d=nb+r-f;
        float w=exp(-4.0*dot(d,d));
        v+=w*(hash21(i+nb)*2.0-1.0);
    }
    return v*0.5+0.5;
}

// Perlin flow (time-varying, use offset as phase)
float perlinFlowNoise(vec2 p, float phase){
    vec2 i=floor(p),f=fract(p);
    vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0);
    float a=dot(vec2(cos(hash21(i)*6.2831+phase),sin(hash21(i)*6.2831+phase)),f);
    float b=dot(vec2(cos(hash21(i+vec2(1,0))*6.2831+phase),sin(hash21(i+vec2(1,0))*6.2831+phase)),f-vec2(1,0));
    float c=dot(vec2(cos(hash21(i+vec2(0,1))*6.2831+phase),sin(hash21(i+vec2(0,1))*6.2831+phase)),f-vec2(0,1));
    float d=dot(vec2(cos(hash21(i+vec2(1,1))*6.2831+phase),sin(hash21(i+vec2(1,1))*6.2831+phase)),f-vec2(1,1));
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y)*0.5+0.5;
}

// fBm helper
float fbmPerlin(vec2 p, int oct){
    float v=0.0,a=1.0,t=0.0,freq=1.0;
    float lac=max(uNoiseLacunarity,0.01);
    for(int i=0;i<16;i++){if(i>=oct)break; v+=perlinNoise(p*freq)*a; t+=a; freq*=lac; a*=uNoiseRoughness;}
    return v/t;
}
float fbmSimplex(vec2 p, int oct){
    float v=0.0,a=1.0,t=0.0,freq=1.0;
    float lac=max(uNoiseLacunarity,0.01);
    for(int i=0;i<16;i++){if(i>=oct)break; v+=simplexNoise(p*freq)*a; t+=a; freq*=lac; a*=uNoiseRoughness;}
    return v/t;
}
float fbmValue(vec2 p, int oct){
    float v=0.0,a=1.0,t=0.0,freq=1.0;
    float lac=max(uNoiseLacunarity,0.01);
    for(int i=0;i<16;i++){if(i>=oct)break; v+=valueNoise(p*freq)*a; t+=a; freq*=lac; a*=uNoiseRoughness;}
    return v/t;
}

// Master noise selector
float computeNoise(vec2 uv){
    float sz=max(uNoiseElementSize, 0.01);
    // Scale: smaller sz = bigger detail, larger sz = zoomed out
    // Offset is in normalized space, scaled by 1/sz so pan distance is optically constant
    vec2 p = uv / sz + vec2(uNoiseOffsetX, uNoiseOffsetY) / sz;
    
    if(uNoiseType==0)  return fbmSimplex(p,uNoiseOctaves);
    if(uNoiseType==1)  return valueNoise(p);
    if(uNoiseType==2)  return sparseConvNoise(p);
    if(uNoiseType==3)  return alligatorNoise(p);
    if(uNoiseType==4)  return perlinNoise(p);
    if(uNoiseType==5)  return perlinFlowNoise(p, (uNoiseOffsetX+uNoiseOffsetY)*0.5);
    if(uNoiseType==6)  return simplexNoise(p);
    if(uNoiseType==7)  return worleyEuc(p).x;
    if(uNoiseType==8)  return clamp(worleyEuc(p).y-worleyEuc(p).x,0.0,1.0);
    if(uNoiseType==9)  return worleyMan(p).x;
    if(uNoiseType==10) return clamp(worleyMan(p).y-worleyMan(p).x,0.0,1.0);
    if(uNoiseType==11) return worleyCheb(p).x;
    if(uNoiseType==12) return clamp(worleyCheb(p).y-worleyCheb(p).x,0.0,1.0);
    if(uNoiseType==13) return fbmPerlin(p,uNoiseOctaves);
    if(uNoiseType==14) return fbmSimplex(p,uNoiseOctaves);
    if(uNoiseType==15) return fbmValue(p,uNoiseOctaves);
    return 0.5;
}

/* ── Image source ─────────────────────────────────────────── */
uniform int       uSourceMode;    // 0=pattern, 1=image, 2=camera
uniform sampler2D uImageTex;
uniform float     uImageScale;
uniform float     uImageAspect;   // image width/height

vec2 randomPoint(int i) {
    float fi=float(i);
    float seedOff=mod(uSeed*127.1, 6283.0);
    return vec2(hash(fi*1.7+seedOff+0.3), hash(fi*3.1+seedOff+1.9));
}

bool isRemoved(int i, float th, float gs) {
    return hash(float(i)*91.3+mod(gs*7.919, 6283.0)+5.3) < th;
}

vec2 rotatePoint(vec2 p, vec2 piv, float a) {
    float c=cos(a),s=sin(a); vec2 d=p-piv;
    return piv+vec2(d.x*c-d.y*s, d.x*s+d.y*c);
}

vec4 hsvToRgb(float h,float s,float v) {
    float h6=fract(h)*6.0,f=fract(h6),p=v*(1.0-s),q=v*(1.0-s*f),t=v*(1.0-s*(1.0-f));
    int hi=int(floor(h6));
    if(hi>=6) hi=0;
    if(hi==0)return vec4(v,t,p,1);if(hi==1)return vec4(q,v,p,1);if(hi==2)return vec4(p,v,t,1);
    if(hi==3)return vec4(p,q,v,1);if(hi==4)return vec4(t,p,v,1);return vec4(v,p,q,1);
}

float cellT(int ci) { return hash(float(ci)*7.31+mod(uColorSeed*53.7, 6283.0)+mod(uGradientSeed*17.3, 6283.0)+2.9); }

vec4 cellColor(int ci) {
    // Saturation: randomize per cell if satSeed > 0, else fixed at mix(satMin,satMax,0.5)
    float sat = mix(uSatMin, uSatMax, 0.5);
    if(uSatSeed > 0.0) {
        float sr = hash(float(ci)*13.37 + mod(uSatSeed*41.3, 6283.0) + 5.7);
        sat = mix(uSatMin, uSatMax, sr);
    }
    // Brightness: randomize per cell if brightSeed > 0, else fixed at mix(valueMin,valueMax,0.5)
    float val = mix(uValueMin, uValueMax, 0.5);
    if(uBrightSeed > 0.0) {
        float br = hash(float(ci)*7.31 + mod(uBrightSeed*53.7, 6283.0) + 2.9);
        val = mix(uValueMin, uValueMax, br);
    }
    // Unique per-cell hue (golden ratio distribution)
    float h=fract(float(ci)*0.618033988+mod(uColorSeed*0.1317, 1.0));
    return hsvToRgb(h, sat, val);
}

vec4 dotColor(int ci) {
    float h = fract(float(ci)*0.618033988+mod(uColorSeed*0.1317, 1.0)+0.13);
    h = fract(h * uHueRadius + uHueOffset);
    return hsvToRgb(h, 0.9, 1.0);
}

/* ── HSV conversion for hue shift ─────────────────────────────── */
vec3 rgb2hsv(vec3 c) {
    float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b)),d=mx-mn,h=0.0;
    if(d>1e-4){
        if(mx==c.r) h=(c.g-c.b)/d+(c.g<c.b?6.0:0.0);
        else if(mx==c.g) h=(c.b-c.r)/d+2.0;
        else h=(c.r-c.g)/d+4.0;
        h/=6.0;
    }
    return vec3(clamp(h,0.0,1.0), mx>1e-4?d/mx:0.0, mx);
}
vec3 hsv2rgb(vec3 c) {
    float h=fract(c.x)*6.0,s=c.y,v=c.z,f=fract(h),p=v*(1.0-s),q=v*(1.0-s*f),t=v*(1.0-s*(1.0-f));
    int hi=int(floor(h));
    if(hi>=6) hi=0;
    if(hi==0)return vec3(v,t,p);if(hi==1)return vec3(q,v,p);if(hi==2)return vec3(p,v,t);
    if(hi==3)return vec3(p,q,v);if(hi==4)return vec3(t,p,v);return vec3(v,p,q);
}

/* ── Blend modes ──────────────────────────────────────────────── */
float blendOverlay(float b,float l)   { return b<0.5 ? 2.0*b*l : 1.0-2.0*(1.0-b)*(1.0-l); }
float blendMultiply(float b,float l)  { return b*l; }
float blendScreen(float b,float l)    { return 1.0-(1.0-b)*(1.0-l); }
float blendSoftLight(float b,float l) { return l<0.5 ? b-(1.0-2.0*l)*b*(1.0-b) : b+(2.0*l-1.0)*(sqrt(max(b,0.0))-b); }
float blendHardLight(float b,float l) { return l<0.5 ? 2.0*b*l : 1.0-2.0*(1.0-b)*(1.0-l); }
float blendDodge(float b,float l)     { return l>=1.0 ? 1.0 : min(1.0, b/(1.0-l)); }
float blendBurn(float b,float l)      { return l<=0.0 ? 0.0 : max(0.0, 1.0-(1.0-b)/l); }
float blendLinLight(float b,float l)  { return clamp(b+2.0*l-1.0, 0.0, 1.0); }

float applyBlendCh(float b, float l, int mode) {
    if(mode==0) return blendOverlay(b,l);
    if(mode==1) return blendMultiply(b,l);
    if(mode==2) return blendScreen(b,l);
    if(mode==3) return blendSoftLight(b,l);
    if(mode==4) return blendHardLight(b,l);
    if(mode==5) return blendDodge(b,l);
    if(mode==6) return blendBurn(b,l);
    if(mode==7) return blendLinLight(b,l);
    return l; // 8 = normal
}

vec3 applyBlend(vec3 base, vec3 layer, int mode) {
    return vec3(
        applyBlendCh(base.r, layer.r, mode),
        applyBlendCh(base.g, layer.g, mode),
        applyBlendCh(base.b, layer.b, mode));
}

// Mode 9: hue shift — factor = lum(layer), shift = factor * hueOffset (wraps)
vec3 applyBlendH(vec3 base, vec3 layer, int mode, float hueOffset) {
    if(mode == 9) {
        float factor = dot(layer, vec3(0.299, 0.587, 0.114));
        vec3 hsv = rgb2hsv(base);
        hsv.x = fract(hsv.x + hueOffset * factor);
        return hsv2rgb(hsv);
    }
    return applyBlend(base, layer, mode);
}

/* ── Spring ───────────────────────────────────────────────────── */
float tanh_safe(float x) {
    x = clamp(x, -10.0, 10.0);  // prevent exp overflow
    float e = exp(2.0*x);
    return (e-1.0)/(e+1.0);
}
float springAxis(float p,float lo,float hi,float s) {
    float m=(hi-lo)*0.02, iL=lo+m, iH=hi-m;
    if(p<iL) return iL-m*tanh_safe((iL-p)*s/max(m,0.001));
    if(p>iH) return iH+m*tanh_safe((p-iH)*s/max(m,0.001));
    return p;
}
vec2 applySpring(vec2 p,vec2 fL,vec2 fH,float s) {
    return s<=0.0 ? p : vec2(springAxis(p.x,fL.x,fH.x,s),springAxis(p.y,fL.y,fH.y,s));
}

struct Hit { float d; float d2; int ci; int ci2; vec4 dotCol; vec2 nearPt; vec2 nearPt2; };

void testPoint(vec2 uv, vec2 p, int ci, inout Hit h) {
    float d=dist(uv,p);
    if(d<h.d){h.d2=h.d;h.ci2=h.ci;h.nearPt2=h.nearPt;h.d=d;h.ci=ci;h.dotCol=dotColor(ci);h.nearPt=p;}
    else if(d<h.d2){h.d2=d;h.ci2=ci;h.nearPt2=p;}
}

void addSentinels(vec2 q,vec2 fL,vec2 fH,float s,inout Hit h) {
    if(s<=0.0)return;
    float b=0.15,rx=fH.x-fL.x,ry=fH.y-fL.y;
    for(int i=0;i<6;i++){float t=(float(i)+0.5)/6.0;
        testPoint(q,vec2(fL.x+t*rx,fH.y+b),9999,h);testPoint(q,vec2(fL.x+t*rx,fL.y-b),9999,h);
        testPoint(q,vec2(fL.x-b,fL.y+t*ry),9999,h);testPoint(q,vec2(fH.x+b,fL.y+t*ry),9999,h);
    }
}

void testPtMirror(vec2 uv,vec2 p,int ci,vec2 piv,inout Hit h) {
    testPoint(uv,p,ci,h);
    if(uMirrorX==1) testPoint(uv,vec2(2.0*piv.x-p.x,p.y),ci,h);
    if(uMirrorY==1) testPoint(uv,vec2(p.x,2.0*piv.y-p.y),ci,h);
    if(uMirrorX==1&&uMirrorY==1) testPoint(uv,vec2(2.0*piv.x-p.x,2.0*piv.y-p.y),ci,h);
}

vec2 flipSrc(vec2 p,vec2 piv) {
    vec2 r=p;
    // Flip X: reflect x coordinate around screen center
    if(uFlipX==1) r.x=2.0*piv.x-r.x;
    // Flip Y: reflect y coordinate around screen center
    if(uFlipY==1) r.y=2.0*piv.y-r.y;
    return r;
}

void queryScene(vec2 q,vec2 piv,vec2 fL,vec2 fH,inout Hit hit) {
    float asp=iResolution.x/iResolution.y;
    for(int i=0;i<64;i++){
        if(i>=uNumPoints)break;
        vec2 p=randomPoint(i);
        if(asp>=1.0)p.x*=asp; else p.y/=asp;
        p=piv+(p-piv)*uScale; p=rotatePoint(p,piv,uRotation); p+=uDisplace;
        p=applySpring(p,fL,fH,uSpring);
        // Snap to grid (grid cell = uSnapGrid pixels, same W and H)
        if(uSnapGrid>0.0){
            vec2 gridUV=vec2(uSnapGrid)/iResolution;
            p=floor(p/gridUV+0.5)*gridUV;
        }
        testPtMirror(q,flipSrc(p,piv),i,piv,hit);
        #define GRP(G,N) if(uGroupCount>G&&uGroupActive[G]==1&&!isRemoved(i,uGroupThreshold[G],uGroupSeed[G])){vec2 gp=(piv+uGroupDisplace[G])+(p-piv)*uGroupScale[G];gp=applySpring(gp,fL,fH,uSpring);if(uSnapGrid>0.0){vec2 gg=vec2(uSnapGrid)/iResolution;gp=floor(gp/gg+0.5)*gg;}testPtMirror(q,flipSrc(gp,piv),i+N*67,piv,hit);}
        GRP(0,1)GRP(1,2)GRP(2,3)GRP(3,4)GRP(4,5)GRP(5,6)GRP(6,7)GRP(7,8)
    }
    addSentinels(q,fL,fH,uSpring,hit);
}

/* ── Compute final color for a cell (base + preprocess + colorize) ── */
vec4 computeCellFinalColor(int ci) {
    if(ci==9999) return vec4(uBgColor, 1.0);
    vec4 col = cellColor(ci);

    // Pre-process
    if(uPreProcess==1){
        vec3 hsv=rgb2hsv(col.rgb);
        hsv.x=fract(hsv.x+uCamHue/360.0);
        hsv.y=clamp(hsv.y*uCamSat,0.0,1.0);
        hsv.z=clamp(hsv.z*uCamVal,0.0,1.0);
        col.rgb=hsv2rgb(hsv);
        col.rgb=clamp((col.rgb-0.5)*uCamContrast+0.5,0.0,1.0);
    }

    // Colorize: 0=gradient, 1=hue, 2=raw (skip)
    if(uColorize==1 && uColorMode!=2){
        float t=cellT(ci);
        if(uColorMode==0){
            col=texture2D(uGradientTex, vec2(t,0.5));
        } else {
            float h=fract(float(ci)*0.618033988+mod(uColorSeed*0.1317, 1.0));
            h=fract(h*uHueRadius+uHueOffset);
            float sat = mix(uSatMin, uSatMax, 0.5);
            if(uSatSeed > 0.0) {
                float sr = hash(float(ci)*13.37 + mod(uSatSeed*41.3, 6283.0) + 5.7);
                sat = mix(uSatMin, uSatMax, sr);
            }
            float val = mix(uValueMin, uValueMax, 0.5);
            if(uBrightSeed > 0.0) {
                float br = hash(float(ci)*7.31 + mod(uBrightSeed*53.7, 6283.0) + 2.9);
                val = mix(uValueMin, uValueMax, br);
            }
            col=hsvToRgb(h, sat, val);
        }
    }
    return col;
}

/* ── Flow mode: simplex-noise fluid (CC BY-NC-SA 3.0, shadertoy.com/view/ltKyRR) ─── */
vec3 flow_random3(vec3 c) {
    float j = 4096.0 * sin(dot(c, vec3(17.0, 59.4, 15.0)));
    vec3 r;
    r.z = fract(512.0 * j); j *= 0.125;
    r.x = fract(512.0 * j); j *= 0.125;
    r.y = fract(512.0 * j);
    return r - 0.5;
}
const float F3 = 0.3333333;
const float G3 = 0.1666667;
float flow_simplex3d(vec3 p) {
    vec3 s = floor(p + dot(p, vec3(F3)));
    vec3 x = p - s + dot(s, vec3(G3));
    vec3 e = step(vec3(0.0), x - x.yzx);
    vec3 i1 = e * (1.0 - e.zxy);
    vec3 i2 = 1.0 - e.zxy * (1.0 - e);
    vec3 x1 = x - i1 + G3;
    vec3 x2 = x - i2 + 2.0 * G3;
    vec3 x3 = x - 1.0 + 3.0 * G3;
    vec4 w, d;
    w.x = dot(x,  x);  w.y = dot(x1, x1);
    w.z = dot(x2, x2); w.w = dot(x3, x3);
    w = max(0.6 - w, 0.0);
    d.x = dot(flow_random3(s),      x);
    d.y = dot(flow_random3(s + i1), x1);
    d.z = dot(flow_random3(s + i2), x2);
    d.w = dot(flow_random3(s + 1.0),x3);
    w *= w; w *= w; d *= w;
    return dot(d, vec4(52.0));
}
// Base noise for flow1 — dispatches on uFlow1Style
// Styles 1-15 map the 2D noise library into 3D via z→phase projection
float flow_base_noise(vec3 p) {
    if(uFlow1Style == 0) return flow_simplex3d(p);
    // 2D projection: use xy + small z-derived drift so channels differ smoothly
    vec2 p2 = p.xy + vec2(sin(p.z * 1.7) * 0.4, cos(p.z * 1.3) * 0.4);
    if(uFlow1Style == 1)  return fbmSimplex(p2, 4);
    if(uFlow1Style == 2)  return valueNoise(p2);
    if(uFlow1Style == 3)  return sparseConvNoise(p2);
    if(uFlow1Style == 4)  return alligatorNoise(p2);
    if(uFlow1Style == 5)  return perlinNoise(p2);
    if(uFlow1Style == 6)  return perlinFlowNoise(p2, p.z);
    if(uFlow1Style == 7)  return simplexNoise(p2);
    if(uFlow1Style == 8)  return worleyEuc(p2).x;
    if(uFlow1Style == 9)  return clamp(worleyEuc(p2).y  - worleyEuc(p2).x,  0.0, 1.0);
    if(uFlow1Style == 10) return worleyMan(p2).x;
    if(uFlow1Style == 11) return clamp(worleyMan(p2).y  - worleyMan(p2).x,  0.0, 1.0);
    if(uFlow1Style == 12) return worleyCheb(p2).x;
    if(uFlow1Style == 13) return clamp(worleyCheb(p2).y - worleyCheb(p2).x, 0.0, 1.0);
    if(uFlow1Style == 14) return fbmPerlin(p2, 4);
    if(uFlow1Style == 15) return fbmValue(p2, 4);
    return flow_simplex3d(p);
}

float flow_fractal(vec3 m) {
    float sum = 0.0;
    for (int i = 0; i < 16; ++i) {
        float sc = pow(2.0, float(i));
        sum += flow_base_noise(sc * m) / sc;
    }
    return sum;
}
vec3 flow_texture(vec3 p) {
    float t = iTime * uFlowSpeed;
    vec3 p1 = 0.1 * p + vec3(1.0 + t * 0.0023, 2.0 - t * 0.0017, 4.0 + t * 0.001);
    vec3 p2 = p + uFlowDistort1 * flow_fractal(p1) + 0.5;
    vec3 p3 = p2 + uFlowDistort2 * flow_fractal(0.5 * p2 + vec3(5.0, 4.0, 8.0 + t * 0.01)) + 0.5;
    vec3 ret;
    ret.x = flow_fractal(p3 + vec3(0.0, 0.0, 0.1 + t * 0.1));
    ret.y = flow_fractal(p3 + vec3(0.0, 0.0, 0.2 + t * 0.1));
    ret.z = flow_fractal(p3 + vec3(0.0, 0.0, 0.3 + t * 0.1));
    ret = 0.5 + 0.5 * ret;
    ret = smoothstep(vec3(uFlowSmoothLo), vec3(uFlowSmoothHi), ret);
    return ret;
}

/* ── Flow 2: vector field visualizer (CC BY-SA 4.0, @stormoid / shadertoy) ── */
float flow2_f(vec2 p) {
    return sin(p.x + sin(p.y + iTime * uF2VelX)) * sin(p.y * p.x * 0.1 + iTime * uF2VelY);
}

vec3 flow2_color(vec2 uv0, float asp) {
    // Center, aspect-correct, scale — pan via uDisplace
    vec2 p = (uv0 - 0.5 - uDisplace);
    p.x *= asp;
    p *= uF2Scale;

    // Decode fieldMode (0 or 1) and colorMode (0 or 1) from uF2Mode (0-3)
    int f2field = uF2Mode / 2;           // 0,0,1,1
    int f2color = uF2Mode - f2field * 2; // 0,1,0,1

    vec2 ep = vec2(0.05, 0.0);
    vec2 rz = vec2(0.0);
    vec2 pp = p;

    // Gradient field iteration (shared by all modes)
    for(int i = 0; i < 20; i++) {
        if(i >= uF2Iter1) break;
        float t0 = flow2_f(pp);
        float t1 = flow2_f(pp + ep.xy);
        float t2 = flow2_f(pp + ep.yx);
        vec2 g  = vec2((t1-t0), (t2-t0)) / ep.xx;
        vec2 t  = vec2(-g.y, g.x);
        pp += (uF2Twist * 0.01) * t + g * (1.0 / uF2Detail);
        pp.x += sin(iTime * uF2Speed / 10.0) / 10.0;
        pp.y += cos(iTime * uF2Speed / 10.0) / 10.0;
        rz = g;
    }

    // Field mode C/D: additional curved warp iteration
    if(f2field == 1) {
        for(int i = 1; i < 20; i++) {
            if(i >= uF2Iter2) break;
            pp.x += 0.3 / float(i) * sin(float(i) * 3.0 * pp.y + iTime * uF2Speed) + 0.5;
            pp.y += 0.3 / float(i) * cos(float(i) * 3.0 * pp.x + iTime * uF2Speed) + 0.5;
        }
    }

    vec3 col;
    if(f2color == 0) {
        // Velocity-based color: maps gradient vector into RGB
        col = clamp(vec3(rz * 0.5 + 0.5, 1.0), 0.0, 1.0);
    } else {
        // Position-based color: sinusoidal on iterated position
        col.r = cos(pp.x + pp.y + 1.0) * 0.5 + 0.5;
        col.g = sin(pp.x + pp.y + 1.0) * 0.5 + 0.5;
        col.b = (sin(pp.x + pp.y) + cos(pp.x + pp.y)) * 0.3 + 0.5;
        col = clamp(col, 0.0, 1.0);
    }

    return col * 0.85;
}

void main() {
    float asp=iResolution.x/iResolution.y;
    vec2 uv=gl_FragCoord.xy/iResolution.xy, uvW=uv;
    if(asp>=1.0)uvW.x*=asp; else uvW.y/=asp;
    vec2 piv=vec2(0.5); if(asp>=1.0)piv.x=0.5*asp; else piv.y=0.5/asp;
    vec2 fL=vec2(0),fH=vec2(1); if(asp>=1.0)fH.x=asp; else fH.y=1.0/asp;

    vec4 col;
    float cellIdNorm = 0.0;

    // ── Image source: sample uploaded image ──
    if(uSourceMode==1){
        // Aspect-correct cover: fit image to canvas preserving aspect ratio
        vec2 imgUV = uv;
        float canvasAR = asp;
        float imgAR = max(uImageAspect, 0.001);
        if(imgAR > canvasAR){
            float sc = canvasAR / imgAR;
            imgUV.x = imgUV.x * sc + (1.0-sc)*0.5;
        } else {
            float sc = imgAR / canvasAR;
            imgUV.y = imgUV.y * sc + (1.0-sc)*0.5;
        }
        // Apply scale from center
        imgUV = (imgUV - 0.5) / max(uImageScale, 0.01) + 0.5;
        // Flip Y: GL has Y-up, image has Y-down
        imgUV.y = 1.0 - imgUV.y;
        col = texture2D(uImageTex, clamp(imgUV, vec2(0.001), vec2(0.999)));
        // Pre-process on image
        if(uPreProcess==1){
            vec3 hsv=rgb2hsv(col.rgb);
            hsv.x=fract(hsv.x+uCamHue/360.0);
            hsv.y=clamp(hsv.y*uCamSat,0.0,1.0);
            hsv.z=clamp(hsv.z*uCamVal,0.0,1.0);
            col.rgb=hsv2rgb(hsv);
            col.rgb=clamp((col.rgb-0.5)*uCamContrast+0.5,0.0,1.0);
        }
        // Colorize image: map luminance through gradient or hue
        if(uColorize==1 && uColorMode!=2){
            float imgLum = dot(col.rgb, vec3(0.299,0.587,0.114));
            if(uColorMode==0){
                col = texture2D(uGradientTex, vec2(imgLum, 0.5));
            } else {
                float h = fract(imgLum + uHueOffset);
                h = fract(h * uHueRadius);
                float sat = mix(uSatMin, uSatMax, 0.5);
                float val = mix(uValueMin, uValueMax, imgLum);
                col = hsvToRgb(h, sat, val);
            }
        }
        cellIdNorm = dot(col.rgb, vec3(0.299,0.587,0.114));

    // ── Noise mode (mode==3) ──
    } else if(uMode==3){
        // Pan: subtract uDisplace so drag direction matches visual motion
        vec2 noiseUV = uvW - uDisplace;
        float nv = computeNoise(noiseUV);
        nv = clamp(nv, 0.0, 1.0);

        // Pre-process on noise (treat nv as grayscale)
        vec3 noiseCol = vec3(nv);
        if(uPreProcess==1){
            vec3 hsv=rgb2hsv(noiseCol);
            hsv.x=fract(hsv.x+uCamHue/360.0);
            hsv.y=clamp(hsv.y*uCamSat,0.0,1.0);
            hsv.z=clamp(hsv.z*uCamVal,0.0,1.0);
            noiseCol=hsv2rgb(hsv);
            noiseCol=clamp((noiseCol-0.5)*uCamContrast+0.5,0.0,1.0);
            nv = dot(noiseCol, vec3(0.299,0.587,0.114));
        }

        // Colorize: Raw=smooth grayscale, Gradient=map through gradient, Hue=map through hue
        if(uColorize==1 && uColorMode==0){
            // Gradient: continuous noise value maps smoothly through gradient
            col = texture2D(uGradientTex, vec2(nv, 0.5));
        } else if(uColorize==1 && uColorMode==1){
            // Hue: continuous noise value maps through hue ramp
            float h = fract(nv + uHueOffset);
            h = fract(h * uHueRadius);
            float sat = mix(uSatMin, uSatMax, 0.5);
            float val = mix(uValueMin, uValueMax, nv);
            col = hsvToRgb(h, sat, val);
        } else {
            // Raw: smooth grayscale
            col = vec4(noiseCol, 1.0);
        }
        cellIdNorm = nv;

        // Banding for noise — use raw noise value as band distance
        if(uBanding==1 && uBandCount>0.0) {
            float lum = dot(col.rgb, vec3(0.299,0.587,0.114));
            if(lum >= uBandLumMin && lum <= uBandLumMax) {
                float effectiveCount = uBandCount;
                if(uBandRandCount==1) {
                    float countRand = hash(floor(nv*32.0) * 197.3 + mod(uBandRandCountSeed * 53.1, 6283.0) + 11.7);
                    float t = mix(uBandRandCountMin, uBandRandCountMax, countRand);
                    effectiveCount = max(floor(uBandCount * t), 1.0);
                }
                float bandDist = nv; // use raw noise value as band distance
                float bi = floor(bandDist * effectiveCount);
                bi = min(bi, effectiveCount-1.0);
                float bv = (uBandRandomize==1) ? hash(bi*127.1+311.7) : bi/max(effectiveCount-1.0,1.0);
                vec3 blended = applyBlendH(col.rgb, vec3(bv), uBandBlendMode, uBandHueOffset);
                col.rgb = mix(col.rgb, blended, uBandStrength);

                if(uBandHueStrength > 0.0 && uBandHueRadius > 0.0) {
                    float hueShift = bv * uBandHueStrength;
                    vec3 hsv2 = rgb2hsv(col.rgb);
                    hsv2.x = fract(hsv2.x + hueShift);
                    vec3 hueShifted = hsv2rgb(hsv2);
                    col.rgb = mix(col.rgb, hueShifted, uBandHueRadius);
                }
            }
        }

    // ── Flow mode (mode==4) ──
    } else if(uMode==4){

        vec3 fres;
        if(uFlowType == 0) {
            // ── Flow 1: domain-warped noise fluid ──
            vec3 fp = vec3((uvW - uDisplace) * uFlowScale, iTime * 0.0001 * uFlowSpeed);
            fres = flow_texture(fp);
            fres = sqrt(max(fres, vec3(0.0)));
        } else {
            // ── Flow 2: vector field visualizer ──
            fres = flow2_color(uv, asp);
        }

        // ── Flow hue remap: per-type, skipped if not enabled ──
        if(uFlowType == 0 && uFlowHueEnabled == 1) {
            vec3 fhsv = rgb2hsv(fres);
            fhsv.x = fract(fhsv.x * uFlowHueRadius + uFlowHueOffset);
            fres = hsv2rgb(fhsv);
        }
        if(uFlowType == 1 && uF2HueEnabled == 1) {
            vec3 fhsv = rgb2hsv(fres);
            fhsv.x = fract(fhsv.x * uF2HueRadius + uF2HueOffset);
            fres = hsv2rgb(fhsv);
        }

        float lum = dot(fres, vec3(0.299, 0.587, 0.114));

        if(uPreProcess==1){
            vec3 hsv=rgb2hsv(fres);
            hsv.x=fract(hsv.x+uCamHue/360.0);
            hsv.y=clamp(hsv.y*uCamSat,0.0,1.0);
            hsv.z=clamp(hsv.z*uCamVal,0.0,1.0);
            fres=hsv2rgb(hsv);
            fres=clamp((fres-0.5)*uCamContrast+0.5,0.0,1.0);
            lum = dot(fres, vec3(0.299,0.587,0.114));
        }

        if(uColorize==1 && uColorMode==0){
            col = texture2D(uGradientTex, vec2(lum, 0.5));
        } else if(uColorize==1 && uColorMode==1){
            float h = fract(lum + uHueOffset);
            h = fract(h * uHueRadius);
            float sat = mix(uSatMin, uSatMax, 0.5);
            float val = mix(uValueMin, uValueMax, lum);
            col = hsvToRgb(h, sat, val);
        } else {
            col = vec4(fres, 1.0);
        }
        cellIdNorm = lum;

    // ── Voronoi pattern ──
    } else {
        Hit hit; hit.d=1e9; hit.d2=1e9; hit.ci=0; hit.ci2=0; hit.dotCol=vec4(0); hit.nearPt=vec2(0); hit.nearPt2=vec2(0);
        queryScene(uvW,piv,fL,fH,hit);

        col = computeCellFinalColor(hit.ci);

        if(uShowDots==1 && hit.d<uDotRadius) col=mix(col,hit.dotCol,smoothstep(uDotRadius,uDotRadius*0.4,hit.d));

        float borderDist = clamp((hit.d2-hit.d)*0.5/0.15, 0.0, 1.0);
        cellIdNorm = float(hit.ci) / 64.0;

        // ── Banding (before pixelation — mirrors already applied) ──
        if(uBanding==1 && uBandCount>0.0 && hit.ci!=9999) {
            float bandDist = borderDist;

            if(uBandAngleMode==1) {
                vec2 bandUV = uvW;
                if(uMirrorX==1 && bandUV.x > piv.x) bandUV.x = 2.0*piv.x - bandUV.x;
                if(uMirrorY==1 && bandUV.y > piv.y) bandUV.y = 2.0*piv.y - bandUV.y;
                if(uFlipX==1 && uvW.x > piv.x) bandUV.x = 2.0*piv.x - bandUV.x;
                if(uFlipY==1 && uvW.y > piv.y) bandUV.y = 2.0*piv.y - bandUV.y;
                
                float cellRand = hash(float(hit.ci) * 73.17 + mod(uBandAngleSeed * 31.7, 6283.0) + 19.3);
                
                if(cellRand < 0.66) {
                    int angleIdx;
                    bool twoAngles = cellRand >= 0.33;
                    
                    if(twoAngles) {
                        angleIdx = int(floor(hash(float(hit.ci)*251.3 + mod(uBandAngleSeed*17.3, 6283.0) + 41.7) * 8.0));
                    } else {
                        angleIdx = int(floor(hash(float(hit.ci)*137.9 + mod(uBandAngleSeed*23.1, 6283.0) + 7.1) * 8.0));
                    }
                    if(angleIdx >= 8) angleIdx = 7;
                    
                    float a1 = float(angleIdx) * 0.7853981633974483;
                    vec2 dir1 = vec2(cos(a1), sin(a1));
                    
                    float proj1 = dot(bandUV, dir1);
                    float span = 0.3;
                    float dirDist1 = fract(proj1 / span);
                    
                    if(twoAngles) {
                        float a2 = float(angleIdx + 1) * 0.7853981633974483;
                        vec2 dir2 = vec2(cos(a2), sin(a2));
                        float proj2 = dot(bandUV, dir2);
                        float dirDist2 = fract(proj2 / span);
                        bandDist = min(dirDist1, dirDist2);
                    } else {
                        bandDist = dirDist1;
                    }
                }
            }

            float lum = dot(col.rgb, vec3(0.299,0.587,0.114));
            if(lum >= uBandLumMin && lum <= uBandLumMax) {
                float effectiveCount = uBandCount;
                if(uBandRandCount==1) {
                    float countRand = hash(float(hit.ci) * 197.3 + mod(uBandRandCountSeed * 53.1, 6283.0) + 11.7);
                    float t = mix(uBandRandCountMin, uBandRandCountMax, countRand);
                    effectiveCount = max(floor(uBandCount * t), 1.0);
                }
                
                float bi = floor(bandDist * effectiveCount);
                bi = min(bi, effectiveCount-1.0);
                float bv = (uBandRandomize==1) ? hash(bi*127.1+311.7) : bi/max(effectiveCount-1.0,1.0);
                vec3 blended = applyBlendH(col.rgb, vec3(bv), uBandBlendMode, uBandHueOffset);
                col.rgb = mix(col.rgb, blended, uBandStrength);

                if(uBandHueStrength > 0.0 && uBandHueRadius > 0.0) {
                    float hueShift = bv * uBandHueStrength;
                    vec3 hsv = rgb2hsv(col.rgb);
                    hsv.x = fract(hsv.x + hueShift);
                    vec3 hueShifted = hsv2rgb(hsv);
                    col.rgb = mix(col.rgb, hueShifted, uBandHueRadius);
                }
            }
        }
    }

    gl_FragColor = vec4(col.rgb, cellIdNorm);
}
`;

const EDGE_GLSL_SRC = `precision highp float;
precision highp int;

invariant gl_FragColor;

uniform vec2      iResolution;
uniform sampler2D uSceneTex;
uniform float     uOutlineWidth;
uniform vec3      uOutlineColor;
uniform int       uPixelate;
uniform vec2      uPixelSize;
uniform int       uWeaveMode;
uniform int       uPixelShape;
uniform float     uShapeMargin;
uniform float     uShapeBleed;
uniform float     uPixelScale;
uniform float     uShapeScale;
uniform int       uForceSquare;       // 0=off, 1=parent shape to square frame
uniform int       uMaintainThickness; // 0=off, 1=keep arm thickness optically constant across quadtree
uniform int       uOblique;
uniform int       uBandOutline;
uniform vec3      uGapColor;
uniform float     uGapOpacity;
uniform sampler2D uShapeGradTex;
uniform float     uShapeGradOpacity;
uniform int       uShapeGradDir;
uniform int       uTileGradEnabled;
uniform vec2      uRadialCenter;      // radial gradient center offset (-1 to 1)
uniform float     uRadialScale;       // radial gradient scale (0-2)
uniform int       uEmbossBlendMode; // same blend mode set as banding
uniform float     uEmbossHueOff;    // hue offset for emboss hue-shift blend (mode 9)

uniform float     uGradeHue;
uniform float     uGradeSat;
uniform float     uGradeVal;
uniform float     uGradeContrast;
uniform int       uPostProcess;

/* ── Image Pixel uniforms ──────────────────────────────────── */
uniform int       uImgPixelEnabled;
uniform sampler2D uImgPixelTex;
uniform float     uImgPixelCols;
uniform float     uImgPixelRows;
uniform int       uImgPixelBlend;
uniform float     uImgPixelHueOff;  // hue offset for hue-shift blend (mode 9)
uniform float     uImgPixelOpacity;
uniform int       uImgPixelAffectScale;
uniform float     uImgPixelMinScale;
uniform float     uImgPixelMaxScale;
uniform int       uImgPixelAffectRotate;
uniform float     uImgPixelMinRotate;
uniform float     uImgPixelMaxRotate;
uniform int       uImgPixelAffectOffset;
uniform float     uImgPixelMinOffset;
uniform float     uImgPixelMaxOffset;
uniform int       uImgPixelMask;          // 0=normal, 1=mask (lum→opacity)

/* ── Oct Diamond Image Pixel uniforms (layer 2 for Oct weave) ── */
uniform int       uImgPixel2Enabled;
uniform sampler2D uImgPixel2Tex;
uniform float     uImgPixel2Cols;
uniform float     uImgPixel2Rows;
uniform int       uImgPixel2Blend;
uniform float     uImgPixel2HueOff; // hue offset for hue-shift blend (mode 9)
uniform float     uImgPixel2Opacity;
uniform int       uImgPixel2AffectScale;
uniform float     uImgPixel2MinScale;
uniform float     uImgPixel2MaxScale;
uniform int       uImgPixel2AffectRotate;
uniform float     uImgPixel2MinRotate;
uniform float     uImgPixel2MaxRotate;
uniform int       uImgPixel2AffectOffset;
uniform float     uImgPixel2MinOffset;
uniform float     uImgPixel2MaxOffset;
uniform int       uImgPixel2Mask;

/* ── Opacity Pattern uniforms ──────────────────────────────── */
uniform int       uOpPatternCount;    // 0-4 active patterns
uniform sampler2D uOpPatternTex;      // 64-wide texture, each row = one pattern's data
uniform vec4      uOpPatternDims[4];  // x=cols, y=rows, z=hueShift, w=hueOpacity
uniform float     uOpPatternSeed;     // seed for pattern distribution randomization
uniform int       uOpPatternMode;     // 0=by color (post-banding), 1=by shape (cell ID)

/* ── Blend modes (same as fragment.glsl) ──────────────────────── */
float bOverlay(float b,float l)   { return b<0.5?2.0*b*l:1.0-2.0*(1.0-b)*(1.0-l); }
float bMultiply(float b,float l)  { return b*l; }
float bScreen(float b,float l)    { return 1.0-(1.0-b)*(1.0-l); }
float bSoftLight(float b,float l) { return l<0.5?b-(1.0-2.0*l)*b*(1.0-b):b+(2.0*l-1.0)*(sqrt(b)-b); }
float bHardLight(float b,float l) { return l<0.5?2.0*b*l:1.0-2.0*(1.0-b)*(1.0-l); }
float bDodge(float b,float l)     { return l>=1.0?1.0:min(1.0,b/(1.0-l)); }
float bBurn(float b,float l)      { return l<=0.0?0.0:max(0.0,1.0-(1.0-b)/l); }
float bLinLight(float b,float l)  { return clamp(b+2.0*l-1.0,0.0,1.0); }

float blendCh(float b,float l,int m){
    if(m==0)return bOverlay(b,l);if(m==1)return bMultiply(b,l);if(m==2)return bScreen(b,l);
    if(m==3)return bSoftLight(b,l);if(m==4)return bHardLight(b,l);if(m==5)return bDodge(b,l);
    if(m==6)return bBurn(b,l);if(m==7)return bLinLight(b,l);return l;
}
vec3 blendV(vec3 b,vec3 l,int m){return vec3(blendCh(b.r,l.r,m),blendCh(b.g,l.g,m),blendCh(b.b,l.b,m));}

/* ── Weave tile ───────────────────────────────────────────────── */
struct BlockInfo { vec2 uv; vec2 tilePx; vec2 shapePx; bool isWarp; vec2 cell; };

// Quadtree: pick grid size based on pixel luminance
// Darker pixels get smaller blocks, brighter get larger
uniform int       uQuadSteps;         // 1=off, 2-5=number of size levels
uniform int       uQuadEnabled;       // 0=off, 1=on
uniform int       uGenDiamond;        // 0=off, 1=generate full diamond shapes at oct corners

// Snap a base grid size so every quadtree level halves to exact integers.
// divisor = 2^(steps-1); round smallest cell ≥ 1, base = smallest * divisor.
vec2 snapQuadBase(vec2 base, int steps) {
    float div = 1.0;
    for(int i = 0; i < 4; i++) { if(i < steps - 1) div *= 2.0; }
    vec2 smallest = max(floor(base / div + 0.5), vec2(1.0));
    return smallest * div;
}

vec2 quadtreeGrid(vec2 rawUV, vec2 baseGrid) {
    vec2 baseInt = floor(baseGrid + 0.5);
    baseInt = max(baseInt, vec2(1.0));
    if(uQuadEnabled==0 || uQuadSteps <= 1) return baseInt;

    // Snap base so every subdivision is an exact halving
    vec2 snappedBase = snapQuadBase(baseInt, uQuadSteps);

    vec2 canvasCenter = floor(iResolution * 0.5);
    vec2 pixPos = rawUV * iResolution;

    // Iterative top-down quadtree: at each level, sample luminance
    // at the current cell's own center, decide whether to subdivide.
    vec2 cellPx = snappedBase;

    for(int i = 0; i < 4; i++) {
        if(i >= uQuadSteps - 1) break;

        vec2 ci = floor((pixPos - canvasCenter) / cellPx);
        vec2 centerUV = (canvasCenter + (ci + 0.5) * cellPx) / iResolution;

        float lum = dot(texture2D(uSceneTex,
                        clamp(centerUV, vec2(0.001), vec2(0.999))).rgb,
                        vec3(0.299, 0.587, 0.114));
        lum = clamp(lum, 0.0, 1.0);

        float threshold = float(uQuadSteps - 1 - i) / float(uQuadSteps);
        if(lum >= threshold) break;

        // Halve — exact because cellPx is always a multiple of smallest
        cellPx = cellPx * 0.5;
    }

    return cellPx;
}

BlockInfo getBlock(vec2 rawUV) {
    BlockInfo b; b.isWarp=false; b.cell=vec2(0);
    if(uPixelate==0){b.uv=rawUV;b.tilePx=vec2(1);b.shapePx=vec2(1);return b;}

    // Canvas center (integer pixel) — grid originates here
    vec2 canvasCenter = floor(iResolution * 0.5);
    // Effective pixel position for grid lookup
    vec2 pixPos = rawUV * iResolution;
    float outerSize = (uOblique==1) ? max(uPixelSize.x, uPixelSize.y) : 0.0;

    // Hexagonal grid (weave mode 3)
    if(uWeaveMode==3){
        float sz = floor(max(uPixelSize.x, uPixelSize.y) + 0.5);
        sz = max(sz, 1.0);
        vec2 actualGrid = quadtreeGrid(rawUV, vec2(sz));
        float cellWpx = actualGrid.x;                       // integer px width
        float cellHpx = floor(cellWpx * 0.866025 + 0.5);   // integer px height (sqrt3/2)
        cellHpx = max(cellHpx, 1.0);
        // Shift each odd row by half a cell width (in integer px)
        float halfWpx = floor(cellWpx * 0.5 + 0.5);
        // Offset pixel position from canvas center
        vec2 off = pixPos - canvasCenter;
        float row = floor(off.y / cellHpx);
        float xShift = mod(row, 2.0) >= 1.0 ? halfWpx : 0.0;
        float col = floor((off.x - xShift) / cellWpx);
        vec2 cellCenterPx = canvasCenter + vec2((col + 0.5) * cellWpx + xShift, (row + 0.5) * cellHpx);
        // Find nearest of 9 candidates for true hex center
        float bestD = 1e9; vec2 bestC = cellCenterPx; vec2 bestCell = vec2(col, row);
        for(int dy = -1; dy <= 1; dy++) {
            float nr = row + float(dy);
            float nxShift = mod(nr, 2.0) >= 1.0 ? halfWpx : 0.0;
            for(int dx = -1; dx <= 1; dx++) {
                float nc = col + float(dx);
                vec2 cc = canvasCenter + vec2((nc + 0.5) * cellWpx + nxShift, (nr + 0.5) * cellHpx);
                float dd = length(pixPos - cc);
                if(dd < bestD) { bestD = dd; bestC = cc; bestCell = vec2(nc, nr); }
            }
        }
        b.uv = bestC / iResolution;
        b.tilePx = actualGrid;
        b.shapePx = actualGrid;
        b.cell = bestCell;
        return b;
    }

    // Octagonal grid (weave mode 4)
    if(uWeaveMode==4){
        float sz = floor(max(uPixelSize.x, uPixelSize.y) + 0.5);
        sz = max(sz, 1.0);
        vec2 actualGrid = quadtreeGrid(rawUV, vec2(sz));
        vec2 cellPx = actualGrid;
        // Center-based cell index
        vec2 off = pixPos - canvasCenter;
        vec2 ci = floor(off / cellPx);
        vec2 sqCenterPx = canvasCenter + (ci + 0.5) * cellPx;

        if(uGenDiamond==0) {
            // Diamond cells at grid corners (offset by 0.5 cell)
            vec2 diCI = floor(off / cellPx + 0.5);
            vec2 vtxPx = canvasCenter + diCI * cellPx;
            vec2 dv = abs(pixPos - vtxPx) / cellPx;
            float l1 = dv.x + dv.y;
            if(l1 < 0.2929) {
                float diaSz = floor(0.2929 * 2.0 * cellPx.x + 0.5);
                b.uv = vtxPx / iResolution;
                b.tilePx = vec2(diaSz);
                b.shapePx = vec2(diaSz);
                b.cell = diCI + vec2(5000.0);
                b.isWarp = true;
                return b;
            }
        }
        b.uv = sqCenterPx / iResolution;
        b.tilePx = cellPx;
        b.shapePx = cellPx;
        b.cell = ci;
        return b;
    }

    // Weave (mode 2): checkerboard warp/weft
    if(uWeaveMode==2){
        float ts = floor(max(uPixelSize.x, uPixelSize.y) + 0.5);
        ts = max(ts, 1.0);
        vec2 actualGrid = quadtreeGrid(rawUV, vec2(ts));
        vec2 cellPx = actualGrid;
        vec2 off = pixPos - canvasCenter;
        vec2 ci = floor(off / cellPx);
        bool warp = mod(ci.x + ci.y, 2.0) >= 1.0;
        b.isWarp = warp;
        b.tilePx = cellPx;
        // Snap shape sizes to integer
        vec2 shapeBase = warp ? vec2(uPixelSize.y, uPixelSize.x) : uPixelSize;
        b.shapePx = floor(shapeBase + 0.5);
        b.shapePx = max(b.shapePx, vec2(1.0));
        b.uv = (canvasCenter + (ci + 0.5) * cellPx) / iResolution;
        b.cell = ci;
        return b;
    }

    // Default rectangular grid (modes 0 = none, 1 = brick)
    vec2 gridSize = (uOblique==1) ? vec2(outerSize) : uPixelSize;
    vec2 actualGrid = quadtreeGrid(rawUV, gridSize);
    // Snap cell to integer px
    vec2 cellPx = actualGrid;   // already integer from quadtreeGrid
    // Force-square: parent cell wrapper to square (max of w,h), shape stays as-is
    if (uForceSquare == 1) {
        float sq = max(cellPx.x, cellPx.y);
        cellPx = vec2(sq);
    }
    vec2 off = pixPos - canvasCenter;

    // Brick offset (mode 1): odd rows shift by half cell width
    vec2 ci = floor(off / cellPx);
    if(uWeaveMode==1 && mod(ci.y, 2.0) >= 1.0){
        // Shift x by half cell, re-derive ci.x
        float offX = off.x - cellPx.x * 0.5;
        ci.x = floor(offX / cellPx.x);
        vec2 ctrPx = canvasCenter + vec2((ci.x + 0.5) * cellPx.x + cellPx.x * 0.5,
                                         (ci.y + 0.5) * cellPx.y);
        // Snap shape size; if force-square, parent to max(w,h)
        vec2 sPx = floor(uPixelSize + 0.5); sPx = max(sPx, vec2(1.0));
        if(uForceSquare==1) { float sq=max(sPx.x,sPx.y); sPx=vec2(sq); }
        b.uv = ctrPx / iResolution;
        b.tilePx = cellPx;
        b.shapePx = sPx;
        b.cell = ci;
        return b;
    }

    vec2 ctrPx = canvasCenter + (ci + 0.5) * cellPx;
    vec2 sPx = floor(uPixelSize + 0.5); sPx = max(sPx, vec2(1.0));
    if(uForceSquare==1) { float sq=max(sPx.x,sPx.y); sPx=vec2(sq); }
    b.uv = ctrPx / iResolution;
    b.tilePx = cellPx;
    b.shapePx = sPx;
    b.cell = ci;
    return b;
}

vec2 snapUV(vec2 uv){return getBlock(uv).uv;}

/* ── Shape SDFs ───────────────────────────────────────────────── */
float pillSDF(vec2 p,vec2 h,float m){
    vec2 i=h-vec2(m);if(i.x<=0.0||i.y<=0.0)return 1.0;float r=min(i.x,i.y);vec2 a=abs(p);
    if(i.x>=i.y)return length(vec2(max(a.x-(i.x-r),0.0),a.y))-r;
    return length(vec2(a.x,max(a.y-(i.y-r),0.0)))-r;
}
float diamondSDF(vec2 p,vec2 h,float m){
    vec2 i=h-vec2(m);if(i.x<=0.0||i.y<=0.0)return 1.0;
    float raw=(abs(p.x)/i.x+abs(p.y)/i.y)-1.0;
    return raw/sqrt(1.0/(i.x*i.x)+1.0/(i.y*i.y));
}
float squareSDF(vec2 p,vec2 h,float m){
    vec2 i=h-vec2(m);if(i.x<=0.0||i.y<=0.0)return 1.0;vec2 d=abs(p)-i;return max(d.x,d.y);
}
float chevronSDF(vec2 p,vec2 h,float m){
    vec2 i=h-vec2(m);if(i.x<=0.0||i.y<=0.0)return 1.0;vec2 a=abs(p);float cap=min(i.x,i.y);
    if(i.x>=i.y){float st=i.x-cap;if(a.x<=st)return a.y-i.y;
        float raw=((a.x-st)/cap+a.y/i.y)-1.0;return raw/sqrt(1.0/(cap*cap)+1.0/(i.y*i.y));}
    else{float st=i.y-cap;if(a.y<=st)return a.x-i.x;
        float raw=(a.x/i.x+(a.y-st)/cap)-1.0;return raw/sqrt(1.0/(i.x*i.x)+1.0/(cap*cap));}
}
// Hexagon SDF — flat-top hexagon
float hexSDF(vec2 p, vec2 h, float m){
    float sz = min(h.x, h.y) - m;
    if(sz <= 0.0) return 1.0;
    vec2 a = abs(p);
    // Flat-top hex: test against 3 half-planes
    float d = max(a.x, a.x*0.5 + a.y*0.866025) - sz;
    return d;
}
// Octagon SDF
float octSDF(vec2 p, vec2 h, float m){
    float sz = min(h.x, h.y) - m;
    if(sz <= 0.0) return 1.0;
    vec2 a = abs(p);
    float cut = 0.4142 * sz; // tan(pi/8) * sz
    float d = max(max(a.x, a.y), (a.x + a.y) * 0.7071) - sz;
    return d;
}
// ── Stroke (capsule) SDF ─────────────────────────────────────────
// Horizontal capsule: segment (-halfLen,0)→(halfLen,0), with rounded caps of radius r.
// r and halfLen are ALREADY accounting for margin (no further shrinkage inside).
float capsuleH(vec2 p, float halfLen, float r) {
    float dx = max(abs(p.x) - halfLen, 0.0);
    return length(vec2(dx, p.y)) - r;
}
// Same but vertical
float capsuleV(vec2 p, float halfLen, float r) {
    float dy = max(abs(p.y) - halfLen, 0.0);
    return length(vec2(p.x, dy)) - r;
}

// ── Cross "+" / "×" geometry helper ─────────────────────────────
// Given cell half-extents hx/hy, stroke radius r (from slider), margin m:
//   - outer edge of cap = halfExtent - m  →  cap_center + r ≤ halfExtent - m
//   - so cap_center = halfExtent - m - r  (= arm half-length)
//   - degenerate when arm half-length ≤ 0: just a circle at origin

// Cross "+" — two arms along X and Y axes
float crossPlusSDF(vec2 p, vec2 h, float m, float r) {
    // r clamped so cap fits inside cell with margin on all sides
    float rX = min(r, max(h.x - m, 0.001));  // clamp to cell in X
    float rY = min(r, max(h.y - m, 0.001));  // clamp to cell in Y
    float rUse = min(rX, rY);                  // single consistent stroke radius
    // Arm half-lengths (0 = pure circle)
    float lX = max(h.x - m - rUse, 0.0);
    float lY = max(h.y - m - rUse, 0.0);
    float d1 = capsuleH(p, lX, rUse);   // horizontal arm
    float d2 = capsuleV(p, lY, rUse);   // vertical arm
    return min(d1, d2);
}

// Cross "×" — same two arms rotated 45°
float crossXSDF(vec2 p, vec2 h, float m, float r) {
    float c45 = 0.7071068; float s45 = 0.7071068;
    vec2 pr = vec2(p.x*c45 + p.y*s45, -p.x*s45 + p.y*c45);
    // In the 45° frame the effective half-extent = min(h.x,h.y) * 0.7071 (conservative — ensures no cap escapes the cell corner)
    float sz = min(h.x, h.y) * 0.7071;
    float rUse = min(r, max(sz - m, 0.001));
    float l = max(sz - m - rUse, 0.0);
    float d1 = capsuleH(pr, l, rUse);
    float d2 = capsuleV(pr, l, rUse);
    return min(d1, d2);
}

// Backward-compat wrappers (used by shapeSDF for non-MT path)
float crossPlusSDFt(vec2 p, vec2 h, float m, float thickH, float thickV) {
    return crossPlusSDF(p, h, m, min(thickH, thickV));
}
float crossXSDFt(vec2 p, vec2 h, float m, float thick) {
    return crossXSDF(p, h, m, thick);
}
float shapeSDF(vec2 p,vec2 h,float m){
    if(uPixelShape==1)return pillSDF(p,h,m);
    if(uPixelShape==2)return diamondSDF(p,h,m);
    if(uPixelShape==3)return squareSDF(p,h,m);
    if(uPixelShape==4)return chevronSDF(p,h,m);
    if(uPixelShape==5)return hexSDF(p,h,m);
    if(uPixelShape==6)return octSDF(p,h,m);
    if(uPixelShape==7){ float r=min(h.x,h.y)*0.35; return crossPlusSDF(p,h,m,r); }
    if(uPixelShape==8){ float r=min(h.x,h.y)*0.35; return crossXSDF(p,h,m,r); }
    return -1.0;
}

bool diffCell(vec4 a,vec4 b){vec3 d=abs(a.rgb-b.rgb);return max(d.r,max(d.g,d.b))>0.015||(d.r+d.g+d.b)>0.03;}

/* ── HSV / grading ────────────────────────────────────────────── */
vec3 rgb2hsv(vec3 c){
    float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b)),d=mx-mn,h=0.0;
    if(d>1e-4){
        if(mx==c.r) h=(c.g-c.b)/d+(c.g<c.b?6.0:0.0);
        else if(mx==c.g) h=(c.b-c.r)/d+2.0;
        else h=(c.r-c.g)/d+4.0;
        h/=6.0;
    }
    return vec3(clamp(h,0.0,1.0),mx>1e-4?d/mx:0.0,mx);
}
vec3 hsv2rgb(vec3 c){
    float h=fract(c.x)*6.0,s=c.y,v=c.z,f=fract(h),p=v*(1.0-s),q=v*(1.0-s*f),t=v*(1.0-s*(1.0-f));
    int hi=int(floor(h));
    if(hi>=6) hi=0;
    if(hi==0)return vec3(v,t,p);if(hi==1)return vec3(q,v,p);if(hi==2)return vec3(p,v,t);
    if(hi==3)return vec3(p,q,v);if(hi==4)return vec3(t,p,v);return vec3(v,p,q);
}
// Cell-only diff: compares hue+saturation, ignores value changes from banding
bool diffCellOnly(vec4 a,vec4 b){
    vec3 ha=rgb2hsv(a.rgb), hb=rgb2hsv(b.rgb);
    float hueDiff=abs(ha.x-hb.x); if(hueDiff>0.5) hueDiff=1.0-hueDiff;
    float satDiff=abs(ha.y-hb.y);
    return hueDiff>0.05 || satDiff>0.15;
}
vec3 grade(vec3 c){
    if(uPostProcess==0) return c;
    vec3 h=rgb2hsv(c);h.x=fract(h.x+uGradeHue/360.0);
    h.y=clamp(h.y*uGradeSat,0.0,1.0);h.z=clamp(h.z*uGradeVal,0.0,1.0);
    vec3 r=hsv2rgb(h);return clamp((r-0.5)*uGradeContrast+0.5,0.0,1.0);
}
// Mode 9: hue-shift — factor = luminance of layer, shift = factor * hueOff (wraps)
vec3 blendVH(vec3 base, vec3 layer, int m, float hueOff) {
    if(m == 9) {
        float factor = dot(layer, vec3(0.299, 0.587, 0.114));
        vec3 hsv = rgb2hsv(base);
        hsv.x = fract(hsv.x + hueOff * factor);
        return hsv2rgb(hsv);
    }
    return blendV(base, layer, m);
}

// Compute gradient t from normalised position (-0.5..0.5 per axis):
// dir 0=0° (horizontal), 1=45°, 2=90° (vertical), 3=135°, 4=radial
float gradientT(vec2 norm) {
    if(uShapeGradDir == 0) return clamp(norm.x + 0.5, 0.0, 1.0);
    if(uShapeGradDir == 1) {
        float v = dot(norm, vec2(0.7071068, -0.7071068)); // 45°
        return clamp(v + 0.5, 0.0, 1.0);
    }
    if(uShapeGradDir == 2) return clamp(norm.y + 0.5, 0.0, 1.0);
    if(uShapeGradDir == 3) {
        float v = dot(norm, vec2(0.7071068, 0.7071068)); // 135°
        return clamp(v + 0.5, 0.0, 1.0);
    }
    // dir 4 = radial
    vec2 rc = uRadialCenter * 0.5;
    return clamp(length(norm - rc) * 2.0 / max(uRadialScale, 0.001), 0.0, 1.0);
}

void main(){
    vec2 rawUV=gl_FragCoord.xy/iResolution;

    // Oblique: rotate in pixel space (aspect-correct) then back to UV
    vec2 obliqueUV = rawUV;
    if(uOblique==1){
        // Work in pixel coordinates to avoid aspect skew
        vec2 pxPos = gl_FragCoord.xy;
        vec2 center = iResolution * 0.5;
        vec2 d = pxPos - center;
        // Rotate 45°: cos=sin=0.7071
        vec2 rotPx = center + vec2(d.x*0.7071 - d.y*0.7071, d.x*0.7071 + d.y*0.7071);
        obliqueUV = rotPx / iResolution;
    }

    BlockInfo blk=getBlock(obliqueUV);

    // Rotate block center back to sample scene texture
    vec2 uv=blk.uv;
    if(uOblique==1){
        // Convert back from UV to pixel, un-rotate, back to UV
        vec2 rotPx = blk.uv * iResolution;
        vec2 center = iResolution * 0.5;
        vec2 d = rotPx - center;
        // Inverse rotation: -45°
        vec2 origPx = center + vec2(d.x*0.7071 + d.y*0.7071, -d.x*0.7071 + d.y*0.7071);
        uv = origPx / iResolution;
    }

    vec4 scene=texture2D(uSceneTex,uv);
    vec3 rawColor=scene.rgb;
    vec3 color=scene.rgb;

    /* ── Shape masking + emboss gradient ──────────────────────── */
    // For hex/oct weave, auto-select shape regardless of uPixelShape
    int effectiveShape = uPixelShape;
    if(uWeaveMode==3) effectiveShape = 5; // hex weave → hex shape
    if(uWeaveMode==4) {
        effectiveShape = (uGenDiamond==0 && blk.isWarp) ? 2 : 6;
    }

    bool isOctGap = false;
    bool isDiamondPixel = false;  // set by genDiamond overlay so image pixel can route to L2

    if(uPixelate==1 && effectiveShape>0){
        // posInTile in PIXEL space — DO NOT scale this
        vec2 posInTile = (obliqueUV - blk.uv) * iResolution;
        float sc = max(uShapeScale, 0.01);

        // Cell half-extents in pixels.
        // Use the ACTUAL cell boundary: min of shape frame and tile frame.
        // In quadtree, tilePx shrinks per subdivision level while shapePx stays
        // at the slider value — the shape must fit within the real tile.
        vec2 cellHalf = min(blk.shapePx, blk.tilePx) * 0.5;

        // ── Margin: insets the cell boundary in optical pixel space ─────
        // Content area = cell minus margin on all sides.
        // Margin always wins — content can shrink to 0 but never negative.
        vec2 content = max(cellHalf - vec2(uShapeMargin), vec2(1.0));

        // ── Stroke radius: min(pixelW,pixelH)/2 from sliders ────────────
        // This is the CAP radius = half the stroke thickness.
        // Clamped so the cap (r on each side) fits inside content on the short axis.
        float rSlider = min(uPixelSize.x, uPixelSize.y) * 0.5;
        // r must fit perpendicularly: the cap must not touch the margin
        float rMax = min(content.x, content.y);
        float r = clamp(rSlider, 1.0, rMax);

        // ── Scale: arm LENGTH scales with sc, radius stays fixed ─────────
        // In pixel space: shape arm tip is at (content * sc) from center.
        // capsule arm half-length = max(content_axis * sc - r, 0)
        // When armLen=0: shape degenerates to a circle of radius r at center.
        // (For quadtree: different cells have different content sizes → different arm lengths)

        float d = -1.0;

        if(effectiveShape==1){
            // Pill: oriented along longer axis
            if(cellHalf.x >= cellHalf.y){
                float rCap = min(r, content.y);   // can't exceed content short axis
                float armLen = max(content.x * sc - rCap, 0.0);
                d = capsuleH(posInTile, armLen, rCap);
            } else {
                float rCap = min(r, content.x);
                float armLen = max(content.y * sc - rCap, 0.0);
                d = capsuleV(posInTile, armLen, rCap);
            }
        }
        if(effectiveShape==2) d=diamondSDF(posInTile, cellHalf, uShapeMargin);
        if(effectiveShape==3) d=squareSDF(posInTile,  cellHalf, uShapeMargin);
        if(effectiveShape==4) d=chevronSDF(posInTile, cellHalf, uShapeMargin);
        if(effectiveShape==5) d=hexSDF(posInTile,     cellHalf, uShapeMargin);
        if(effectiveShape==6) d=octSDF(posInTile,     cellHalf, uShapeMargin);

        if(effectiveShape==7){
            // Cross "+": horizontal arm along X, vertical arm along Y
            // Each arm independently: r clamped per-axis
            float rX = min(r, content.y);   // horizontal arm: perp = Y axis
            float rY = min(r, content.x);   // vertical arm:   perp = X axis
            float rUse = min(rX, rY);        // single consistent r across both arms
            float lX = max(content.x * sc - rUse, 0.0);
            float lY = max(content.y * sc - rUse, 0.0);
            d = min(capsuleH(posInTile, lX, rUse),
                    capsuleV(posInTile, lY, rUse));
        }

        if(effectiveShape==8){
            // Cross "×": same arms rotated 45°
            float c45 = 0.7071068; float s45 = 0.7071068;
            vec2 pr = vec2(posInTile.x*c45 + posInTile.y*s45,
                          -posInTile.x*s45 + posInTile.y*c45);
            // In the 45° frame the cell half-extent along each arm axis
            float diagHalf = min(content.x, content.y) * 0.7071;
            float rUse = min(r, diagHalf);
            float l = max(diagHalf * sc - rUse, 0.0);
            d = min(capsuleH(pr, l, rUse), capsuleV(pr, l, rUse));
        }

        d -= uShapeBleed;
        if(d > 0.0){
            if(uWeaveMode==4 && uGenDiamond==1){
                isOctGap = true;
            } else {
                gl_FragColor = vec4(grade(mix(color, uGapColor, uGapOpacity)), 1.0);
                return;
            }
        }
    }

    /* ── Outline ───────────────────────────────────────────────── */
    if(uOutlineWidth>0.0){
        vec2 px=1.0/iResolution;

        if (uPixelate==1) {
            vec2 gridSz=(uOblique==1)?vec2(max(uPixelSize.x,uPixelSize.y)):uPixelSize;
            vec2 stp=gridSz/iResolution;
            vec4 rc=vec4(rawColor,1.0);
            bool isEdge=false;
            for(int ni=0;ni<4;ni++){
                vec2 off=vec2(0);
                if(ni==0) off=vec2(stp.x,0);
                if(ni==1) off=vec2(-stp.x,0);
                if(ni==2) off=vec2(0,stp.y);
                if(ni==3) off=vec2(0,-stp.y);
                vec2 neighborOblique=obliqueUV+off;
                BlockInfo nb=getBlock(neighborOblique);
                vec2 nbUV=nb.uv;
                if(uOblique==1){
                    vec2 rotPx=nb.uv*iResolution;
                    vec2 ctr=iResolution*0.5;
                    vec2 dd=rotPx-ctr;
                    nbUV=(ctr+vec2(dd.x*0.7071+dd.y*0.7071,-dd.x*0.7071+dd.y*0.7071))/iResolution;
                }
                vec4 ns=texture2D(uSceneTex,nbUV);
                if(uBandOutline==1){
                    if(diffCell(rc,vec4(ns.rgb,1.0))) isEdge=true;
                } else {
                    // Cell-only: detect any color diff, but skip if only V changed (=banding)
                    if(diffCell(rc,vec4(ns.rgb,1.0))){
                        vec3 hA=rgb2hsv(rc.rgb), hB=rgb2hsv(ns.rgb);
                        float hueDiff=abs(hA.x-hB.x);
                        if(hueDiff>0.5) hueDiff=1.0-hueDiff;
                        float satDiff=abs(hA.y-hB.y);
                        // If hue or sat differs meaningfully, it's a real cell boundary
                        if(hueDiff>0.02 || satDiff>0.05) isEdge=true;
                    }
                }
            }
            if(isEdge) color=mix(color,uOutlineColor,min(uOutlineWidth,1.0));
        } else {
            // Non-pixelated: full disc sampling
            float hw=uOutlineWidth*0.5;
            float sRad=hw;
            float minD=sRad+2.0;
            vec4 rc=vec4(rawColor,1.0);
            #define C(dir,rad){vec4 ss=texture2D(uSceneTex,snapUV(uv+(dir)*(rad)*px));bool hit=false;if(diffCell(rc,vec4(ss.rgb,1.0))){if(uBandOutline==1){hit=true;}else{vec3 hA=rgb2hsv(rc.rgb),hB=rgb2hsv(ss.rgb);float hd=abs(hA.x-hB.x);if(hd>0.5)hd=1.0-hd;if(hd>0.02||abs(hA.y-hB.y)>0.05)hit=true;}}if(hit)minD=min(minD,rad);}
            C(vec2(1,0),sRad)C(vec2(.924,.383),sRad)C(vec2(.707,.707),sRad)C(vec2(.383,.924),sRad)
            C(vec2(0,1),sRad)C(vec2(-.383,.924),sRad)C(vec2(-.707,.707),sRad)C(vec2(-.924,.383),sRad)
            C(vec2(-1,0),sRad)C(vec2(-.924,-.383),sRad)C(vec2(-.707,-.707),sRad)C(vec2(-.383,-.924),sRad)
            C(vec2(0,-1),sRad)C(vec2(.383,-.924),sRad)C(vec2(.707,-.707),sRad)C(vec2(.924,-.383),sRad)
            float hRad=sRad*0.5;
            C(vec2(.981,.195),hRad)C(vec2(.831,.556),hRad)C(vec2(.556,.831),hRad)C(vec2(.195,.981),hRad)
            C(vec2(-.195,.981),hRad)C(vec2(-.556,.831),hRad)C(vec2(-.831,.556),hRad)C(vec2(-.981,.195),hRad)
            C(vec2(-.981,-.195),hRad)C(vec2(-.831,-.556),hRad)C(vec2(-.556,-.831),hRad)C(vec2(-.195,-.981),hRad)
            C(vec2(.195,-.981),hRad)C(vec2(.556,-.831),hRad)C(vec2(.831,-.556),hRad)C(vec2(.981,-.195),hRad)
            float edge=1.0-smoothstep(hw-0.7,hw+0.7,minD);
            color=mix(color,uOutlineColor,edge);
        }
    }

    /* ── Opacity Pattern Hue Shift ─────────────────────────────── */
    if(uPixelate==1 && uOpPatternCount>0){
        float colorId;
        if(uOpPatternMode==1){
            // By Shape — use cell ID from alpha, groups entire Voronoi cell as one mask
            colorId = scene.a;
        } else {
            // By Color — quantize the rendered pixel color, each unique color is its own mask
            vec3 qc = floor(rawColor * 64.0 + 0.5) / 64.0;
            colorId = fract(qc.r * 0.299 + qc.g * 0.587 + qc.b * 0.114);
        }

        // Hash with seed for randomized but stable pattern assignment
        float hashed = fract(sin(colorId * 78.233 + uOpPatternSeed * 43.17) * 43758.5453);

        // Each unique color gets exactly one pattern — no overlap
        int patIdx = int(floor(hashed * float(uOpPatternCount)));
        if(patIdx >= uOpPatternCount) patIdx = uOpPatternCount - 1;
        if(patIdx < 0) patIdx = 0;

        // Get pattern dimensions
        vec4 dims = uOpPatternDims[0];
        if(patIdx==1) dims = uOpPatternDims[1];
        if(patIdx==2) dims = uOpPatternDims[2];
        if(patIdx==3) dims = uOpPatternDims[3];

        float pCols = dims.x;
        float pRows = dims.y;
        float pHueShift = dims.z;
        float pHueOp = dims.w;

        if(pCols > 0.0 && pRows > 0.0 && pHueOp > 0.0){
            // Tile pattern across the pixelated grid
            float pcol = mod(blk.cell.x, pCols);
            float prow = mod(blk.cell.y, pRows);

            // Sample pattern texture
            float texX = (float(patIdx) * 16.0 + pcol + 0.5) / 64.0;
            float texY = (prow + 0.5) / 16.0;
            float opacity = texture2D(uOpPatternTex, vec2(texX, texY)).r;

            // Apply hue shift based on opacity
            if(opacity > 0.001){
                vec3 hsv = rgb2hsv(color);
                hsv.x = fract(hsv.x + pHueShift * opacity);
                vec3 shifted = hsv2rgb(hsv);
                color = mix(color, shifted, pHueOp * opacity);
            }
        }
    }

    /* ── Layered Oct+Diamond overlay (Generate Diamond + Quadtree) ── */
    // Render from smallest quadtree level to largest.
    // Each level: octagon first, then diamond on top.
    // Larger levels paint over smaller ones.
    if(uPixelate==1 && uWeaveMode==4 && uGenDiamond==1){
        float sz = max(uPixelSize.x, uPixelSize.y);
        vec2 basePx = vec2(floor(sz + 0.5));
        basePx = max(basePx, vec2(1.0));
        int steps = (uQuadEnabled==1 && uQuadSteps > 1) ? uQuadSteps : 1;
        // Snap base so all levels halve to exact integers
        if(steps > 1) basePx = snapQuadBase(basePx, steps);

        // Iterate levels: 0 = smallest, steps-1 = largest (on top)
        for(int lvl = 0; lvl < 5; lvl++) {
            if(lvl >= steps) break;

            // Compute grid size for this level by exact halving
            vec2 lvlPx = basePx;
            int shifts = steps - 1 - lvl;
            for(int s = 0; s < 4; s++) { if(s < shifts) lvlPx = lvlPx * 0.5; }
            vec2 lvlTUV = lvlPx / iResolution;

            // --- Octagon at this level ---
            vec2 octCI = floor(obliqueUV / lvlTUV);
            vec2 octCenter = (octCI + 0.5) * lvlTUV;
            // Only render if scene luminance at this cell maps to this level
            vec2 octSampleUV = clamp(octCenter, vec2(0.001), vec2(0.999));
            float octLum = dot(texture2D(uSceneTex, octSampleUV).rgb, vec3(0.299, 0.587, 0.114));
            int octLvl = int(floor(clamp(octLum, 0.0, 1.0) * float(steps)));
            if(octLvl >= steps) octLvl = steps - 1;
            vec2 octPos = (obliqueUV - octCenter) * iResolution;
            vec2 octHalf = lvlPx * 0.5;
            float octD = octSDF(octPos, octHalf, uShapeMargin) - uShapeBleed;
            if(octD <= 0.0 && octLvl == lvl) {
                vec2 sUV = octCenter;
                if(uOblique==1){
                    vec2 rp = sUV * iResolution; vec2 ct = iResolution * 0.5; vec2 dp = rp - ct;
                    sUV = (ct + vec2(dp.x*0.7071+dp.y*0.7071, -dp.x*0.7071+dp.y*0.7071)) / iResolution;
                }
                sUV = clamp(sUV, vec2(0.001), vec2(0.999));
                vec3 octCol = texture2D(uSceneTex, sUV).rgb;
                // Emboss gradient
                if(uTileGradEnabled==1 && uShapeGradOpacity > 0.0){
                    vec2 onorm = octPos / lvlPx;
                    float gT = gradientT(onorm);
                    gT = clamp(gT, 0.0, 1.0);
                    vec3 gC = texture2D(uShapeGradTex, vec2(gT,0.5)).rgb;
                    octCol = mix(octCol, blendVH(octCol, gC, uEmbossBlendMode, uEmbossHueOff), uShapeGradOpacity);
                }
                color = octCol;
            }

            // --- Diamond at this level (offset grid) ---
            vec2 halfCell = lvlTUV * 0.5;
            vec2 offUV = obliqueUV - halfCell;
            vec2 diCI = floor(offUV / lvlTUV);
            vec2 diCenter = (diCI + 0.5) * lvlTUV + halfCell;
            // Only render diamond if scene luminance at diamond center maps to this level
            vec2 diSampleUV = clamp(diCenter, vec2(0.001), vec2(0.999));
            float diLum = dot(texture2D(uSceneTex, diSampleUV).rgb, vec3(0.299, 0.587, 0.114));
            int diLvl = int(floor(clamp(diLum, 0.0, 1.0) * float(steps)));
            if(diLvl >= steps) diLvl = steps - 1;
            vec2 diaPos = (obliqueUV - diCenter) * iResolution;
            float diaHalf = 0.2929 * lvlPx.x;
            float diaR = diaHalf - uShapeMargin;
            if(diaR > 0.0 && diLvl == lvl){
                float dd = (abs(diaPos.x) + abs(diaPos.y)) / diaR - 1.0 - uShapeBleed;
                if(dd <= 0.0){
                    vec2 sUV = diCenter;
                    if(uOblique==1){
                        vec2 rp = sUV * iResolution; vec2 ct = iResolution * 0.5; vec2 dp = rp - ct;
                        sUV = (ct + vec2(dp.x*0.7071+dp.y*0.7071, -dp.x*0.7071+dp.y*0.7071)) / iResolution;
                    }
                    sUV = clamp(sUV, vec2(0.001), vec2(0.999));
                    vec3 diaCol = texture2D(uSceneTex, sUV).rgb;
                    if(uTileGradEnabled==1 && uShapeGradOpacity > 0.0){
                        vec2 dn = diaPos / vec2(diaHalf);
                        float gT = gradientT(dn * 0.5);
                        gT = clamp(gT, 0.0, 1.0);
                        vec3 gC = texture2D(uShapeGradTex, vec2(gT,0.5)).rgb;
                        diaCol = mix(diaCol, blendVH(diaCol, gC, uEmbossBlendMode, uEmbossHueOff), uShapeGradOpacity);
                    }
                    color = diaCol;
                    isDiamondPixel = true;

                    // ── Inline diamond image pixel (applied immediately per diamond) ──
                    if(uImgPixel2Enabled==1){
                        // posInBlock: normalize diaPos into 0-1 within the diamond bounding box
                        vec2 dpib = diaPos / vec2(diaHalf * 2.0) + 0.5;
                        dpib.y = 1.0 - dpib.y;
                        dpib = vec2(1.0 - dpib.y, dpib.x); // warp rotation

                        // Inner wrapper: 0.66× — texture maps to central 66% of bounding box
                        vec2 dInner = (dpib - 0.5) / 0.66 + 0.5;
                        if(dInner.x > 0.005 && dInner.x < 0.995 && dInner.y > 0.005 && dInner.y < 0.995){
                            float dLum = dot(color, vec3(0.299,0.587,0.114));
                            float dTot = uImgPixel2Cols * uImgPixel2Rows;
                            float dIdx = clamp(floor(dLum*dTot), 0.0, dTot-1.0);
                            float dIC = mod(dIdx, uImgPixel2Cols);
                            float dIR = floor(dIdx / uImgPixel2Cols);
                            float dCW = 1.0/uImgPixel2Cols, dCH = 1.0/uImgPixel2Rows;

                            vec2 dCen = dInner - 0.5;
                            if(uImgPixel2AffectOffset==1) dCen += vec2(mix(uImgPixel2MinOffset,uImgPixel2MaxOffset,dLum));
                            if(uImgPixel2AffectRotate==1){float da=radians(mix(uImgPixel2MinRotate,uImgPixel2MaxRotate,dLum));float dc=cos(da),ds=sin(da);dCen=vec2(dCen.x*dc-dCen.y*ds,dCen.x*ds+dCen.y*dc);}
                            if(uImgPixel2AffectScale==1){float dsc=mix(uImgPixel2MinScale,uImgPixel2MaxScale,dLum);if(abs(dsc)>0.001)dCen/=dsc;}

                            vec2 dSP = clamp(dCen+0.5, 0.0, 1.0);
                            vec2 dIUV = vec2((dIC+dSP.x)*dCW, (dIR+dSP.y)*dCH);
                            dIUV.x = clamp(dIUV.x, dIC*dCW+0.001, (dIC+1.0)*dCW-0.001);
                            dIUV.y = clamp(dIUV.y, dIR*dCH+0.001, (dIR+1.0)*dCH-0.001);

                            vec3 dImgC = texture2D(uImgPixel2Tex, dIUV).rgb;
                            if(uImgPixel2Mask==1){
                                float dMV = dot(dImgC, vec3(0.299,0.587,0.114));
                                color = mix(mix(color,uGapColor,uGapOpacity), color, dMV*uImgPixel2Opacity);
                            } else {
                                color = mix(color, blendVH(color,dImgC,uImgPixel2Blend,uImgPixel2HueOff), uImgPixel2Opacity);
                            }
                        }
                    }
                }
            }
        }
    }

    /* ── Image Pixel: map each pixelated block to an image grid cell by luminance ── */
    // Overlay diamonds (isDiamondPixel) already handled inline above — skip here.
    // getBlock diamonds (isWarp, genDiamond=0) use L2 settings.
    // All other cells use L1.
    bool isDiaCell = blk.isWarp && !isDiamondPixel;
    bool useL2 = uWeaveMode==4 && isDiaCell && uImgPixel2Enabled==1;
    bool useL1 = uImgPixelEnabled==1 && !useL2 && !isDiamondPixel;

    if((useL1 || useL2) && uPixelate==1){
        // Select which set of params to use
        float ipCols   = useL2 ? uImgPixel2Cols    : uImgPixelCols;
        float ipRows   = useL2 ? uImgPixel2Rows    : uImgPixelRows;
        int   ipBlend  = useL2 ? uImgPixel2Blend   : uImgPixelBlend;
        float ipOp     = useL2 ? uImgPixel2Opacity  : uImgPixelOpacity;
        int   ipMask   = useL2 ? uImgPixel2Mask     : uImgPixelMask;
        int   ipAffSc  = useL2 ? uImgPixel2AffectScale  : uImgPixelAffectScale;
        float ipMinSc  = useL2 ? uImgPixel2MinScale     : uImgPixelMinScale;
        float ipMaxSc  = useL2 ? uImgPixel2MaxScale     : uImgPixelMaxScale;
        int   ipAffRot = useL2 ? uImgPixel2AffectRotate : uImgPixelAffectRotate;
        float ipMinRot = useL2 ? uImgPixel2MinRotate    : uImgPixelMinRotate;
        float ipMaxRot = useL2 ? uImgPixel2MaxRotate    : uImgPixelMaxRotate;
        int   ipAffOff = useL2 ? uImgPixel2AffectOffset : uImgPixelAffectOffset;
        float ipMinOff = useL2 ? uImgPixel2MinOffset    : uImgPixelMinOffset;
        float ipMaxOff = useL2 ? uImgPixel2MaxOffset    : uImgPixelMaxOffset;
        float ipHueOff = useL2 ? uImgPixel2HueOff       : uImgPixelHueOff;

        float lum=dot(color,vec3(0.299,0.587,0.114));
        float totalCells=ipCols*ipRows;
        float cellIdx=clamp(floor(lum*totalCells),0.0,totalCells-1.0);
        float imgCol=mod(cellIdx,ipCols);
        float imgRow=floor(cellIdx/ipCols);

        // Compute position within the pixelated block (0→1)
        vec2 ipTilePx = blk.tilePx;
        if(isDiaCell)
            ipTilePx = max(ipTilePx - vec2(uShapeMargin * 2.0), vec2(1.0));
        vec2 tileUV=ipTilePx/iResolution;
        vec2 offset=obliqueUV-blk.uv;
        vec2 posInBlock=offset/tileUV+0.5;
        if(!isDiaCell) posInBlock=clamp(posInBlock,0.001,0.999);
        
        posInBlock.y=1.0-posInBlock.y;
        if(isDiaCell) posInBlock=vec2(1.0-posInBlock.y, posInBlock.x);

        // For getBlock diamond cells: inner 0.66× wrapper
        bool diaTexVisible = true;
        if(isDiaCell){
            vec2 diaInner = (posInBlock - 0.5) / 0.66 + 0.5;
            if(diaInner.x < 0.005 || diaInner.x > 0.995 || diaInner.y < 0.005 || diaInner.y > 0.995){
                diaTexVisible = false;
            } else {
                posInBlock = diaInner;
            }
        }

        if(!diaTexVisible){
            color=mix(color,uGapColor,uGapOpacity);
        } else {
            float cellW=1.0/ipCols;
            float cellH=1.0/ipRows;
            float cellMinX=imgCol*cellW;
            float cellMaxX=(imgCol+1.0)*cellW;
            float cellMinY=imgRow*cellH;
            float cellMaxY=(imgRow+1.0)*cellH;
            
            vec2 centered=posInBlock-0.5;
            
            if(ipAffOff==1){
                float offsetAmount=mix(ipMinOff,ipMaxOff,lum);
                centered+=vec2(offsetAmount);
            }
            if(ipAffRot==1){
                float angleRad=radians(mix(ipMinRot,ipMaxRot,lum));
                float cosA=cos(angleRad); float sinA=sin(angleRad);
                centered=vec2(centered.x*cosA-centered.y*sinA, centered.x*sinA+centered.y*cosA);
            }
            if(ipAffSc==1){
                float scale=mix(ipMinSc,ipMaxSc,lum);
                if(abs(scale)>0.001) centered/=scale;
            }
            
            vec2 scaledPos=clamp(centered+0.5, 0.0, 1.0);
            vec2 imgUV=vec2((imgCol+scaledPos.x)*cellW, (imgRow+scaledPos.y)*cellH);
            imgUV.x=clamp(imgUV.x, cellMinX+0.001, cellMaxX-0.001);
            imgUV.y=clamp(imgUV.y, cellMinY+0.001, cellMaxY-0.001);

            vec3 imgColor = useL2 ? texture2D(uImgPixel2Tex,imgUV).rgb
                                   : texture2D(uImgPixelTex,imgUV).rgb;
            if(ipMask==1){
                float maskVal=dot(imgColor,vec3(0.299,0.587,0.114));
                color=mix(mix(color,uGapColor,uGapOpacity), color, maskVal*ipOp);
            } else {
                vec3 blended=blendVH(color,imgColor,ipBlend,ipHueOff);
                color=mix(color,blended,ipOp);
            }
        }
    }

    /* ── Tile Gradient (after image pixel) ─────────────────────── */
    if(uTileGradEnabled==1 && uPixelate==1 && uShapeGradOpacity>0.0){
        vec2 posInTile2=(obliqueUV-blk.uv)*iResolution;
        vec2 ss=blk.shapePx;
        vec2 norm2 = posInTile2 / ss;
        // isWarp (diamond) cells swap axes so the gradient reads correctly
        if(blk.isWarp) norm2 = vec2(norm2.y, norm2.x);
        float gradT = gradientT(norm2);
        vec3 gCol=texture2D(uShapeGradTex,vec2(gradT,0.5)).rgb;
        color=mix(color,blendVH(color,gCol,uEmbossBlendMode,uEmbossHueOff),uShapeGradOpacity);
    }

    // Dither to break 8-bit banding
    vec2 ditherUV = gl_FragCoord.xy;
    float d1 = fract(sin(dot(ditherUV, vec2(12.9898,78.233))) * 43758.5453);
    float d2 = fract(sin(dot(ditherUV, vec2(63.7264,10.873))) * 43758.5453);
    float dither = (d1 + d2 - 1.0) / 255.0;
    vec3 finalColor = grade(color) + vec3(dither);

    gl_FragColor=vec4(finalColor,1.0);
}
`;

(function() {
  const sceneSrc = FRAGMENT_GLSL_SRC;
  const edgeSrc  = EDGE_GLSL_SRC;

  const vert = compileShader(gl.VERTEX_SHADER, VERT_SRC);
  const sceneFrag = compileShader(gl.FRAGMENT_SHADER, sceneSrc);
  const edgeFrag  = compileShader(gl.FRAGMENT_SHADER, edgeSrc);

  // Build programs immediately so GPU can compile in parallel
  const sceneProg = buildProgram(vert, sceneFrag);
  const edgeProg  = buildProgram(vert, edgeFrag);

  // Blit is tiny — compile inline too
  const blitFS = `precision mediump float; uniform sampler2D uTex; varying vec2 vUV;
    void main(){ gl_FragColor = texture2D(uTex, vUV); }`;
  const blitVS = `attribute vec2 aPos; varying vec2 vUV;
    void main(){ vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0, 1); }`;
  const blitFrag = compileShader(gl.FRAGMENT_SHADER, blitFS);
  const blitVertShader = compileShader(gl.VERTEX_SHADER, blitVS);
  const blitProg = buildProgram(blitVertShader, blitFrag);

  // ── Gaussian blur shader (separable, 9-tap) ──────────────────────
  const BLUR_VS = `attribute vec2 aPos; varying vec2 vUV;
    void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos,0,1); }`;
  const BLUR_FS = `precision mediump float;
    varying vec2 vUV;
    uniform sampler2D uTex;
    uniform vec2 uDir;       // (1/W,0) for H pass, (0,1/H) for V pass
    uniform float uRadius;   // blur radius in pixels
    void main(){
      vec2 uv = vUV;
      // Gaussian weights for 9 taps at spacing=radius/4
      float step = uRadius / 4.0;
      vec4 col = vec4(0.0);
      float wsum = 0.0;
      for(int i=-4; i<=4; i++){
        float off = float(i) * step;
        float w = exp(-0.5 * float(i*i) / 4.0);
        col += texture2D(uTex, uv + uDir * off) * w;
        wsum += w;
      }
      gl_FragColor = col / wsum;
    }`;
  const blurFrag_s  = compileShader(gl.FRAGMENT_SHADER, BLUR_FS);
  const blurProg    = buildProgram(blitVertShader, blurFrag_s);

  // Signal to the HTML overlay that compilation has started
  window._shaderCompiling = true;

  waitForPrograms(
    [sceneProg, edgeProg, blitProg, blurProg],
    [sceneFrag, edgeFrag, vert, blurFrag_s],
    function() {
  const sRes            = gl.getUniformLocation(sceneProg, 'iResolution');
  const sMode           = gl.getUniformLocation(sceneProg, 'uMode');
  const sNumPoints      = gl.getUniformLocation(sceneProg, 'uNumPoints');
  const sSeed           = gl.getUniformLocation(sceneProg, 'uSeed');
  const sRotation       = gl.getUniformLocation(sceneProg, 'uRotation');
  const sDisplace       = gl.getUniformLocation(sceneProg, 'uDisplace');
  const sScale          = gl.getUniformLocation(sceneProg, 'uScale');
  const sMirrorX        = gl.getUniformLocation(sceneProg, 'uMirrorX');
  const sMirrorY        = gl.getUniformLocation(sceneProg, 'uMirrorY');
  const sFlipX          = gl.getUniformLocation(sceneProg, 'uFlipX');
  const sFlipY          = gl.getUniformLocation(sceneProg, 'uFlipY');
  const sShowDots       = gl.getUniformLocation(sceneProg, 'uShowDots');
  const sDotRadius      = gl.getUniformLocation(sceneProg, 'uDotRadius');
  const sSpring         = gl.getUniformLocation(sceneProg, 'uSpring');
  const sBgColor        = gl.getUniformLocation(sceneProg, 'uBgColor');
  const sSnapGrid       = gl.getUniformLocation(sceneProg, 'uSnapGrid');
  const sPreProcess     = gl.getUniformLocation(sceneProg, 'uPreProcess');
  const sCamHue         = gl.getUniformLocation(sceneProg, 'uCamHue');
  const sCamSat         = gl.getUniformLocation(sceneProg, 'uCamSat');
  const sCamVal         = gl.getUniformLocation(sceneProg, 'uCamVal');
  const sCamContrast    = gl.getUniformLocation(sceneProg, 'uCamContrast');
  const sColorSeed      = gl.getUniformLocation(sceneProg, 'uColorSeed');
  const sHueOffset      = gl.getUniformLocation(sceneProg, 'uHueOffset');
  const sHueRadius      = gl.getUniformLocation(sceneProg, 'uHueRadius');
  const sSatSeed        = gl.getUniformLocation(sceneProg, 'uSatSeed');
  const sSatMin         = gl.getUniformLocation(sceneProg, 'uSatMin');
  const sSatMax         = gl.getUniformLocation(sceneProg, 'uSatMax');
  const sBrightSeed     = gl.getUniformLocation(sceneProg, 'uBrightSeed');
  const sValueMin       = gl.getUniformLocation(sceneProg, 'uValueMin');
  const sValueMax       = gl.getUniformLocation(sceneProg, 'uValueMax');
  const sGradientSeed   = gl.getUniformLocation(sceneProg, 'uGradientSeed');
  const sColorMode      = gl.getUniformLocation(sceneProg, 'uColorMode');
  const sColorize       = gl.getUniformLocation(sceneProg, 'uColorize');
  const sGradientTex    = gl.getUniformLocation(sceneProg, 'uGradientTex');
  const sBanding        = gl.getUniformLocation(sceneProg, 'uBanding');
  const sBandAngleMode  = gl.getUniformLocation(sceneProg, 'uBandAngleMode');
  const sBandAngleSeed  = gl.getUniformLocation(sceneProg, 'uBandAngleSeed');
  const sBandRandCount  = gl.getUniformLocation(sceneProg, 'uBandRandCount');
  const sBandRandCountMin = gl.getUniformLocation(sceneProg, 'uBandRandCountMin');
  const sBandRandCountMax = gl.getUniformLocation(sceneProg, 'uBandRandCountMax');
  const sBandRandCountSeed = gl.getUniformLocation(sceneProg, 'uBandRandCountSeed');
  const sBandCount      = gl.getUniformLocation(sceneProg, 'uBandCount');
  const sBandLumMin     = gl.getUniformLocation(sceneProg, 'uBandLumMin');
  const sBandLumMax     = gl.getUniformLocation(sceneProg, 'uBandLumMax');
  const sBandStrength   = gl.getUniformLocation(sceneProg, 'uBandStrength');
  const sBandRandomize  = gl.getUniformLocation(sceneProg, 'uBandRandomize');
  const sBandBlendMode = gl.getUniformLocation(sceneProg, 'uBandBlendMode');
  const sBandHueStrength = gl.getUniformLocation(sceneProg, 'uBandHueStrength');
  const sBandHueRadius = gl.getUniformLocation(sceneProg, 'uBandHueRadius');
  const sBandHueOffset = gl.getUniformLocation(sceneProg, 'uBandHueOffset');
  const sGroupCount     = gl.getUniformLocation(sceneProg, 'uGroupCount');
  const sGroupActive    = Array.from({length:8},(_,g)=>gl.getUniformLocation(sceneProg,`uGroupActive[${g}]`));
  const sGroupDisplace  = Array.from({length:8},(_,g)=>gl.getUniformLocation(sceneProg,`uGroupDisplace[${g}]`));
  const sGroupThreshold = Array.from({length:8},(_,g)=>gl.getUniformLocation(sceneProg,`uGroupThreshold[${g}]`));
  const sGroupSeed      = Array.from({length:8},(_,g)=>gl.getUniformLocation(sceneProg,`uGroupSeed[${g}]`));
  const sGroupScale     = Array.from({length:8},(_,g)=>gl.getUniformLocation(sceneProg,`uGroupScale[${g}]`));

  // Noise + image source uniforms
  const sNoiseType      = gl.getUniformLocation(sceneProg, 'uNoiseType');
  const sNoiseElementSize = gl.getUniformLocation(sceneProg, 'uNoiseElementSize');
  const sNoiseOffsetX   = gl.getUniformLocation(sceneProg, 'uNoiseOffsetX');
  const sNoiseOffsetY   = gl.getUniformLocation(sceneProg, 'uNoiseOffsetY');
  const sNoiseOctaves   = gl.getUniformLocation(sceneProg, 'uNoiseOctaves');
  const sNoiseLacunarity = gl.getUniformLocation(sceneProg, 'uNoiseLacunarity');
  const sNoiseRoughness = gl.getUniformLocation(sceneProg, 'uNoiseRoughness');
  const sSourceMode     = gl.getUniformLocation(sceneProg, 'uSourceMode');
  const sImageTex       = gl.getUniformLocation(sceneProg, 'uImageTex');
  const sImageScale     = gl.getUniformLocation(sceneProg, 'uImageScale');
  const sImageAspect    = gl.getUniformLocation(sceneProg, 'uImageAspect');

  // Flow mode uniforms
  const sFlowTime      = gl.getUniformLocation(sceneProg, 'iTime');
  const sFlowType      = gl.getUniformLocation(sceneProg, 'uFlowType');
  const sFlow1Style    = gl.getUniformLocation(sceneProg, 'uFlow1Style');
  const sFlowHueOffset = gl.getUniformLocation(sceneProg, 'uFlowHueOffset');
  const sFlowHueRadius = gl.getUniformLocation(sceneProg, 'uFlowHueRadius');
  const sFlowHueEnabled = gl.getUniformLocation(sceneProg, 'uFlowHueEnabled');
  const sF2HueOffset  = gl.getUniformLocation(sceneProg, 'uF2HueOffset');
  const sF2HueRadius  = gl.getUniformLocation(sceneProg, 'uF2HueRadius');
  const sF2HueEnabled = gl.getUniformLocation(sceneProg, 'uF2HueEnabled');
  const sFlowScale     = gl.getUniformLocation(sceneProg, 'uFlowScale');
  const sFlowSpeed     = gl.getUniformLocation(sceneProg, 'uFlowSpeed');
  const sFlowDistort1  = gl.getUniformLocation(sceneProg, 'uFlowDistort1');
  const sFlowDistort2  = gl.getUniformLocation(sceneProg, 'uFlowDistort2');
  const sFlowSmoothLo  = gl.getUniformLocation(sceneProg, 'uFlowSmoothLo');
  const sFlowSmoothHi  = gl.getUniformLocation(sceneProg, 'uFlowSmoothHi');
  // Flow 2 uniforms
  const sF2Scale       = gl.getUniformLocation(sceneProg, 'uF2Scale');
  const sF2VelX        = gl.getUniformLocation(sceneProg, 'uF2VelX');
  const sF2VelY        = gl.getUniformLocation(sceneProg, 'uF2VelY');
  const sF2Speed       = gl.getUniformLocation(sceneProg, 'uF2Speed');
  const sF2Detail      = gl.getUniformLocation(sceneProg, 'uF2Detail');
  const sF2Twist       = gl.getUniformLocation(sceneProg, 'uF2Twist');
  const sF2Iter1       = gl.getUniformLocation(sceneProg, 'uF2Iter1');
  const sF2Iter2       = gl.getUniformLocation(sceneProg, 'uF2Iter2');
  const sF2Mode        = gl.getUniformLocation(sceneProg, 'uF2Mode');

  // Image source texture
  let imageSrcTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, imageSrcTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128,128,128,255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  window.uploadImageSourceTex = function(img) {
    gl.bindTexture(gl.TEXTURE_2D, imageSrcTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    // Store dimensions for canvas sizing
    window._imageSrcWidth = img.naturalWidth || img.width;
    window._imageSrcHeight = img.naturalHeight || img.height;
    window.shaderDirty = true;
  };

  const eRes          = gl.getUniformLocation(edgeProg, 'iResolution');
  const eSceneTex     = gl.getUniformLocation(edgeProg, 'uSceneTex');
  const eOutlineWidth = gl.getUniformLocation(edgeProg, 'uOutlineWidth');
  const eOutlineColor = gl.getUniformLocation(edgeProg, 'uOutlineColor');
  const ePixelate     = gl.getUniformLocation(edgeProg, 'uPixelate');
  const ePixelSize    = gl.getUniformLocation(edgeProg, 'uPixelSize');
  const eWeaveMode    = gl.getUniformLocation(edgeProg, 'uWeaveMode');
  const ePixelShape   = gl.getUniformLocation(edgeProg, 'uPixelShape');
  const eShapeMargin  = gl.getUniformLocation(edgeProg, 'uShapeMargin');
  const eShapeBleed   = gl.getUniformLocation(edgeProg, 'uShapeBleed');
  const ePixelScale   = gl.getUniformLocation(edgeProg, 'uPixelScale');
  const eShapeScale   = gl.getUniformLocation(edgeProg, 'uShapeScale');
  const eForceSquare  = gl.getUniformLocation(edgeProg, 'uForceSquare');
  const eMaintainThickness = gl.getUniformLocation(edgeProg, 'uMaintainThickness');
  const eOblique      = gl.getUniformLocation(edgeProg, 'uOblique');
  const eBandOutline  = gl.getUniformLocation(edgeProg, 'uBandOutline');
  const eQuadSteps    = gl.getUniformLocation(edgeProg, 'uQuadSteps');
  const eQuadEnabled  = gl.getUniformLocation(edgeProg, 'uQuadEnabled');
  const eGenDiamond   = gl.getUniformLocation(edgeProg, 'uGenDiamond');
  const eShapeGradTex = gl.getUniformLocation(edgeProg, 'uShapeGradTex');
  const eShapeGradOpacity = gl.getUniformLocation(edgeProg, 'uShapeGradOpacity');
  const eShapeGradDir = gl.getUniformLocation(edgeProg, 'uShapeGradDir');
  const eTileGradEnabled = gl.getUniformLocation(edgeProg, 'uTileGradEnabled');
  const eRadialCenter = gl.getUniformLocation(edgeProg, 'uRadialCenter');
  const eRadialScale  = gl.getUniformLocation(edgeProg, 'uRadialScale');
  const eEmbossBlendMode = gl.getUniformLocation(edgeProg, 'uEmbossBlendMode');
  const eGapColor     = gl.getUniformLocation(edgeProg, 'uGapColor');
  const eGapOpacity   = gl.getUniformLocation(edgeProg, 'uGapOpacity');
  const eBanding      = gl.getUniformLocation(edgeProg, 'uBanding');
  const eBandCount    = gl.getUniformLocation(edgeProg, 'uBandCount');
  const eBandLumMin   = gl.getUniformLocation(edgeProg, 'uBandLumMin');
  const eBandLumMax   = gl.getUniformLocation(edgeProg, 'uBandLumMax');
  const eBandStrength = gl.getUniformLocation(edgeProg, 'uBandStrength');
  const eBandRandomize= gl.getUniformLocation(edgeProg, 'uBandRandomize');
  const eEmbossHueOff    = gl.getUniformLocation(edgeProg, 'uEmbossHueOff');
  const eImgPixelHueOff  = gl.getUniformLocation(edgeProg, 'uImgPixelHueOff');
  const eImgPixel2HueOff = gl.getUniformLocation(edgeProg, 'uImgPixel2HueOff');
  const eGradeHue     = gl.getUniformLocation(edgeProg, 'uGradeHue');
  const eGradeSat     = gl.getUniformLocation(edgeProg, 'uGradeSat');
  const eGradeVal     = gl.getUniformLocation(edgeProg, 'uGradeVal');
  const eGradeContrast= gl.getUniformLocation(edgeProg, 'uGradeContrast');
  const ePostProcess  = gl.getUniformLocation(edgeProg, 'uPostProcess');
  const eOpPatternCount = gl.getUniformLocation(edgeProg, 'uOpPatternCount');
  const eOpPatternTex = gl.getUniformLocation(edgeProg, 'uOpPatternTex');
  const eOpPatternDims = [];
  for (let i = 0; i < 4; i++) eOpPatternDims.push(gl.getUniformLocation(edgeProg, 'uOpPatternDims['+i+']'));
  const eOpPatternSeed = gl.getUniformLocation(edgeProg, 'uOpPatternSeed');
  const eOpPatternMode = gl.getUniformLocation(edgeProg, 'uOpPatternMode');

  // Opacity pattern texture: 64x16, R channel only (LUMINANCE)
  let opPatternTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, opPatternTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 64, 16, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  window.uploadOpPatterns = function(patterns) {
    const data = new Uint8Array(64 * 16);
    if (patterns) {
      patterns.forEach((pat, idx) => {
        if (idx >= 4 || !pat.grid) return;
        const rows = pat.grid;
        for (let r = 0; r < rows.length && r < 16; r++) {
          for (let c = 0; c < rows[r].length && c < 16; c++) {
            data[(r * 64) + (idx * 16) + c] = Math.round(Math.max(0, Math.min(1, rows[r][c])) * 255);
          }
        }
      });
    }
    gl.bindTexture(gl.TEXTURE_2D, opPatternTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 64, 16, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
  };

  // Image Pixel uniform locations
  const eImgPixelEnabled = gl.getUniformLocation(edgeProg, 'uImgPixelEnabled');
  const eImgPixelTex     = gl.getUniformLocation(edgeProg, 'uImgPixelTex');
  const eImgPixelCols    = gl.getUniformLocation(edgeProg, 'uImgPixelCols');
  const eImgPixelRows    = gl.getUniformLocation(edgeProg, 'uImgPixelRows');
  const eImgPixelBlend   = gl.getUniformLocation(edgeProg, 'uImgPixelBlend');
  const eImgPixelOpacity = gl.getUniformLocation(edgeProg, 'uImgPixelOpacity');
  const eImgPixelAffectScale = gl.getUniformLocation(edgeProg, 'uImgPixelAffectScale');
  const eImgPixelMinScale = gl.getUniformLocation(edgeProg, 'uImgPixelMinScale');
  const eImgPixelMaxScale = gl.getUniformLocation(edgeProg, 'uImgPixelMaxScale');
  const eImgPixelAffectRotate = gl.getUniformLocation(edgeProg, 'uImgPixelAffectRotate');
  const eImgPixelMinRotate = gl.getUniformLocation(edgeProg, 'uImgPixelMinRotate');
  const eImgPixelMaxRotate = gl.getUniformLocation(edgeProg, 'uImgPixelMaxRotate');
  const eImgPixelAffectOffset = gl.getUniformLocation(edgeProg, 'uImgPixelAffectOffset');
  const eImgPixelMinOffset = gl.getUniformLocation(edgeProg, 'uImgPixelMinOffset');
  const eImgPixelMaxOffset = gl.getUniformLocation(edgeProg, 'uImgPixelMaxOffset');
  const eImgPixelMask = gl.getUniformLocation(edgeProg, 'uImgPixelMask');

  // Layer 2 image pixel (Oct diamond)
  const eImgPixel2Enabled = gl.getUniformLocation(edgeProg, 'uImgPixel2Enabled');
  const eImgPixel2Tex     = gl.getUniformLocation(edgeProg, 'uImgPixel2Tex');
  const eImgPixel2Cols    = gl.getUniformLocation(edgeProg, 'uImgPixel2Cols');
  const eImgPixel2Rows    = gl.getUniformLocation(edgeProg, 'uImgPixel2Rows');
  const eImgPixel2Blend   = gl.getUniformLocation(edgeProg, 'uImgPixel2Blend');
  const eImgPixel2Opacity = gl.getUniformLocation(edgeProg, 'uImgPixel2Opacity');
  const eImgPixel2AffectScale  = gl.getUniformLocation(edgeProg, 'uImgPixel2AffectScale');
  const eImgPixel2MinScale     = gl.getUniformLocation(edgeProg, 'uImgPixel2MinScale');
  const eImgPixel2MaxScale     = gl.getUniformLocation(edgeProg, 'uImgPixel2MaxScale');
  const eImgPixel2AffectRotate = gl.getUniformLocation(edgeProg, 'uImgPixel2AffectRotate');
  const eImgPixel2MinRotate    = gl.getUniformLocation(edgeProg, 'uImgPixel2MinRotate');
  const eImgPixel2MaxRotate    = gl.getUniformLocation(edgeProg, 'uImgPixel2MaxRotate');
  const eImgPixel2AffectOffset = gl.getUniformLocation(edgeProg, 'uImgPixel2AffectOffset');
  const eImgPixel2MinOffset    = gl.getUniformLocation(edgeProg, 'uImgPixel2MinOffset');
  const eImgPixel2MaxOffset    = gl.getUniformLocation(edgeProg, 'uImgPixel2MaxOffset');
  const eImgPixel2Mask         = gl.getUniformLocation(edgeProg, 'uImgPixel2Mask');

  // Image Pixel texture
  let imgPixelTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, imgPixelTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  window.uploadImgPixelTex = function(img) {
    gl.bindTexture(gl.TEXTURE_2D, imgPixelTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    window.shaderDirty = true;
    // Upload to every instance slot so all instances share the default tile
    const insts = (window.shaderParams && window.shaderParams.pixelateInstances) || [];
    const n = Math.max(insts.length, 1);
    for (let i = 0; i < n; i++) {
      const t = getImgPixelTex(i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    // Store the image so newly-added instances can pick it up
    window._defaultImgPixelImage = img;
  };

  window.uploadInstanceImgPixelTex = function(idx, img) {
    const t = getImgPixelTex(idx);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    window.shaderDirty = true;
  };

  window.uploadInstanceImgPixel2Tex = function(idx, img) {
    const t = getImgPixel2Tex(idx);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    window.shaderDirty = true;
  };

  // Flush any texture uploads that arrived before GL was ready
  if (window._texUploadQueue && window._texUploadQueue.length) {
    window._texUploadQueue.forEach(function(item) {
      if (typeof window[item.fn] === 'function') {
        window[item.fn](...item.args);
        window.shaderDirty = true;
      }
    });
    window._texUploadQueue = [];
  }

  // ── Blit uniform location (program built above) ──
  const blitTex = gl.getUniformLocation(blitProg, 'uTex');

  // Blur uniform locations
  const blurTex_u  = gl.getUniformLocation(blurProg, 'uTex');
  const blurDir    = gl.getUniformLocation(blurProg, 'uDir');
  const blurRadius = gl.getUniformLocation(blurProg, 'uRadius');

  // Helper: run one separable blur pass
  function doBlurPass(srcTex, dstFbo, dx, dy, radius, W, H) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
    gl.viewport(0, 0, W, H);
    gl.useProgram(blurProg);
    bindQuad(blurProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(blurTex_u, 0);
    gl.uniform2f(blurDir, dx, dy);
    gl.uniform1f(blurRadius, radius);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function blitToScreen(texture, W, H) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(blitProg);
    bindQuad(blitProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(blitTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  rebuildFBO();
  rebuildInstanceFBOs();
  createGradientTex();
  createShapeGradTex();

  if (window.shaderParams && window.shaderParams.gradientStops) {
    window.uploadGradient(window.shaderParams.gradientStops);
  }
  if (window.shaderParams && window.shaderParams.shapeGradStops) {
    window.uploadShapeGradient(window.shaderParams.shapeGradStops);
  }

  // ── Pan (mouse + single-finger touch) ──
  let isPanning = false, panStartPx = {x:0,y:0}, panStartDxy = {x:0,y:0};
  function panStart(cx,cy) {
    isPanning    = true;
    panStartPx   = {x:cx, y:cy};
    panStartDxy  = {x:window.shaderParams.dx, y:window.shaderParams.dy};
  }
  function panMove(cx,cy) {
    if (!isPanning) return;
    const aspect = canvas.width / canvas.height;
    window.shaderParams.dx = panStartDxy.x + (cx - panStartPx.x) / canvas.width  * (aspect >= 1 ? aspect : 1);
    window.shaderParams.dy = panStartDxy.y - (cy - panStartPx.y) / canvas.height * (aspect <  1 ? 1/aspect : 1);
    window.shaderDirty = true;
  }
  function panEnd() { isPanning = false; }

  canvas.addEventListener('mousedown',  e => panStart(e.clientX, e.clientY));
  window.addEventListener('mousemove',  e => panMove(e.clientX, e.clientY));
  window.addEventListener('mouseup',    panEnd);

  // ── Touch: 1-finger pan, 2-finger rotate + pinch zoom ──
  let touches = {};
  let pinchStartAngle = null, pinchStartRot = 0;
  let pinchStartDist = null, pinchStartSx = 1, pinchStartSy = 1, pinchStartScale = 1;

  function pinchDist(t0, t1) {
    const dx = t1.x - t0.x, dy = t1.y - t0.y;
    return Math.sqrt(dx*dx + dy*dy);
  }

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) touches[t.identifier] = {x: t.clientX, y: t.clientY};

    const ids = Object.keys(touches);
    if (ids.length === 1) {
      panStart(e.touches[0].clientX, e.touches[0].clientY);
      pinchStartAngle = null;
      pinchStartDist = null;
    } else if (ids.length >= 2) {
      isPanning = false;
      const t0 = touches[ids[0]], t1 = touches[ids[1]];
      pinchStartAngle = Math.atan2(t1.y - t0.y, t1.x - t0.x);
      pinchStartRot = window.shaderParams.rot;
      pinchStartDist = pinchDist(t0, t1);
      pinchStartSx = window.shaderParams.sx;
      pinchStartSy = window.shaderParams.sy;
      // For flow mode — capture the active scale parameter
      if (window.shaderParams.mode === 4) {
        pinchStartScale = window.shaderParams.flowType === 1
          ? (window.shaderParams.f2Scale != null ? window.shaderParams.f2Scale : 6)
          : (window.shaderParams.flowScale != null ? window.shaderParams.flowScale : 2);
      }
    }
  }, {passive: false});

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) touches[t.identifier] = {x: t.clientX, y: t.clientY};

    const ids = Object.keys(touches);
    if (ids.length >= 2 && pinchStartAngle !== null) {
      const t0 = touches[ids[0]], t1 = touches[ids[1]];

      // Rotate
      const angle = Math.atan2(t1.y - t0.y, t1.x - t0.x);
      let delta = (angle - pinchStartAngle) * (180 / Math.PI);
      window.shaderParams.rot = ((pinchStartRot + delta) % 360 + 360) % 360;
      const rotSlider = document.getElementById('sRot');
      if (rotSlider) rotSlider.value = window.shaderParams.rot;
      const rotLabel = document.getElementById('vRot');
      if (rotLabel) { if (rotLabel.tagName==='INPUT') rotLabel.value = Math.round(window.shaderParams.rot); else rotLabel.textContent = Math.round(window.shaderParams.rot) + '°'; }

      // Pinch zoom
      if (pinchStartDist !== null && pinchStartDist > 10) {
        const dist = pinchDist(t0, t1);
        const ratio = dist / pinchStartDist;

        if (window.shaderParams.mode === 4) {
          // Flow mode: drive flowScale (flow1) or f2Scale (flow2)
          const isF2 = window.shaderParams.flowType === 1;
          const scaleKey = isF2 ? 'f2Scale' : 'flowScale';
          const slid = isF2 ? 'sF2Scale' : 'sFlowScale';
          const labl = isF2 ? 'vF2Scale' : 'vFlowScale';
          const minS = isF2 ? 1 : 0.1;
          const maxS = isF2 ? 20 : 8;
          const newScale = Math.max(minS, Math.min(maxS, pinchStartScale * ratio));
          window.shaderParams[scaleKey] = newScale;
          const sl = document.getElementById(slid);
          if (sl) sl.value = newScale;
          const lb = document.getElementById(labl);
          if (lb) { if (lb.tagName === 'INPUT') lb.value = newScale.toFixed(2); else lb.textContent = newScale.toFixed(2); }
        } else {
          // Voronoi/noise mode: drive sx/sy
          const newSx = Math.max(0.1, Math.min(5, pinchStartSx * ratio));
          const newSy = Math.max(0.1, Math.min(5, pinchStartSy * ratio));
          window.shaderParams.sx = newSx;
          window.shaderParams.sy = newSy;
          const sxSlider = document.getElementById('sSx');
          if (sxSlider) sxSlider.value = newSx;
          const sxLabel = document.getElementById('vSx');
          if (sxLabel) { if (sxLabel.tagName==='INPUT') sxLabel.value = newSx.toFixed(2); else sxLabel.textContent = newSx.toFixed(2); }
          const sySlider = document.getElementById('sSy');
          if (sySlider) sySlider.value = newSy;
          const syLabel = document.getElementById('vSy');
          if (syLabel) { if (syLabel.tagName==='INPUT') syLabel.value = newSy.toFixed(2); else syLabel.textContent = newSy.toFixed(2); }
        }
      }

      window.shaderDirty = true;
    } else if (ids.length === 1) {
      panMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, {passive: false});

  canvas.addEventListener('touchend', e => {
    for (const t of e.changedTouches) delete touches[t.identifier];
    if (Object.keys(touches).length < 2) { pinchStartAngle = null; pinchStartDist = null; }
    if (Object.keys(touches).length === 0) panEnd();
  });
  canvas.addEventListener('touchcancel', e => {
    for (const t of e.changedTouches) delete touches[t.identifier];
    if (Object.keys(touches).length < 2) { pinchStartAngle = null; pinchStartDist = null; }
    if (Object.keys(touches).length === 0) panEnd();
  });

  // ── Simple continuous render loop with dirty-flag skip ──
  let lastRenderTime = 0;
  let frameCount = 0;
  window.shaderDirty = true;
  window._flowTime = 0;
  let flowTime = 0;
  let flowLastMs = 0;

  function render(now) {
    requestAnimationFrame(render);
    frameCount++;

    // Check if fast mode changed — force resize to update resolution
    const p = window.shaderParams;
    const resDivisor = isFast() ? (p.renderRes || 2) : 1;

    // Check if any enabled instance wants override resolution
    const hasOverride = isFast() && p.pixelate && p.pixelateInstances &&
      p.pixelateInstances.some(function(inst) { return inst.enabled !== false && inst.overrideResolution; });

    // Canvas at full resolution when override is active, else reduced by fast mode
    const wantScale = hasOverride ? 1.0 : (1.0 / resDivisor);
    if (wantScale !== currentRenderScale) {
      currentRenderScale = wantScale;
      curW = 0; curH = 0;
    }

    // resize check
    const resized = syncSize();
    if (resized) gl.viewport(0, 0, canvas.width, canvas.height);

    // Scene FBO dimensions: always reduced in fast mode even when canvas is full
    const newSceneW = hasOverride ? Math.max(1, (canvas.width / resDivisor) | 0) : canvas.width;
    const newSceneH = hasOverride ? Math.max(1, (canvas.height / resDivisor) | 0) : canvas.height;
    if (resized || newSceneW !== sceneW || newSceneH !== sceneH) {
      sceneW = newSceneW;
      sceneH = newSceneH;
      rebuildFBO();
      rebuildInstanceFBOs();
      window.shaderDirty = true;
    }

    // animation — update rotation at target FPS cadence
    if (p.animating) {
      const targetFps = p.fps || 30;
      const frameInterval = 1000.0 / targetFps;
      if (lastRenderTime === 0 || (now - lastRenderTime) >= frameInterval) {
        // Fixed rotation step per target frame
        const fixedDt = 1.0 / targetFps;
        if (lastRenderTime > 0) {
          p.rot = (p.rot + p.animSpeed * fixedDt) % 360;
          const slider = document.getElementById('sRot');
          if (slider) slider.value = p.rot;
          const label = document.getElementById('vRot');
          if (label) { if (label.tagName==='INPUT') label.value = Math.round(p.rot); else label.textContent = Math.round(p.rot) + '°'; }
        }
        lastRenderTime = now;
        window.shaderDirty = true;
      }

      // Flow time — advance every frame using real elapsed time * flowSpeed
      if (p.mode === 4) {
        if (flowLastMs > 0) {
          const realDt = (now - flowLastMs) * 0.001; // ms → seconds
          flowTime += realDt * (p.flowSpeed != null ? p.flowSpeed : 1.0);
        }
        flowLastMs = now;
        window._flowTime = flowTime;
        window.shaderDirty = true;
      }
    } else {
      // When not animating, allow recording to drive flowTime externally
      if (window._flowTimeOverride != null) {
        flowTime = window._flowTimeOverride;
        window._flowTimeOverride = null;
        window.shaderDirty = true;
      }
      lastRenderTime = 0;
      flowLastMs = 0;
    }

    if (!window.shaderDirty) return;
    window.shaderDirty = false;
    const W = canvas.width;
    const H = canvas.height;

    // Apply background color as clear color
    const bgc = hexToRgb01((p.bgColor && p.bgColor.length === 7) ? p.bgColor : '#000000');
    gl.clearColor(bgc[0], bgc[1], bgc[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // --- pass 1: scene → FBO ---
    const isCamera = p.source === 'camera' && window.cameraVideo && window.cameraVideo.readyState >= 2;

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, sceneW, sceneH);

    if (isCamera) {
      // Upload video to a separate camera texture
      if (!window._camTex) {
        window._camTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, window._camTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.bindTexture(gl.TEXTURE_2D, window._camTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, window.cameraVideo);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

      // Compile camera shader on first use
      if (!window._camProg) {
        const camVS = `attribute vec2 a_pos;varying vec2 vUV;void main(){vUV=a_pos*0.5+0.5;gl_Position=vec4(a_pos,0,1);}`;
        const camFS = `precision highp float;
          uniform sampler2D uCamTex;
          uniform sampler2D uGradTex;
          uniform vec2 uCanvasSize;
          uniform vec2 uVideoSize;
          uniform int uColorMode;
          uniform int uColorize;
          uniform float uCamHue;
          uniform float uCamSat;
          uniform float uCamVal;
          uniform float uCamContrast;
          uniform int uPreProcess;
          uniform float uHueOffset;
          uniform float uHueRadius;
          uniform float uColorSeed;
          uniform float uSatSeed;
          uniform float uSatMin;
          uniform float uSatMax;
          uniform float uBrightSeed;
          uniform float uValueMin;
          uniform float uValueMax;
          varying vec2 vUV;
          float hash(float n){return fract(sin(n)*43758.5453123);}
          vec3 rgb2hsv(vec3 c){float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b)),d=mx-mn,h=0.0;
            if(d>1e-4){if(mx==c.r)h=(c.g-c.b)/d+(c.g<c.b?6.0:0.0);else if(mx==c.g)h=(c.b-c.r)/d+2.0;else h=(c.r-c.g)/d+4.0;h/=6.0;}
            return vec3(clamp(h,0.0,1.0),mx>1e-4?d/mx:0.0,mx);}
          vec3 hsv2rgb(vec3 c){float h=fract(c.x)*6.0,s=c.y,v=c.z,f=fract(h),p=v*(1.0-s),q=v*(1.0-s*f),t=v*(1.0-s*(1.0-f));
            int hi=int(floor(h));if(hi>=6)hi=0;
            if(hi==0)return vec3(v,t,p);if(hi==1)return vec3(q,v,p);if(hi==2)return vec3(p,v,t);
            if(hi==3)return vec3(p,q,v);if(hi==4)return vec3(t,p,v);return vec3(v,p,q);}
          void main(){
            float canvasAR=uCanvasSize.x/uCanvasSize.y;
            float videoAR=uVideoSize.x/uVideoSize.y;
            vec2 uv=vUV;
            if(videoAR>canvasAR){
              float scale=canvasAR/videoAR;
              uv.x=uv.x*scale+(1.0-scale)*0.5;
            } else {
              float scale=videoAR/canvasAR;
              uv.y=uv.y*scale+(1.0-scale)*0.5;
            }
            vec4 cam=texture2D(uCamTex,uv);
            vec3 col=cam.rgb;
            // Pre-process: apply before any color mapping
            if(uPreProcess==1){
              vec3 hsv=rgb2hsv(col);
              hsv.x=fract(hsv.x+uCamHue/360.0);
              hsv.y=clamp(hsv.y*uCamSat,0.0,1.0);
              hsv.z=clamp(hsv.z*uCamVal,0.0,1.0);
              col=hsv2rgb(hsv);
              col=clamp((col-0.5)*uCamContrast+0.5,0.0,1.0);
            }
            // Colorize
            if(uColorize==1){
              float lum=dot(col,vec3(0.299,0.587,0.114));
              if(uColorMode==0){
                // Gradient mode: map luminance through gradient texture
                col=texture2D(uGradTex,vec2(lum,0.5)).rgb;
              } else {
                // Hue mode: per-pixel hue from original hue, offset/radius, sat/bright
                vec3 origHSV=rgb2hsv(col);
                float h=fract(origHSV.x*uHueRadius+uHueOffset);
                // Saturation
                float sat=mix(uSatMin,uSatMax,0.5);
                if(uSatSeed>0.0){
                  float sr=hash(floor(origHSV.x*360.0)*13.37+uSatSeed*41.3+5.7);
                  sat=mix(uSatMin,uSatMax,sr);
                }
                // Brightness from luminance mapped into valueMin..valueMax
                float val=mix(uValueMin,uValueMax,lum);
                if(uBrightSeed>0.0){
                  float br=hash(floor(lum*100.0)*7.31+uBrightSeed*53.7+2.9);
                  val=mix(uValueMin,uValueMax,lum*br);
                }
                col=hsv2rgb(vec3(h,sat,val));
              }
            }
            gl_FragColor=vec4(col,1.0);
          }`;
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, camVS); gl.compileShader(vs);
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, camFS); gl.compileShader(fs);
        window._camProg = gl.createProgram();
        gl.attachShader(window._camProg, vs);
        gl.attachShader(window._camProg, fs);
        gl.linkProgram(window._camProg);
        window._camLocs = {
          camTex: gl.getUniformLocation(window._camProg, 'uCamTex'),
          gradTex: gl.getUniformLocation(window._camProg, 'uGradTex'),
          canvasSize: gl.getUniformLocation(window._camProg, 'uCanvasSize'),
          videoSize: gl.getUniformLocation(window._camProg, 'uVideoSize'),
          colorMode: gl.getUniformLocation(window._camProg, 'uColorMode'),
          colorize: gl.getUniformLocation(window._camProg, 'uColorize'),
          preProcess: gl.getUniformLocation(window._camProg, 'uPreProcess'),
          camHue: gl.getUniformLocation(window._camProg, 'uCamHue'),
          camSat: gl.getUniformLocation(window._camProg, 'uCamSat'),
          camVal: gl.getUniformLocation(window._camProg, 'uCamVal'),
          camContrast: gl.getUniformLocation(window._camProg, 'uCamContrast'),
          hueOffset: gl.getUniformLocation(window._camProg, 'uHueOffset'),
          hueRadius: gl.getUniformLocation(window._camProg, 'uHueRadius'),
          colorSeed: gl.getUniformLocation(window._camProg, 'uColorSeed'),
          satSeed: gl.getUniformLocation(window._camProg, 'uSatSeed'),
          satMin: gl.getUniformLocation(window._camProg, 'uSatMin'),
          satMax: gl.getUniformLocation(window._camProg, 'uSatMax'),
          brightSeed: gl.getUniformLocation(window._camProg, 'uBrightSeed'),
          valueMin: gl.getUniformLocation(window._camProg, 'uValueMin'),
          valueMax: gl.getUniformLocation(window._camProg, 'uValueMax')
        };
      }

      gl.useProgram(window._camProg);
      bindQuad(window._camProg);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, window._camTex);
      gl.uniform1i(window._camLocs.camTex, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, gradientTex);
      gl.uniform1i(window._camLocs.gradTex, 1);

      const vid = window.cameraVideo;
      gl.uniform2f(window._camLocs.canvasSize, sceneW, sceneH);
      gl.uniform2f(window._camLocs.videoSize, vid.videoWidth || sceneW, vid.videoHeight || sceneH);
      gl.uniform1i(window._camLocs.colorMode, p.colorMode);
      gl.uniform1i(window._camLocs.colorize, p.colorize !== false ? 1 : 0);
      gl.uniform1i(window._camLocs.preProcess, p.preProcess ? 1 : 0);
      gl.uniform1f(window._camLocs.camHue, p.camHue || 0);
      gl.uniform1f(window._camLocs.camSat, p.camSat != null ? p.camSat : 1);
      gl.uniform1f(window._camLocs.camVal, p.camVal != null ? p.camVal : 1);
      gl.uniform1f(window._camLocs.camContrast, p.camContrast != null ? p.camContrast : 1);
      gl.uniform1f(window._camLocs.hueOffset, p.hueOffset || 0);
      gl.uniform1f(window._camLocs.hueRadius, p.hueRadius != null ? p.hueRadius : 1);
      gl.uniform1f(window._camLocs.colorSeed, p.colorSeed || 0);
      gl.uniform1f(window._camLocs.satSeed, p.satSeed || 0);
      gl.uniform1f(window._camLocs.satMin, p.satMin != null ? p.satMin : 0);
      gl.uniform1f(window._camLocs.satMax, p.satMax != null ? p.satMax : 1);
      gl.uniform1f(window._camLocs.brightSeed, p.brightSeed || 0);
      gl.uniform1f(window._camLocs.valueMin, p.valueMin != null ? p.valueMin : 0.75);
      gl.uniform1f(window._camLocs.valueMax, p.valueMax != null ? p.valueMax : 1.0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Keep rendering continuously for live video
      window.shaderDirty = true;
    } else {
      // Voronoi mode: render scene shader to FBO
      gl.useProgram(sceneProg);
      bindQuad(sceneProg);

      gl.uniform2f(sRes,       sceneW, sceneH);
      gl.uniform1i(sMode,      p.mode);
      gl.uniform1f(sSeed,      p.seed);
      gl.uniform1f(sRotation,  p.rot * Math.PI / 180.0);
      gl.uniform2f(sDisplace,  p.dx, p.dy);
      gl.uniform2f(sScale,     p.sx, p.sy);
      gl.uniform1i(sMirrorX,   p.mirrorX);
      gl.uniform1i(sMirrorY,   p.mirrorY);
      gl.uniform1i(sFlipX,     p.flipX);
      gl.uniform1i(sFlipY,     p.flipY);
      gl.uniform1i(sShowDots,  p.showDots ? 1 : 0);
      gl.uniform1f(sDotRadius, p.dotRadius || 0.008);
      gl.uniform1f(sSpring,    p.spring);
      const bgc = hexToRgb01(p.bgColor || '#000000');
      gl.uniform3f(sBgColor, bgc[0], bgc[1], bgc[2]);
      gl.uniform1f(sSnapGrid,  p.snapGrid ? p.gridUnit : 0);
      gl.uniform1i(sPreProcess, p.preProcess ? 1 : 0);
      gl.uniform1f(sCamHue, p.camHue || 0);
      gl.uniform1f(sCamSat, p.camSat != null ? p.camSat : 1);
      gl.uniform1f(sCamVal, p.camVal != null ? p.camVal : 1);
      gl.uniform1f(sCamContrast, p.camContrast != null ? p.camContrast : 1);
      gl.uniform1f(sColorSeed, p.colorSeed);
      gl.uniform1f(sHueOffset, p.hueOffset != null ? p.hueOffset : 0);
      gl.uniform1f(sHueRadius, p.hueRadius != null ? p.hueRadius : 1);
      gl.uniform1f(sSatSeed, p.satSeed || 0);
      gl.uniform1f(sSatMin, p.satMin != null ? p.satMin : 0);
      gl.uniform1f(sSatMax, p.satMax != null ? p.satMax : 1);
      gl.uniform1f(sBrightSeed, p.brightSeed || 0);
      gl.uniform1f(sValueMin,  p.valueMin);
      gl.uniform1f(sValueMax,  p.valueMax);
      gl.uniform1f(sGradientSeed, p.gradientSeed);
      gl.uniform1i(sColorMode, p.colorMode);
      gl.uniform1i(sColorize, p.colorize !== false ? 1 : 0);

      // Noise + image source uniforms
      const srcMode = p.source === 'image' ? 1 : 0;
      gl.uniform1i(sSourceMode, srcMode);
      gl.uniform1i(sNoiseType, p.noiseType || 0);
      gl.uniform1f(sNoiseElementSize, p.noiseElementSize != null ? p.noiseElementSize : 0.5);
      gl.uniform1f(sNoiseOffsetX, p.noiseOffsetX || 0);
      gl.uniform1f(sNoiseOffsetY, p.noiseOffsetY || 0);
      gl.uniform1i(sNoiseOctaves, p.noiseOctaves != null ? p.noiseOctaves : 5);
      gl.uniform1f(sNoiseLacunarity, p.noiseLacunarity != null ? p.noiseLacunarity : 2.0);
      gl.uniform1f(sNoiseRoughness, p.noiseRoughness != null ? p.noiseRoughness : 0.5);

      // Flow uniforms
      gl.uniform1f(sFlowTime,      flowTime);
      gl.uniform1i(sFlowType,      p.flowType     != null ? p.flowType     : 0);
      gl.uniform1i(sFlow1Style,    p.flow1Style   != null ? p.flow1Style   : 0);
      gl.uniform1f(sFlowHueOffset, p.flowHueOffset != null ? p.flowHueOffset : 0.0);
      gl.uniform1f(sFlowHueRadius, p.flowHueRadius != null ? p.flowHueRadius : 1.0);
      gl.uniform1i(sFlowHueEnabled, p.flowHueEnabled ? 1 : 0);
      gl.uniform1f(sF2HueOffset,  p.f2HueOffset  != null ? p.f2HueOffset  : 0.0);
      gl.uniform1f(sF2HueRadius,  p.f2HueRadius  != null ? p.f2HueRadius  : 1.0);
      gl.uniform1i(sF2HueEnabled, p.f2HueEnabled ? 1 : 0);
      gl.uniform1f(sFlowScale,     p.flowScale    != null ? p.flowScale    : 2.0);
      gl.uniform1f(sFlowSpeed,    p.flowSpeed    != null ? p.flowSpeed    : 1.0);
      gl.uniform1f(sFlowDistort1, p.flowDistort1 != null ? p.flowDistort1 : 8.1);
      gl.uniform1f(sFlowDistort2, p.flowDistort2 != null ? p.flowDistort2 : 4.13);
      gl.uniform1f(sFlowSmoothLo, p.flowSmoothLo != null ? p.flowSmoothLo : 0.15);
      gl.uniform1f(sFlowSmoothHi, p.flowSmoothHi != null ? p.flowSmoothHi : 0.85);
      // Flow 2 uniforms
      gl.uniform1f(sF2Scale,      p.f2Scale    != null ? p.f2Scale    : 6.0);
      gl.uniform1f(sF2VelX,       p.f2VelX     != null ? p.f2VelX     : 0.1);
      gl.uniform1f(sF2VelY,       p.f2VelY     != null ? p.f2VelY     : 0.2);
      gl.uniform1f(sF2Speed,      p.f2Speed    != null ? p.f2Speed    : 2.5);
      gl.uniform1f(sF2Detail,     p.f2Detail   != null ? p.f2Detail   : 200.0);
      gl.uniform1f(sF2Twist,      p.f2Twist    != null ? p.f2Twist    : 50.0);
      gl.uniform1i(sF2Iter1,      p.f2Iter1    != null ? p.f2Iter1    : 20);
      gl.uniform1i(sF2Iter2,      p.f2Iter2    != null ? p.f2Iter2    : 20);
      gl.uniform1i(sF2Mode,       p.f2Mode     != null ? p.f2Mode     : 0);
      gl.uniform1f(sImageScale, p.imageScale != null ? p.imageScale : 1.0);
      const imgAR = (window._imageSrcWidth && window._imageSrcHeight)
                     ? window._imageSrcWidth / window._imageSrcHeight : 1.0;
      gl.uniform1f(sImageAspect, imgAR);

      // Image source texture (unit 2)
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, imageSrcTex);
      gl.uniform1i(sImageTex, 2);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, gradientTex);
      gl.uniform1i(sGradientTex, 1);

      // Banding uniforms
      gl.uniform1i(sBanding,      p.banding ? 1 : 0);
      gl.uniform1i(sBandAngleMode, p.bandAngleMode || 0);
      gl.uniform1f(sBandAngleSeed, p.bandAngleSeed || 0);
      gl.uniform1i(sBandRandCount, p.bandRandCount ? 1 : 0);
      gl.uniform1f(sBandRandCountMin, p.bandRandCountMin != null ? p.bandRandCountMin : 0.2);
      gl.uniform1f(sBandRandCountMax, p.bandRandCountMax != null ? p.bandRandCountMax : 1.0);
      gl.uniform1f(sBandRandCountSeed, p.bandRandCountSeed || 0);
      gl.uniform1f(sBandCount,    p.bandCount);
      gl.uniform1f(sBandLumMin,   p.bandLumMin);
      gl.uniform1f(sBandLumMax,   p.bandLumMax);
      gl.uniform1f(sBandStrength, p.bandStrength);
      gl.uniform1i(sBandRandomize, p.bandRandomize ? 1 : 0);
      gl.uniform1i(sBandBlendMode, p.bandBlendMode);
      gl.uniform1f(sBandHueOffset, p.bandHueOffset != null ? p.bandHueOffset : 0);
      gl.uniform1f(sBandHueStrength, p.bandHueStrength || 0);
      gl.uniform1f(sBandHueRadius, p.bandHueRadius || 0.5);

      const groups = p.groups;
      const groupsOn = p.groupsEnabled !== false;
      const maxGroups = groupsOn ? (isFast() ? Math.min(groups.length, 2) : groups.length) : 0;
      const maxPoints = isFast() ? Math.min(p.points, 20) : p.points;
      gl.uniform1i(sNumPoints, maxPoints);
      gl.uniform1i(sGroupCount, maxGroups);
      for (let g = 0; g < 8; g++) {
        if (g < maxGroups) {
          const grp = groups[g];
          gl.uniform1i(sGroupActive[g],    grp.active ? 1 : 0);
          gl.uniform2f(sGroupDisplace[g],  grp.dx, grp.dy);
          gl.uniform1f(sGroupThreshold[g], grp.threshold);
          gl.uniform1f(sGroupSeed[g],      grp.seed);
          gl.uniform1f(sGroupScale[g],     grp.scale);
        } else {
          gl.uniform1i(sGroupActive[g],    0);
          gl.uniform2f(sGroupDisplace[g],  0, 0);
          gl.uniform1f(sGroupThreshold[g], 0);
          gl.uniform1f(sGroupSeed[g],      1);
          gl.uniform1f(sGroupScale[g],     1);
        }
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // --- pass 1.5: optional Gaussian blur of scene result ---
    // blurRadius > 0 runs H then V pass; result ends up in blurTex_V
    // which replaces sceneTex as input to the edge/pixelate chain.
    const blurR = (p.blurEnabled !== false) ? (p.blurRadius || 0) : 0;
    let blurredSceneTex = sceneTex;
    if (blurR > 0) {
      doBlurPass(sceneTex, blurFBO_H, 1.0/sceneW, 0,          blurR, sceneW, sceneH);
      doBlurPass(blurTex_H, blurFBO_V, 0,          1.0/sceneH, blurR, sceneW, sceneH);
      blurredSceneTex = blurTex_V;
    }

    // --- pass 2: edge / pixelate chain ---
    // Resolve pixelate instances.  Fall back to a synthetic single-instance
    // built from the legacy flat params so old configs continue working.
    const usePrecompute = p.precompute && p.animating;
    const pcFrames = Math.max(1, Math.min(10, p.precomputeFrames || 3));

    const insts = (p.pixelate && p.pixelateInstances && p.pixelateInstances.length > 0)
      ? p.pixelateInstances
      : [{
          // legacy / single-instance fallback
          pixelW: p.pixelW, pixelH: p.pixelH, pixelScale: p.pixelScale || 1,
          weaveMode: p.weaveMode || 0, pixelShape: p.pixelShape || 0,
          shapeMargin: p.shapeMargin || 0, shapeBleed: p.shapeBleed || 0,
          oblique: p.oblique, quadEnabled: p.quadEnabled, quadSteps: p.quadSteps,
          genDiamond: p.genDiamond,
          gapColor: p.gapColor, gapOpacity: p.gapOpacity,
          shapeGradOpacity: p.shapeGradOpacity, shapeGradDir: p.shapeGradDir,
          tileGradEnabled: p.tileGradEnabled, radialCenterX: p.radialCenterX,
          radialCenterY: p.radialCenterY, radialScale: p.radialScale,
          embossBlendMode: p.embossBlendMode,
          opPatternsEnabled: p.opPatternsEnabled, opPatterns: p.opPatterns,
          opPatternSeed: p.opPatternSeed, opPatternMode: p.opPatternMode,
          imgPixelEnabled: p.imgPixelEnabled, imgPixelCols: p.imgPixelCols,
          imgPixelRows: p.imgPixelRows, imgPixelBlend: p.imgPixelBlend,
          imgPixelOpacity: p.imgPixelOpacity, imgPixelAffectScale: p.imgPixelAffectScale,
          imgPixelMinScale: p.imgPixelMinScale, imgPixelMaxScale: p.imgPixelMaxScale,
          imgPixelAffectRotate: p.imgPixelAffectRotate, imgPixelMinRotate: p.imgPixelMinRotate,
          imgPixelMaxRotate: p.imgPixelMaxRotate, imgPixelAffectOffset: p.imgPixelAffectOffset,
          imgPixelMinOffset: p.imgPixelMinOffset, imgPixelMaxOffset: p.imgPixelMaxOffset,
          imgPixelMask: p.imgPixelMask,
          imgPixel2Enabled: false,
          resolution: 'full'
        }];

    const N = insts.length;

    // Filter to only enabled instances (inst.enabled !== false)
    const activeInsts = insts.filter(function(inst) { return inst.enabled !== false; });
    const NA = activeInsts.length;
    if (NA === 0) {
      // Nothing to do — blit scene directly to screen
      if (usePrecompute) {
        ensurePrecomputeFBOs(pcFrames, W, H);
        const writeIdx = precomputePlayIdx % pcFrames;
        blitToScreen(sceneTex, W, H);
        precomputeBuffer[writeIdx].ready = true;
        precomputePlayIdx = (precomputePlayIdx + 1) % pcFrames;
      } else {
        blitToScreen(sceneTex, W, H);
      }
      return;
    }

    // Ensure intermediary FBOs are current (based on full instance list for consistency)
    rebuildInstanceFBOs();

    // Keep track of the texture that is the input to each pass
    let inputTex = blurredSceneTex;

    for (let instIdx = 0; instIdx < NA; instIdx++) {
      const inst = activeInsts[instIdx];
      const isLast = instIdx === NA - 1;

      // Map active instance index back to original index for FBO slot
      const origIdx = insts.indexOf(inst);

      // Determine output target for this instance
      // Override instances render at canvas (full) resolution; others at scene resolution
      const instBaseW = inst.overrideResolution ? W : (sceneW || W);
      const instBaseH = inst.overrideResolution ? H : (sceneH || H);
      const [iW, iH] = isLast ? [instBaseW, instBaseH] : (() => {
        const slot = instanceFBOs[origIdx];
        return slot ? [slot.w, slot.h] : [instBaseW, instBaseH];
      })();

      if (isLast) {
        if (usePrecompute) {
          ensurePrecomputeFBOs(pcFrames, W, H);
          const writeIdx = precomputePlayIdx % pcFrames;
          gl.bindFramebuffer(gl.FRAMEBUFFER, precomputeBuffer[writeIdx].fbo);
        } else {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, instanceFBOs[origIdx] ? instanceFBOs[origIdx].fbo : null);
      }

      gl.viewport(0, 0, iW, iH);
      gl.useProgram(edgeProg);
      bindQuad(edgeProg);

      // Scene texture input
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTex);
      gl.uniform1i(eSceneTex, 0);
      gl.uniform2f(eRes, iW, iH);

      // Outline — only on the last instance
      gl.uniform1f(eOutlineWidth, isLast && p.showOutline ? p.outlineWidth : 0.0);
      const oc = hexToRgb01(p.outlineColor || '#000000');
      gl.uniform3f(eOutlineColor, oc[0], oc[1], oc[2]);

      // Per-instance pixelate params
      gl.uniform1i(ePixelate, p.pixelate ? 1 : 0);
      const pw = (inst.pixelW || 8) * (inst.pixelScale || 1);
      const ph = (inst.pixelH || 8) * (inst.pixelScale || 1);
      gl.uniform2f(ePixelSize, pw, ph);
      gl.uniform1i(eWeaveMode,   inst.weaveMode  || 0);
      gl.uniform1i(ePixelShape,  inst.pixelShape || 0);
      gl.uniform1f(eShapeMargin, inst.shapeMargin != null ? inst.shapeMargin : 0);
      gl.uniform1f(eShapeBleed,  inst.shapeBleed  != null ? inst.shapeBleed  : 0);
      gl.uniform1f(ePixelScale,  inst.pixelScale  || 1);
      gl.uniform1f(eShapeScale,  inst.shapeScale  != null ? inst.shapeScale  : 1.0);
      gl.uniform1i(eForceSquare, inst.forceSquare ? 1 : 0);
      gl.uniform1i(eMaintainThickness, inst.maintainThickness ? 1 : 0);
      gl.uniform1i(eOblique,     inst.oblique     ? 1 : 0);
      gl.uniform1i(eBandOutline, p.bandOutline    ? 1 : 0);
      gl.uniform1i(eQuadSteps,   inst.quadEnabled ? (inst.quadSteps || 1) : 1);
      gl.uniform1i(eQuadEnabled, inst.quadEnabled ? 1 : 0);
      gl.uniform1i(eGenDiamond,  inst.genDiamond  ? 1 : 0);
      const gc = hexToRgb01(inst.gapColor || p.gapColor || '#000000');
      gl.uniform3f(eGapColor,    gc[0], gc[1], gc[2]);
      gl.uniform1f(eGapOpacity,  inst.gapOpacity != null ? inst.gapOpacity : (p.gapOpacity || 0));

      // Shape gradient (shared texture, per-instance params)
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, shapeGradTex);
      gl.uniform1i(eShapeGradTex, 2);
      gl.uniform1f(eShapeGradOpacity, inst.shapeGradOpacity != null ? inst.shapeGradOpacity : (p.shapeGradOpacity || 0));
      gl.uniform1i(eShapeGradDir,     inst.shapeGradDir     != null ? inst.shapeGradDir     : (p.shapeGradDir || 0));
      gl.uniform1i(eTileGradEnabled,  inst.tileGradEnabled  !== false ? 1 : 0);
      gl.uniform2f(eRadialCenter,     inst.radialCenterX || 0, inst.radialCenterY || 0);
      gl.uniform1f(eRadialScale,      inst.radialScale    != null ? inst.radialScale : 1.0);
      gl.uniform1i(eEmbossBlendMode,  inst.embossBlendMode || 0);
      gl.uniform1f(eEmbossHueOff,     inst.embossHueOff    != null ? inst.embossHueOff : 0);

      // Banding + grading + post-process — only on last instance
      gl.uniform1i(eBanding,      isLast && p.banding     ? 1 : 0);
      gl.uniform1f(eBandCount,    p.bandCount);
      gl.uniform1f(eBandLumMin,   p.bandLumMin);
      gl.uniform1f(eBandLumMax,   p.bandLumMax);
      gl.uniform1f(eBandStrength, p.bandStrength);
      gl.uniform1i(eBandRandomize, p.bandRandomize ? 1 : 0);
      gl.uniform1f(eGradeHue,     isLast ? p.gradeHue     : 0);
      gl.uniform1f(eGradeSat,     isLast ? p.gradeSat     : 1);
      gl.uniform1f(eGradeVal,     isLast ? p.gradeVal     : 1);
      gl.uniform1f(eGradeContrast,isLast ? p.gradeContrast: 1);
      gl.uniform1i(ePostProcess,  isLast && p.postProcessEnabled !== false ? 1 : 0);

      // Opacity patterns (per-instance)
      const opPatsEnabled = inst.opPatternsEnabled !== false;
      const opPats = inst.opPatterns || [];
      const opCount = opPatsEnabled ? opPats.filter(op => op.active !== false).length : 0;
      gl.uniform1i(eOpPatternCount, opCount);
      gl.uniform1f(eOpPatternSeed,  inst.opPatternSeed || 0);
      gl.uniform1i(eOpPatternMode,  inst.opPatternMode || 0);
      for (let k = 0; k < 4; k++) gl.uniform4f(eOpPatternDims[k], 0, 0, 0, 0);
      if (opCount > 0) {
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, opPatternTex);
        gl.uniform1i(eOpPatternTex, 3);
        let activeIdx = 0;
        for (let k = 0; k < opPats.length && activeIdx < 4; k++) {
          if (opPats[k].active === false) continue;
          const pat = opPats[k];
          const rows = pat.grid || [];
          const cols = rows.length > 0 ? rows[0].length : 0;
          gl.uniform4f(eOpPatternDims[activeIdx], cols, rows.length, pat.hueShift || 0, pat.hueOpacity || 0);
          activeIdx++;
        }
      }

      // Image pixel (per-instance texture — use original index so upload slot matches)
      gl.uniform1i(eImgPixelEnabled, inst.imgPixelEnabled ? 1 : 0);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, getImgPixelTex(origIdx));
      gl.uniform1i(eImgPixelTex, 4);
      gl.uniform1f(eImgPixelCols,   inst.imgPixelCols    || 5);
      gl.uniform1f(eImgPixelRows,   inst.imgPixelRows    || 5);
      gl.uniform1i(eImgPixelBlend,  inst.imgPixelBlend   != null ? inst.imgPixelBlend   : 8);
      gl.uniform1f(eImgPixelHueOff, inst.imgPixelHueOff  != null ? inst.imgPixelHueOff  : 0);
      gl.uniform1f(eImgPixelOpacity,inst.imgPixelOpacity != null ? inst.imgPixelOpacity : 1.0);
      gl.uniform1i(eImgPixelAffectScale,  inst.imgPixelAffectScale  ? 1 : 0);
      gl.uniform1f(eImgPixelMinScale,     inst.imgPixelMinScale     != null ? inst.imgPixelMinScale     : -4.0);
      gl.uniform1f(eImgPixelMaxScale,     inst.imgPixelMaxScale     != null ? inst.imgPixelMaxScale     :  4.0);
      gl.uniform1i(eImgPixelAffectRotate, inst.imgPixelAffectRotate ? 1 : 0);
      gl.uniform1f(eImgPixelMinRotate,    inst.imgPixelMinRotate    != null ? inst.imgPixelMinRotate    : -90.0);
      gl.uniform1f(eImgPixelMaxRotate,    inst.imgPixelMaxRotate    != null ? inst.imgPixelMaxRotate    :  90.0);
      gl.uniform1i(eImgPixelAffectOffset, inst.imgPixelAffectOffset ? 1 : 0);
      gl.uniform1f(eImgPixelMinOffset,    inst.imgPixelMinOffset    != null ? inst.imgPixelMinOffset    : -0.5);
      gl.uniform1f(eImgPixelMaxOffset,    inst.imgPixelMaxOffset    != null ? inst.imgPixelMaxOffset    :  0.5);
      gl.uniform1i(eImgPixelMask,         inst.imgPixelMask ? 1 : 0);

      // Layer 2 image pixel (Oct diamond cells — texture unit 5)
      const isOct = (inst.weaveMode || 0) === 4;
      gl.uniform1i(eImgPixel2Enabled, isOct && inst.imgPixel2Enabled ? 1 : 0);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, getImgPixel2Tex(origIdx));
      gl.uniform1i(eImgPixel2Tex, 5);
      gl.uniform1f(eImgPixel2Cols,   inst.imgPixel2Cols    || 5);
      gl.uniform1f(eImgPixel2Rows,   inst.imgPixel2Rows    || 5);
      gl.uniform1i(eImgPixel2Blend,  inst.imgPixel2Blend   != null ? inst.imgPixel2Blend   : 8);
      gl.uniform1f(eImgPixel2HueOff, inst.imgPixel2HueOff  != null ? inst.imgPixel2HueOff  : 0);
      gl.uniform1f(eImgPixel2Opacity,inst.imgPixel2Opacity != null ? inst.imgPixel2Opacity : 1.0);
      gl.uniform1i(eImgPixel2AffectScale,  inst.imgPixel2AffectScale  ? 1 : 0);
      gl.uniform1f(eImgPixel2MinScale,     inst.imgPixel2MinScale     != null ? inst.imgPixel2MinScale     : -4.0);
      gl.uniform1f(eImgPixel2MaxScale,     inst.imgPixel2MaxScale     != null ? inst.imgPixel2MaxScale     :  4.0);
      gl.uniform1i(eImgPixel2AffectRotate, inst.imgPixel2AffectRotate ? 1 : 0);
      gl.uniform1f(eImgPixel2MinRotate,    inst.imgPixel2MinRotate    != null ? inst.imgPixel2MinRotate    : -90.0);
      gl.uniform1f(eImgPixel2MaxRotate,    inst.imgPixel2MaxRotate    != null ? inst.imgPixel2MaxRotate    :  90.0);
      gl.uniform1i(eImgPixel2AffectOffset, inst.imgPixel2AffectOffset ? 1 : 0);
      gl.uniform1f(eImgPixel2MinOffset,    inst.imgPixel2MinOffset    != null ? inst.imgPixel2MinOffset    : -0.5);
      gl.uniform1f(eImgPixel2MaxOffset,    inst.imgPixel2MaxOffset    != null ? inst.imgPixel2MaxOffset    :  0.5);
      gl.uniform1i(eImgPixel2Mask,         inst.imgPixel2Mask ? 1 : 0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // The output of this instance becomes the input of the next
      if (!isLast && instanceFBOs[instIdx]) {
        inputTex = instanceFBOs[instIdx].tex;
      }
    }

    // Precompute: mark slot ready and display buffered frame
    if (usePrecompute) {
      const writeIdx = precomputePlayIdx % pcFrames;
      precomputeBuffer[writeIdx].ready = true;
      gl.finish();

      const displayIdx = (precomputePlayIdx + 1) % pcFrames;
      if (precomputeBuffer[displayIdx] && precomputeBuffer[displayIdx].ready) {
        blitToScreen(precomputeBuffer[displayIdx].tex, W, H);
      } else {
        blitToScreen(precomputeBuffer[writeIdx].tex, W, H);
      }
      precomputePlayIdx = (precomputePlayIdx + 1) % pcFrames;
    }
  }

  requestAnimationFrame(render);

  // All GL setup done — now safe to apply shaderParams to uniforms.
  // Fade out the loading overlay and reveal the UI.
  var overlay = document.getElementById('shader-loading-overlay');
  if (overlay) {
    overlay.classList.add('fade-out');
    setTimeout(function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 350);
  }

  if (window._pendingApplyConfig) {
    window._pendingApplyConfig();
    window._pendingApplyConfig = null;
  } else if (typeof applyConfigToUI === 'function') {
    applyConfigToUI();
    if (typeof uploadAllOpPatterns === 'function') uploadAllOpPatterns();
  }
  window.shaderDirty = true;

  // Handle resize outside the render loop
  const ro = new ResizeObserver(() => {
    if (syncSize()) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      rebuildFBO();
      rebuildInstanceFBOs();
      window.shaderDirty = true;
    }
  });
  ro.observe(canvas);

  } // end waitForPrograms callback
  ); // end waitForPrograms call
})(); // end IIFE
