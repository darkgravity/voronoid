// ═══ Config, Gradient, Export & Init ═══
// Config load/save, gradient editor, recording, initialization

    function setCanvasMode(mode) {
      var p = window.shaderParams;
      p.canvasMode = mode;
      document.getElementById('btn-canvas-fullscreen').classList.toggle('active', mode === 'fullscreen');
      document.getElementById('btn-canvas-custom').classList.toggle('active', mode === 'custom');
      document.getElementById('btn-canvas-imageframe').classList.toggle('active', mode === 'imageframe');
      document.getElementById('canvas-custom-controls').style.display = mode === 'custom' ? '' : 'none';
      applyCanvasSize();
    }

    function applyCanvasSize() {
      var p = window.shaderParams;
      var container = document.getElementById('canvas-container');
      var canvas = document.getElementById('glCanvas');
      if (p.canvasMode === 'custom') {
        var w = Math.round(p.canvasWidth || 1920);
        var h = Math.round(p.canvasHeight || 1080);
        container.classList.add('custom');
        canvas.classList.add('custom-size');
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
      } else if (p.canvasMode === 'imageframe') {
        var iw = window._imageSrcWidth || 1920;
        var ih = window._imageSrcHeight || 1080;
        var scale = p.imageScale || 1;
        var fw = Math.round(iw * scale);
        var fh = Math.round(ih * scale);
        container.classList.add('custom');
        canvas.classList.add('custom-size');
        canvas.style.width = fw + 'px';
        canvas.style.height = fh + 'px';
      } else {
        container.classList.remove('custom');
        canvas.classList.remove('custom-size');
        canvas.style.width = '';
        canvas.style.height = '';
      }
      window.shaderDirty = true;
    }

    // ── Canvas background color ───────────────────────────────────
    // JS mirror of fragment shader hash: fract(sin(n)*43758.5453123)
    function shaderHash(n) {
      var x = Math.sin(n) * 43758.5453123;
      return x - Math.floor(x);
    }

    // Interpolate gradient stops at position t
    function sampleGradient(stops, t) {
      if (!stops || stops.length === 0) return { r: 0.5, g: 0.5, b: 0.5 };
      // Ensure each stop has numeric r,g,b (parse hex if needed)
      var parsed = stops.map(function(s) {
        var r = s.r, g = s.g, b = s.b;
        if (r == null || isNaN(r)) {
          var h = (s.hex || '#808080').replace('#','');
          r = parseInt(h.slice(0,2),16) || 0;
          g = parseInt(h.slice(2,4),16) || 0;
          b = parseInt(h.slice(4,6),16) || 0;
        }
        return { pos: s.pos, r: r, g: g, b: b };
      });
      var sorted = parsed.slice().sort(function(a,b){ return a.pos - b.pos; });
      t = Math.max(0, Math.min(1, t));
      var lo = sorted[0], hi = sorted[sorted.length-1];
      for (var i = 0; i < sorted.length - 1; i++) {
        if (t >= sorted[i].pos && t <= sorted[i+1].pos) { lo = sorted[i]; hi = sorted[i+1]; break; }
      }
      var range = hi.pos - lo.pos;
      var f = range < 0.0001 ? 0 : (t - lo.pos) / range;
      return {
        r: (lo.r + (hi.r - lo.r) * f) / 255,
        g: (lo.g + (hi.g - lo.g) * f) / 255,
        b: (lo.b + (hi.b - lo.b) * f) / 255
      };
    }

    // Mirrors computeCellFinalColor for a given pseudo cell index `ci`
    function computeCellColorJS(ci) {
      var p = window.shaderParams;
      var colorSeed = p.colorSeed || 0;
      var gradientSeed = p.gradientSeed || 0;
      var satMin = p.satMin != null ? p.satMin : 0;
      var satMax = p.satMax != null ? p.satMax : 1;
      var valMin = p.valueMin != null ? p.valueMin : 0.75;
      var valMax = p.valueMax != null ? p.valueMax : 1.0;
      var satSeed = p.satSeed || 0;
      var brightSeed = p.brightSeed || 0;

      // cellT — mirrors: hash(float(ci)*7.31 + mod(colorSeed*53.7,6283) + mod(gradSeed*17.3,6283) + 2.9)
      var t = shaderHash(ci * 7.31 + ((colorSeed * 53.7) % 6283) + ((gradientSeed * 17.3) % 6283) + 2.9);

      var r, g, b;

      if (p.colorize !== false) {
        if ((p.colorMode || 0) === 0) {
          // Gradient mode: sample gradient at t
          var gc = sampleGradient(p.gradientStops, t);
          r = gc.r; g = gc.g; b = gc.b;
        } else {
          // Hue mode — mirrors shader hue mode path
          var h = ((ci * 0.618033988 + ((colorSeed * 0.1317) % 1.0)) % 1.0 + 1.0) % 1.0;
          h = ((h * (p.hueRadius != null ? p.hueRadius : 1.0) + (p.hueOffset || 0)) % 1.0 + 1.0) % 1.0;
          var sat = (satMin + satMax) * 0.5;
          if (satSeed > 0) {
            var sr = shaderHash(ci * 13.37 + ((satSeed * 41.3) % 6283) + 5.7);
            sat = satMin + sr * (satMax - satMin);
          }
          var val = (valMin + valMax) * 0.5;
          if (brightSeed > 0) {
            var br = shaderHash(ci * 7.31 + ((brightSeed * 53.7) % 6283) + 2.9);
            val = valMin + br * (valMax - valMin);
          }
          var rgb = hsvToRgbJS(h, sat, val);
          r = rgb[0]; g = rgb[1]; b = rgb[2];
        }
      } else {
        // No colorize — base cellColor
        var sat2 = (satMin + satMax) * 0.5;
        if (satSeed > 0) { var sr2 = shaderHash(ci*13.37+((satSeed*41.3)%6283)+5.7); sat2=satMin+sr2*(satMax-satMin); }
        var val2 = (valMin + valMax) * 0.5;
        if (brightSeed > 0) { var br2 = shaderHash(ci*7.31+((brightSeed*53.7)%6283)+2.9); val2=valMin+br2*(valMax-valMin); }
        var h2 = ((ci * 0.618033988 + ((colorSeed * 0.1317) % 1.0)) % 1.0 + 1.0) % 1.0;
        var rgb2 = hsvToRgbJS(h2, sat2, val2);
        r = rgb2[0]; g = rgb2[1]; b = rgb2[2];
      }
      return [r, g, b];
    }

    function hsvToRgbJS(h, s, v) {
      h = ((h % 1.0) + 1.0) % 1.0;
      var h6 = h * 6.0, i = Math.floor(h6), f = h6 - i;
      var p = v*(1-s), q = v*(1-s*f), tv = v*(1-s*(1-f));
      switch(i % 6) {
        case 0: return [v,tv,p];  case 1: return [q,v,p];
        case 2: return [p,v,tv];  case 3: return [p,q,v];
        case 4: return [tv,p,v];  default: return [v,p,q];
      }
    }

    function rgbFloatToHex(r, g, b) {
      return '#' + [r,g,b].map(function(c){ return Math.round(Math.max(0,Math.min(1,c))*255).toString(16).padStart(2,'0'); }).join('');
    }

    function computeRandomBgColor() {
      var p = window.shaderParams;
      // Simple: generate a single 0-1 float from the seed, then run it through
      // the active color filter exactly as the shader would.
      var t = shaderHash((p.bgSeed || 0) * 1.618033988 + 0.5);

      var r, g, b;

      if (p.colorize !== false && (p.colorMode || 0) === 0) {
        // ── Gradient mode: sample the gradient at t ──
        var gc = sampleGradient(p.gradientStops, t);
        r = gc.r; g = gc.g; b = gc.b;
      } else {
        // ── Hue mode (or no colorize): t is the raw hue, apply hueOffset + hueRadius ──
        var hueRadius = p.hueRadius != null ? p.hueRadius : 1.0;
        var hueOffset = p.hueOffset || 0;
        var hue = ((t * hueRadius + hueOffset) % 1.0 + 1.0) % 1.0;
        // Sat from satMin/satMax midpoint
        var satMin = p.satMin != null ? p.satMin : 0;
        var satMax = p.satMax != null ? p.satMax : 1;
        var sat = (satMin + satMax) * 0.5;
        // Val from valueMin/valueMax midpoint
        var valMin = p.valueMin != null ? p.valueMin : 0.75;
        var valMax = p.valueMax != null ? p.valueMax : 1.0;
        var val = (valMin + valMax) * 0.5;
        var rgb = hsvToRgbJS(hue, sat, val);
        r = rgb[0]; g = rgb[1]; b = rgb[2];
      }

      return rgbFloatToHex(r, g, b);
    }

    function updateBgRandomPreview() {
      var hex = computeRandomBgColor();
      var preview = document.getElementById('bg-random-preview');
      if (preview) preview.style.background = hex;
      if (window.shaderParams.bgMode === 'random') {
        window.shaderParams.bgColor = hex;
        applyBgColor();
      }
    }

    function setBgMode(mode) {
      var p = window.shaderParams;
      p.bgMode = mode;
      document.getElementById('btn-bg-custom').classList.toggle('active', mode === 'custom');
      document.getElementById('btn-bg-random').classList.toggle('active', mode === 'random');
      document.getElementById('bg-custom-controls').style.display = mode === 'custom' ? '' : 'none';
      document.getElementById('bg-random-controls').style.display = mode === 'random' ? '' : 'none';
      if (mode === 'random') {
        p.bgColor = computeRandomBgColor();
        updateBgRandomPreview();
      }
      applyBgColor();
    }

    function applyBgColor() {
      var hex = window.shaderParams.bgColor || '#000000';
      var container = document.getElementById('canvas-container');
      if (container) container.style.background = hex;
      document.body.style.background = hex;
      // Apply to WebGL clear color so it shows behind the canvas in custom-size mode
      if (window._glRef) {
        var gl = window._glRef;
        var c = hexToRgb01JS(hex);
        gl.clearColor(c[0], c[1], c[2], 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      window.shaderDirty = true;
    }

    function hexToRgb01JS(hex) {
      return [
        parseInt(hex.slice(1,3),16)/255,
        parseInt(hex.slice(3,5),16)/255,
        parseInt(hex.slice(5,7),16)/255
      ];
    }

    // Wire bg seed slider
    (function() {
      var sl = document.getElementById('sBgSeed');
      var disp = document.getElementById('vBgSeed');
      if (!sl) return;
      function sync(v) {
        window.shaderParams.bgSeed = v;
        if (disp) disp.value = v;
        updateBgRandomPreview();
      }
      sl.addEventListener('input', function() { sync(parseInt(sl.value)); });
      if (disp) disp.addEventListener('change', function() {
        var v = Math.max(0, Math.min(1000, parseInt(disp.value) || 0));
        sl.value = v; sync(v);
      });
    })();

    // Init bg color swatch
    (function() {
      var sw = document.getElementById('bg-color-swatch');
      if (sw) sw.style.background = window.shaderParams.bgColor || '#000000';
      applyBgColor();
    })();
    function toggleOblique() { setPixOblique(activePixelateTab); }
    function toggleQuadtree() { setPixQuad(activePixelateTab); }
    function setWeaveMode(m) { setPixWeave(activePixelateTab, m); }
    function toggleGenDiamond() { setPixGenDiamond(activePixelateTab); }
    function setPixelShape(s) { setPixShape(activePixelateTab, s); }
    function setShapeGradDir(d) { setPixSGDir(activePixelateTab, d); }
    function toggleTileGrad() { setPixTileGrad(activePixelateTab); }
    function toggleImgPixel() { togglePixImgPixel(activePixelateTab); }
    function toggleImgPixelAffectScale() { togglePixImgPixelAffect(activePixelateTab, 'scale'); }
    function toggleImgPixelAffectRotate() { togglePixImgPixelAffect(activePixelateTab, 'rotate'); }
    function toggleImgPixelAffectOffset() { togglePixImgPixelAffect(activePixelateTab, 'offset'); }
    function handleImgPixelUpload(e) { handlePixImgPixelUpload(e, activePixelateTab); }
    function addOpPattern() { addPixOpPattern(activePixelateTab); }
    function setOpPatMode(m) { setPixOpPatMode(activePixelateTab, m); }

    function toggleOutline() {
      window.shaderParams.showOutline = !window.shaderParams.showOutline;
      document.getElementById('btn-outline').classList.toggle('active', window.shaderParams.showOutline);
      document.getElementById('outline-controls').style.display = window.shaderParams.showOutline ? '' : 'none';
      window.shaderDirty = true;
    }

    function toggleBanding() {
      window.shaderParams.banding = !window.shaderParams.banding;
      var on = window.shaderParams.banding;
      document.getElementById('btn-banding-toggle').classList.toggle('on', on);
      var ctrl = document.getElementById('banding-controls');
      if(ctrl) ctrl.classList.toggle('controls-disabled', !on);
      window.shaderDirty = true;
    }

    function setBandAngleMode(m) {
      window.shaderParams.bandAngleMode = m;
      document.getElementById('btn-bandangle-all').classList.toggle('active', m === 0);
      document.getElementById('btn-bandangle-random').classList.toggle('active', m === 1);
      document.getElementById('btn-bandangle-randsides').classList.toggle('active', m === 2);
      document.getElementById('bandangle-seed-row').style.display = m >= 1 ? '' : 'none';
      window.shaderDirty = true;
    }

    function toggleRandBandCount() {
      window.shaderParams.bandRandCount = !window.shaderParams.bandRandCount;
      document.getElementById('btn-randcount').classList.toggle('active', window.shaderParams.bandRandCount);
      document.getElementById('randcount-controls').style.display = window.shaderParams.bandRandCount ? '' : 'none';
      window.shaderDirty = true;
    }

    function toggleBandRandomize() {
      window.shaderParams.bandRandomize = !window.shaderParams.bandRandomize;
      document.getElementById('btn-band-random').classList.toggle('active', window.shaderParams.bandRandomize);
      window.shaderDirty = true;
    }

    function toggleBandOutline() {
      window.shaderParams.bandOutline = !window.shaderParams.bandOutline;
      document.getElementById('btn-band-outline').classList.toggle('active', window.shaderParams.bandOutline);
      window.shaderDirty = true;
    }

    function toggleAllGroups() {
      window.shaderParams.groupsEnabled = !(window.shaderParams.groupsEnabled !== false);
      var on = window.shaderParams.groupsEnabled;
      document.getElementById('btn-groups-toggle').classList.toggle('on', on);
      var ctrl = document.getElementById('groups-controls');
      if(ctrl) ctrl.classList.toggle('controls-disabled', !on);
      // Disable/enable all card toggles visually but remember individual states
      document.querySelectorAll('#groups-list .group-card').forEach(function(card) {
        var toggle = card.querySelector('.toggle-active');
        var body = card.querySelector('.group-body');
        if(!on) {
          if(body) body.classList.add('controls-disabled');
          if(toggle) toggle.style.pointerEvents = 'none';
        } else {
          if(toggle) {
            toggle.style.pointerEvents = '';
            var isOn = toggle.classList.contains('on');
            if(body) body.classList.toggle('controls-disabled', !isOn);
          }
        }
      });
      window.shaderDirty = true;
    }

    function toggleAllOpPatterns() {
      // Legacy global function — delegate to active pixelate instance
      if (typeof activePixelateTab !== 'undefined') {
        togglePixOpPatterns(activePixelateTab);
        return;
      }
      window.shaderParams.opPatternsEnabled = !window.shaderParams.opPatternsEnabled;
      var on = window.shaderParams.opPatternsEnabled;
      var btn = document.getElementById('btn-oppattern-toggle');
      if (btn) btn.classList.toggle('on', on);
      var ctrl = document.getElementById('oppattern-controls');
      if (ctrl) ctrl.classList.toggle('controls-disabled', !on);
      uploadAllOpPatterns();
      window.shaderDirty = true;
    }

    function setOpPatMode(m) {
      // Legacy global — delegate to active pixelate instance
      if (typeof activePixelateTab !== 'undefined') {
        setPixOpPatMode(activePixelateTab, m);
        return;
      }
      window.shaderParams.opPatternMode = m;
      var b1 = document.getElementById('btn-oppat-color');
      var b2 = document.getElementById('btn-oppat-shape');
      if (b1) b1.classList.toggle('active', m === 0);
      if (b2) b2.classList.toggle('active', m === 1);
      window.shaderDirty = true;
    }

    let lastAnimTime = 0;
    function togglePlay() {
      const p = window.shaderParams;
      p.animating = !p.animating;
      const btn = document.getElementById('btn-play');
      btn.classList.toggle('active', p.animating);
      // Panel play/stop icons
      const ppi = document.getElementById('panel-play-icon');
      const psi = document.getElementById('panel-stop-icon');
      if (ppi) ppi.style.display = p.animating ? 'none' : '';
      if (psi) psi.style.display = p.animating ? '' : 'none';
      // Mobile float play/stop icons
      const fp = document.getElementById('btn-float-play');
      if (fp) fp.classList.toggle('active', p.animating);
      const pi = document.getElementById('float-play-icon');
      const si = document.getElementById('float-stop-icon');
      if (pi) pi.style.display = p.animating ? 'none' : '';
      if (si) si.style.display = p.animating ? '' : 'none';
      window.shaderDirty = true;
    }

    // Safe file download — prevents page reload on mobile
    function downloadBlob(blob, filename) {
      // Try navigator.share for mobile (if supported and user wants it)
      // Otherwise use standard download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
      a.href = url;
      a.download = filename;
      a.target = '_self';
      a.rel = 'noopener';
      document.body.appendChild(a);
      // Use setTimeout to break out of any event handler chain
      setTimeout(() => {
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 500);
      }, 0);
    }

    function saveConfig() {
      const p = JSON.parse(JSON.stringify(window.shaderParams));
      delete p.animating;
      const json = JSON.stringify(p, null, 2);
      // Use octet-stream to force download instead of browser trying to open JSON
      const blob = new Blob([json], { type: 'application/octet-stream' });
      downloadBlob(blob, 'voronoi-config.json');
      return false; // prevent any default action
    }

    function saveImage() {
      window.shaderDirty = true;
      requestAnimationFrame(() => {
        const canvas = document.getElementById('glCanvas');
        canvas.toBlob(function(blob) {
          if (!blob) return;
          downloadBlob(blob, 'voronoi-' + Date.now() + '.png');
        }, 'image/png');
      });
      return false;
    }

    /* ── Video Recording ──────────────────────────────────────────── */
    let videoRecorder = null, videoChunks = [], videoRecording = false, videoCancelFlag = false;

    function toggleVideoPanel() {
      const panel = document.getElementById('video-panel');
      const btn = document.getElementById('btn-video');
      const visible = panel.style.display !== 'none';
      panel.style.display = visible ? 'none' : '';
      btn.classList.toggle('active', !visible);
    }

    // FPS dropdown handled inline via onchange

    function startRecording() {
      // ═══════════════════════════════════════════════════════════════════
      // MOBILE PATH (Android/iOS) — record what's on screen, do not touch
      // animation state. The desktop path below sets p.animating=false and
      // drives frames manually via _flowTimeOverride + track.requestFrame().
      // That architecture is fundamentally broken on Android Chrome:
      //   • track.requestFrame is unavailable
      //   • setting p.animating=false interacts with the mobile budget /
      //     dirty-flag pipeline in a way that leaves the visible canvas
      //     black for the duration of the recording
      //   • the manual frame loop fights with auto-capture
      // The result was: black canvas, zero-frame video. Detect mobile and
      // bypass that architecture entirely. Just keep the animation running,
      // start MediaRecorder with auto-capture at the target fps, and stop
      // it after the requested duration. The user gets a recording of
      // exactly what they're seeing on screen.
      if (window.isMobile) {
        var canvasM = document.getElementById('glCanvas');
        var pM = window.shaderParams;
        if (!canvasM) { alert('Canvas not found.'); return; }

        if (typeof MediaRecorder === 'undefined') {
          alert('MediaRecorder is not supported in this browser. Cannot record.');
          return;
        }

        var lengthMinM = parseFloat(document.getElementById('selVideoLen').value) || 1;
        var fpsM = pM.fps || 30;
        var brSelM = document.getElementById('selVideoBitrate');
        var bitrateM = brSelM ? parseInt(brSelM.value, 10) : 25000000;
        // Cap mobile bitrate at 25 Mbps regardless of UI choice — Android
        // hardware encoders refuse to start at very high bitrates and the
        // recorder silently produces zero frames.
        if (bitrateM > 25000000) bitrateM = 25000000;

        // Probe codecs. Android Chrome supports webm/vp8 reliably; vp9 is
        // hit-or-miss; mp4 generally not. iOS Safari only does mp4/h264.
        var codecsM = [
          { mime: 'video/webm;codecs=vp8', ext: 'webm' },
          { mime: 'video/webm;codecs=vp9', ext: 'webm' },
          { mime: 'video/webm',            ext: 'webm' },
          { mime: 'video/mp4;codecs=avc1', ext: 'mp4'  },
          { mime: 'video/mp4',             ext: 'mp4'  }
        ];
        var mimeM = '', extM = 'webm';
        for (var ci = 0; ci < codecsM.length; ci++) {
          try {
            if (MediaRecorder.isTypeSupported(codecsM[ci].mime)) {
              mimeM = codecsM[ci].mime; extM = codecsM[ci].ext; break;
            }
          } catch(e) {}
        }
        if (!mimeM) {
          alert('No supported video codec on this device.');
          return;
        }
        console.log('%c[startRecording MOBILE] codec=' + mimeM + ' fps=' + fpsM + ' bitrate=' + bitrateM, 'background:#06a;color:#fff;padding:2px 6px;border-radius:3px');

        // Mark recording active so engine.js v20.4 forces a draw every rAF
        // (otherwise the dirty-flag early-out can let the buffer go stale
        // between draws and the recorder samples cleared pixels).
        window._recordingActive = true;
        window._recordingSizeOverride = null;
        // Critically: do NOT touch pM.animating, pM.fastMode, pM.renderRes,
        // pM.rot, _flowTimeOverride, or anything else. The animation keeps
        // running on its own.

        var streamM;
        try {
          streamM = canvasM.captureStream(fpsM);
        } catch(e) {
          window._recordingActive = false;
          alert('canvas.captureStream() failed: ' + e.message);
          return;
        }

        var recorderM;
        try {
          recorderM = new MediaRecorder(streamM, {
            mimeType: mimeM,
            videoBitsPerSecond: bitrateM
          });
        } catch(e) {
          // Retry without bitrate hint — some Android encoders reject it.
          try { recorderM = new MediaRecorder(streamM, { mimeType: mimeM }); }
          catch(e2) {
            window._recordingActive = false;
            alert('MediaRecorder init failed: ' + e2.message);
            return;
          }
        }

        var chunksM = [];
        var startMsM = Date.now();
        var durMsM = lengthMinM * 60 * 1000;
        var stopTimerM = null;
        var progTimerM = null;
        var stoppedM = false;
        var cancelledM = false;

        recorderM.ondataavailable = function(ev) {
          if (ev.data && ev.data.size > 0) chunksM.push(ev.data);
        };
        recorderM.onerror = function(ev) {
          console.error('[rec MOBILE] error', ev);
        };
        recorderM.onstop = function() {
          if (stopTimerM) { clearTimeout(stopTimerM); stopTimerM = null; }
          if (progTimerM) { clearInterval(progTimerM); progTimerM = null; }
          window._recordingActive = false;
          // Stop the stream tracks
          try {
            var tracks = streamM.getTracks();
            for (var ti = 0; ti < tracks.length; ti++) tracks[ti].stop();
          } catch(e) {}
          if (!cancelledM && chunksM.length > 0) {
            var blob = new Blob(chunksM, { type: mimeM });
            var fname = 'voronoi-mobile-' + canvasM.width + 'x' + canvasM.height + '-' + Date.now() + '.' + extM;
            downloadBlob(blob, fname);
            document.getElementById('video-status').textContent = 'Saved (' + (blob.size/1048576).toFixed(1) + ' MB)';
          } else if (chunksM.length === 0) {
            document.getElementById('video-status').textContent = 'No frames captured (encoder issue)';
          } else {
            document.getElementById('video-status').textContent = 'Cancelled';
          }
          chunksM = [];
          // Restore UI after a short delay so the user can see the status
          setTimeout(function() {
            document.getElementById('btn-record').style.display = '';
            document.getElementById('btn-cancel-record').style.display = 'none';
            document.getElementById('video-progress').style.display = 'none';
            document.getElementById('video-bar').style.width = '0%';
            document.getElementById('video-status').textContent = '';
            var indi = document.getElementById('rec-indicator');
            if (indi) indi.classList.remove('visible');
          }, 3000);
        };

        // Override window.cancelRecording for the duration of this mobile
        // recording so the Cancel button stops THIS recorder, not the
        // desktop manual loop's flag.
        var prevCancel = window.cancelRecording;
        window.cancelRecording = function() {
          cancelledM = true;
          if (recorderM && recorderM.state !== 'inactive') {
            try { recorderM.stop(); } catch(e) {}
          }
          window.cancelRecording = prevCancel;
        };

        // Start the recorder. Use a 1s timeslice so chunks accumulate
        // periodically and a sudden stop/crash doesn't lose everything.
        try {
          recorderM.start(1000);
        } catch(e) {
          window._recordingActive = false;
          alert('MediaRecorder.start() failed: ' + e.message);
          return;
        }

        // UI
        document.getElementById('btn-record').style.display = 'none';
        document.getElementById('btn-cancel-record').style.display = '';
        document.getElementById('video-progress').style.display = '';
        var indiM = document.getElementById('rec-indicator');
        if (indiM) indiM.classList.add('visible');

        progTimerM = setInterval(function() {
          var elapsed = Date.now() - startMsM;
          var pct = Math.min(100, (elapsed / durMsM) * 100);
          document.getElementById('video-bar').style.width = pct.toFixed(1) + '%';
          var sec = (elapsed / 1000) | 0;
          var m = (sec / 60) | 0;
          var s = sec % 60;
          var status = canvasM.width + '×' + canvasM.height + ' · ' + m + ':' + (s < 10 ? '0' : '') + s + '/' + lengthMinM + ':00 · ' + mimeM.split(';')[0];
          document.getElementById('video-status').textContent = status;
          var rt = document.getElementById('rec-text');
          if (rt) rt.textContent = 'REC ' + m + ':' + (s < 10 ? '0' : '') + s;
        }, 250);

        stopTimerM = setTimeout(function() {
          if (recorderM && recorderM.state !== 'inactive' && !stoppedM) {
            stoppedM = true;
            try { recorderM.stop(); } catch(e) {}
          }
        }, durMsM);

        return; // ← END OF MOBILE PATH
      }
      // ═══════════════════════════════════════════════════════════════════
      // DESKTOP PATH continues below — manual frame loop with full quality
      // ═══════════════════════════════════════════════════════════════════
      const format = document.getElementById('selVideoFmt').value;
      const canvas = document.getElementById('glCanvas');
      const p = window.shaderParams;
      const lengthMin = parseFloat(document.getElementById('selVideoLen').value);
      const fps = p.fps || 30;
      const totalFrames = Math.round(lengthMin * 60 * fps);
      const wasAnimating = p.animating;
      const savedRot = p.rot;
      const savedFlowTime = window._flowTime || 0;

      // ── Force highest-quality rendering for the duration of the recording ──
      // Read target resolution from new dropdown (default 1920x1080); recording
      // canvas size is independent of the on-screen canvas size. The special
      // value "screen" means: do NOT override, just use whatever size the
      // canvas already is. This is the recommended choice on mobile because
      // overriding to e.g. 1920×1080 on a phone forces the GPU to render
      // millions more fragments per frame than the mobile budget can handle,
      // which stalls the render loop and produces black recordings.
      const resSel = document.getElementById('selVideoRes');
      const resVal = resSel ? resSel.value : '1920x1080';
      const screenMode = (resVal === 'screen');
      let recW, recH;
      if (screenMode) {
        recW = canvas.width  | 0;
        recH = canvas.height | 0;
      } else {
        const parts = resVal.split('x').map(function(n){ return parseInt(n,10); });
        recW = parts[0]; recH = parts[1];
      }
      console.log('%c[startRecording] mode=' + (screenMode ? 'screen-native' : 'override') + ' ' + recW + 'x' + recH, 'background:#06a;color:#fff;padding:2px 6px;border-radius:3px');
      // Read target bitrate (default 100 Mbps)
      const brSel = document.getElementById('selVideoBitrate');
      const bitrate = brSel ? parseInt(brSel.value,10) : 100000000;

      // ──────────────────────────────────────────────────────────────────
      // MOBILE LIVE-CANVAS FAST PATH (v20.5)
      // The standard recording flow below sets p.animating=false and tries
      // to drive frames manually via _flowTimeOverride + double rAF + (on
      // browsers that support it) track.requestFrame(). On Android Chrome
      // this does not work — track.requestFrame is missing, p.animating=false
      // pauses the visible canvas, and the recording captures black/0 frames.
      // Multiple attempts to "fix" this from the engine side failed because
      // they all relied on the manual drive loop functioning.
      //
      // The fundamental insight: on mobile in Screen-Size mode we don't WANT
      // a manual drive loop. The user wants to record what they see. The
      // visible animation is already running every frame at the device's
      // natural rate. Just attach captureStream to it, start MediaRecorder,
      // and stop after the requested duration. Touch nothing else — no
      // animating flag, no flow time override, no resize, no fast-mode flip.
      // ──────────────────────────────────────────────────────────────────
      if (window.isMobile && screenMode && format === 'webm-hq') {
        console.log('%c[startRecording] MOBILE LIVE-CANVAS path active', 'background:#fa0;color:#000;padding:2px 6px;border-radius:3px');

        const codecCandidates = [
          { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
          { mime: 'video/webm;codecs=vp9',      ext: 'webm' },
          { mime: 'video/webm;codecs=vp8',      ext: 'webm' },
          { mime: 'video/webm',                 ext: 'webm' },
          { mime: 'video/mp4;codecs=avc1',      ext: 'mp4'  },
          { mime: 'video/mp4',                  ext: 'mp4'  }
        ];
        let mime = '', fileExt = 'webm';
        for (const c of codecCandidates) {
          try { if (MediaRecorder.isTypeSupported(c.mime)) { mime = c.mime; fileExt = c.ext; break; } } catch(e) {}
        }
        if (!mime) {
          alert('No supported video codec found on this device. Try PNG Sequence for lossless export.');
          return;
        }
        console.log('[startRecording] mobile codec=' + mime);

        let stream;
        try {
          stream = canvas.captureStream(fps);
        } catch(e) {
          alert('canvas.captureStream() failed: ' + e.message);
          return;
        }

        let mobileRec;
        try {
          mobileRec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
        } catch(e) {
          try { mobileRec = new MediaRecorder(stream, { mimeType: mime }); }
          catch(e2) { alert('MediaRecorder init failed: ' + e2.message); return; }
        }

        const mobileChunks = [];
        const mobileStartMs = Date.now();
        const mobileDurMs = lengthMin * 60 * 1000;

        mobileRec.ondataavailable = function(ev) {
          if (ev.data && ev.data.size > 0) mobileChunks.push(ev.data);
        };
        mobileRec.onerror = function(ev) {
          console.error('[startRecording] mobile rec error', ev);
        };
        mobileRec.onstop = function() {
          const blob = new Blob(mobileChunks, { type: mime });
          if (blob.size > 0 && !videoCancelFlag) {
            downloadBlob(blob, 'voronoi-' + recW + 'x' + recH + '-' + Date.now() + '.' + fileExt);
          }
          // Reset flags & UI — minimal state was touched
          videoRecording = false;
          videoCancelFlag = false;
          window._recordingActive = false;
          resetVideoUI();
        };

        try {
          mobileRec.start(1000); // emit chunks every 1s so cancellation/crash keeps partial data
        } catch(e) {
          alert('MediaRecorder.start() failed: ' + e.message);
          return;
        }

        // Minimal state: only flag _recordingActive (so isFast() and engine
        // can know recording is happening if needed) and the cancel flag.
        // DO NOT touch p.animating, _recordingSizeOverride, p.fastMode, or
        // p.renderRes. The visible canvas keeps running on its natural loop.
        window._recordingActive = true;
        videoRecording = true;
        videoCancelFlag = false;
        videoRecorder = mobileRec; // expose so cancelRecording() can stop it

        document.getElementById('btn-record').style.display = 'none';
        document.getElementById('btn-cancel-record').style.display = '';
        document.getElementById('video-progress').style.display = '';
        document.getElementById('rec-indicator').classList.add('visible');

        const mobileProgTimer = setInterval(function() {
          if (videoCancelFlag || mobileRec.state === 'inactive') {
            clearInterval(mobileProgTimer);
            return;
          }
          const el = Date.now() - mobileStartMs;
          const pct = Math.min(100, (100 * el / mobileDurMs)).toFixed(1);
          const bar = document.getElementById('video-bar');
          if (bar) bar.style.width = pct + '%';
          const status = document.getElementById('video-status');
          if (status) status.textContent = recW + '×' + recH + ' · ' + formatTime(el/1000) + ' / ' + formatTime(mobileDurMs/1000) + '  (' + pct + '%)';
          const recTxt = document.getElementById('rec-text');
          if (recTxt) recTxt.textContent = 'REC ' + formatTime(el/1000);
        }, 200);

        setTimeout(function() {
          if (mobileRec.state !== 'inactive') {
            try { mobileRec.stop(); } catch(e) {}
          }
        }, mobileDurMs);

        return; // skip the standard desktop drive-loop path entirely
      }
      // ──────────────────────────────────────────────────────────────────
      // END mobile fast path — fall through to standard desktop path
      // ──────────────────────────────────────────────────────────────────

      // Save state we're about to clobber so we can restore in finish()
      const savedFastMode    = p.fastMode;
      const savedRenderRes   = p.renderRes;
      const savedCanvasW     = canvas.width;
      const savedCanvasH     = canvas.height;
      const savedCanvasCssW  = canvas.style.width;
      const savedCanvasCssH  = canvas.style.height;

      // Activate recording mode: isFast() now returns false (desktop only —
      // engine.js v20.3 keeps mobile in fast mode during recording so the GPU
      // doesn't stall), syncSize() honors override.
      window._recordingActive     = true;
      if (!screenMode) {
        window._recordingSizeOverride = { w: recW, h: recH };
        p.fastMode  = false;
        p.renderRes = 1;
      } else {
        // Screen mode: leave canvas at native size, do NOT touch fastMode or
        // renderRes. On mobile this preserves the mobile-budget render path
        // that the user is actually seeing on screen.
        window._recordingSizeOverride = null;
      }
      // Trigger a resize on the next render frame; engine.js syncSize() picks up the override
      window.shaderDirty = true;

      videoCancelFlag = false;
      videoRecording = true;
      p.animating = false;

      // Show progress UI
      document.getElementById('btn-record').style.display = 'none';
      document.getElementById('btn-cancel-record').style.display = '';
      document.getElementById('video-progress').style.display = '';
      document.getElementById('rec-indicator').classList.add('visible');
      const startTime = Date.now();

      function updateProgress(frame) {
        const pct = ((frame / totalFrames) * 100).toFixed(1);
        document.getElementById('video-bar').style.width = pct + '%';
        const elapsedSec = (Date.now() - startTime) / 1000;
        const estTotal = frame > 0 ? (elapsedSec / frame) * totalFrames : 0;
        document.getElementById('video-status').textContent =
          recW + '×' + recH + ' · ' + formatTime(elapsedSec) + ' / ~' + formatTime(estTotal) + '  (' + pct + '%)';
        document.getElementById('rec-text').textContent = 'REC ' + formatTime(elapsedSec);
      }

      function finish() {
        videoRecording = false;
        // ── Restore everything we changed ──
        window._recordingActive       = false;
        window._recordingSizeOverride = null;
        p.fastMode  = savedFastMode;
        p.renderRes = savedRenderRes;
        canvas.style.width  = savedCanvasCssW;
        canvas.style.height = savedCanvasCssH;
        // Force a resize back to on-screen dimensions
        resetVideoUI();
        p.rot = savedRot;
        window._flowTimeOverride = savedFlowTime;
        if (!wasAnimating) p.animating = false;
        window.shaderDirty = true;
      }

      // Advance all animation state for a given frame index
      function advanceRecordFrame(frame, dt) {
        const isFlow = p.mode === 4;
        // Rotation (used by voronoi/noise modes and as secondary for flow)
        p.rot = (savedRot + p.animSpeed * frame * dt) % 360;
        const slider = document.getElementById('sRot');
        if (slider) slider.value = p.rot;
        const label = document.getElementById('vRot');
        if (label) { if (label.tagName === 'INPUT') label.value = Math.round(p.rot); else label.textContent = Math.round(p.rot) + '°'; }
        // Flow time (used by flow mode — drives iTime uniform via window._flowTimeOverride)
        if (isFlow) {
          const flowSpeed = p.flowSpeed != null ? p.flowSpeed : 1.0;
          window._flowTimeOverride = savedFlowTime + flowSpeed * frame * dt;
        }
        window.shaderDirty = true;
      }

      if (format === 'webm-hq') {
        // ── WebM via MediaRecorder ──
        // Try manual frame mode first: captureStream(0) with explicit
        // track.requestFrame() per rendered frame. This is the canonical
        // workflow because frames align exactly with rendered frames.
        // PROBLEM: on Android Chrome and some other mobile browsers, the
        // resulting video track has NO requestFrame() method. Without it the
        // manual loop pushes nothing into the recorder and the video has 0
        // frames (which is exactly the bug the user reported). Detect this
        // and fall back to automatic capture at the target fps — slightly
        // less precise but produces a real, playable video on mobile.
        let stream = canvas.captureStream(0);
        let useAutoCapture = false;
        let _probe = stream.getVideoTracks()[0];
        if (!_probe || typeof _probe.requestFrame !== 'function') {
          console.warn('[startRecording] track.requestFrame() unavailable — falling back to auto-capture at ' + fps + 'fps');
          try { if (_probe) _probe.stop(); } catch(e) {}
          stream = canvas.captureStream(fps);
          useAutoCapture = true;
        }
        // Codec fallback chain. VP9 first (best quality on Chrome/Edge), then
        // VP8 (still acceptable), then mp4/h264 for iOS Safari and Android
        // browsers that lack VP9. Each candidate carries its own file extension.
        const codecCandidates = [
          { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
          { mime: 'video/webm;codecs=vp9',      ext: 'webm' },
          { mime: 'video/webm;codecs="vp9.0"',  ext: 'webm' },
          { mime: 'video/webm;codecs=vp8',      ext: 'webm' },
          { mime: 'video/webm',                 ext: 'webm' },
          { mime: 'video/mp4;codecs=avc1',      ext: 'mp4'  },
          { mime: 'video/mp4',                  ext: 'mp4'  }
        ];
        let mime = '', fileExt = 'webm';
        for (const c of codecCandidates) {
          try {
            if (MediaRecorder.isTypeSupported(c.mime)) { mime = c.mime; fileExt = c.ext; break; }
          } catch(e) {}
        }
        if (!mime) {
          alert('No supported video codec found on this device. Try PNG Sequence for lossless export.');
          finish(); return;
        }
        console.log('[startRecording] codec=' + mime + ' ext=' + fileExt);

        videoChunks = [];
        videoRecorder = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: bitrate
        });
        videoRecorder.ondataavailable = (e) => { if (e.data.size > 0) videoChunks.push(e.data); };
        videoRecorder.onstop = () => {
          if (!videoCancelFlag) {
            const blob = new Blob(videoChunks, { type: mime });
            downloadBlob(blob, 'voronoi-' + recW + 'x' + recH + '-' + Date.now() + '.' + fileExt);
          }
          finish();
        };
        videoRecorder.start();

        let frame = 0;
        const dt = 1.0 / fps;

        if (useAutoCapture) {
          // ── Auto-capture path (mobile / browsers without requestFrame) ──
          // captureStream(fps) is sampling the canvas on its own timer at the
          // target fps. We do NOT try to drive frames manually — that path
          // requires p.animating=false + manual _flowTimeOverride feeding,
          // which on mobile interacts badly with the budget pipeline / dirty
          // flag / FBO chain and produces black recordings.
          //
          // Instead: restore p.animating to whatever it was, let the engine's
          // own render loop animate the canvas in real time, and just poll
          // for cancel + duration. The recording becomes a real-time screen
          // capture of what is actually visible — which is exactly what the
          // user expects on mobile and what already works.
          p.animating = wasAnimating;
          window._flowTimeOverride = null; // never drive flow time manually
          const recStartMs = performance.now();
          const recDurMs   = totalFrames * dt * 1000;
          function pollAuto() {
            if (videoCancelFlag) {
              try { videoRecorder.stop(); } catch(e) {}
              return;
            }
            const elapsedMs = performance.now() - recStartMs;
            const f = Math.min(totalFrames, Math.floor((elapsedMs / 1000) * fps));
            if (f !== frame) { frame = f; updateProgress(frame); }
            if (elapsedMs >= recDurMs) {
              try { videoRecorder.stop(); } catch(e) {}
              return;
            }
            // Poll at ~20Hz — fast enough to keep the progress bar smooth and
            // respond to cancel quickly, slow enough not to monopolize the
            // event loop on mobile.
            setTimeout(pollAuto, 50);
          }
          pollAuto();
        } else {
          // ── Manual frame mode (desktop with track.requestFrame()) ──
          // Drive frames one-by-one for exact frame timing. Each iteration:
          // advance state → double rAF → requestFrame → next iteration.
          function renderWebM() {
            if (videoCancelFlag || frame >= totalFrames) { videoRecorder.stop(); return; }
            advanceRecordFrame(frame, dt);
            // Double rAF: first rAF triggers the GL draw, second rAF ensures GPU finished
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const track = stream.getVideoTracks()[0];
                if (track.requestFrame) track.requestFrame();
                frame++;
                updateProgress(frame);
                setTimeout(renderWebM, 0);
              });
            });
          }
          renderWebM();
        }

      } else if (format === 'png-zip') {
        // ── PNG Sequence → ZIP (lossless) ──
        if (typeof JSZip === 'undefined') {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
          script.onload = () => recordPngSequence(canvas, totalFrames, fps, p, savedFlowTime, startTime, advanceRecordFrame, updateProgress, finish);
          script.onerror = () => { alert('Failed to load JSZip library. Check network connection.'); finish(); };
          document.head.appendChild(script);
        } else {
          recordPngSequence(canvas, totalFrames, fps, p, savedFlowTime, startTime, advanceRecordFrame, updateProgress, finish);
        }
      }
    }

    function recordPngSequence(canvas, totalFrames, fps, p, savedFlowTime, startTime, advanceRecordFrame, updateProgress, finish) {
      const zip = new JSZip();
      const folder = zip.folder('frames');
      const padLen = totalFrames.toString().length;
      let frame = 0;
      const dt = 1.0 / fps;

      function renderPng() {
        if (videoCancelFlag || frame >= totalFrames) {
          if (videoCancelFlag) { finish(); return; }
          document.getElementById('video-status').textContent = 'Compressing ZIP...';
          zip.generateAsync({ type: 'blob', compression: 'STORED' }).then(blob => {
            downloadBlob(blob, 'voronoi-frames-' + Date.now() + '.zip');
            finish();
          });
          return;
        }

        advanceRecordFrame(frame, dt);

        // Double rAF to ensure GPU fully renders before PNG capture
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            canvas.toBlob(blob => {
              const name = 'frame_' + String(frame).padStart(padLen, '0') + '.png';
              folder.file(name, blob);
              frame++;
              updateProgress(frame);
              setTimeout(renderPng, 0);
            }, 'image/png');
          });
        });
      }
      renderPng();
    }

    function cancelRecording() {
      videoCancelFlag = true;
    }

    function resetVideoUI() {
      document.getElementById('btn-record').style.display = '';
      document.getElementById('btn-cancel-record').style.display = 'none';
      document.getElementById('video-progress').style.display = 'none';
      document.getElementById('video-bar').style.width = '0%';
      document.getElementById('video-status').textContent = '';
      document.getElementById('rec-indicator').classList.remove('visible');
    }

    function formatTime(seconds) {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return m + ':' + s.toString().padStart(2, '0');
    }

    function loadConfig() {
      document.getElementById('configFileInput').click();
    }

    function handleConfigLoad(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const loaded = JSON.parse(e.target.result);
          applyLoadedConfig(loaded);
        } catch(err) {
          console.error('Config load error:', err);
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    }

    function loadFlavor(url) {
      if (!url) return;
      fetch(url)
        .then(r => { if (!r.ok) throw new Error('Not found: ' + url); return r.json(); })
        .then(data => applyLoadedConfig(data))
        .catch(err => console.error('Flavor load error:', err));
    }

    // Load flavors.json to populate dropdown
    fetch('flavors.json')
      .then(r => r.json())
      .then(flavors => {
        const sel = document.getElementById('selFlavor');
        flavors.forEach(f => {
          const opt = document.createElement('option');
          opt.value = f.file;
          opt.textContent = f.name;
          sel.appendChild(opt);
        });
      })
      .catch(() => {}); // no flavors.json = silently skip

    function applyLoadedConfig(loaded) {
      // Stop animation first
      window.shaderParams.animating = false;
      const btn = document.getElementById('btn-play');
      btn.classList.remove('active');
      const ppi = document.getElementById('panel-play-icon');
      const psi = document.getElementById('panel-stop-icon');
      if (ppi) ppi.style.display = '';
      if (psi) psi.style.display = 'none';
      const fpi = document.getElementById('float-play-icon');
      const fsi = document.getElementById('float-stop-icon');
      if (fpi) fpi.style.display = '';
      if (fsi) fsi.style.display = 'none';
      const fpb = document.getElementById('btn-float-play');
      if (fpb) fpb.classList.remove('active');

      // Merge loaded config
      Object.assign(window.shaderParams, loaded);
      window.shaderParams.animating = false;

      // Update groupIdCounter
      const groups = window.shaderParams.groups || [];
      groupIdCounter = groups.reduce((mx, g) => Math.max(mx, g.id || 0), 0);

      applyConfigToUI();
      if (window.forceResize) window.forceResize();
      window.shaderDirty = true;

      // Restore image pixel textures from saved dataURLs.
      // uploadInstanceImgPixelTex is defined inside shader.js which may not have
      // finished compiling yet. We queue uploads and flush them as soon as the
      // function becomes available (shader.js calls window._flushTexQueue on ready).
      function tryUpload(fn, ...args) {
        if (typeof window[fn] === 'function') {
          window[fn](...args);
          window.shaderDirty = true;
        } else {
          window._texUploadQueue = window._texUploadQueue || [];
          window._texUploadQueue.push({ fn, args });
        }
      }

      var insts = window.shaderParams.pixelateInstances || [];
      insts.forEach(function(inst, idx) {
        if (inst.imgDataURL) {
          var img = new Image();
          img.onload = function() { tryUpload('uploadInstanceImgPixelTex', idx, img); };
          img.src = inst.imgDataURL;
        }
        if (inst.imgData2URL) {
          var img2 = new Image();
          img2.onload = function() { tryUpload('uploadInstanceImgPixel2Tex', idx, img2); };
          img2.src = inst.imgData2URL;
        }
        // Per-shape images: walk inst.shapes and upload each shape's image
        // to its own texture (multi-shape instances can have unique images
        // per shape now). Uses uploadShapeImgPixelTex with the shape object.
        if (inst.shapes && inst.shapes.length > 0) {
          inst.shapes.forEach(function(sh) {
            if (sh.imgDataURL) {
              var sImg = new Image();
              sImg.onload = function() { tryUpload('uploadShapeImgPixelTex', sh, sImg); };
              sImg.src = sh.imgDataURL;
            }
            if (sh.imgData2URL) {
              var sImg2 = new Image();
              sImg2.onload = function() { tryUpload('uploadShapeImgPixel2Tex', sh, sImg2); };
              sImg2.src = sh.imgData2URL;
            }
          });
        }
      });

      // Restore image source texture
      if (window.shaderParams.imageDataURL) {
        var srcImg = new Image();
        srcImg.onload = function() { tryUpload('uploadImageSourceTex', srcImg); };
        srcImg.src = window.shaderParams.imageDataURL;
      }
    }

    function applyConfigToUI() {
      const p = window.shaderParams;

      function el(id) { return document.getElementById(id); }
      function setSlider(id, val, dispId, fmt) {
        const s = el(id), d = el(dispId);
        if (s && val != null) s.value = val;
        if (d && fmt && val != null) {
          if (d.tagName === 'INPUT') {
            d.value = String(fmt(val)).replace(/[°%]/g,'').trim();
          } else {
            d.textContent = fmt(val);
          }
        }
      }
      function setToggle(id, active) {
        const e = el(id); if (e) e.classList.toggle('active', !!active);
      }
      function setVis(id, show) {
        const e = el(id); if (e) e.style.display = show ? '' : 'none';
      }

      // Mode
      // Source
      var src = p.source || 'pattern';
      if (src === 'voronoi') src = 'pattern'; // backward compat
      p.source = src;
      setToggle('btn-src-pattern', src === 'pattern');
      setToggle('btn-src-image', src === 'image');
      setToggle('btn-src-camera', src === 'camera');
      setVis('voronoi-sections', src === 'pattern');
      setVis('voronoi-sections-2', src === 'pattern');
      setVis('camera-controls', src === 'camera');
      setVis('image-controls', src === 'image');

      setToggle('btn-chebyshev', p.mode === 0);
      setToggle('btn-manhattan', p.mode === 1);
      setToggle('btn-euclidean', p.mode === 2);
      setToggle('btn-noise', p.mode === 3);
      var btnFlow = el('btn-flow'); if(btnFlow) btnFlow.classList.toggle('active', p.mode === 4);
      setVis('noise-controls', p.mode === 3);
      setVis('flow-controls', p.mode === 4);
      setVis('voronoi-controls', p.mode !== 3 && p.mode !== 4);

      // Sliders
      setSlider('sPoints', p.points, 'vPoints', v => Math.round(v));
      setSlider('sSeed', p.seed, 'vSeed', v => Math.round(v));
      setSlider('sRot', p.rot, 'vRot', v => Math.round(v) + '°');
      setSlider('sDx', p.dx, 'vDx', v => v.toFixed(2));
      setSlider('sDy', p.dy, 'vDy', v => v.toFixed(2));
      setSlider('sSx', p.sx, 'vSx', v => v.toFixed(2));
      setSlider('sSy', p.sy, 'vSy', v => v.toFixed(2));
      setSlider('sSpring', p.spring, 'vSpring', v => v.toFixed(1));
      setSlider('sGridUnit', p.gridUnit, 'vGridUnit', v => Math.round(v));
      setSlider('sNoiseElemSize', p.noiseElementSize || 0.5, 'vNoiseElemSize', v => v.toFixed(2));
      setSlider('sGlobalPixelScale', p.globalPixelScale != null ? p.globalPixelScale : 1.0, 'vGlobalPixelScale', v => v.toFixed(2));
      setSlider('sNoiseOffsetX', p.noiseOffsetX || 0, 'vNoiseOffsetX', v => v.toFixed(3));
      setSlider('sNoiseOffsetY', p.noiseOffsetY || 0, 'vNoiseOffsetY', v => v.toFixed(3));
      setSlider('sNoiseOctaves', p.noiseOctaves != null ? p.noiseOctaves : 5, 'vNoiseOctaves', v => Math.round(v));
      setSlider('sNoiseLac', p.noiseLacunarity != null ? p.noiseLacunarity : 2, 'vNoiseLac', v => v.toFixed(2));
      setSlider('sNoiseRough', p.noiseRoughness != null ? p.noiseRoughness : 0.5, 'vNoiseRough', v => v.toFixed(2));
      setSlider('sFlowScale',    p.flowScale    != null ? p.flowScale    : 2.0,  'vFlowScale',    v => v.toFixed(2));
      setSlider('sFlowSpeed',    p.flowSpeed    != null ? p.flowSpeed    : 1.0,  'vFlowSpeed',    v => v.toFixed(2));
      setSlider('sFlowDistort1', p.flowDistort1 != null ? p.flowDistort1 : 8.1,  'vFlowDistort1', v => v.toFixed(2));
      setSlider('sFlowDistort2', p.flowDistort2 != null ? p.flowDistort2 : 4.13, 'vFlowDistort2', v => v.toFixed(2));
      setSlider('sFlowSmoothLo', p.flowSmoothLo != null ? p.flowSmoothLo : 0.15, 'vFlowSmoothLo', v => v.toFixed(2));
      setSlider('sFlowSmoothHi', p.flowSmoothHi != null ? p.flowSmoothHi : 0.85, 'vFlowSmoothHi', v => v.toFixed(2));
      // Flow type + Flow 2 controls
      var ft = p.flowType != null ? p.flowType : 0;
      setFlowType(ft);
      var f1s = p.flow1Style != null ? p.flow1Style : 0;
      setFlow1Style(f1s);
      setSlider('sFlowHueOffset', p.flowHueOffset != null ? p.flowHueOffset : 0.0, 'vFlowHueOffset', v => v.toFixed(3));
      setSlider('sFlowHueRadius', p.flowHueRadius != null ? p.flowHueRadius : 1.0, 'vFlowHueRadius', v => v.toFixed(3));
      // Flow1 hue toggle
      var fhe = !!p.flowHueEnabled;
      var f1hBtn = document.getElementById('btn-flow1-hue-toggle');
      if(f1hBtn) f1hBtn.classList.toggle('on', fhe);
      var f1hCtrl = document.getElementById('flow1-hue-controls');
      if(f1hCtrl) f1hCtrl.style.display = fhe ? '' : 'none';
      var f2m = p.f2Mode != null ? p.f2Mode : 0;
      setFlow2Mode(f2m);
      setSlider('sF2Scale',  p.f2Scale  != null ? p.f2Scale  : 6.0,   'vF2Scale',  v => v.toFixed(1));
      setSlider('sF2VelX',   p.f2VelX   != null ? p.f2VelX   : 0.1,   'vF2VelX',   v => v.toFixed(3));
      setSlider('sF2VelY',   p.f2VelY   != null ? p.f2VelY   : 0.2,   'vF2VelY',   v => v.toFixed(3));
      setSlider('sF2Speed',  p.f2Speed  != null ? p.f2Speed  : 2.5,   'vF2Speed',  v => v.toFixed(2));
      setSlider('sF2Detail', p.f2Detail != null ? p.f2Detail : 200.0, 'vF2Detail', v => Math.round(v));
      setSlider('sF2Twist',  p.f2Twist  != null ? p.f2Twist  : 50.0,  'vF2Twist',  v => v.toFixed(1));
      setSlider('sF2Iter1',  p.f2Iter1  != null ? p.f2Iter1  : 20,    'vF2Iter1',  v => Math.round(v));
      setSlider('sF2Iter2',  p.f2Iter2  != null ? p.f2Iter2  : 20,    'vF2Iter2',  v => Math.round(v));
      setSlider('sF2HueOffset', p.f2HueOffset != null ? p.f2HueOffset : 0.0, 'vF2HueOffset', v => v.toFixed(3));
      setSlider('sF2HueRadius', p.f2HueRadius != null ? p.f2HueRadius : 1.0, 'vF2HueRadius', v => v.toFixed(3));
      // Flow2 hue toggle
      var f2he = !!p.f2HueEnabled;
      var f2hBtn = document.getElementById('btn-f2-hue-toggle');
      if(f2hBtn) f2hBtn.classList.toggle('on', f2he);
      var f2hCtrl = document.getElementById('f2-hue-controls');
      if(f2hCtrl) f2hCtrl.style.display = f2he ? '' : 'none';
      setSlider('sImageScale', p.imageScale != null ? p.imageScale : 1, 'vImageScale', v => v.toFixed(2));
      // Noise type dropdown
      var nts = document.getElementById('selNoiseType');
      if (nts) nts.value = p.noiseType || 0;
      setSlider('sColorSeed', p.colorSeed, 'vColorSeed', v => Math.round(v));
      setSlider('sHueOffset', p.hueOffset != null ? p.hueOffset : 0, 'vHueOffset', v => v.toFixed(2));
      setSlider('sHueRadius', p.hueRadius != null ? p.hueRadius : 1, 'vHueRadius', v => v.toFixed(2));
      setSlider('sSatSeed', p.satSeed || 0, 'vSatSeed', v => Math.round(v));
      setSlider('sSatMin', p.satMin != null ? p.satMin : 0, 'vSatMin', v => v.toFixed(2));
      setSlider('sSatMax', p.satMax != null ? p.satMax : 1, 'vSatMax', v => v.toFixed(2));
      setSlider('sBrightSeed', p.brightSeed || 0, 'vBrightSeed', v => Math.round(v));
      setSlider('sValueMin', p.valueMin, 'vValueMin', v => v.toFixed(2));
      setSlider('sValueMax', p.valueMax, 'vValueMax', v => v.toFixed(2));
      setSlider('sOutlineWidth', p.outlineWidth, 'vOutlineWidth', v => v.toFixed(1));
      setSlider('sBandCount', p.bandCount, 'vBandCount', v => Math.round(v));
      setSlider('sBandStrength', p.bandStrength, 'vBandStrength', v => v.toFixed(2));
      setSlider('sBandLumMin', p.bandLumMin, 'vBandLumMin', v => v.toFixed(2));
      setSlider('sBandLumMax', p.bandLumMax, 'vBandLumMax', v => v.toFixed(2));
      setSlider('sBandHueStrength', p.bandHueStrength, 'vBandHueStrength', v => v.toFixed(2));
      setSlider('sBandHueRadius', p.bandHueRadius, 'vBandHueRadius', v => v.toFixed(2));
      setSlider('sPixelW', p.pixelW, 'vPixelW', v => Math.round(v));
      setSlider('sPixelH', p.pixelH, 'vPixelH', v => Math.round(v));
      setSlider('sPixelScale', p.pixelScale, 'vPixelScale', v => v.toFixed(2));
      setSlider('sShapeMargin', p.shapeMargin, 'vShapeMargin', v => Math.round(v));
      setSlider('sShapeBleed', p.shapeBleed, 'vShapeBleed', v => Math.round(v));
      setSlider('sShapeGradOpacity', p.shapeGradOpacity, 'vShapeGradOpacity', v => v.toFixed(2));
      // Tile Gradient toggle
      var tge = p.tileGradEnabled !== false;
      setToggle('btn-tilegrad-toggle', tge);
      var tgc = el('tilegrad-controls');
      if (tgc) tgc.classList.toggle('controls-disabled', !tge);
      setSlider('sGapOpacity', p.gapOpacity, 'vGapOpacity', v => v.toFixed(2));

      // Post-process stack
      var ppe = p.postProcessEnabled !== false;
      setToggle('btn-postprocess-toggle', ppe);
      var ppc = el('postprocess-controls');
      if (ppc) ppc.classList.toggle('controls-disabled', !ppe);
      // Smooth Edges (permanent control at top of PP panel)
      if (window.syncSmoothEdgesUI) window.syncSmoothEdgesUI();
      if (!p.ppStack) p.ppStack = [];
      // Auto-migrate legacy grading to stack if ppStack is empty
      if (p.ppStack.length === 0 && (p.gradeHue || (p.gradeSat != null && p.gradeSat !== 1) || (p.gradeVal != null && p.gradeVal !== 1) || (p.gradeContrast != null && p.gradeContrast !== 1))) {
        if (p.gradeHue || (p.gradeSat != null && p.gradeSat !== 1) || (p.gradeVal != null && p.gradeVal !== 1)) {
          p.ppStack.push({ type:4, enabled:true, id:++ppIdCounter, hue:p.gradeHue||0, saturation:((p.gradeSat!=null?p.gradeSat:1)-1), lightness:((p.gradeVal!=null?p.gradeVal:1)-1) });
        }
        if (p.gradeContrast != null && p.gradeContrast !== 1) {
          p.ppStack.push({ type:0, enabled:true, id:++ppIdCounter, brightness:0, contrast:p.gradeContrast||1 });
        }
      }
      renderPPStack();

      setSlider('sSpeed', p.animSpeed, 'vSpeed', v => Math.round(v));
      var fpsSel = document.getElementById('selFps');
      if(fpsSel) fpsSel.value = String(p.fps || 30);
      setSlider('sOpPatSeed', p.opPatternSeed, 'vOpPatSeed', v => Math.round(v));

      // Toggles
      setToggle('btn-mx', p.mirrorX);
      setToggle('btn-my', p.mirrorY);
      setToggle('btn-fx', p.flipX);
      setToggle('btn-fy', p.flipY);
      setToggle('btn-dots', p.showDots);
      setVis('dots-controls', p.showDots);
      setSlider('sDotRadius', p.dotRadius, 'vDotRadius', v => v.toFixed(3));
      setToggle('btn-snapgrid', p.snapGrid);
      setVis('snapgrid-controls', p.snapGrid);
      setToggle('btn-fast', p.fastMode);
      setVis('fast-controls', p.fastMode);
      var resSlider = el('sRenderRes');
      var resDisp = el('vRenderRes');
      if (resSlider && p.renderRes) { resSlider.value = p.renderRes; }
      if (resDisp && p.renderRes) { resDisp.textContent = p.renderRes === 1 ? 'Full' : '1/' + p.renderRes; }
      setToggle('btn-smooth', p.smoothEnabled);
      setVis('smooth-controls', p.smoothEnabled);
      setSlider('sSmoothEdge', p.smoothEdge != null ? p.smoothEdge : 2, 'vSmoothEdge', v => Math.round(v));
      setToggle('btn-merge', p.mergeEnabled);
      setVis('merge-controls', p.mergeEnabled);
      setSlider('sMergeDist', p.mergeDist != null ? p.mergeDist : 1, 'vMergeDist', v => Math.round(v));
      setToggle('btn-precompute', p.precompute);
      setVis('precompute-controls', p.precompute);
      var pcfSlider = el('sPrecomputeFrames');
      var pcfDisp = el('vPrecomputeFrames');
      if (pcfSlider) pcfSlider.value = p.precomputeFrames || 3;
      if (pcfDisp) { if(pcfDisp.tagName==='INPUT') pcfDisp.value = p.precomputeFrames||3; else pcfDisp.textContent = p.precomputeFrames||3; }
      var bt = el('btn-banding-toggle');
      if(bt) bt.classList.toggle('on', p.banding);
      var bc = el('banding-controls');
      if(bc) bc.classList.toggle('controls-disabled', !p.banding);
      setToggle('btn-bandangle-all', (p.bandAngleMode || 0) === 0);
      setToggle('btn-bandangle-random', (p.bandAngleMode || 0) === 1);
      setToggle('btn-bandangle-randsides', (p.bandAngleMode || 0) === 2);
      setVis('bandangle-seed-row', (p.bandAngleMode || 0) >= 1);
      setSlider('sBandAngleSeed', p.bandAngleSeed, 'vBandAngleSeed', v => Math.round(v));
      setToggle('btn-randcount', p.bandRandCount);
      setVis('randcount-controls', p.bandRandCount);
      setSlider('sRandCountMin', p.bandRandCountMin, 'vRandCountMin', v => v.toFixed(2));
      setSlider('sRandCountMax', p.bandRandCountMax, 'vRandCountMax', v => v.toFixed(2));
      setSlider('sRandCountSeed', p.bandRandCountSeed, 'vRandCountSeed', v => Math.round(v));

      setToggle('btn-band-random', p.bandRandomize);
      setToggle('btn-band-outline', p.bandOutline);
      var pt = el('btn-pixelate-toggle');
      if(pt) pt.classList.toggle('on', p.pixelate);
      var pmw = el('pixelate-master-wrap');
      if(pmw) pmw.classList.toggle('controls-disabled', !p.pixelate);

      // Canvas size
      var cmode = p.canvasMode || 'fullscreen';
      var cbf = el('btn-canvas-fullscreen'); if(cbf) cbf.classList.toggle('active', cmode==='fullscreen');
      var cbc = el('btn-canvas-custom'); if(cbc) cbc.classList.toggle('active', cmode==='custom');
      var cbi = el('btn-canvas-imageframe'); if(cbi) cbi.classList.toggle('active', cmode==='imageframe');
      var ccc = el('canvas-custom-controls'); if(ccc) ccc.style.display = cmode==='custom'?'':'none';
      var slW = el('sCanvasW'); if(slW) slW.value = p.canvasWidth || 1920;
      var valW = el('vCanvasW'); if(valW) valW.value = p.canvasWidth || 1920;
      var slH = el('sCanvasH'); if(slH) slH.value = p.canvasHeight || 1080;
      var valH = el('vCanvasH'); if(valH) valH.value = p.canvasHeight || 1080;
      applyCanvasSize();

      // Background color
      var bgm = p.bgMode || 'custom';
      var bbcBtn = el('btn-bg-custom'); if(bbcBtn) bbcBtn.classList.toggle('active', bgm==='custom');
      var bbrBtn = el('btn-bg-random'); if(bbrBtn) bbrBtn.classList.toggle('active', bgm==='random');
      var bgCC = el('bg-custom-controls'); if(bgCC) bgCC.style.display = bgm==='custom'?'':'none';
      var bgRC = el('bg-random-controls'); if(bgRC) bgRC.style.display = bgm==='random'?'':'none';
      var bgSw = el('bg-color-swatch'); if(bgSw) bgSw.style.background = p.bgColor||'#000000';
      var bgSl = el('sBgSeed'); if(bgSl) bgSl.value = p.bgSeed||0;
      var bgVl = el('vBgSeed'); if(bgVl) bgVl.value = p.bgSeed||0;
      if(bgm==='random' && typeof updateBgRandomPreview==='function') updateBgRandomPreview();
      else if(typeof applyBgColor==='function') applyBgColor();

      // Pixelate instances — rebuild tabs and panel
      initPixelateInstances();
      activePixelateTab = 0;
      renderPixelateTabs();
      renderPixelateInstancePanel(0);

      // Groups master toggle
      var gc = el('groups-controls');
      if(gc) gc.classList.toggle('controls-disabled', !(p.groupsEnabled !== false));
      var gt = el('btn-groups-toggle');
      if (gt) gt.classList.toggle('on', p.groupsEnabled !== false);
      var gl2 = el('groups-list');
      if (gl2) gl2.style.display = p.groupsEnabled !== false ? '' : 'none';

      setToggle('btn-outline', p.showOutline);
      setVis('outline-controls', p.showOutline);

      // Color mode
      setToggle('btn-cm-raw', p.colorMode === 2);
      setToggle('btn-cm-grad', p.colorMode === 0);
      setToggle('btn-cm-hue', p.colorMode === 1);
      setVis('gradient-controls', p.colorMode === 0);
      setVis('hue-controls', p.colorMode === 1);

      // Image Pixel
      var ipe = !!p.imgPixelEnabled;
      setToggle('btn-imgpixel-toggle', ipe);
      var ipc = el('imgpixel-controls');
      if (ipc) ipc.classList.toggle('controls-disabled', !ipe);
      setSlider('sImgPixelCols', p.imgPixelCols || 5, 'vImgPixelCols', v => Math.round(v));
      setSlider('sImgPixelRows', p.imgPixelRows || 5, 'vImgPixelRows', v => Math.round(v));
      setSlider('sImgPixelOpacity', p.imgPixelOpacity != null ? p.imgPixelOpacity : 1, 'vImgPixelOpacity', v => v.toFixed(2));
      var ipbSel = el('selImgPixelBlend');
      if (ipbSel) ipbSel.value = String(p.imgPixelBlend != null ? p.imgPixelBlend : 8);
      
      var ipas = !!p.imgPixelAffectScale;
      var ipasBtn = el('btn-imgpixel-scale');
      if (ipasBtn) ipasBtn.classList.toggle('active', ipas);
      var ipasCtrl = el('imgpixel-scale-controls');
      if (ipasCtrl) ipasCtrl.style.display = ipas ? '' : 'none';
      setSlider('sImgPixelMinScale', p.imgPixelMinScale != null ? p.imgPixelMinScale : -4, 'vImgPixelMinScale', v => v.toFixed(2));
      setSlider('sImgPixelMaxScale', p.imgPixelMaxScale != null ? p.imgPixelMaxScale : 4, 'vImgPixelMaxScale', v => v.toFixed(2));
      
      var ipar = !!p.imgPixelAffectRotate;
      var iparBtn = el('btn-imgpixel-rotate');
      if (iparBtn) iparBtn.classList.toggle('active', ipar);
      var iparCtrl = el('imgpixel-rotate-controls');
      if (iparCtrl) iparCtrl.style.display = ipar ? '' : 'none';
      setSlider('sImgPixelMinRotate', p.imgPixelMinRotate != null ? p.imgPixelMinRotate : -90, 'vImgPixelMinRotate', v => Math.round(v) + '°');
      setSlider('sImgPixelMaxRotate', p.imgPixelMaxRotate != null ? p.imgPixelMaxRotate : 90, 'vImgPixelMaxRotate', v => Math.round(v) + '°');
      
      var ipao = !!p.imgPixelAffectOffset;
      var ipaoBtn = el('btn-imgpixel-offset');
      if (ipaoBtn) ipaoBtn.classList.toggle('active', ipao);
      var ipaoCtrl = el('imgpixel-offset-controls');
      if (ipaoCtrl) ipaoCtrl.style.display = ipao ? '' : 'none';
      setSlider('sImgPixelMinOffset', p.imgPixelMinOffset != null ? p.imgPixelMinOffset : -0.5, 'vImgPixelMinOffset', v => v.toFixed(2));
      setSlider('sImgPixelMaxOffset', p.imgPixelMaxOffset != null ? p.imgPixelMaxOffset : 0.5, 'vImgPixelMaxOffset', v => v.toFixed(2));

      // Pre Process
      var pp = !!p.preProcess;
      setToggle('btn-preprocess-toggle', pp);
      var pc = el('preprocess-controls');
      if (pc) pc.classList.toggle('controls-disabled', !pp);
      // Blur
      var blurOn = p.blurEnabled !== false;
      setToggle('btn-blur-toggle', blurOn);
      var blurCtrl = el('blur-controls');
      if (blurCtrl) blurCtrl.classList.toggle('controls-disabled', !blurOn);
      setSlider('sBlurRadius', p.blurRadius != null ? p.blurRadius : 0, 'vBlurRadius', v => v.toFixed(1));
      setSlider('sCamHue', p.camHue, 'vCamHue', v => Math.round(v) + '°');
      setSlider('sCamSat', p.camSat, 'vCamSat', v => v.toFixed(2));
      setSlider('sCamVal', p.camVal, 'vCamVal', v => v.toFixed(2));
      setSlider('sCamContrast', p.camContrast, 'vCamContrast', v => v.toFixed(2));

      // Weave
      setToggle('btn-weave-none', p.weaveMode === 0);
      setToggle('btn-weave-brick', p.weaveMode === 1);
      setToggle('btn-weave-weave', p.weaveMode === 2);
      setToggle('btn-weave-hex', p.weaveMode === 3);
      setToggle('btn-weave-oct', p.weaveMode === 4);
      var isAutoShape = false;
      var ss = el('shape-section');
      // Shape section always interactive

      // Shape
      setToggle('btn-shape-none', p.pixelShape === 0);
      setToggle('btn-shape-pill', p.pixelShape === 1);
      setToggle('btn-shape-diamond', p.pixelShape === 2);
      setToggle('btn-shape-square', p.pixelShape === 3);
      setToggle('btn-shape-pointed', p.pixelShape === 4);
      setToggle('btn-shape-hex', p.pixelShape === 5);
      setToggle('btn-shape-oct', p.pixelShape === 6);
      setVis('shape-controls', p.pixelShape > 0);

      // Shape gradient dir
      setToggle('btn-sgdir-0', p.shapeGradDir === 0);
      setToggle('btn-sgdir-1', p.shapeGradDir === 1);
      setToggle('btn-sgdir-2', p.shapeGradDir === 2);
      setToggle('btn-sgdir-3', p.shapeGradDir === 3);
      setToggle('btn-sgdir-4', p.shapeGradDir === 4);
      setVis('radial-controls', p.shapeGradDir === 4);
      setSlider('sRadialX', p.radialCenterX, 'vRadialX', v => v.toFixed(2));
      setSlider('sRadialY', p.radialCenterY, 'vRadialY', v => v.toFixed(2));
      setSlider('sRadialScale', p.radialScale, 'vRadialScale', v => v.toFixed(2));

      // Dropdowns (null-safe)
      var sb = el('selBandBlend'); if (sb) sb.value = p.bandBlendMode || 0;
      var bhor = el('bandHueOffRow'); if (bhor) bhor.style.display = (p.bandBlendMode === 9) ? '' : 'none';
      setSlider('sBandHueOffset', p.bandHueOffset != null ? p.bandHueOffset : 0, 'vBandHueOffset', v => v.toFixed(3));
      var se = el('selEmbossBlend'); if (se) se.value = p.embossBlendMode || 0;

      // Color pickers (null-safe)
      var os = el('outlineSwatch'); if (os && p.outlineColor) { os.style.background = p.outlineColor; }
      var gs = el('gapSwatch'); if (gs && p.gapColor) { gs.style.background = p.gapColor; }

      // Gradients
      if (p.gradientStops) {
        renderGradientBar(); renderGradientHandles();
        if (window.uploadGradient) syncGradientToGL();
      }
      if (p.shapeGradStops) {
        renderShapeGradBar(); renderShapeGradHandles();
        if (window.uploadShapeGradient) syncShapeGradToGL();
      }

      // Groups
      renderGroups();

      // Opacity patterns
      renderOpPatterns();
      setTimeout(() => uploadAllOpPatterns(), 100);
    }

    function wire(sliderId, displayId, paramKey, fmt) {
      const slider  = document.getElementById(sliderId);
      const display = document.getElementById(displayId);
      if (!slider) return;
      const isInput = display && display.tagName === 'INPUT';
      // Params that affect the random bg color preview
      const bgRelevant = ['colorSeed','hueOffset','hueRadius','gradientSeed','satMin','satMax','valueMin','valueMax','brightSeed','satSeed'];
      function updateDisplay(v) {
        if (!display) return;
        if (isInput) {
          display.value = String(fmt(v)).replace(/[°%]/g,'').trim();
        } else {
          display.textContent = fmt(v);
        }
      }
      function afterChange() {
        if (bgRelevant.indexOf(paramKey) !== -1 && window.shaderParams.bgMode === 'random') {
          updateBgRandomPreview();
        }
      }
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        window.shaderParams[paramKey] = v;
        updateDisplay(v);
        window.shaderDirty = true;
        afterChange();
      });
      if (isInput) {
        display.addEventListener('change', () => {
          let v = parseFloat(display.value);
          if (isNaN(v)) return;
          v = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), v));
          slider.value = v;
          window.shaderParams[paramKey] = v;
          display.value = String(fmt(v)).replace(/[°%]/g,'').trim();
          window.shaderDirty = true;
          afterChange();
        });
      }
    }

    wire('sPoints',  'vPoints',  'points',       v => Math.round(v));
    wire('sSeed',    'vSeed',    'seed',         v => Math.round(v));
    wire('sRot',     'vRot',     'rot',          v => Math.round(v) + '°');
    wire('sSpeed',   'vSpeed',   'animSpeed',    v => Math.round(v));
    wire('sDx',      'vDx',      'dx',           v => v.toFixed(2));
    wire('sDy',      'vDy',      'dy',           v => v.toFixed(2));
    wire('sSx',      'vSx',      'sx',           v => v.toFixed(2));
    wire('sSy',      'vSy',      'sy',           v => v.toFixed(2));
    wire('sSpring',  'vSpring',  'spring',       v => v.toFixed(1));
    wire('sGridUnit','vGridUnit','gridUnit',     v => Math.round(v));
    wire('sNoiseElemSize', 'vNoiseElemSize', 'noiseElementSize', v => v.toFixed(2));
    wire('sGlobalPixelScale', 'vGlobalPixelScale', 'globalPixelScale', v => v.toFixed(2));
    wire('sSmoothEdges', 'vSmoothEdges', 'smoothEdgesAmount', v => v.toFixed(2));
    wire('sNoiseOffsetX', 'vNoiseOffsetX', 'noiseOffsetX', v => v.toFixed(3));
    wire('sNoiseOffsetY', 'vNoiseOffsetY', 'noiseOffsetY', v => v.toFixed(3));
    wire('sNoiseOctaves', 'vNoiseOctaves', 'noiseOctaves', v => Math.round(v));
    wire('sNoiseLac', 'vNoiseLac', 'noiseLacunarity', v => v.toFixed(2));
    wire('sNoiseRough', 'vNoiseRough', 'noiseRoughness', v => v.toFixed(2));
    wire('sImageScale', 'vImageScale', 'imageScale', v => v.toFixed(2));
    wire('sFlowScale',    'vFlowScale',    'flowScale',    v => v.toFixed(2));
    wire('sFlowSpeed',    'vFlowSpeed',    'flowSpeed',    v => v.toFixed(2));
    wire('sFlowDistort1', 'vFlowDistort1', 'flowDistort1', v => v.toFixed(2));
    wire('sFlowDistort2', 'vFlowDistort2', 'flowDistort2', v => v.toFixed(2));
    wire('sFlowSmoothLo', 'vFlowSmoothLo', 'flowSmoothLo', v => v.toFixed(2));
    wire('sFlowSmoothHi', 'vFlowSmoothHi', 'flowSmoothHi', v => v.toFixed(2));
    wire('sFlowHueOffset', 'vFlowHueOffset', 'flowHueOffset', v => v.toFixed(3));
    wire('sFlowHueRadius', 'vFlowHueRadius', 'flowHueRadius', v => v.toFixed(3));
    wire('sF2Scale',  'vF2Scale',  'f2Scale',  v => v.toFixed(1));
    wire('sF2VelX',   'vF2VelX',   'f2VelX',   v => v.toFixed(3));
    wire('sF2VelY',   'vF2VelY',   'f2VelY',   v => v.toFixed(3));
    wire('sF2Speed',  'vF2Speed',  'f2Speed',  v => v.toFixed(2));
    wire('sF2Detail', 'vF2Detail', 'f2Detail', v => Math.round(v));
    wire('sF2Twist',  'vF2Twist',  'f2Twist',  v => v.toFixed(1));
    wire('sF2Iter1',  'vF2Iter1',  'f2Iter1',  v => Math.round(v));
    wire('sF2Iter2',  'vF2Iter2',  'f2Iter2',  v => Math.round(v));
    wire('sF2HueOffset', 'vF2HueOffset', 'f2HueOffset', v => v.toFixed(3));
    wire('sF2HueRadius', 'vF2HueRadius', 'f2HueRadius', v => v.toFixed(3));

    // Resolution slider — custom wire with fraction display
    (function() {
      const slider = document.getElementById('sRenderRes');
      const display = document.getElementById('vRenderRes');
      slider.addEventListener('input', () => {
        const v = parseInt(slider.value);
        window.shaderParams.renderRes = v;
        display.textContent = v === 1 ? 'Full' : '1/' + v;
        window.shaderDirty = true;
      });
    })();

    // Precompute frames slider
    (function() {
      const slider = document.getElementById('sPrecomputeFrames');
      const display = document.getElementById('vPrecomputeFrames');
      if (!slider) return;
      function sync(v) {
        if (display) { if (display.tagName==='INPUT') display.value=v; else display.textContent=v; }
      }
      slider.addEventListener('input', () => {
        const v = parseInt(slider.value);
        window.shaderParams.precomputeFrames = v;
        sync(v);
        if (window.resetPrecomputeBuffer) window.resetPrecomputeBuffer();
      });
      if (display && display.tagName==='INPUT') {
        display.addEventListener('change', () => {
          let v = Math.max(parseInt(slider.min)||1, Math.min(parseInt(slider.max)||60, parseInt(display.value)||3));
          slider.value = v; sync(v);
          window.shaderParams.precomputeFrames = v;
          if (window.resetPrecomputeBuffer) window.resetPrecomputeBuffer();
        });
      }
    })();

    wire('sSmoothEdge','vSmoothEdge','smoothEdge', v => Math.round(v));
    wire('sMergeDist','vMergeDist','mergeDist', v => Math.round(v));
    wire('sOutline', 'vOutline', 'outlineWidth', v => v.toFixed(1));
    wire('sDotRadius','vDotRadius','dotRadius', v => v.toFixed(3));
    wire('sOpPatSeed','vOpPatSeed','opPatternSeed', v => Math.round(v));
    wire('sPixelW',  'vPixelW',  'pixelW',       v => Math.round(v));
    wire('sPixelH',  'vPixelH',  'pixelH',       v => Math.round(v));
    wire('sShapeMargin','vShapeMargin','shapeMargin', v => Math.round(v));
    wire('sShapeBleed', 'vShapeBleed', 'shapeBleed',  v => Math.round(v));
    wire('sPixelScale', 'vPixelScale', 'pixelScale',  v => v.toFixed(2));
    wire('sQuadSteps', 'vQuadSteps', 'quadSteps', v => Math.round(v));
    wire('sShapeGradOpacity','vShapeGradOpacity','shapeGradOpacity', v => v.toFixed(2));
    wire('sRadialX','vRadialX','radialCenterX', v => v.toFixed(2));
    wire('sRadialY','vRadialY','radialCenterY', v => v.toFixed(2));
    wire('sRadialScale','vRadialScale','radialScale', v => v.toFixed(2));
    wire('sGapOpacity','vGapOpacity','gapOpacity', v => v.toFixed(2));
    wire('sBlurRadius','vBlurRadius','blurRadius', v => v.toFixed(1));
    wire('sCamHue','vCamHue','camHue', v => Math.round(v) + '°');
    wire('sCamSat','vCamSat','camSat', v => v.toFixed(2));
    wire('sCamVal','vCamVal','camVal', v => v.toFixed(2));
    wire('sCamContrast','vCamContrast','camContrast', v => v.toFixed(2));
    wire('sBandCount',   'vBandCount',   'bandCount',    v => Math.round(v));
    wire('sBandAngleSeed','vBandAngleSeed','bandAngleSeed', v => Math.round(v));
    wire('sRandCountMin','vRandCountMin','bandRandCountMin', v => v.toFixed(2));
    wire('sRandCountMax','vRandCountMax','bandRandCountMax', v => v.toFixed(2));
    wire('sRandCountSeed','vRandCountSeed','bandRandCountSeed', v => Math.round(v));
    wire('sBandStrength','vBandStrength','bandStrength',  v => v.toFixed(2));
    wire('sBandLumMin',  'vBandLumMin',  'bandLumMin',   v => v.toFixed(2));
    wire('sBandLumMax',  'vBandLumMax',  'bandLumMax',   v => v.toFixed(2));
    wire('sBandHueStrength','vBandHueStrength','bandHueStrength', v => v.toFixed(2));
    wire('sBandHueRadius','vBandHueRadius','bandHueRadius', v => v.toFixed(2));
    wire('sBandHueOffset','vBandHueOffset','bandHueOffset', v => v.toFixed(3));
    // Legacy grade sliders removed — now using PP stack

    // Canvas size sliders
    (function() {
      const slW = document.getElementById('sCanvasW');
      const valW = document.getElementById('vCanvasW');
      const slH = document.getElementById('sCanvasH');
      const valH = document.getElementById('vCanvasH');
      function applyW(v) {
        window.shaderParams.canvasWidth = v;
        if (window.shaderParams.canvasMode === 'custom') applyCanvasSize();
      }
      function applyH(v) {
        window.shaderParams.canvasHeight = v;
        if (window.shaderParams.canvasMode === 'custom') applyCanvasSize();
      }
      if (slW) {
        slW.addEventListener('input', () => { const v=parseInt(slW.value); valW.value=v; applyW(v); });
        valW.addEventListener('change', () => { const v=Math.max(64,Math.min(3840,parseInt(valW.value)||1920)); slW.value=v; valW.value=v; applyW(v); });
      }
      if (slH) {
        slH.addEventListener('input', () => { const v=parseInt(slH.value); valH.value=v; applyH(v); });
        valH.addEventListener('change', () => { const v=Math.max(64,Math.min(2160,parseInt(valH.value)||1080)); slH.value=v; valH.value=v; applyH(v); });
      }
    })();

    wire('sColorSeed','vColorSeed','colorSeed',  v => Math.round(v));
    wire('sHueOffset','vHueOffset','hueOffset',  v => v.toFixed(2));
    wire('sHueRadius','vHueRadius','hueRadius',  v => v.toFixed(2));
    wire('sSatSeed','vSatSeed','satSeed',  v => Math.round(v));
    wire('sSatMin','vSatMin','satMin',  v => v.toFixed(2));
    wire('sSatMax','vSatMax','satMax',  v => v.toFixed(2));
    wire('sBrightSeed','vBrightSeed','brightSeed',  v => Math.round(v));
    wire('sValueMin', 'vValueMin', 'valueMin',   v => v.toFixed(2));
    wire('sValueMax', 'vValueMax', 'valueMax',   v => v.toFixed(2));
    wire('sGradientSeed', 'vGradientSeed', 'gradientSeed', v => Math.round(v));
    wire('sImgPixelCols', 'vImgPixelCols', 'imgPixelCols', v => Math.round(v));
    wire('sImgPixelRows', 'vImgPixelRows', 'imgPixelRows', v => Math.round(v));
    wire('sImgPixelOpacity', 'vImgPixelOpacity', 'imgPixelOpacity', v => v.toFixed(2));
    wire('sImgPixelMinScale', 'vImgPixelMinScale', 'imgPixelMinScale', v => v.toFixed(2));
    wire('sImgPixelMaxScale', 'vImgPixelMaxScale', 'imgPixelMaxScale', v => v.toFixed(2));
    wire('sImgPixelMinRotate', 'vImgPixelMinRotate', 'imgPixelMinRotate', v => Math.round(v) + '°');
    wire('sImgPixelMaxRotate', 'vImgPixelMaxRotate', 'imgPixelMaxRotate', v => Math.round(v) + '°');
    wire('sImgPixelMinOffset', 'vImgPixelMinOffset', 'imgPixelMinOffset', v => v.toFixed(2));
    wire('sImgPixelMaxOffset', 'vImgPixelMaxOffset', 'imgPixelMaxOffset', v => v.toFixed(2));

    /* ── Gradient Editor ──────────────────────────────────────────── */
    function hexToRgb(hex) {
      return {
        r: parseInt(hex.slice(1,3),16),
        g: parseInt(hex.slice(3,5),16),
        b: parseInt(hex.slice(5,7),16)
      };
    }
    function rgbToHex(r,g,b) {
      return '#' + [r,g,b].map(c => Math.round(c).toString(16).padStart(2,'0')).join('');
    }

    function sortedStops() {
      return window.shaderParams.gradientStops.slice().sort((a,b) => a.pos - b.pos);
    }

    function renderGradientBar() {
      const bar = document.getElementById('gradBar');
      const ctx = bar.getContext('2d');
      bar.width = bar.clientWidth;
      const w = bar.width, h = bar.height;
      const stops = sortedStops();
      const grad = ctx.createLinearGradient(0,0,w,0);
      stops.forEach(s => grad.addColorStop(s.pos, s.hex));
      ctx.fillStyle = grad;
      ctx.fillRect(0,0,w,h);
    }

    function renderGradientHandles() {
      const track = document.getElementById('gradTrack');
      track.innerHTML = '';
      const stops = window.shaderParams.gradientStops;
      stops.forEach((stop, idx) => {
        const handle = document.createElement('div');
        handle.className = 'grad-handle';
        handle.style.left = (stop.pos * 100) + '%';
        handle.style.background = stop.hex;
        handle.dataset.idx = idx;
        handle.style.touchAction = 'none';

        // State for distinguishing tap vs drag vs double-tap
        let dragging = false, hasMoved = false, tapTimer = null, tapCount = 0;

        function startDrag(cx, cy) {
          dragging = true; hasMoved = false;
          handle.classList.add('dragging');
        }
        function moveDrag(cx, cy) {
          if (!dragging) return;
          hasMoved = true;
          const tr = track.getBoundingClientRect();
          stop.pos = Math.max(0, Math.min(1, (cx - tr.left) / tr.width));
          handle.style.left = (stop.pos * 100) + '%';
          renderGradientBar(); syncGradientToGL();
        }
        function endDrag() {
          const wasDrag = hasMoved;
          dragging = false; hasMoved = false;
          handle.classList.remove('dragging');

          if (!wasDrag) {
            // It was a tap, not a drag
            tapCount++;
            if (tapCount === 1) {
              tapTimer = setTimeout(() => {
                // Single tap → open color picker
                tapCount = 0;
                openColorPicker(stop.hex, (hex, r, g, b) => {
                  stop.r = r; stop.g = g; stop.b = b; stop.hex = hex;
                  handle.style.background = hex;
                  renderGradientBar(); syncGradientToGL();
                });
              }, 250);
            } else if (tapCount >= 2) {
              // Double tap → delete stop
              clearTimeout(tapTimer); tapCount = 0;
              if (stops.length > 2) {
                stops.splice(stops.indexOf(stop), 1);
                renderGradientHandles(); renderGradientBar(); syncGradientToGL();
              }
            }
          } else {
            tapCount = 0;
          }
        }

        // Mouse events
        handle.addEventListener('mousedown', (e) => {
          e.preventDefault(); e.stopPropagation();
          startDrag(e.clientX, e.clientY);
          const onM = ev => moveDrag(ev.clientX, ev.clientY);
          const onU = () => { endDrag(); window.removeEventListener('mousemove', onM); window.removeEventListener('mouseup', onU); };
          window.addEventListener('mousemove', onM); window.addEventListener('mouseup', onU);
        });
        // Touch events
        handle.addEventListener('touchstart', (e) => {
          if (e.touches.length !== 1) return;
          e.preventDefault(); e.stopPropagation();
          startDrag(e.touches[0].clientX, e.touches[0].clientY);
        }, {passive: false});
        handle.addEventListener('touchmove', (e) => {
          e.preventDefault();
          if (e.touches.length === 1) moveDrag(e.touches[0].clientX, e.touches[0].clientY);
        }, {passive: false});
        handle.addEventListener('touchend', (e) => { e.preventDefault(); endDrag(); }, {passive: false});

        track.appendChild(handle);
      });
    }

    // click on gradient bar → add new stop
    document.getElementById('gradBar').addEventListener('click', (e) => {
      const rect = e.target.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      // sample color at this position from sorted stops
      const stops = sortedStops();
      let lo = stops[0], hi = stops[stops.length-1];
      for (let i = 0; i < stops.length - 1; i++) {
        if (pos >= stops[i].pos && pos <= stops[i+1].pos) {
          lo = stops[i]; hi = stops[i+1]; break;
        }
      }
      const range = hi.pos - lo.pos;
      const f = range < 0.0001 ? 0 : (pos - lo.pos) / range;
      const r = Math.round(lo.r + (hi.r - lo.r) * f);
      const g = Math.round(lo.g + (hi.g - lo.g) * f);
      const b = Math.round(lo.b + (hi.b - lo.b) * f);
      window.shaderParams.gradientStops.push({
        pos, r, g, b, hex: rgbToHex(r,g,b)
      });
      renderGradientHandles();
      renderGradientBar();
      syncGradientToGL();
    });

    function syncGradientToGL() {
      if (window.uploadGradient) {
        window.uploadGradient(sortedStops());
      }
      if (window.shaderParams.bgMode === 'random' && typeof updateBgRandomPreview === 'function') updateBgRandomPreview();
    }

    // initial render
    renderGradientBar();
    renderGradientHandles();

    /* ── Shape Gradient Editor ────────────────────────────────────── */
    function sortedShapeStops() {
      return window.shaderParams.shapeGradStops.slice().sort((a,b) => a.pos - b.pos);
    }

    function renderShapeGradBar() {
      const bar = document.getElementById('shapeGradBar');
      if (!bar) return;
      const ctx = bar.getContext('2d');
      bar.width = bar.clientWidth;
      const w = bar.width, h = bar.height;
      const stops = sortedShapeStops();
      const grad = ctx.createLinearGradient(0,0,w,0);
      stops.forEach(s => grad.addColorStop(s.pos, s.hex));
      ctx.fillStyle = grad;
      ctx.fillRect(0,0,w,h);
    }

    function renderShapeGradHandles() {
      const track = document.getElementById('shapeGradTrack');
      if (!track) return;
      track.innerHTML = '';
      const stops = window.shaderParams.shapeGradStops;
      stops.forEach((stop, idx) => {
        const handle = document.createElement('div');
        handle.className = 'grad-handle';
        handle.style.left = (stop.pos * 100) + '%';
        handle.style.background = stop.hex;
        handle.dataset.idx = idx;
        handle.style.touchAction = 'none';

        let dragging = false, hasMoved = false, tapTimer = null, tapCount = 0;

        function startDrag(cx, cy) { dragging = true; hasMoved = false; handle.classList.add('dragging'); }
        function moveDrag(cx, cy) {
          if (!dragging) return; hasMoved = true;
          const tr = track.getBoundingClientRect();
          stop.pos = Math.max(0, Math.min(1, (cx - tr.left) / tr.width));
          handle.style.left = (stop.pos * 100) + '%';
          renderShapeGradBar(); syncShapeGradToGL();
        }
        function endDrag() {
          const wasDrag = hasMoved;
          dragging = false; hasMoved = false; handle.classList.remove('dragging');
          if (!wasDrag) {
            tapCount++;
            if (tapCount === 1) {
              tapTimer = setTimeout(() => {
                tapCount = 0;
                openColorPicker(stop.hex, (hex, r, g, b) => {
                  stop.r = r; stop.g = g; stop.b = b; stop.hex = hex;
                  handle.style.background = hex;
                  renderShapeGradBar(); syncShapeGradToGL();
                });
              }, 250);
            } else if (tapCount >= 2) {
              clearTimeout(tapTimer); tapCount = 0;
              if (stops.length > 2) {
                stops.splice(stops.indexOf(stop), 1);
                renderShapeGradHandles(); renderShapeGradBar(); syncShapeGradToGL();
              }
            }
          } else { tapCount = 0; }
        }

        handle.addEventListener('mousedown', (e) => {
          e.preventDefault(); e.stopPropagation(); startDrag(e.clientX, e.clientY);
          const onM = ev => moveDrag(ev.clientX, ev.clientY);
          const onU = () => { endDrag(); window.removeEventListener('mousemove', onM); window.removeEventListener('mouseup', onU); };
          window.addEventListener('mousemove', onM); window.addEventListener('mouseup', onU);
        });
        handle.addEventListener('touchstart', (e) => {
          if (e.touches.length !== 1) return;
          e.preventDefault(); e.stopPropagation();
          startDrag(e.touches[0].clientX, e.touches[0].clientY);
        }, {passive: false});
        handle.addEventListener('touchmove', (e) => {
          e.preventDefault(); if (e.touches.length === 1) moveDrag(e.touches[0].clientX, e.touches[0].clientY);
        }, {passive: false});
        handle.addEventListener('touchend', (e) => { e.preventDefault(); endDrag(); }, {passive: false});

        track.appendChild(handle);
      });
    }

    const _sgb = document.getElementById('shapeGradBar');
    if (_sgb) _sgb.addEventListener('click', (e) => {
      const rect = e.target.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      const stops = sortedShapeStops();
      let lo = stops[0], hi = stops[stops.length-1];
      for (let i = 0; i < stops.length - 1; i++) {
        if (pos >= stops[i].pos && pos <= stops[i+1].pos) { lo = stops[i]; hi = stops[i+1]; break; }
      }
      const range = hi.pos - lo.pos;
      const f = range < 0.0001 ? 0 : (pos - lo.pos) / range;
      const r = Math.round(lo.r + (hi.r - lo.r) * f);
      const g = Math.round(lo.g + (hi.g - lo.g) * f);
      const b = Math.round(lo.b + (hi.b - lo.b) * f);
      window.shaderParams.shapeGradStops.push({ pos, r, g, b, hex: rgbToHex(r,g,b) });
      renderShapeGradHandles();
      renderShapeGradBar();
      syncShapeGradToGL();
    });

    function syncShapeGradToGL() {
      if (window.uploadShapeGradient) {
        window.uploadShapeGradient(sortedShapeStops());
      }
      window.shaderDirty = true;
    }

    renderShapeGradBar();
    renderShapeGradHandles();

    // also sync after shader.js loads
    window.addEventListener('load', () => {
      setTimeout(() => {
        // Try loading default.json; if not found, use hardcoded defaults
        fetch('default.json')
          .then(r => { if (!r.ok) throw new Error('no default.json'); return r.json(); })
          .then(data => {
            applyLoadedConfig(data);
            syncGradientToGL();
            syncShapeGradToGL();
            renderGradientBar();
            renderGradientHandles();
            renderShapeGradBar();
            renderShapeGradHandles();
          })
          .catch(() => {
            // No default.json, use hardcoded params
            syncGradientToGL();
            syncShapeGradToGL();
            renderGradientBar();
            renderGradientHandles();
            renderShapeGradBar();
            renderShapeGradHandles();
          });
      }, 200);
    });

    /* ── Groups (Secondary Noise) ─────────────────────────────────── */
    function defaultGroup() {
      return { id: ++groupIdCounter, active: true, dx: 0.27, dy: 0.18, scale: 1.0, threshold: 0.0, seed: 1 };
    }

    /* ── Opacity Pattern Management ──────────────────────────────── */
    function parseGridStr(str) {
      return str.trim().split('\n').map(row =>
        row.split(',').map(v => parseFloat(v.trim()) || 0)
      );
    }
    function gridToStr(grid) {
      return grid.map(row => row.map(v => v.toFixed(2)).join(',')).join('\n');
    }

    function addOpPattern() {
      const p = window.shaderParams;
      if (p.opPatterns.length >= 4) return;
      p.opPatternIdCounter = (p.opPatternIdCounter || 0) + 1;
      p.opPatterns.push({
        id: p.opPatternIdCounter,
        active: true,
        grid: [[0, 0.5], [0.5, 0]],
        hueShift: 0.1,
        hueOpacity: 0.5
      });
      renderOpPatterns();
      uploadAllOpPatterns();
    }

    function removeOpPattern(id) {
      const p = window.shaderParams;
      p.opPatterns = p.opPatterns.filter(op => op.id !== id);
      renderOpPatterns();
      uploadAllOpPatterns();
    }

    // uploadAllOpPatterns is defined earlier (per-instance version) — no override here

    function renderOpPatterns() {
      const list = document.getElementById('oppattern-list');
      if (!list) return;  // now per-instance — nothing to render here
      const pats = window.shaderParams.opPatterns;

      pats.forEach((pat, idx) => {
        const card = document.createElement('div');
        card.className = 'group-card';
        card.innerHTML = `
          <div class="group-header">
            <span class="g-title">Pattern ${idx + 1}</span>
            <button class="toggle-active ${pat.active ? 'on' : ''}" data-opid="${pat.id}"></button>
            <div class="g-actions">
              <button class="small danger" data-opaction="del" data-opid="${pat.id}">✕</button>
            </div>
          </div>
          <div class="group-body ${pat.active ? '' : 'controls-disabled'}">
            <div class="row" style="flex-direction:column;align-items:stretch;gap:4px">
              <label style="width:auto;text-align:left">Grid (rows of comma-separated 0-1 values)</label>
              <textarea data-opid="${pat.id}" data-opkey="grid"
                style="width:100%;height:60px;background:#1a1a1a;color:#ccc;border:1px solid rgba(255,255,255,0.15);
                border-radius:4px;font-family:monospace;font-size:11px;padding:6px;resize:vertical"
              >${gridToStr(pat.grid)}</textarea>
            </div>
            <div class="row">
              <label>Hue Shift</label>
              <input type="range" min="0" max="1" step="0.01" value="${pat.hueShift}"
                     data-opid="${pat.id}" data-opkey="hueShift">
              <input type="number" class="val" id="ophs-${pat.id}" value="${pat.hueShift.toFixed(2)}">
            </div>
            <div class="row">
              <label>Hue Opacity</label>
              <input type="range" min="0" max="1" step="0.01" value="${pat.hueOpacity}"
                     data-opid="${pat.id}" data-opkey="hueOpacity">
              <input type="number" class="val" id="opho-${pat.id}" value="${pat.hueOpacity.toFixed(2)}">
            </div>
          </div>
        `;
        list.appendChild(card);
      });

      // Wire toggles
      list.querySelectorAll('.toggle-active').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.dataset.opid);
          const pat = pats.find(p => p.id === id);
          if (!pat) return;
          pat.active = !pat.active;
          btn.classList.toggle('on', pat.active);
          const body = btn.closest('.group-card').querySelector('.group-body');
          if(body) body.classList.toggle('controls-disabled', !pat.active);
          uploadAllOpPatterns();
        });
      });

      // Wire delete
      list.querySelectorAll('[data-opaction="del"]').forEach(btn => {
        btn.addEventListener('click', () => removeOpPattern(parseInt(btn.dataset.opid)));
      });

      // Wire sliders
      list.querySelectorAll('input[type=range][data-opkey]').forEach(slider => {
        slider.addEventListener('input', () => {
          const id = parseInt(slider.dataset.opid);
          const key = slider.dataset.opkey;
          const pat = pats.find(p => p.id === id);
          if (!pat) return;
          pat[key] = parseFloat(slider.value);
          const label = document.getElementById(key === 'hueShift' ? 'ophs-' + id : 'opho-' + id);
          if (label) { if (label.tagName==='INPUT') label.value = pat[key].toFixed(2); else label.textContent = pat[key].toFixed(2); }
          uploadAllOpPatterns();
        });
      });

      // Wire number val inputs two-way
      list.querySelectorAll('input.val[id^="ophs-"], input.val[id^="opho-"]').forEach(inp => {
        const range = inp.previousElementSibling;
        if (!range || range.type !== 'range') return;
        const id = parseInt(range.dataset.opid);
        const key = range.dataset.opkey;
        inp.addEventListener('change', () => {
          let v = parseFloat(inp.value);
          if (isNaN(v)) return;
          v = Math.max(parseFloat(range.min), Math.min(parseFloat(range.max), v));
          const pat = pats.find(p => p.id === id);
          if (!pat) return;
          pat[key] = v;
          range.value = v;
          inp.value = v.toFixed(2);
          uploadAllOpPatterns();
        });
      });

      // Wire textareas
      list.querySelectorAll('textarea[data-opkey="grid"]').forEach(ta => {
        ta.addEventListener('change', () => {
          const id = parseInt(ta.dataset.opid);
          const pat = pats.find(p => p.id === id);
          if (!pat) return;
          pat.grid = parseGridStr(ta.value);
          uploadAllOpPatterns();
        });
      });
    }

    window.addOpPattern = addOpPattern;
    window.removeOpPattern = removeOpPattern;

    function addGroup(copyFrom) {
      if (window.shaderParams.groups.length >= 8) return;
      const base = copyFrom || defaultGroup();
      const g = {
        id:        ++groupIdCounter,
        active:    base.active,
        dx:        base.dx,
        dy:        base.dy,
        scale:     base.scale,
        threshold: base.threshold,
        seed:      base.seed
      };
      window.shaderParams.groups.push(g);
      renderGroups();
      window.shaderDirty = true;
    }

    function removeGroup(id) {
      window.shaderParams.groups = window.shaderParams.groups.filter(g => g.id !== id);
      renderGroups();
      window.shaderDirty = true;
    }

    function moveGroup(id, dir) {
      const arr = window.shaderParams.groups;
      const idx = arr.findIndex(g => g.id === id);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      renderGroups();
      window.shaderDirty = true;
    }

    function renderGroups() {
      const list = document.getElementById('groups-list');
      list.innerHTML = '';

      window.shaderParams.groups.forEach((grp, idx) => {
        const card = document.createElement('div');
        card.className = 'group-card';

        card.innerHTML = `
          <div class="group-header">
            <span class="g-title">Noise ${idx + 1}</span>
            <button class="toggle-active ${grp.active ? 'on' : ''}" data-id="${grp.id}"></button>
            <div class="g-actions">
              <button class="small" data-action="dup"  data-id="${grp.id}">⧉</button>
              <button class="small danger" data-action="del" data-id="${grp.id}">✕</button>
            </div>
          </div>
          <div class="group-body ${grp.active ? '' : 'controls-disabled'}">
            <div class="row">
              <label>Displace X</label>
              <input type="range" min="-1" max="1" step="0.01" value="${grp.dx}"
                     data-id="${grp.id}" data-key="dx">
              <input type="number" class="val" id="gdx-${grp.id}" value="${grp.dx.toFixed(2)}">
            </div>
            <div class="row">
              <label>Displace Y</label>
              <input type="range" min="-1" max="1" step="0.01" value="${grp.dy}"
                     data-id="${grp.id}" data-key="dy">
              <input type="number" class="val" id="gdy-${grp.id}" value="${grp.dy.toFixed(2)}">
            </div>
            <div class="row">
              <label>Scale</label>
              <input type="range" min="0" max="2" step="0.01" value="${grp.scale}"
                     data-id="${grp.id}" data-key="scale">
              <input type="number" class="val" id="gscl-${grp.id}" value="${grp.scale.toFixed(2)}">
            </div>
            <div class="row">
              <label>Threshold</label>
              <input type="range" min="0" max="1" step="0.001" value="${grp.threshold}"
                     data-id="${grp.id}" data-key="threshold">
              <input type="number" class="val" id="gthr-${grp.id}" value="${grp.threshold.toFixed(3)}">
            </div>
            <div class="row">
              <label>Seed</label>
              <input type="range" min="1" max="1000" step="1" value="${grp.seed}"
                     data-id="${grp.id}" data-key="seed">
              <input type="number" class="val" id="gseed-${grp.id}" value="${Math.round(grp.seed)}">
            </div>
          </div>
        `;

        list.appendChild(card);
      });

      list.querySelectorAll('.toggle-active').forEach(btn => {
        btn.addEventListener('click', () => {
          const id  = parseInt(btn.dataset.id);
          const grp = window.shaderParams.groups.find(g => g.id === id);
          if (!grp) return;
          grp.active = !grp.active;
          btn.classList.toggle('on', grp.active);
          const body = btn.closest('.group-card').querySelector('.group-body');
          if(body) body.classList.toggle('controls-disabled', !grp.active);
          window.shaderDirty = true;
        });
      });

      list.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id  = parseInt(btn.dataset.id);
          const act = btn.dataset.action;
          if (act === 'del')  removeGroup(id);
          if (act === 'dup') {
            const grp = window.shaderParams.groups.find(g => g.id === id);
            if (grp) addGroup(grp);
          }
        });
      });

      list.querySelectorAll('input[type=range][data-id]').forEach(slider => {
        slider.addEventListener('input', () => {
          const id  = parseInt(slider.dataset.id);
          const key = slider.dataset.key;
          const v   = parseFloat(slider.value);
          const grp = window.shaderParams.groups.find(g => g.id === id);
          if (!grp) return;
          grp[key] = v;
          const displayId = key === 'dx'        ? `gdx-${id}`
                          : key === 'dy'        ? `gdy-${id}`
                          : key === 'scale'     ? `gscl-${id}`
                          : key === 'threshold' ? `gthr-${id}`
                          :                       `gseed-${id}`;
          const fmt = key === 'threshold' ? v.toFixed(3)
                    : key === 'seed'      ? String(Math.round(v))
                    :                       v.toFixed(2);
          const el = document.getElementById(displayId);
          if (el) { if (el.tagName==='INPUT') el.value = fmt; else el.textContent = fmt; }
          window.shaderDirty = true;
        });
      });

      // Two-way: number inputs back-drive the range slider
      list.querySelectorAll('input.val[data-id], input[type=number].val[id^="gdx-"], input[type=number].val[id^="gdy-"], input[type=number].val[id^="gscl-"], input[type=number].val[id^="gthr-"], input[type=number].val[id^="gseed-"]').forEach(inp => {
        const range = inp.previousElementSibling;
        if (!range || range.type !== 'range') return;
        inp.addEventListener('change', () => {
          let v = parseFloat(inp.value);
          if (isNaN(v)) return;
          v = Math.max(parseFloat(range.min), Math.min(parseFloat(range.max), v));
          const id  = parseInt(range.dataset.id);
          const key = range.dataset.key;
          const grp = window.shaderParams.groups.find(g => g.id === id);
          if (!grp) return;
          grp[key] = v;
          range.value = v;
          const fmt = key === 'threshold' ? v.toFixed(3)
                    : key === 'seed'      ? String(Math.round(v))
                    :                       v.toFixed(2);
          inp.value = fmt;
          window.shaderDirty = true;
        });
      });
    }

    window.addGroup    = addGroup;
    window.removeGroup = removeGroup;
    window.moveGroup   = moveGroup;

    renderGroups();
    renderOpPatterns();
    document.getElementById('btn-groups-toggle').classList.toggle('on', window.shaderParams.groupsEnabled !== false);
    
    const _bopt = document.getElementById('btn-oppattern-toggle');
    if (_bopt) _bopt.classList.toggle('on', window.shaderParams.opPatternsEnabled !== false);

    // Initialize pixelate instances
    initPixelateInstances();
    renderPixelateTabs();
    renderPixelateInstancePanel(0);

    // Initialize canvas size
    applyCanvasSize();

    // Initialize background color
    applyBgColor();

    // Register a callback for shader.js to call once GL programs are compiled.
    // applyConfigToUI() runs before shader.js initializes so uniform locations
    // don't exist yet — this re-applies everything once they do.
    window._pendingApplyConfig = function() {
      applyConfigToUI();
      uploadAllOpPatterns();
    };
    

