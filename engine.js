const canvas = document.getElementById('glCanvas');
let gl = canvas.getContext('webgl', {
  antialias: false,
  preserveDrawingBuffer: true
});

// Retry once if context lost (common during rapid Live Server reloads)
if (!gl) {
  const lostCtx = document.querySelectorAll('canvas');
  lostCtx.forEach(c => { const g = c.getContext('webgl'); if (g) { g.getExtension('WEBGL_lose_context')?.loseContext(); } });
  gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });
}

if (!gl) {
  var overlay = document.getElementById('shader-loading-overlay');
  if (overlay) overlay.innerHTML = '<pre style="color:#f66;padding:2rem;margin:0">WebGL context unavailable.\nTry refreshing the page (Ctrl+Shift+R).</pre>';
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
  let dpr = (window.devicePixelRatio || 1) * currentRenderScale;
  // Mobile: cap effective DPR at 1.0 so the canvas never exceeds CSS-pixel
  // resolution. Combined with a multi-pass FBO pipeline (blur + chained
  // pixelation + edge/grading), full DPR on phones turns into 5–10M frag
  // shader invocations per frame and the page locks up.
  if (isMobile) dpr = Math.min(dpr, 1.0);
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

function compileShader(type, src, tag) {
  const s = gl.createShader(type);
  s._tag = tag || (type === gl.VERTEX_SHADER ? 'vertex?' : 'fragment?');
  s._src = src;
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

// Escape HTML so error messages render verbatim in the overlay
function _escHtml(s) {
  return String(s).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; });
}
// Show a fatal shader error in the overlay (scrollable, wraps long lines, mobile-friendly)
function _showShaderError(title, body, src) {
  var html = '<pre style="color:#f66;padding:12px;font-size:11px;line-height:1.4;margin:0;'
           + 'white-space:pre-wrap;word-break:break-word;'
           + 'position:fixed;inset:0;overflow:auto;background:#000;'
           + 'font-family:ui-monospace,Menlo,Consolas,monospace;z-index:9999">'
           + _escHtml(title) + '\n\n' + _escHtml(body);
  // If we have the source and the error references a line number, show that line in context
  if (src) {
    var m = /(?:^|\b)\d+:(\d+)/.exec(body);
    if (m) {
      var ln = parseInt(m[1], 10);
      var lines = src.split('\n');
      var from = Math.max(0, ln - 4), to = Math.min(lines.length, ln + 3);
      html += '\n\n--- source (lines ' + (from+1) + '-' + to + ') ---\n';
      for (var i = from; i < to; i++) {
        html += _escHtml((i+1) + (i+1===ln ? ' >> ' : '    ') + lines[i]) + '\n';
      }
    }
  }
  html += '</pre>';
  var overlay = document.getElementById('shader-loading-overlay');
  if (overlay) overlay.innerHTML = html;
  else { var d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d); }
  console.error(title, body);
}

// Check a compiled shader for errors (called after parallel compile finishes)
function checkShader(s) {
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    var log = gl.getShaderInfoLog(s);
    if (!log || !log.trim()) log = '(driver returned empty info log — check desktop console / remote-debug for details)';
    _showShaderError('Shader compile error [' + (s._tag || '?') + ']', log, s._src);
    throw new Error(log);
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
        _showShaderError('Shader link error [' + (prog._tag || '?') + ']', gl.getProgramInfoLog(prog) || '(empty link log)', null);
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
    // All done compiling — check shaders FIRST so real compile errors surface
    for (const s of shaders) { try { checkShader(s); } catch(e) { return; } }
    for (const prog of programs) {
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        _showShaderError('Shader link error [' + (prog._tag || '?') + ']', gl.getProgramInfoLog(prog) || '(empty link log)', null);
        return;
      }
    }
    onReady();
  }
  requestAnimationFrame(check);
}


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
let prePPFBO = null, prePPTex = null;
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
  const pxOn = window.shaderParams && window.shaderParams.pixelate;

  // Free surplus
  while (instanceFBOs.length > N) destroyFBOSlot(instanceFBOs.pop());

  // Create / resize — disabled instances get null (no FBO, no rendering)
  for (let i = 0; i < N; i++) {
    if (!pxOn || insts[i].enabled === false) {
      destroyFBOSlot(instanceFBOs[i]);
      instanceFBOs[i] = null;
      continue;
    }
    const ovr = insts[i].overrideResolution;
    const baseW = ovr ? W : (sceneW || W);
    const baseH = ovr ? H : (sceneH || H);
    const [fw, fh] = resolveFBOSize(baseW, baseH, insts[i].resolution);
    if (!instanceFBOs[i] || instanceFBOs[i].w !== fw || instanceFBOs[i].h !== fh) {
      destroyFBOSlot(instanceFBOs[i]);
      instanceFBOs[i] = makeFBOSlot(fw, fh);
    }
  }
}

window.rebuildInstanceFBOs = rebuildInstanceFBOs;
window.forceResize = function() { curW = 0; curH = 0; };

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
let cellGradTex = null;

