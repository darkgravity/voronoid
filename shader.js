const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl', {
  antialias: false,
  preserveDrawingBuffer: true
});

if (!gl) {
  document.body.innerHTML = '<pre style="color:#f66;padding:2rem">WebGL not supported.</pre>';
  throw new Error('No WebGL');
}

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
}

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
  const sSnapGrid       = gl.getUniformLocation(sceneProg, 'uSnapGrid');
  const sPreProcess     = gl.getUniformLocation(sceneProg, 'uPreProcess');
  const sCamHue         = gl.getUniformLocation(sceneProg, 'uCamHue');
  const sCamSat         = gl.getUniformLocation(sceneProg, 'uCamSat');
  const sCamVal         = gl.getUniformLocation(sceneProg, 'uCamVal');
  const sCamContrast    = gl.getUniformLocation(sceneProg, 'uCamContrast');
  const sColorSeed      = gl.getUniformLocation(sceneProg, 'uColorSeed');
  const sValueMin       = gl.getUniformLocation(sceneProg, 'uValueMin');
  const sValueMax       = gl.getUniformLocation(sceneProg, 'uValueMax');
  const sGradientSeed   = gl.getUniformLocation(sceneProg, 'uGradientSeed');
  const sColorMode      = gl.getUniformLocation(sceneProg, 'uColorMode');
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
  const eOblique      = gl.getUniformLocation(edgeProg, 'uOblique');
  const eBandOutline  = gl.getUniformLocation(edgeProg, 'uBandOutline');
  const eQuadSteps    = gl.getUniformLocation(edgeProg, 'uQuadSteps');
  const eQuadEnabled  = gl.getUniformLocation(edgeProg, 'uQuadEnabled');
  const eGenDiamond   = gl.getUniformLocation(edgeProg, 'uGenDiamond');
  const eShapeGradTex = gl.getUniformLocation(edgeProg, 'uShapeGradTex');
  const eShapeGradOpacity = gl.getUniformLocation(edgeProg, 'uShapeGradOpacity');
  const eShapeGradDir = gl.getUniformLocation(edgeProg, 'uShapeGradDir');
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

  rebuildFBO();
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
      if (rotLabel) rotLabel.textContent = Math.round(window.shaderParams.rot) + '°';

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
        if (sxLabel) sxLabel.textContent = newSx.toFixed(2);
        const sySlider = document.getElementById('sSy');
        if (sySlider) sySlider.value = newSy;
        const syLabel = document.getElementById('vSy');
        if (syLabel) syLabel.textContent = newSy.toFixed(2);
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
      window.shaderDirty = true;
    }

    // animation — throttled to target FPS
    if (p.animating) {
      const targetFps = p.fps || 30;
      const frameInterval = 1000.0 / targetFps;
      if (lastRenderTime > 0 && (now - lastRenderTime) < frameInterval) {
        // Not time for next frame yet — skip
        return;
      }
      if (lastRenderTime > 0) {
        const dt = (now - lastRenderTime) / 1000.0;
        p.rot = (p.rot + p.animSpeed * dt) % 360;
        const slider = document.getElementById('sRot');
        if (slider) slider.value = p.rot;
        const label = document.getElementById('vRot');
        if (label) label.textContent = Math.round(p.rot) + '°';
      }
      lastRenderTime = now;
      window.shaderDirty = true;
    } else {
      lastRenderTime = 0;
    }

    if (!window.shaderDirty) return;
    window.shaderDirty = false;
    const W = canvas.width;
    const H = canvas.height;

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
          uniform float uCamHue;
          uniform float uCamSat;
          uniform float uCamVal;
          uniform float uCamContrast;
          uniform int uPreProcess;
          varying vec2 vUV;
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
            // Color mapping (gradient or hue)
            if(uColorMode==0 || uColorMode==1){
              float lum=dot(col,vec3(0.299,0.587,0.114));
              vec3 mapped=texture2D(uGradTex,vec2(lum,0.5)).rgb;
              col=mapped;
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
          preProcess: gl.getUniformLocation(window._camProg, 'uPreProcess'),
          camHue: gl.getUniformLocation(window._camProg, 'uCamHue'),
          camSat: gl.getUniformLocation(window._camProg, 'uCamSat'),
          camVal: gl.getUniformLocation(window._camProg, 'uCamVal'),
          camContrast: gl.getUniformLocation(window._camProg, 'uCamContrast')
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
      gl.uniform1i(window._camLocs.preProcess, p.preProcess ? 1 : 0);
      gl.uniform1f(window._camLocs.camHue, p.camHue || 0);
      gl.uniform1f(window._camLocs.camSat, p.camSat != null ? p.camSat : 1);
      gl.uniform1f(window._camLocs.camVal, p.camVal != null ? p.camVal : 1);
      gl.uniform1f(window._camLocs.camContrast, p.camContrast != null ? p.camContrast : 1);

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
      gl.uniform1f(sSnapGrid,  p.snapGrid ? p.gridUnit : 0);
      gl.uniform1i(sPreProcess, p.preProcess ? 1 : 0);
      gl.uniform1f(sCamHue, p.camHue || 0);
      gl.uniform1f(sCamSat, p.camSat != null ? p.camSat : 1);
      gl.uniform1f(sCamVal, p.camVal != null ? p.camVal : 1);
      gl.uniform1f(sCamContrast, p.camContrast != null ? p.camContrast : 1);
      gl.uniform1f(sColorSeed, p.colorSeed);
      gl.uniform1f(sValueMin,  p.valueMin);
      gl.uniform1f(sValueMax,  p.valueMax);
      gl.uniform1f(sGradientSeed, p.gradientSeed);
      gl.uniform1i(sColorMode, p.colorMode);

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

    // --- pass 2: edge detect → screen ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(edgeProg);
    bindQuad(edgeProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(eSceneTex,     0);
    gl.uniform2f(eRes,          W, H);
    gl.uniform1f(eOutlineWidth, p.showOutline ? p.outlineWidth : 0.0);
    const oc = hexToRgb01(p.outlineColor);
    gl.uniform3f(eOutlineColor, oc[0], oc[1], oc[2]);
    gl.uniform1i(ePixelate,     p.pixelate ? 1 : 0);
    const pw = p.pixelW * p.pixelScale;
    const ph = p.pixelH * p.pixelScale;
    gl.uniform2f(ePixelSize, pw, ph);
    gl.uniform1i(eWeaveMode,    p.weaveMode);
    gl.uniform1i(ePixelShape,   p.pixelShape);
    gl.uniform1f(eShapeMargin,  p.shapeMargin);
    gl.uniform1f(eShapeBleed,   p.shapeBleed);
    gl.uniform1f(ePixelScale,   p.pixelScale);
    gl.uniform1i(eOblique,      p.oblique ? 1 : 0);
    gl.uniform1i(eBandOutline,  p.bandOutline ? 1 : 0);
    gl.uniform1i(eQuadSteps,    p.quadEnabled ? (p.quadSteps || 1) : 1);
    gl.uniform1i(eQuadEnabled,  p.quadEnabled ? 1 : 0);
    gl.uniform1i(eGenDiamond,  p.genDiamond ? 1 : 0);
    const gc = hexToRgb01(p.gapColor);
    gl.uniform3f(eGapColor,     gc[0], gc[1], gc[2]);
    gl.uniform1f(eGapOpacity,   p.gapOpacity);

    // Shape gradient texture on unit 2
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, shapeGradTex);
    gl.uniform1i(eShapeGradTex, 2);
    gl.uniform1f(eShapeGradOpacity, p.shapeGradOpacity);
    gl.uniform1i(eShapeGradDir, p.shapeGradDir);
    gl.uniform2f(eRadialCenter, p.radialCenterX || 0, p.radialCenterY || 0);
    gl.uniform1f(eRadialScale, p.radialScale != null ? p.radialScale : 1.0);
    gl.uniform1i(eEmbossBlendMode, p.embossBlendMode);
    gl.uniform1i(eBanding,      p.banding ? 1 : 0);
    gl.uniform1f(eBandCount,    p.bandCount);
    gl.uniform1f(eBandLumMin,   p.bandLumMin);
    gl.uniform1f(eBandLumMax,   p.bandLumMax);
    gl.uniform1f(eBandStrength, p.bandStrength);
    gl.uniform1i(eBandRandomize, p.bandRandomize ? 1 : 0);
    gl.uniform1f(eGradeHue,     p.gradeHue);
    gl.uniform1f(eGradeSat,     p.gradeSat);
    gl.uniform1f(eGradeVal,     p.gradeVal);
    gl.uniform1f(eGradeContrast,p.gradeContrast);

    // Opacity patterns on texture unit 3
    const opPatsEnabled = p.opPatternsEnabled !== false;
    const opPats = p.opPatterns || [];
    const opCount = opPatsEnabled ? opPats.filter(op => op.active !== false).length : 0;
    gl.uniform1i(eOpPatternCount, opCount);
    gl.uniform1f(eOpPatternSeed, p.opPatternSeed || 0);
    gl.uniform1i(eOpPatternMode, p.opPatternMode || 0);
    // Always zero out all dims first
    for (let i = 0; i < 4; i++) gl.uniform4f(eOpPatternDims[i], 0, 0, 0, 0);
    if (opCount > 0) {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, opPatternTex);
      gl.uniform1i(eOpPatternTex, 3);
      let activeIdx = 0;
      for (let i = 0; i < opPats.length && activeIdx < 4; i++) {
        if (opPats[i].active === false) continue;
        const pat = opPats[i];
        const rows = pat.grid || [];
        const cols = rows.length > 0 ? rows[0].length : 0;
        gl.uniform4f(eOpPatternDims[activeIdx], cols, rows.length, pat.hueShift || 0, pat.hueOpacity || 0);
        activeIdx++;
      }
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  requestAnimationFrame(render);

  // Handle resize outside the render loop
  const ro = new ResizeObserver(() => {
    if (syncSize()) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      rebuildFBO();
      window.shaderDirty = true;
    }
  });
  ro.observe(canvas);

}).catch(err => {
  document.body.innerHTML = `<pre style="color:#f66;padding:2rem;font-size:13px;">${err.message}</pre>`;
});