// ═══ Auto-collapse initialization ═══
    // uploadAllOpPatterns is now called via _pendingApplyConfig inside shader.js
    // Keep a short fallback in case shader compiled synchronously (older drivers)
    setTimeout(() => {
      if (typeof uploadAllOpPatterns === 'function') uploadAllOpPatterns();
    }, 500);

    // ── Auto-collapse system for all tabs ─────────────────
    function initCollapsibleSections() {
      document.querySelectorAll('.section-title').forEach(function(title) {
        // Skip already-processed or dynamically generated ones
        if (title.dataset.collapsible || title.closest('#pix-instance-panel')) return;
        var next = title.nextElementSibling;
        if (!next) return;
        // Collect siblings until next divider or section-title
        var content = [];
        var sib = next;
        while (sib && !sib.classList.contains('divider') && !sib.classList.contains('section-title')) {
          content.push(sib);
          sib = sib.nextElementSibling;
        }
        if (content.length === 0) return;
        // Wrap in collapsible div
        var wrapper = document.createElement('div');
        wrapper.id = 'sec-auto-' + Math.random().toString(36).substr(2, 6);
        content[0].parentNode.insertBefore(wrapper, content[0]);
        content.forEach(function(el) { wrapper.appendChild(el); });
        // Add chevron + click handler
        var chev = document.createElementNS('http://www.w3.org/2000/svg','svg');
        chev.setAttribute('class','collapse-chev');
        chev.setAttribute('width','10'); chev.setAttribute('height','10');
        chev.setAttribute('viewBox','0 0 24 24');
        chev.innerHTML = '<polyline points="6,9 12,15 18,9" fill="none" stroke="white" stroke-width="3"/>';
        title.style.display = 'flex'; title.style.alignItems = 'center';
        title.style.gap = '4px'; title.style.cursor = 'pointer'; title.style.userSelect = 'none';
        title.insertBefore(chev, title.firstChild);
        title.dataset.collapsible = wrapper.id;
        title.addEventListener('click', function() {
          var w = document.getElementById(this.dataset.collapsible);
          if (!w) return;
          w.classList.toggle('section-collapsed');
          var c = this.querySelector('.collapse-chev');
          if (c) c.style.transform = w.classList.contains('section-collapsed') ? 'rotate(-90deg)' : '';
        });
      });
      // Also handle toggle-headers that have a toggle-label (Gap, Fill, etc.)
      document.querySelectorAll('.toggle-header').forEach(function(hdr) {
        if (hdr.dataset.collapsible || hdr.closest('#pix-instance-panel')) return;
        var label = hdr.querySelector('.toggle-label');
        if (!label) return;
        var next = hdr.nextElementSibling;
        if (!next || next.classList.contains('divider')) return;
        var wrapper = document.createElement('div');
        wrapper.id = 'sec-auto-' + Math.random().toString(36).substr(2, 6);
        next.parentNode.insertBefore(wrapper, next);
        wrapper.appendChild(next);
        var chev = document.createElementNS('http://www.w3.org/2000/svg','svg');
        chev.setAttribute('class','collapse-chev');
        chev.setAttribute('width','10'); chev.setAttribute('height','10');
        chev.setAttribute('viewBox','0 0 24 24');
        chev.innerHTML = '<polyline points="6,9 12,15 18,9" fill="none" stroke="white" stroke-width="3"/>';
        label.parentNode.insertBefore(chev, label);
        hdr.dataset.collapsible = wrapper.id;
        hdr.style.cursor = 'pointer';
        hdr.addEventListener('click', function(e) {
          if (e.target.closest('.toggle-active') || e.target.closest('button:not(.collapse-chev)')) return;
          var w = document.getElementById(this.dataset.collapsible);
          if (!w) return;
          w.classList.toggle('section-collapsed');
          var c = this.querySelector('.collapse-chev');
          if (c) c.style.transform = w.classList.contains('section-collapsed') ? 'rotate(-90deg)' : '';
        });
      });
    }
    // Run after DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initCollapsibleSections);
    } else {
      setTimeout(initCollapsibleSections, 100);
    }