function createShapeGradTex() {
  shapeGradTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shapeGradTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  // Cell gradient texture (used by Cell Color = Gradient mode)
  cellGradTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, cellGradTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // Initial: black→white ramp so anything works out of the box
  const initData = new Uint8Array(GRAD_WIDTH * 4);
  for (let x = 0; x < GRAD_WIDTH; x++) {
    const v = Math.round((x / (GRAD_WIDTH - 1)) * 255);
    initData[x*4+0] = v; initData[x*4+1] = v; initData[x*4+2] = v; initData[x*4+3] = 255;
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GRAD_WIDTH, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, initData);
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


(function() {
  const sceneSrc = FRAGMENT_GLSL_SRC;
  const edgeSrc  = EDGE_GLSL_SRC;

  const vert = compileShader(gl.VERTEX_SHADER, VERT_SRC, 'main vertex');
  const sceneFrag = compileShader(gl.FRAGMENT_SHADER, sceneSrc, 'scene fragment');
  const edgeFrag  = compileShader(gl.FRAGMENT_SHADER, edgeSrc, 'edge fragment');

  // Build programs immediately so GPU can compile in parallel
  const sceneProg = buildProgram(vert, sceneFrag); sceneProg._tag = 'scene';
  const edgeProg  = buildProgram(vert, edgeFrag);  edgeProg._tag  = 'edge';

  // Blit is tiny — compile inline too
  const blitFS = `precision mediump float; uniform sampler2D uTex; varying vec2 vUV;
    void main(){ gl_FragColor = texture2D(uTex, vUV); }`;
  const blitVS = `attribute vec2 aPos; varying vec2 vUV;
    void main(){ vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0, 1); }`;
  const blitFrag = compileShader(gl.FRAGMENT_SHADER, blitFS, 'blit fragment');
  const blitVertShader = compileShader(gl.VERTEX_SHADER, blitVS, 'blit vertex');
  const blitProg = buildProgram(blitVertShader, blitFrag); blitProg._tag = 'blit';

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
  const blurFrag_s  = compileShader(gl.FRAGMENT_SHADER, BLUR_FS, 'blur fragment');
  const blurProg    = buildProgram(blitVertShader, blurFrag_s); blurProg._tag = 'blur';

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
  const sMergeEnabled   = gl.getUniformLocation(sceneProg, 'uMergeEnabled');
  const sMergeDist      = gl.getUniformLocation(sceneProg, 'uMergeDist');
  const sSmoothEdge     = gl.getUniformLocation(sceneProg, 'uSmoothEdge');
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
  const eAccumTex     = gl.getUniformLocation(edgeProg, 'uAccumTex');
  const eOutlineWidth = gl.getUniformLocation(edgeProg, 'uOutlineWidth');
  const eOutlineColor = gl.getUniformLocation(edgeProg, 'uOutlineColor');
  const ePixelate     = gl.getUniformLocation(edgeProg, 'uPixelate');
  const ePixelSize    = gl.getUniformLocation(edgeProg, 'uPixelSize');
  const eWeaveMode    = gl.getUniformLocation(edgeProg, 'uWeaveMode');
  const ePixelShape   = gl.getUniformLocation(edgeProg, 'uPixelShape');
  const eShapeMargin  = gl.getUniformLocation(edgeProg, 'uShapeMargin');
  const eShapeBleed   = gl.getUniformLocation(edgeProg, 'uShapeBleed');
  const eGapEnabled   = gl.getUniformLocation(edgeProg, 'uGapEnabled');
  const eGapFiltered  = gl.getUniformLocation(edgeProg, 'uGapFiltered');
  const eInstBlendMode = gl.getUniformLocation(edgeProg, 'uInstanceBlendMode');
  const eInstBlendHueOff = gl.getUniformLocation(edgeProg, 'uInstBlendHueOff');
  const eInstanceOpacity = gl.getUniformLocation(edgeProg, 'uInstanceOpacity');
  const eShapeSmoothness = gl.getUniformLocation(edgeProg, 'uShapeSmoothness');
  const eSdfAffectScale  = gl.getUniformLocation(edgeProg, 'uSdfAffectScale');
  const eSdfMinScale     = gl.getUniformLocation(edgeProg, 'uSdfMinScale');
  const eSdfMaxScale     = gl.getUniformLocation(edgeProg, 'uSdfMaxScale');
  const eSdfAffectRotate = gl.getUniformLocation(edgeProg, 'uSdfAffectRotate');
  const eSdfMinRotate    = gl.getUniformLocation(edgeProg, 'uSdfMinRotate');
  const eSdfMaxRotate    = gl.getUniformLocation(edgeProg, 'uSdfMaxRotate');
  const eSdfAffectOffset = gl.getUniformLocation(edgeProg, 'uSdfAffectOffset');
  const eSdfMinOffset    = gl.getUniformLocation(edgeProg, 'uSdfMinOffset');
  const eSdfMaxOffset    = gl.getUniformLocation(edgeProg, 'uSdfMaxOffset');
  const eSdfAffectAlpha  = gl.getUniformLocation(edgeProg, 'uSdfAffectAlpha');
  const eSdfMinAlpha     = gl.getUniformLocation(edgeProg, 'uSdfMinAlpha');
  const eSdfMaxAlpha     = gl.getUniformLocation(edgeProg, 'uSdfMaxAlpha');
  const ePixelScale   = gl.getUniformLocation(edgeProg, 'uPixelScale');
  const eShapeScale   = gl.getUniformLocation(edgeProg, 'uShapeScale');
  const eForceSquare  = gl.getUniformLocation(edgeProg, 'uForceSquare');
  const eMaintainThickness = gl.getUniformLocation(edgeProg, 'uMaintainThickness');
  const eQuadReverse = gl.getUniformLocation(edgeProg, 'uQuadReverse');
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
  const eFillMode     = gl.getUniformLocation(edgeProg, 'uFillMode');
  const eFillColor    = gl.getUniformLocation(edgeProg, 'uFillColor');
  const ePassthrough  = gl.getUniformLocation(edgeProg, 'uPassthrough');
  const eTwoImage     = gl.getUniformLocation(edgeProg, 'uTwoImage');
  const eShapeBlendMode = gl.getUniformLocation(edgeProg, 'uShapeBlendMode');
  const eShapeBlendHueOff = gl.getUniformLocation(edgeProg, 'uShapeBlendHueOff');
  const eShapeBlendMagnitude = gl.getUniformLocation(edgeProg, 'uShapeBlendMagnitude');
  const eCellColorMode = gl.getUniformLocation(edgeProg, 'uCellColorMode');
  const eCustomCellColor = gl.getUniformLocation(edgeProg, 'uCustomCellColor');
  const eFinalPass = gl.getUniformLocation(edgeProg, 'uFinalPass');
  const eOrigSceneTex = gl.getUniformLocation(edgeProg, 'uOrigSceneTex');
  const eCellGradTex = gl.getUniformLocation(edgeProg, 'uCellGradTex');
  const eImgPixelHueOff  = gl.getUniformLocation(edgeProg, 'uImgPixelHueOff');
  const eImgPixel2HueOff = gl.getUniformLocation(edgeProg, 'uImgPixel2HueOff');
  const eGradeHue     = gl.getUniformLocation(edgeProg, 'uGradeHue');
  const eGradeSat     = gl.getUniformLocation(edgeProg, 'uGradeSat');
  const eGradeVal     = gl.getUniformLocation(edgeProg, 'uGradeVal');
  const eGradeContrast= gl.getUniformLocation(edgeProg, 'uGradeContrast');
  const ePostProcess  = gl.getUniformLocation(edgeProg, 'uPostProcess');
  const ePPCount = gl.getUniformLocation(edgeProg, 'uPPCount');
  const ePPType = []; const ePPParams = []; const ePPBlend = []; const ePPExtra = [];
  for (let k = 0; k < 16; k++) {
    ePPType.push(gl.getUniformLocation(edgeProg, 'uPPType['+k+']'));
    ePPParams.push(gl.getUniformLocation(edgeProg, 'uPPParams['+k+']'));
    ePPBlend.push(gl.getUniformLocation(edgeProg, 'uPPBlend['+k+']'));
    ePPExtra.push(gl.getUniformLocation(edgeProg, 'uPPExtra['+k+']'));
  }
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
    const hasOverride = isFast() && p.pixelate && p.pixelateInstances &&
      p.pixelateInstances.some(function(inst) { return inst.enabled !== false && inst.overrideResolution; });
    const wantScale = hasOverride ? 1.0 : (1.0 / resDivisor);
    if (wantScale !== currentRenderScale) {
      currentRenderScale = wantScale;
      curW = 0; curH = 0;
    }
    const resized = syncSize();
    if (resized) gl.viewport(0, 0, canvas.width, canvas.height);
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
      gl.uniform1i(sMergeEnabled, p.mergeEnabled ? 1 : 0);
      gl.uniform1f(sMergeDist,    p.mergeDist || 1);
      gl.uniform1f(sSmoothEdge,   p.smoothEnabled ? (p.smoothEdge || 2) : 0);
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
      doBlurPass(sceneTex, blurFBO_H, 1.0/sceneW, 0, blurR, sceneW, sceneH);
      doBlurPass(blurTex_H, blurFBO_V, 0, 1.0/sceneH, blurR, sceneW, sceneH);
      blurredSceneTex = blurTex_V;
    }

    // --- pre-process filter pass ---
    const prePPStack = (p.preProcess && p.prePPStack && p.prePPStack.length > 0) ? p.prePPStack.filter(function(f){ return f.enabled !== false; }) : [];
    if (prePPStack.length > 0) {
      if (!prePPFBO) {
        prePPTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, prePPTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        prePPFBO = gl.createFramebuffer();
      }
      gl.bindTexture(gl.TEXTURE_2D, prePPTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, prePPFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, prePPTex, 0);
      gl.viewport(0, 0, W, H);

      gl.useProgram(edgeProg);
      bindQuad(edgeProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, blurredSceneTex);
      gl.uniform1i(eSceneTex, 0);
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_2D, blurredSceneTex);
      gl.uniform1i(eOrigSceneTex, 7);
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, blurredSceneTex);
      gl.uniform1i(eAccumTex, 6);
      gl.uniform2f(eRes, W, H);
      gl.uniform1i(ePixelate, 0);
      gl.uniform1i(ePassthrough, 1);
      gl.uniform1i(ePostProcess, 1);
      gl.uniform1i(eGapEnabled, 0);
      gl.uniform1i(ePixelShape, 0);
      gl.uniform1f(eGradeHue, 0); gl.uniform1f(eGradeSat, 1);
      gl.uniform1f(eGradeVal, 1); gl.uniform1f(eGradeContrast, 1);
      gl.uniform1i(eInstBlendMode, -1);
      gl.uniform1f(eInstanceOpacity, 1.0);
      gl.uniform1i(eShapeBlendMode, -1);
      gl.uniform1f(eShapeBlendHueOff, 0);
      gl.uniform1f(eShapeBlendMagnitude, 1.0);
      gl.uniform1i(eCellColorMode, 0);
      gl.uniform3f(eCustomCellColor, 1, 1, 1);
      gl.activeTexture(gl.TEXTURE8);
      gl.bindTexture(gl.TEXTURE_2D, cellGradTex);
      gl.uniform1i(eCellGradTex, 8);
      gl.uniform1i(eFinalPass, 1);
      gl.uniform1i(eBanding, 0);
      gl.uniform1f(eOutlineWidth, 0.0);
      // Load prePP filters
      var ppCount = Math.min(prePPStack.length, 16);
      gl.uniform1i(ePPCount, ppCount);
      for (var pi = 0; pi < 16; pi++) {
        if (pi < ppCount) {
          var f = prePPStack[pi];
          var fp = f.params || [0,0,0,0];
          // Color Fill: pack color into params xyz, opacity into w
          if (f.type === 14 && f.color) {
            var cc = hexToRgb01(f.color);
            gl.uniform1i(ePPType[pi], 14);
            gl.uniform4f(ePPParams[pi], cc[0], cc[1], cc[2], f.opacity != null ? f.opacity : 1);
            gl.uniform1i(ePPBlend[pi], f.blend != null ? f.blend : 8);
            gl.uniform4f(ePPExtra[pi], 0, 0, 0, 0);
          } else {
            gl.uniform1i(ePPType[pi], f.type);
            gl.uniform4f(ePPParams[pi], fp[0]||0, fp[1]||0, fp[2]||0, fp[3]||0);
            gl.uniform1i(ePPBlend[pi], f.blend != null ? f.blend : 0);
            gl.uniform4f(ePPExtra[pi], f.opacity != null ? f.opacity : 1, 0, 0, 0);
          }
        } else {
          gl.uniform1i(ePPType[pi], -1);
        }
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      blurredSceneTex = prePPTex;
    }

    // --- pass 2: edge / pixelate chain ---
    // Resolve pixelate instances.  Fall back to a synthetic single-instance
    // built from the legacy flat params so old configs continue working.
    const usePrecompute = p.precompute && p.animating;
    const pcFrames = Math.max(1, Math.min(10, p.precomputeFrames || 3));

    const usingRealInsts = !!(p.pixelate && p.pixelateInstances && p.pixelateInstances.length > 0);
    const insts = usingRealInsts
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
    // Expand shapes: each shape in an instance becomes a virtual sub-instance
    // sharing the parent's grid config but with its own shape/filter params
    const SHAPE_KEYS = ['pixelShape','shapeMargin','shapeBleed','shapeSmoothness','shapeScale','forceSquare',
      'sdfAffectScale','sdfMinScale','sdfMaxScale','sdfAffectRotate','sdfMinRotate','sdfMaxRotate',
      'sdfAffectOffset','sdfMinOffset','sdfMaxOffset',
      'sdfAffectAlpha','sdfMinAlpha','sdfMaxAlpha',
      'imgPixelEnabled','imgPixelCols','imgPixelRows','imgPixelOpacity','imgPixelBlend','imgPixelHueOff','imgPixelMask',
      'imgPixelAffectScale','imgPixelMinScale','imgPixelMaxScale',
      'imgPixelAffectRotate','imgPixelMinRotate','imgPixelMaxRotate',
      'imgPixelAffectOffset','imgPixelMinOffset','imgPixelMaxOffset',
      'twoImage','imgPixel2Enabled','imgPixel2Cols','imgPixel2Rows',
      'imgPixel2Opacity','imgPixel2Blend','imgPixel2HueOff','imgPixel2Mask',
      'imgPixel2AffectScale','imgPixel2AffectRotate','imgPixel2AffectOffset',
      'imgPixel2MinScale','imgPixel2MaxScale','imgPixel2MinRotate','imgPixel2MaxRotate',
      'imgPixel2MinOffset','imgPixel2MaxOffset',
      'filters','filtersEnabled','blendMode','blendHueOff','blendOpacity','cellColorMode','customCellColor','cellGradStops'];

    // Sync any pending inst-level changes to active shapes before expansion
    insts.forEach(function(inst, idx) {
      if (inst.enabled === false || !inst.shapes || !inst.shapes.length) return;
      var sh = inst.shapes[inst.activeShapeIdx || 0];
      if (!sh) return;
      var SK = SHAPE_KEYS;
      for (var ki = 0; ki < SK.length; ki++) {
        var k = SK[ki];
        if (inst[k] !== undefined) sh[k] = inst[k];
      }
    });

    const expandedInsts = [];
    insts.forEach(function(inst) {
      if (inst.enabled === false) return;
      const shapes = (inst.shapes && inst.shapes.length > 0) ? inst.shapes : [inst];
      const enabledShapes = shapes.filter(function(s) { return s.enabled !== false; });
      var hasMultiShapes = enabledShapes.length > 1;
      enabledShapes.forEach(function(sh, si) {
        var merged = {};
        for (var k in inst) { if (inst.hasOwnProperty(k)) merged[k] = inst[k]; }
        SHAPE_KEYS.forEach(function(k) { if (sh[k] !== undefined) merged[k] = sh[k]; });
        if (si > 0) {
          merged.gapEnabled = false;
        }
        if (hasMultiShapes) {
          if (si === 0) {
            merged.instanceBlendMode = -1;  // first shape: no blend (base)
          } else {
            // shapes 1+: use their own blend mode for compositing
            merged.instanceBlendMode = sh.blendMode != null ? sh.blendMode : 8;
            merged.instanceBlendHueOff = sh.blendHueOff || 0;
          }
          merged.instanceOpacity = si > 0 ? (sh.blendOpacity != null ? sh.blendOpacity : 1.0) : 1.0;
          merged._gradeNeutral = true;
        } else {
          merged._gradeNeutral = false;
        }
        merged._isFirstShape = (si === 0);
        merged._isLastShape = (si === enabledShapes.length - 1);
        merged._isFinisher = false;
        merged._parentInst = inst;
        merged._origIdx = insts.indexOf(inst);
        expandedInsts.push(merged);
      });
      // Add finisher pass only if needed (blend, opacity, or grading)
      if (hasMultiShapes) {
        var needsFinisher = (inst.instanceBlendMode != null && inst.instanceBlendMode >= 0)
            || (inst.instanceOpacity != null && inst.instanceOpacity < 1.0);
        if (needsFinisher) {
          var fin = {};
          for (var k in inst) { if (inst.hasOwnProperty(k)) fin[k] = inst[k]; }
          fin.passthrough = true;
          fin.pixelShape = 0;
          fin._isFirstShape = false;
          fin._isLastShape = true;
          fin._isFinisher = true;
          fin._gradeNeutral = false;
          fin._parentInst = inst;
          fin._origIdx = insts.indexOf(inst);
          fin.instanceBlendMode = inst.instanceBlendMode != null ? inst.instanceBlendMode : -1;
          fin.instanceBlendHueOff = inst.instanceBlendHueOff || 0;
          fin.instanceOpacity = inst.instanceOpacity != null ? inst.instanceOpacity : 1.0;
          expandedInsts.push(fin);
        } else {
          // No finisher: let last shape handle grading directly
          var lastExp = expandedInsts[expandedInsts.length - 1];
          if (lastExp) { lastExp._gradeNeutral = false; lastExp._isLastShape = true; }
        }
      }
    });

    const activeInsts = expandedInsts;
    const NA = activeInsts.length;
    if (NA === 0) {
      // Nothing to do — blit scene (with blur if active) directly to screen
      if (usePrecompute) {
        ensurePrecomputeFBOs(pcFrames, W, H);
        const writeIdx = precomputePlayIdx % pcFrames;
        blitToScreen(blurredSceneTex, W, H);
        precomputeBuffer[writeIdx].ready = true;
        precomputePlayIdx = (precomputePlayIdx + 1) % pcFrames;
      } else {
        blitToScreen(blurredSceneTex, W, H);
      }
      return;
    }

    // Ensure intermediary FBOs are current (based on full instance list for consistency)
    rebuildInstanceFBOs();
    // Ensure enough FBOs for expanded shape instances (resolution-aware)
    while (instanceFBOs.length < NA) instanceFBOs.push(null);
    for (let ei = 0; ei < NA; ei++) {
      const eiRes = activeInsts[ei].overrideResolution ? activeInsts[ei].resolution : 'full';
      const [eiW, eiH] = resolveFBOSize(canvas.width, canvas.height, eiRes);
      if (!instanceFBOs[ei] || instanceFBOs[ei].w !== eiW || instanceFBOs[ei].h !== eiH) {
        if (instanceFBOs[ei]) destroyFBOSlot(instanceFBOs[ei]);
        instanceFBOs[ei] = makeFBOSlot(eiW, eiH);
      }
    }

    // Keep track of the texture that is the input to each pass
    let inputTex = blurredSceneTex;

    let parentInputTex = inputTex;
    for (let instIdx = 0; instIdx < NA; instIdx++) {
      const inst = activeInsts[instIdx];
      const isLast = instIdx === NA - 1;

      // Map active instance index back to original index for FBO slot
      const origIdx = inst._origIdx != null ? inst._origIdx : insts.indexOf(inst);

      const slot = usingRealInsts ? instanceFBOs[instIdx] : null;
      const iW = slot ? slot.w : W;
      const iH = slot ? slot.h : H;

      gl.bindFramebuffer(gl.FRAMEBUFFER, slot ? slot.fbo : null);
      gl.viewport(0, 0, iW, iH);
      gl.useProgram(edgeProg);
      bindQuad(edgeProg);

      // Scene texture input — sampleFromGeneral overrides to scene FBO
      // First shape of a group saves the parent's input; siblings reuse it
      if (inst._isFirstShape) { parentInputTex = inputTex; }
      const effectiveInput = inst.sampleFromGeneral ? blurredSceneTex : parentInputTex;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, effectiveInput);
      gl.uniform1i(eSceneTex, 0);
      // Original scene — always blurredSceneTex so cell color reads from true scene
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_2D, blurredSceneTex);
      gl.uniform1i(eOrigSceneTex, 7);
      // Accumulated result: always the chain input (for gap fallback and blend base)
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, inputTex);
      gl.uniform1i(eAccumTex, 6);
      gl.uniform2f(eRes, iW, iH);

      const gradeNeutral = !!inst._gradeNeutral;
      // Outline — only on the last shape of last parent
      gl.uniform1f(eOutlineWidth, !gradeNeutral && inst._isLastShape && p.showOutline ? p.outlineWidth : 0.0);
      const oc = hexToRgb01(p.outlineColor || '#000000');
      gl.uniform3f(eOutlineColor, oc[0], oc[1], oc[2]);

      // Per-instance pixelate params
      gl.uniform1i(ePixelate, p.pixelate ? 1 : 0);
      const pw = (inst.pixelW || 8) * (inst.pixelScale || 1);
      const ph = (inst.pixelH || 8) * (inst.pixelScale || 1);
      gl.uniform2f(ePixelSize, pw, ph);
      gl.uniform1i(eWeaveMode,   inst.weaveMode  || 0);
      // ── Multi-shape loop ──
      // Shape properties are already merged into inst by expandShapes

      gl.uniform1i(ePixelShape,  inst.pixelShape || 0);
      gl.uniform1f(eShapeMargin, inst.shapeMargin != null ? inst.shapeMargin : 0);
      gl.uniform1f(eShapeBleed,  inst.shapeBleed  != null ? inst.shapeBleed  : 0);
      gl.uniform1f(eShapeSmoothness, inst.shapeSmoothness != null ? inst.shapeSmoothness : 0);
      gl.uniform1i(eSdfAffectScale,  inst.sdfAffectScale  ? 1 : 0);
      gl.uniform1f(eSdfMinScale,     inst.sdfMinScale     != null ? inst.sdfMinScale     : 0.5);
      gl.uniform1f(eSdfMaxScale,     inst.sdfMaxScale     != null ? inst.sdfMaxScale     : 2.0);
      gl.uniform1i(eSdfAffectRotate, inst.sdfAffectRotate ? 1 : 0);
      gl.uniform1f(eSdfMinRotate,    inst.sdfMinRotate    != null ? inst.sdfMinRotate    : -45);
      gl.uniform1f(eSdfMaxRotate,    inst.sdfMaxRotate    != null ? inst.sdfMaxRotate    : 45);
      gl.uniform1i(eSdfAffectOffset, inst.sdfAffectOffset ? 1 : 0);
      gl.uniform1f(eSdfMinOffset,    inst.sdfMinOffset    != null ? inst.sdfMinOffset    : -0.3);
      gl.uniform1f(eSdfMaxOffset,    inst.sdfMaxOffset    != null ? inst.sdfMaxOffset    : 0.3);
      gl.uniform1i(eSdfAffectAlpha,  inst.sdfAffectAlpha  ? 1 : 0);
      gl.uniform1f(eSdfMinAlpha,     inst.sdfMinAlpha     != null ? inst.sdfMinAlpha     : 0.0);
      gl.uniform1f(eSdfMaxAlpha,     inst.sdfMaxAlpha     != null ? inst.sdfMaxAlpha     : 1.0);
      gl.uniform1f(ePixelScale,  inst.pixelScale  || 1);
      gl.uniform1f(eShapeScale,  inst.shapeScale  != null ? inst.shapeScale  : 1.0);
      gl.uniform1i(eForceSquare, inst.forceSquare ? 1 : 0);
      gl.uniform1i(eMaintainThickness, inst.maintainThickness ? 1 : 0);
      gl.uniform1i(eQuadReverse, inst.quadReverse ? 1 : 0);
      gl.uniform1i(eOblique,     inst.oblique     ? 1 : 0);
      gl.uniform1i(eBandOutline, p.bandOutline    ? 1 : 0);
      gl.uniform1i(eQuadSteps,   inst.quadEnabled ? (inst.quadSteps || 1) : 1);
      gl.uniform1i(eQuadEnabled, inst.quadEnabled ? 1 : 0);
      gl.uniform1i(eGenDiamond,  inst.genDiamond  ? 1 : 0);
      const gc = hexToRgb01(inst.gapColor || p.gapColor || '#000000');
      gl.uniform3f(eGapColor,    gc[0], gc[1], gc[2]);
      gl.uniform1f(eGapOpacity,  inst.gapOpacity != null ? inst.gapOpacity : (p.gapOpacity || 0));
      gl.uniform1i(eGapFiltered,    inst.gapFiltered ? 1 : 0);
      const gapOn = inst.gapEnabled !== false;
      gl.uniform1i(eGapEnabled, gapOn ? 1 : 0);
      gl.uniform1i(eInstBlendMode, inst.instanceBlendMode != null ? inst.instanceBlendMode : -1);
      gl.uniform1f(eInstBlendHueOff, inst.instanceBlendHueOff != null ? inst.instanceBlendHueOff : 0);
      // Instance opacity: only on last shape (or single shape)
      gl.uniform1f(eInstanceOpacity, inst.instanceOpacity != null ? inst.instanceOpacity : 1.0);

      // Shape gradient — upload from first Gradient Fill filter or instance fallback
      gl.activeTexture(gl.TEXTURE2);
      const gradFilter = (inst.filters || []).find(f => f.type === 15 && f.enabled !== false);
      const gradStopsSource = gradFilter ? gradFilter.gradStops : (inst.shapeGradStops || null);
      if (gradStopsSource && gradStopsSource.length >= 2) {
        const stops = gradStopsSource.slice().sort((a,b) => a.pos - b.pos);
        const gd = new Uint8Array(GRAD_WIDTH * 4);
        for (let x = 0; x < GRAD_WIDTH; x++) {
          const t = x / (GRAD_WIDTH - 1);
          let lo = stops[0], hi = stops[stops.length - 1];
          for (let j = 0; j < stops.length - 1; j++) {
            if (t >= stops[j].pos && t <= stops[j+1].pos) { lo = stops[j]; hi = stops[j+1]; break; }
          }
          const range = hi.pos - lo.pos;
          const f = range < 0.0001 ? 0 : (t - lo.pos) / range;
          gd[x*4+0] = Math.round(lo.r + (hi.r - lo.r) * f);
          gd[x*4+1] = Math.round(lo.g + (hi.g - lo.g) * f);
          gd[x*4+2] = Math.round(lo.b + (hi.b - lo.b) * f);
          gd[x*4+3] = 255;
        }
        gl.bindTexture(gl.TEXTURE_2D, shapeGradTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GRAD_WIDTH, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, gd);
      }
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, shapeGradTex);
      gl.uniform1i(eShapeGradTex, 2);
      gl.uniform1f(eShapeGradOpacity, inst.shapeGradOpacity != null ? inst.shapeGradOpacity : 0);
      const gfDir = gradFilter ? (gradFilter.gradDir || 0) : (inst.shapeGradDir != null ? inst.shapeGradDir : 0);
      gl.uniform1i(eShapeGradDir, gfDir);
      gl.uniform1i(eTileGradEnabled,  gradFilter ? 1 : (inst.tileGradEnabled !== false ? 1 : 0));
      const gfRC = gradFilter || inst;
      gl.uniform2f(eRadialCenter, gfRC.radialCenterX || 0, gfRC.radialCenterY || 0);
      gl.uniform1f(eRadialScale, gfRC.radialScale != null ? gfRC.radialScale : 1.0);
      gl.uniform1i(eEmbossBlendMode, gradFilter ? (gradFilter.blendMode || 0) : (inst.embossBlendMode || 0));
      gl.uniform1f(eEmbossHueOff, gradFilter ? (gradFilter.hueOff || 0) : (inst.embossHueOff != null ? inst.embossHueOff : 0));
      gl.uniform1i(eFillMode, 1);
      const fc = hexToRgb01(inst.fillColor || '#ffffff');
      gl.uniform3f(eFillColor, fc[0], fc[1], fc[2]);
      gl.uniform1i(ePassthrough,     inst.passthrough ? 1 : 0);
      gl.uniform1i(eTwoImage,        inst.twoImage ? 1 : 0);
      gl.uniform1i(eShapeBlendMode,      inst.blendMode != null ? inst.blendMode : -1);
      gl.uniform1f(eShapeBlendHueOff,    inst.blendHueOff != null ? inst.blendHueOff : 0);
      gl.uniform1f(eShapeBlendMagnitude, inst.blendOpacity != null ? inst.blendOpacity : 1.0);
      gl.uniform1i(eCellColorMode, inst.cellColorMode || 0);
      const ccCol = hexToRgb01(inst.customCellColor || '#ffffff');
      gl.uniform3f(eCustomCellColor, ccCol[0], ccCol[1], ccCol[2]);
      // Cell gradient: only re-upload when in Gradient mode and stops exist
      if (inst.cellColorMode === 2 && inst.cellGradStops && inst.cellGradStops.length >= 2) {
        const cgStops = inst.cellGradStops.slice().sort(function(a,b){ return a.pos - b.pos; });
        const cgd = new Uint8Array(GRAD_WIDTH * 4);
        for (let x = 0; x < GRAD_WIDTH; x++) {
          const t = x / (GRAD_WIDTH - 1);
          let lo = cgStops[0], hi = cgStops[cgStops.length - 1];
          for (let j = 0; j < cgStops.length - 1; j++) {
            if (t >= cgStops[j].pos && t <= cgStops[j+1].pos) { lo = cgStops[j]; hi = cgStops[j+1]; break; }
          }
          const range = hi.pos - lo.pos;
          const f = range < 0.0001 ? 0 : (t - lo.pos) / range;
          cgd[x*4+0] = Math.round(lo.r + (hi.r - lo.r) * f);
          cgd[x*4+1] = Math.round(lo.g + (hi.g - lo.g) * f);
          cgd[x*4+2] = Math.round(lo.b + (hi.b - lo.b) * f);
          cgd[x*4+3] = 255;
        }
        gl.activeTexture(gl.TEXTURE8);
        gl.bindTexture(gl.TEXTURE_2D, cellGradTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GRAD_WIDTH, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, cgd);
      }
      gl.activeTexture(gl.TEXTURE8);
      gl.bindTexture(gl.TEXTURE_2D, cellGradTex);
      gl.uniform1i(eCellGradTex, 8);
      gl.uniform1i(eFinalPass, isLast ? 1 : 0);

      // Banding + grading + post-process — only on last instance
      gl.uniform1i(eBanding,      !gradeNeutral && inst._isLastShape && p.banding ? 1 : 0);
      gl.uniform1f(eBandCount,    p.bandCount);
      gl.uniform1f(eBandLumMin,   p.bandLumMin);
      gl.uniform1f(eBandLumMax,   p.bandLumMax);
      gl.uniform1f(eBandStrength, p.bandStrength);
      gl.uniform1i(eBandRandomize, p.bandRandomize ? 1 : 0);
      gl.uniform1f(eGradeHue,     gradeNeutral ? 0 : p.gradeHue);
      gl.uniform1f(eGradeSat,     gradeNeutral ? 1 : p.gradeSat);
      gl.uniform1f(eGradeVal,     gradeNeutral ? 1 : p.gradeVal);
      gl.uniform1f(eGradeContrast,gradeNeutral ? 1 : p.gradeContrast);
      // For gradeNeutral shapes: only enable PP if shape has real filters (avoid legacy rgb>hsv>rgb drift)
      var shapeHasFilters = inst.filtersEnabled !== false && (inst.filters || []).length > 0;
      gl.uniform1i(ePostProcess, gradeNeutral ? (shapeHasFilters ? 1 : 0) : ((inst.filtersEnabled !== false) || (p.postProcessEnabled !== false) ? 1 : 0));

      // Filter stack: per-instance filters + global post-process on last instance
      const instFilters = (inst.filtersEnabled !== false && inst.filters && inst.filters.length > 0)
        ? inst.filters.filter(function(e) { return e.enabled !== false; }) : [];
      const globalPP = (isLast && !gradeNeutral && p.postProcessEnabled !== false && p.ppStack)
        ? p.ppStack.filter(function(e) { return e.enabled !== false; }) : [];
      const ppStack = instFilters.concat(globalPP).slice(0, 16);
      gl.uniform1i(ePPCount, ppStack.length);
      for (let k = 0; k < 16; k++) {
        if (k < ppStack.length) {
          const ppe = ppStack[k];
          gl.uniform1i(ePPType[k], ppe.type);
          const pr = window._ppGetParams ? window._ppGetParams(ppe) : [0,0,0,0];
          gl.uniform4f(ePPParams[k], pr[0], pr[1], pr[2], pr[3]);
          gl.uniform1i(ePPBlend[k], ppe.blendMode != null ? ppe.blendMode : -1);
          gl.uniform1f(ePPExtra[k], ppe.hueOff != null ? ppe.hueOff : 0);
        } else {
          gl.uniform1i(ePPType[k], -1);
          gl.uniform4f(ePPParams[k], 0, 0, 0, 0);
          gl.uniform1i(ePPBlend[k], -1);
          gl.uniform1f(ePPExtra[k], 0);
        }
      }

      // (shape loop continues — draw after all uniforms set below)

      // Opacity patterns — from first enabled OpPattern filter or instance fallback
      const opFilter = (inst.filters || []).find(f => f.type === 16 && f.enabled !== false);
      const opPatsSource = opFilter ? (opFilter.patterns || []) : (inst.opPatterns || []);
      const opPatsEnabled = opFilter ? true : (inst.opPatternsEnabled !== false);
      const opPats = opPatsSource;
      const opCount = opPatsEnabled ? opPats.filter(op => op.active !== false).length : 0;
      gl.uniform1i(eOpPatternCount, opCount);
      gl.uniform1f(eOpPatternSeed, opFilter ? (opFilter.patternSeed || 0) : (inst.opPatternSeed || 0));
      gl.uniform1i(eOpPatternMode, opFilter ? (opFilter.patternMode || 0) : (inst.opPatternMode || 0));
      for (let k = 0; k < 4; k++) gl.uniform4f(eOpPatternDims[k], 0, 0, 0, 0);
      // Opacity patterns — upload per-instance patterns to shared texture
      if (opCount > 0) {
        gl.activeTexture(gl.TEXTURE3);
        const opData = new Uint8Array(64 * 16);
        let opIdx = 0;
        for (let k = 0; k < opPats.length && opIdx < 4; k++) {
          if (opPats[k].active === false) continue;
          const rows = opPats[k].grid || [];
          for (let r = 0; r < rows.length && r < 16; r++) {
            for (let c = 0; c < rows[r].length && c < 16; c++) {
              opData[(r * 64) + (opIdx * 16) + c] = Math.round(Math.max(0, Math.min(1, rows[r][c])) * 255);
            }
          }
          opIdx++;
        }
        gl.bindTexture(gl.TEXTURE_2D, opPatternTex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 64, 16, gl.LUMINANCE, gl.UNSIGNED_BYTE, opData);
      }
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

      // Ensure scene texture stays bound — sibling shapes use same parent input
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, effectiveInput);

      gl.drawArrays(gl.TRIANGLES, 0, 6);



      // inputTex chains normally so uAccumTex gets previous shape's output
      if (!isLast && slot) {
        inputTex = slot.tex;
      }
    }

    const lastSlot = usingRealInsts ? instanceFBOs[NA - 1] : null;
    const lastTex = lastSlot ? lastSlot.tex : blurredSceneTex;

    if (!usingRealInsts) {
      // Legacy path rendered directly to screen
    } else if (usePrecompute) {
      ensurePrecomputeFBOs(pcFrames, W, H);
      const writeIdx = precomputePlayIdx % pcFrames;
      gl.bindFramebuffer(gl.FRAMEBUFFER, precomputeBuffer[writeIdx].fbo);
      gl.viewport(0, 0, W, H);
      gl.useProgram(blitProg);
      bindQuad(blitProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, lastTex);
      gl.uniform1i(blitTex, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      precomputeBuffer[writeIdx].ready = true;
      gl.finish();
      const displayIdx = (precomputePlayIdx + 1) % pcFrames;
      if (precomputeBuffer[displayIdx] && precomputeBuffer[displayIdx].ready) {
        blitToScreen(precomputeBuffer[displayIdx].tex, W, H);
      } else {
        blitToScreen(precomputeBuffer[writeIdx].tex, W, H);
      }
      precomputePlayIdx = (precomputePlayIdx + 1) % pcFrames;
    } else {
      blitToScreen(lastTex, W, H);
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
