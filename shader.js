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
gl.viewport(0, 0, canvas.width, canvas.height);

function compileShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(s);
    document.body.innerHTML = `<pre style="color:#f66;padding:2rem;font-size:13px;">Shader compile error:\n${err}</pre>`;
    throw new Error(err);
  }
  return s;
}

function buildProgram(vert, frag) {
  const p = gl.createProgram();
  gl.attachShader(p, vert);
  gl.attachShader(p, frag);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p));
  return p;
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

function rebuildFBO() {
  if (sceneTex) { gl.deleteTexture(sceneTex); sceneTex = null; }
  if (fbo)      { gl.deleteFramebuffer(fbo);  fbo = null; }

  sceneTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sceneTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
    canvas.width, canvas.height,
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
  // Invalidate precompute buffer on resize
  precomputeBuffer = [];
  precomputePlayIdx = 0;
}

// ── Per-instance FBOs (intermediate pixelate chain) ─────────────
// One FBO per instance except the last; rebuilt when canvas resizes or
// instance list changes.  instanceFBOs[i] holds the output of instance i.
let instanceFBOs = [];   // { tex, fbo, w, h }

function resolveFBOSize(W, H, res) {
  // res: 'full'|'1/2'|'1/4'|'1/8'
  if (!res || res === 'full') return [W, H];
  if (res === '1/2')  return [Math.max(1, W>>1), Math.max(1, H>>1)];
  if (res === '1/4')  return [Math.max(1, W>>2), Math.max(1, H>>2)];
  if (res === '1/8')  return [Math.max(1, W>>3), Math.max(1, H>>3)];
  return [W, H];
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
    const [fw, fh] = resolveFBOSize(W, H, insts[i].resolution);
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

Promise.all([
  fetch('fragment.glsl').then(r => { if (!r.ok) throw new Error('Cannot load fragment.glsl'); return r.text(); }),
  fetch('edge.glsl').then(r => { if (!r.ok) throw new Error('Cannot load edge.glsl'); return r.text(); })
]).then(([sceneSrc, edgeSrc]) => {

  const vert = compileShader(gl.VERTEX_SHADER, VERT_SRC);

  const sceneProg       = buildProgram(vert, compileShader(gl.FRAGMENT_SHADER, sceneSrc));
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
  const sGroupCount     = gl.getUniformLocation(sceneProg, 'uGroupCount');
  const sGroupActive    = Array.from({length:8},(_,g)=>gl.getUniformLocation(sceneProg,`uGroupActive[${g}]`));
  const sGroupDisplace  = Array.from({length:8},(_,g)=>gl.getUniformLocation(sceneProg,`uGroupDisplace[${g}]`));
  const sGroupThreshold = Array.from({length:8},(_,g)=>gl.getUniformLocation(sceneProg,`uGroupThreshold[${g}]`));
  const sGroupSeed      = Array.from({length:8},(_,g)=>gl.getUniformLocation(sceneProg,`uGroupSeed[${g}]`));
  const sGroupScale     = Array.from({length:8},(_,g)=>gl.getUniformLocation(sceneProg,`uGroupScale[${g}]`));

  const edgeProg      = buildProgram(vert, compileShader(gl.FRAGMENT_SHADER, edgeSrc));
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

  // ── Blit shader (copies a texture to current framebuffer) ──
  const blitFS = `precision highp float;
    uniform sampler2D uTex;
    varying vec2 vUV;
    void main(){ gl_FragColor = texture2D(uTex, vUV); }`;
  const blitVS = `attribute vec2 a_pos; varying vec2 vUV;
    void main(){ vUV = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0, 1); }`;
  const blitProg = buildProgram(
    compileShader(gl.VERTEX_SHADER, blitVS),
    compileShader(gl.FRAGMENT_SHADER, blitFS)
  );
  const blitTex = gl.getUniformLocation(blitProg, 'uTex');

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
  let pinchStartDist = null, pinchStartSx = 1, pinchStartSy = 1;

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

      // Pinch zoom — uniform scale
      if (pinchStartDist !== null && pinchStartDist > 10) {
        const dist = pinchDist(t0, t1);
        const ratio = dist / pinchStartDist;
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

  function render(now) {
    requestAnimationFrame(render);
    frameCount++;

    // Check if fast mode changed — force resize to update resolution
    const p = window.shaderParams;
    const resDivisor = isFast() ? (p.renderRes || 2) : 1;
    const wantScale = 1.0 / resDivisor;
    if (wantScale !== currentRenderScale) {
      currentRenderScale = wantScale;
      curW = 0; curH = 0;
    }

    // resize check
    if (syncSize()) {
      gl.viewport(0, 0, canvas.width, canvas.height);
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
    } else {
      lastRenderTime = 0;
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
    gl.viewport(0, 0, W, H);

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
      gl.uniform2f(window._camLocs.canvasSize, W, H);
      gl.uniform2f(window._camLocs.videoSize, vid.videoWidth || W, vid.videoHeight || H);
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

      gl.uniform2f(sRes,       W, H);
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
    let inputTex = sceneTex;

    for (let instIdx = 0; instIdx < NA; instIdx++) {
      const inst = activeInsts[instIdx];
      const isLast = instIdx === NA - 1;

      // Map active instance index back to original index for FBO slot
      const origIdx = insts.indexOf(inst);

      // Determine output target for this instance
      const [iW, iH] = isLast ? [W, H] : (() => {
        const slot = instanceFBOs[origIdx];
        return slot ? [slot.w, slot.h] : [W, H];
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

}).catch(err => {
  document.body.innerHTML = `<pre style="color:#f66;padding:2rem;font-size:13px;">${err.message}</pre>`;
});
