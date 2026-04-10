// ═══ UI Logic ═══
// Auto-extracted from index.html inline scripts


    function switchTab(name) {
      var panels = document.querySelectorAll('.tab-panel');
      var btns = document.querySelectorAll('.tab-btn');
      for(var i=0;i<panels.length;i++) panels[i].classList.remove('active');
      for(var i=0;i<btns.length;i++) btns[i].classList.remove('active');
      var p = document.getElementById('panel-' + name);
      var b = document.getElementById('tab-' + name);
      if(p) p.classList.add('active');
      if(b) b.classList.add('active');
      // Re-render gradient bar when switching to color tab (canvas needs visible width)
      if(name === 'color') {
        setTimeout(function() {
          if(typeof renderGradientBar === 'function') renderGradientBar();
          if(typeof renderGradientHandles === 'function') renderGradientHandles();
          if(typeof renderShapeGradBar === 'function') renderShapeGradBar();
        }, 50);
      }
      if(name === 'pixelate') {
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            if(typeof initPixShapeGrad === 'function') initPixShapeGrad(activePixelateTab);
          });
        });
      }
    }

    let groupIdCounter = 6;

    window.shaderParams = {
      source: 'pattern',
      cameraFacing: 'user',
      mode: 0, points: 14, seed: 0,
      noiseType: 0, noiseElementSize: 0.5, noiseOffsetX: 0, noiseOffsetY: 0,
      noiseOctaves: 5, noiseLacunarity: 2.0, noiseRoughness: 0.5,
      flowScale: 2.0, flowSpeed: 1.0, flowDistort1: 8.1, flowDistort2: 4.13,
      flowSmoothLo: 0.15, flowSmoothHi: 0.85,
      flowType: 0,
      flow1Style: 0, flowHueOffset: 0.0, flowHueRadius: 1.0, flowHueEnabled: false,
      f2Scale: 6.0, f2VelX: 0.1, f2VelY: 0.2, f2Speed: 2.5,
      f2Detail: 200.0, f2Twist: 50.0, f2Iter1: 20, f2Iter2: 20, f2Mode: 0,
      f2HueOffset: 0.0, f2HueRadius: 1.0, f2HueEnabled: false,
      imageScale: 1.0,
      globalPixelScale: 1.0,
      smoothEdgesEnabled: false,
      smoothEdgesAmount: 0.5,
      rot: 117, dx: 0, dy: 0,
      sx: 1, sy: 1,
      mirrorX: 1, mirrorY: 1,
      flipX: 0,   flipY: 0,
      spring: 0,
      snapGrid: false,
      gridUnit: 50,
      fastMode: false,
      renderRes: 2,
      precompute: false,
      precomputeFrames: 3,
      mergeEnabled: false,
      mergeDist: 1,
      smoothEnabled: false,
      smoothEdge: 2,
      showDots: false,
      dotRadius: 0.008,
      colorSeed: 0,
      hueOffset: 0,
      hueRadius: 1,
      satSeed: 0,
      satMin: 0,
      satMax: 1,
      brightSeed: 0,
      colorMode: 0,
      colorize: true,
      preProcess: false,
      blurRadius: 0,
      blurEnabled: true,
      camHue: 0, camSat: 1, camVal: 1, camContrast: 1,  // 0=gradient, 1=hue
      gradientSeed: 0,
      imgPixelEnabled: false,
      imgPixelCols: 5,
      imgPixelRows: 5,
      imgPixelBlend: 8,
      imgPixelOpacity: 1.0,
      imgPixelAffectScale: false,
      imgPixelMinScale: -4.0,
      imgPixelMaxScale: 4.0,
      imgPixelAffectRotate: false,
      imgPixelMinRotate: -90.0,
      imgPixelMaxRotate: 90.0,
      imgPixelAffectOffset: false,
      imgPixelMinOffset: -0.5,
      imgPixelMaxOffset: 0.5,
      valueMin: 0.75,
      valueMax: 1.0,
      animating: false,
      animSpeed: 10,
      fps: 30,
      outlineWidth: 0.0,
      outlineColor: '#000000',
      showOutline: false,
      pixelate: false,
      pixelW: 23,
      pixelH: 11,
      weaveMode: 0,     // 0=none, 1=brick, 2=weave
      pixelShape: 0,    // 0=none, 1=pill, 2=diamond, 3=square
      shapeMargin: 3,
      shapeBleed: 0,
      pixelScale: 1.0,
      oblique: false,
      quadSteps: 4,
      quadEnabled: false,
      genDiamond: false,
      shapeGradOpacity: 0.2,
      shapeGradDir: 0,
      tileGradEnabled: true,
      radialCenterX: 0,
      radialCenterY: 0,
      radialScale: 1,
      embossBlendMode: 8,  // 0=horizontal, 1=vertical
      shapeGradStops: [
        { pos: 0.0, r: 0,   g: 0,   b: 0,   hex: '#000000' },
        { pos: 0.5, r: 255, g: 255, b: 255, hex: '#ffffff' },
        { pos: 1.0, r: 0,   g: 0,   b: 0,   hex: '#000000' }
      ],
      gapColor: '#000000',
      gapOpacity: 1.0,
      // ── Canvas size ──────────────────────────────────────
      canvasMode: 'fullscreen',
      canvasWidth: 1920,
      canvasHeight: 1080,
      bgMode: 'custom',
      bgColor: '#000000',
      bgSeed: 0,
      // ── Multi-instance pixelate ──────────────────────────
      pixelateInstances: null, // populated by initPixelateInstances()
      banding: true,
      bandCount: 12,
      bandLumMin: 0.69,
      bandLumMax: 1.0,
      bandStrength: 1.0,
      bandRandomize: false,
      bandBlendMode: 0,
      bandHueOffset: 0,
      bandAngleMode: 0,
      bandAngleSeed: 0,
      bandRandCount: false,
      bandRandCountMin: 0.2,
      bandRandCountMax: 1.0,
      bandRandCountSeed: 0,
      bandHueStrength: 0.0,
      bandHueRadius: 0.5,
      bandOutline: false,   // 0=overlay,1=multiply,2=screen,3=soft light,4=hard light,5=dodge,6=burn,7=linear light,8=normal
      gradeHue: 0,
      gradeSat: 1.27,
      gradeVal: 1.05,
      gradeContrast: 1.68,
      postProcessEnabled: true,
      ppStack: [],
      prePPStack: [],
      gradientStops: [
        { pos: 0.0,  r: 40,  g: 40,  b: 80,  hex: '#282850' },
        { pos: 0.25, r: 80,  g: 120, b: 200, hex: '#5078c8' },
        { pos: 0.5,  r: 160, g: 60,  b: 180, hex: '#a03cb4' },
        { pos: 0.75, r: 200, g: 50,  b: 100, hex: '#c83264' },
        { pos: 1.0,  r: 240, g: 200, b: 180, hex: '#f0c8b4' }
      ],
      groupsEnabled: true,
      opPatterns: [
        { id: 1, active: true, grid: [[0,1],[1,0]], hueShift: 0.04, hueOpacity: 0.92 },
        { id: 2, active: true, grid: [[1],[0]], hueShift: 0.05, hueOpacity: 1.0 },
        { id: 3, active: true, grid: [[1,0],[1,0]], hueShift: 0.17, hueOpacity: 1.0 },
        { id: 4, active: true, grid: [[1,0,1],[0,1,0]], hueShift: 0.55, hueOpacity: 1.0 }
      ],
      opPatternIdCounter: 4,
      opPatternsEnabled: true,
      opPatternSeed: 0,
      opPatternMode: 0,
      groups: [
        { id: 1, active: true, dx:  0.27, dy:  0.18, scale: 1.12, threshold: 0.000, seed:   1 },
        { id: 2, active: true, dx:  0.27, dy:  0.18, scale: 1.22, threshold: 0.000, seed:   1 },
        { id: 3, active: true, dx:  0.27, dy:  0.18, scale: 1.25, threshold: 0.000, seed: 914 },
        { id: 4, active: true, dx:  0.27, dy:  0.18, scale: 0.95, threshold: 0.000, seed:   1 },
        { id: 5, active: true, dx:  0.27, dy:  0.27, scale: 0.82, threshold: 0.000, seed:   1 },
        { id: 6, active: true, dx:  0.27, dy:  0.09, scale: 0.71, threshold: 0.000, seed:   1 }
      ]
    };

    const isMobileUI = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    let uiVisible = !isMobileUI;

    // Apply initial state
    if (isMobileUI) {
      document.getElementById('ui').classList.add('hidden');
      document.getElementById('mobile-float').classList.add('visible');
    }

    // Mobile: quick horizontal flick on canvas to cycle flavors
    // Distinguishes from pan by requiring high velocity + short duration
    (function() {
      let swipeStartX = 0, swipeStartY = 0, swipeStartTime = 0;
      const canvas = document.getElementById('glCanvas');
      canvas.addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1) return;
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
        swipeStartTime = Date.now();
      }, {passive: true});
      canvas.addEventListener('touchend', function(e) {
        const dt = Date.now() - swipeStartTime;
        if (dt > 300) return; // too slow = pan, not flick
        const dx = e.changedTouches[0].clientX - swipeStartX;
        const dy = e.changedTouches[0].clientY - swipeStartY;
        if (Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) * 0.5) return;
        const sel = document.getElementById('selFlavor');
        if (!sel || sel.options.length === 0) return;
        let idx = sel.selectedIndex;
        if (dx < 0) idx = (idx + 1) % sel.options.length;
        else idx = (idx - 1 + sel.options.length) % sel.options.length;
        if (idx !== sel.selectedIndex) {
          sel.selectedIndex = idx;
          loadFlavor(sel.value);
        }
      }, {passive: true});
    })();

    // Pinch-to-zoom on canvas: adjusts noise element size when in noise mode
    (function() {
      const canvas = document.getElementById('glCanvas');
      let pinchStartDist = 0, pinchStartSize = 0;
      canvas.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) {
          var dx = e.touches[0].clientX - e.touches[1].clientX;
          var dy = e.touches[0].clientY - e.touches[1].clientY;
          pinchStartDist = Math.sqrt(dx*dx + dy*dy);
          pinchStartSize = window.shaderParams.noiseElementSize || 0.5;
        }
      }, {passive: true});
      canvas.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2 && window.shaderParams.mode === 3) {
          e.preventDefault();
          var dx = e.touches[0].clientX - e.touches[1].clientX;
          var dy = e.touches[0].clientY - e.touches[1].clientY;
          var dist = Math.sqrt(dx*dx + dy*dy);
          if (pinchStartDist > 0) {
            var ratio = pinchStartDist / dist; // pinch in = larger value (zoom out)
            var newSize = Math.max(0.01, Math.min(2.0, pinchStartSize * ratio));
            window.shaderParams.noiseElementSize = newSize;
            var sl = document.getElementById('sNoiseElemSize');
            var va = document.getElementById('vNoiseElemSize');
            if (sl) sl.value = newSize;
            if (va) va.value = newSize.toFixed(2);
            window.shaderDirty = true;
          }
        }
      }, {passive: false});
    })();

    function toggleUI() {
      uiVisible = !uiVisible;
      document.getElementById('ui').classList.toggle('hidden', !uiVisible);
      document.getElementById('ui-toggle').classList.toggle('visible', !uiVisible);
      // Mobile: show/hide floating controls
      const mf = document.getElementById('mobile-float');
      if (mf) mf.classList.toggle('visible', !uiVisible);
    }

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }

    /* ── Source switching (Voronoi / Camera) ───────────────────── */
    let cameraStream = null;

    function setSource(src) {
      window.shaderParams.source = src;
      document.getElementById('btn-src-pattern').classList.toggle('active', src === 'pattern');
      document.getElementById('btn-src-image').classList.toggle('active', src === 'image');
      document.getElementById('btn-src-camera').classList.toggle('active', src === 'camera');
      document.getElementById('voronoi-sections').style.display = src === 'pattern' ? '' : 'none';
      document.getElementById('voronoi-sections-2').style.display = src === 'pattern' ? '' : 'none';
      document.getElementById('camera-controls').style.display = src === 'camera' ? '' : 'none';
      document.getElementById('image-controls').style.display = src === 'image' ? '' : 'none';

      if (src === 'camera') {
        startCamera();
      } else {
        stopCamera();
      }
      window.shaderDirty = true;
    }

    function startCamera() {
      const facing = window.shaderParams.cameraFacing || 'user';
      const constraints = {
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      };
      navigator.mediaDevices.getUserMedia(constraints).then(stream => {
        cameraStream = stream;
        const video = document.getElementById('cameraVideo');
        video.srcObject = stream;
        video.play();
        window.cameraVideo = video;
        // Wait for video to actually have frames before rendering
        video.addEventListener('loadeddata', () => {
          window.shaderDirty = true;
        }, { once: true });
        window.shaderDirty = true;
      }).catch(err => {
        console.error('Camera error:', err);
        alert('Could not access camera. Check permissions.');
        setSource('pattern');
      });
    }

    function stopCamera() {
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
      }
      window.cameraVideo = null;
    }

    function flipCamera() {
      const p = window.shaderParams;
      p.cameraFacing = p.cameraFacing === 'user' ? 'environment' : 'user';
      if (p.source === 'camera') {
        stopCamera();
        startCamera();
      }
    }

    /* ── Image source upload ─────────────────────────────────────── */
    function handleImageSourceUpload(event) {
      var file = event.target.files[0];
      if (!file) return;
      var nm = document.getElementById('imageSourceName');
      if (nm) nm.textContent = file.name;
      var reader = new FileReader();
      reader.onload = function(e) {
        window.shaderParams.imageDataURL = e.target.result;
        var img = new Image();
        img.onload = function() {
          if (window.uploadImageSourceTex) window.uploadImageSourceTex(img);
          // Resize canvas if in imageframe mode
          if (window.shaderParams.canvasMode === 'imageframe') applyCanvasSize();
          window.shaderDirty = true;
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    /* ── Custom color picker ──────────────────────────────────────── */
    let cpCallback = null;
    let cpH = 0, cpS = 1, cpV = 1;

    function hsv2rgbPicker(h, s, v) {
      h = ((h % 1) + 1) % 1;
      const i = Math.floor(h * 6), f = h * 6 - i;
      const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
      let r, g, b;
      switch (i % 6) {
        case 0: r=v;g=t;b=p;break; case 1: r=q;g=v;b=p;break;
        case 2: r=p;g=v;b=t;break; case 3: r=p;g=q;b=v;break;
        case 4: r=t;g=p;b=v;break; default: r=v;g=p;b=q;
      }
      return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
    }

    function rgb2hsvPicker(r, g, b) {
      r/=255; g/=255; b/=255;
      const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn;
      let h=0, s=mx?d/mx:0, v=mx;
      if(d){if(mx===r)h=((g-b)/d+6)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h/=6;}
      return [h, s, v];
    }

    function openColorPicker(hexColor, callback) {
      cpCallback = callback;
      const r = parseInt(hexColor.slice(1,3),16)||0;
      const g = parseInt(hexColor.slice(3,5),16)||0;
      const b = parseInt(hexColor.slice(5,7),16)||0;
      [cpH, cpS, cpV] = rgb2hsvPicker(r, g, b);
      document.getElementById('color-picker-overlay').classList.add('open');
      updatePickerUI();
    }

    function closeColorPicker() {
      document.getElementById('color-picker-overlay').classList.remove('open');
      cpCallback = null;
    }

    function confirmColorPicker() {
      if (cpCallback) {
        const [r,g,b] = hsv2rgbPicker(cpH, cpS, cpV);
        const hex = '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
        cpCallback(hex, r, g, b);
      }
      closeColorPicker();
    }

    function updatePickerUI() {
      const svArea = document.getElementById('cp-sv-area');
      const [r,g,b] = hsv2rgbPicker(cpH, 1, 1);
      svArea.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, rgb(${r},${g},${b}))`;
      const cursor = document.getElementById('cp-sv-cursor');
      cursor.style.left = (cpS * 100) + '%';
      cursor.style.top = ((1 - cpV) * 100) + '%';
      const hueCursor = document.getElementById('cp-hue-cursor');
      hueCursor.style.left = (cpH * 100) + '%';
      const hueCol = hsv2rgbPicker(cpH, 1, 1);
      hueCursor.style.background = `rgb(${hueCol[0]},${hueCol[1]},${hueCol[2]})`;
      const [cr,cg,cb] = hsv2rgbPicker(cpH, cpS, cpV);
      document.getElementById('cp-preview').style.background = `rgb(${cr},${cg},${cb})`;
      document.getElementById('cp-r').value = cr;
      document.getElementById('cp-g').value = cg;
      document.getElementById('cp-b').value = cb;
    }

    // SV area interaction
    (function() {
      const sv = document.getElementById('cp-sv-area');
      function updateSV(x, y) {
        const rect = sv.getBoundingClientRect();
        cpS = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
        cpV = Math.max(0, Math.min(1, 1 - (y - rect.top) / rect.height));
        updatePickerUI();
      }
      sv.addEventListener('mousedown', e => { updateSV(e.clientX, e.clientY);
        const onMove = ev => updateSV(ev.clientX, ev.clientY);
        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
      });
      sv.addEventListener('touchstart', e => { e.preventDefault(); updateSV(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
      sv.addEventListener('touchmove', e => { e.preventDefault(); updateSV(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
    })();

    // Hue bar interaction
    (function() {
      const bar = document.getElementById('cp-hue-bar');
      function updateH(x) {
        const rect = bar.getBoundingClientRect();
        cpH = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
        updatePickerUI();
      }
      bar.addEventListener('mousedown', e => { updateH(e.clientX);
        const onMove = ev => updateH(ev.clientX);
        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
      });
      bar.addEventListener('touchstart', e => { e.preventDefault(); updateH(e.touches[0].clientX); }, {passive:false});
      bar.addEventListener('touchmove', e => { e.preventDefault(); updateH(e.touches[0].clientX); }, {passive:false});
    })();

    // RGB input fields
    ['cp-r','cp-g','cp-b'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        const r = parseInt(document.getElementById('cp-r').value)||0;
        const g = parseInt(document.getElementById('cp-g').value)||0;
        const b = parseInt(document.getElementById('cp-b').value)||0;
        [cpH, cpS, cpV] = rgb2hsvPicker(
          Math.max(0,Math.min(255,r)), Math.max(0,Math.min(255,g)), Math.max(0,Math.min(255,b)));
        updatePickerUI();
      });
    });

    // Helper: open custom picker for any color swatch
    function hookColorSwatch(swatchId, inputId, paramKey) {
      const swatch = document.getElementById(swatchId);
      if (!swatch) return;
      swatch.style.cursor = 'pointer';
      swatch.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        const current = window.shaderParams[paramKey] || '#000000';
        openColorPicker(current, (hex) => {
          window.shaderParams[paramKey] = hex;
          swatch.style.background = hex;
          window.shaderDirty = true;
        });
      });
    }

    hookColorSwatch('outlineSwatch', null, 'outlineColor');
    hookColorSwatch('gapSwatch', null, 'gapColor');

    // Mobile: swipe down on the collapse area to close drawer
    (function() {
      const collapse = document.getElementById('ui-collapse');
      let startY = 0;
      collapse.addEventListener('touchstart', function(e) {
        startY = e.touches[0].clientY;
      }, {passive: true});
      collapse.addEventListener('touchend', function(e) {
        const dy = e.changedTouches[0].clientY - startY;
        if (dy > 40 && uiVisible) toggleUI();
      }, {passive: true});
      // Also tap the collapse bar to toggle on mobile
      collapse.addEventListener('click', function(e) {
        if (window.innerWidth <= 768 && e.target === collapse) toggleUI();
      });
    })();

    function setFlowType(t) {
      window.shaderParams.flowType = t;
      var sel = document.getElementById('selFlowType');
      if(sel) sel.value = String(t);
      var f1 = document.getElementById('flow1-controls');
      var f2 = document.getElementById('flow2-controls');
      if(f1) f1.style.display = t === 0 ? '' : 'none';
      if(f2) f2.style.display = t === 1 ? '' : 'none';
      window.shaderDirty = true;
    }

    function setFlow1Style(s) {
      window.shaderParams.flow1Style = s;
      var sel = document.getElementById('selFlow1Style');
      if(sel) sel.value = String(s);
      window.shaderDirty = true;
    }

    function setFlow2Mode(m) {
      window.shaderParams.f2Mode = m;
      for(var i = 0; i < 4; i++) {
        var btn = document.getElementById('btn-f2m' + i);
        if(btn) btn.classList.toggle('active', i === m);
      }
      // Show Curl Iters row only for modes C and D (fieldMode=1)
      var r = document.getElementById('f2iter2-row');
      if(r) r.style.display = m >= 2 ? '' : 'none';
      window.shaderDirty = true;
    }

    function toggleFlow1Hue() {
      var p = window.shaderParams;
      p.flowHueEnabled = !p.flowHueEnabled;
      var btn = document.getElementById('btn-flow1-hue-toggle');
      if(btn) btn.classList.toggle('on', p.flowHueEnabled);
      var ctrl = document.getElementById('flow1-hue-controls');
      if(ctrl) ctrl.style.display = p.flowHueEnabled ? '' : 'none';
      window.shaderDirty = true;
    }

    function toggleF2Hue() {
      var p = window.shaderParams;
      p.f2HueEnabled = !p.f2HueEnabled;
      var btn = document.getElementById('btn-f2-hue-toggle');
      if(btn) btn.classList.toggle('on', p.f2HueEnabled);
      var ctrl = document.getElementById('f2-hue-controls');
      if(ctrl) ctrl.style.display = p.f2HueEnabled ? '' : 'none';
      window.shaderDirty = true;
    }

    function setMode(m) {
      window.shaderParams.mode = m;
      document.getElementById('btn-chebyshev').classList.toggle('active', m === 0);
      document.getElementById('btn-manhattan').classList.toggle('active', m === 1);
      document.getElementById('btn-euclidean').classList.toggle('active', m === 2);
      document.getElementById('btn-noise').classList.toggle('active', m === 3);
      document.getElementById('btn-flow').classList.toggle('active', m === 4);
      // Show the right sub-panel
      document.getElementById('noise-controls').style.display  = m === 3 ? '' : 'none';
      document.getElementById('flow-controls').style.display   = m === 4 ? '' : 'none';
      document.getElementById('voronoi-controls').style.display = (m === 3 || m === 4) ? 'none' : '';
      window.shaderDirty = true;
    }

    function setColorMode(m) {
      window.shaderParams.colorMode = m;
      // Raw=2 means colorize is on but mode skips recoloring
      window.shaderParams.colorize = (m !== 2);
      document.getElementById('btn-cm-raw').classList.toggle('active', m === 2);
      document.getElementById('btn-cm-grad').classList.toggle('active', m === 0);
      document.getElementById('btn-cm-hue').classList.toggle('active', m === 1);
      document.getElementById('gradient-controls').style.display = m === 0 ? '' : 'none';
      document.getElementById('hue-controls').style.display = m === 1 ? '' : 'none';
      if (m === 0) {
        setTimeout(function(){ renderGradientBar(); syncGradientToGL(); }, 50);
      }
      window.shaderDirty = true;
      if (window.shaderParams.bgMode === 'random' && typeof updateBgRandomPreview === 'function') updateBgRandomPreview();
    }

    function toggleBlur() {
      var p = window.shaderParams;
      p.blurEnabled = !(p.blurEnabled !== false);
      var btn = document.getElementById('btn-blur-toggle');
      if (btn) btn.classList.toggle('on', p.blurEnabled !== false);
      var ctrl = document.getElementById('blur-controls');
      if (ctrl) ctrl.classList.toggle('controls-disabled', !p.blurEnabled);
      window.shaderDirty = true;
    }

    function togglePreProcess() {
      var p = window.shaderParams;
      p.preProcess = !p.preProcess;
      document.getElementById('btn-preprocess-toggle').classList.toggle('on', p.preProcess);
      document.getElementById('preprocess-controls').classList.toggle('controls-disabled', !p.preProcess);
      window.shaderDirty = true;
    }

    function toggleColorize() {
      // No longer used — colorize is controlled by Raw/Gradient/Hue buttons
    }

    // ══════════════════════════════════════════════════
    //  POST-PROCESS STACK
    // ══════════════════════════════════════════════════

    var ppIdCounter = 0;

    var PP_CATALOG = [
      { type:0,  name:'Brightness/Contrast', params:[
        {key:'brightness',label:'Brightness',min:-1,max:1,step:0.01,def:0},
        {key:'contrast',label:'Contrast',min:0,max:3,step:0.01,def:1}
      ], pack:function(e){return [e.brightness||0, e.contrast!=null?e.contrast:1, 0, 0];}},
      { type:1,  name:'Levels', params:[
        {key:'inBlack',label:'In Black',min:0,max:1,step:0.01,def:0},
        {key:'inWhite',label:'In White',min:0,max:1,step:0.01,def:1},
        {key:'gamma',label:'Gamma',min:0.1,max:4,step:0.01,def:1}
      ], pack:function(e){return [e.inBlack||0, e.inWhite!=null?e.inWhite:1, e.gamma!=null?e.gamma:1, 0];}},
      { type:2,  name:'Exposure', params:[
        {key:'exposure',label:'Exposure',min:-5,max:5,step:0.01,def:0},
        {key:'offset',label:'Offset',min:-1,max:1,step:0.01,def:0},
        {key:'gammaCorr',label:'Gamma',min:0.1,max:4,step:0.01,def:1}
      ], pack:function(e){return [e.exposure||0, e.offset||0, e.gammaCorr!=null?e.gammaCorr:1, 0];}},
      { type:3,  name:'Vibrance', params:[
        {key:'vibrance',label:'Vibrance',min:-1,max:1,step:0.01,def:0}
      ], pack:function(e){return [e.vibrance||0, 0, 0, 0];}},
      { type:4,  name:'Hue/Saturation', params:[
        {key:'hue',label:'Hue',min:-180,max:180,step:1,def:0},
        {key:'saturation',label:'Saturation',min:-1,max:1,step:0.01,def:0},
        {key:'lightness',label:'Lightness',min:-1,max:1,step:0.01,def:0}
      ], pack:function(e){return [e.hue||0, e.saturation||0, e.lightness||0, 0];}},
      { type:5,  name:'Color Balance', params:[
        {key:'cyanRed',label:'Cyan ↔ Red',min:-2,max:2,step:0.01,def:0},
        {key:'magGreen',label:'Mag ↔ Green',min:-2,max:2,step:0.01,def:0},
        {key:'yellowBlue',label:'Yellow ↔ Blue',min:-2,max:2,step:0.01,def:0}
      ], pack:function(e){return [e.cyanRed||0, e.magGreen||0, e.yellowBlue||0, 0];}},
      { type:6,  name:'Black & White', params:[
        {key:'reds',label:'Reds',min:0,max:2,step:0.01,def:0.4},
        {key:'greens',label:'Greens',min:0,max:2,step:0.01,def:0.35},
        {key:'blues',label:'Blues',min:0,max:2,step:0.01,def:0.25},
        {key:'strength',label:'Strength',min:0,max:2,step:0.01,def:1}
      ], pack:function(e){return [e.reds!=null?e.reds:0.4, e.greens!=null?e.greens:0.35, e.blues!=null?e.blues:0.25, e.strength!=null?e.strength:1];}},
      { type:7,  name:'Photo Filter', params:[
        {key:'pfR',label:'Red',min:0,max:2,step:0.01,def:1},
        {key:'pfG',label:'Green',min:0,max:2,step:0.01,def:0.9},
        {key:'pfB',label:'Blue',min:0,max:2,step:0.01,def:0.7},
        {key:'density',label:'Density',min:0,max:1,step:0.01,def:0.25}
      ], pack:function(e){return [e.pfR!=null?e.pfR:1, e.pfG!=null?e.pfG:0.9, e.pfB!=null?e.pfB:0.7, e.density!=null?e.density:0.25];}},
      { type:8,  name:'Invert', params:[], pack:function(){return [0,0,0,0];}},
      { type:9,  name:'Posterize', params:[
        {key:'levels',label:'Levels',min:2,max:64,step:1,def:8}
      ], pack:function(e){return [e.levels!=null?e.levels:8, 0, 0, 0];}},
      { type:10, name:'Threshold', params:[
        {key:'threshold',label:'Threshold',min:0,max:1,step:0.01,def:0.5}
      ], pack:function(e){return [e.threshold!=null?e.threshold:0.5, 0, 0, 0];}},
      { type:11, name:'Shadows/Highlights', params:[
        {key:'shadows',label:'Shadows',min:-1,max:1,step:0.01,def:0},
        {key:'highlights',label:'Highlights',min:-1,max:1,step:0.01,def:0}
      ], pack:function(e){return [e.shadows||0, e.highlights||0, 0, 0];}},
      { type:12, name:'Desaturate', params:[
        {key:'amount',label:'Amount',min:0,max:1,step:0.01,def:1}
      ], pack:function(e){return [e.amount!=null?e.amount:1, 0, 0, 0];}},
      { type:13, name:'Curves', params:[
        {key:'sCurve',label:'S-Curve',min:-1,max:1,step:0.01,def:0}
      ], pack:function(e){return [e.sCurve||0, 0, 0, 0];}},
      { type:14, name:'Color Fill', params:[
        {key:'fillR',label:'Red',min:0,max:1,step:0.01,def:1},
        {key:'fillG',label:'Green',min:0,max:1,step:0.01,def:1},
        {key:'fillB',label:'Blue',min:0,max:1,step:0.01,def:1},
        {key:'fillOpacity',label:'Opacity',min:0,max:1,step:0.01,def:0.5}
      ], pack:function(e){return [e.fillR!=null?e.fillR:1, e.fillG!=null?e.fillG:1, e.fillB!=null?e.fillB:1, e.fillOpacity!=null?e.fillOpacity:0.5];},
        hasBland:true, defBlend:8, hasColor:true},
      { type:15, name:'Gradient Fill', params:[
        {key:'gradOpacity',label:'Opacity',min:0,max:1,step:0.01,def:0.5}
      ], pack:function(e){return [e.gradOpacity!=null?e.gradOpacity:0.5, 0, 0, 0];},
        hasBland:true, defBlend:8, hasGradient:true, hasGradEditor:true},
      { type:16, name:'Opacity Pattern', params:[],
        pack:function(){return [0,0,0,0];}, hasOpPattern:true}
    ];

    // Pack params for shader uniform
    window._ppGetParams = function(ppe) {
      var cat = PP_CATALOG.find(function(c){ return c.type === ppe.type; });
      return cat ? cat.pack(ppe) : [0,0,0,0];
    };

    // Filter catalog for the + menu (excludes some PP types, reorders for UX)
    var FILTER_MENU = [
      {label:'Color Fill', type:14},
      {label:'Gradient Fill', type:15},
      {label:'Opacity Pattern', type:16},
      {label:'─── Adjustments ───', sep:true},
      {label:'Brightness/Contrast', type:0},
      {label:'Levels', type:1},
      {label:'Exposure', type:2},
      {label:'Vibrance', type:3},
      {label:'Hue/Saturation', type:4},
      {label:'Color Balance', type:5},
      {label:'Black & White', type:6},
      {label:'Photo Filter', type:7},
      {label:'Invert', type:8},
      {label:'Posterize', type:9},
      {label:'Threshold', type:10},
      {label:'Shadows/Highlights', type:11},
      {label:'Desaturate', type:12},
      {label:'Curves', type:13}
    ];

    function togglePrePPMenu() {
      var menu = document.getElementById('prepp-menu');
      if (menu.style.display === 'none') {
        var cats = [
          {name:'Brightness/Contrast',t:0},{name:'Levels',t:1},{name:'Exposure',t:2},
          {name:'Vibrance',t:3},{name:'Color Balance',t:4},{name:'Channel Mixer',t:5},
          {name:'HSL Adjust',t:6},{name:'Posterize',t:7},{name:'Threshold',t:8},
          {name:'Invert',t:9},{name:'Sepia',t:10},{name:'Duotone',t:11},
          {name:'Sharpen',t:12},{name:'Vignette',t:13},
          {name:'Color Fill',t:14},{name:'Gradient Fill',t:15}
        ];
        menu.innerHTML = cats.map(function(c){
          return '<div style="padding:4px 12px;cursor:pointer;font-size:11px;color:#ccc" onmouseover="this.style.background=\'rgba(255,255,255,0.08)\'" onmouseout="this.style.background=\'\'" onclick="addPrePPItem('+c.t+')">'+c.name+'</div>';
        }).join('');
        menu.style.display = '';
      } else {
        menu.style.display = 'none';
      }
    }

    function addPrePPItem(type) {
      var p = window.shaderParams;
      if (!p.prePPStack) p.prePPStack = [];
      if (p.prePPStack.length >= 16) return;
      var ppCats = [
        {name:'Brightness/Contrast',params:[0,1,0,0]},
        {name:'Levels',params:[0,1,1,0]},
        {name:'Exposure',params:[0,1,0,0]},
        {name:'Vibrance',params:[0,0,0,0]},
        {name:'Color Balance',params:[0,0,0,0]},
        {name:'Channel Mixer',params:[1,1,1,0]},
        {name:'HSL Adjust',params:[0,1,1,0]},
        {name:'Posterize',params:[8,0,0,0]},
        {name:'Threshold',params:[0.5,0,0,0]},
        {name:'Invert',params:[1,0,0,0]},
        {name:'Sepia',params:[1,0,0,0]},
        {name:'Duotone',params:[0,0,0,0]},
        {name:'Sharpen',params:[0.5,0,0,0]},
        {name:'Vignette',params:[0.5,0.5,0,0]},
        {name:'Color Fill',params:[0,0,0,0]},
        {name:'Gradient Fill',params:[0,0,0,0]}
      ];
      var cat = ppCats[type];
      var item = { id: Date.now(), type: type, name: cat.name, params: cat.params.slice(), enabled: true };
      if (type === 14) { item.color = '#ff0000'; item.blend = 8; item.opacity = 1.0; }
      if (type === 15) { item.blend = 8; item.opacity = 1.0; item.gradStops = [{pos:0,color:'#000000'},{pos:1,color:'#ffffff'}]; item.gradDir = 0; item.gradRadial = false; }
      p.prePPStack.push(item);
      document.getElementById('prepp-menu').style.display = 'none';
      wirePrePPStack();
      window.shaderDirty = true;
    }

    function removePrePPItem(id) {
      var p = window.shaderParams;
      p.prePPStack = (p.prePPStack || []).filter(function(x){ return x.id !== id; });
      wirePrePPStack();
      window.shaderDirty = true;
    }

    function togglePrePPItem(id) {
      var p = window.shaderParams;
      var item = (p.prePPStack || []).find(function(x){ return x.id === id; });
      if (!item) return;
      item.enabled = !item.enabled;
      var btn = document.getElementById('prepp-toggle-'+id);
      if (btn) btn.classList.toggle('on', item.enabled);
      var body = document.getElementById('prepp-body-'+id);
      if (body) body.classList.toggle('controls-disabled', !item.enabled);
      window.shaderDirty = true;
    }

    function movePrePPItem(id, dir) {
      var p = window.shaderParams;
      var stack = p.prePPStack || [];
      var idx = stack.findIndex(function(x){ return x.id === id; });
      if (idx < 0) return;
      var ni = idx + dir;
      if (ni < 0 || ni >= stack.length) return;
      var tmp = stack[idx]; stack[idx] = stack[ni]; stack[ni] = tmp;
      wirePrePPStack();
      window.shaderDirty = true;
    }

    function dupPrePPItem(id) {
      var p = window.shaderParams;
      var stack = p.prePPStack || [];
      var item = stack.find(function(x){ return x.id === id; });
      if (!item || stack.length >= 16) return;
      var copy = JSON.parse(JSON.stringify(item));
      copy.id = Date.now();
      var idx = stack.indexOf(item);
      stack.splice(idx + 1, 0, copy);
      wirePrePPStack();
      window.shaderDirty = true;
    }

    function togglePostProcess() {
      var p = window.shaderParams;
      p.postProcessEnabled = !p.postProcessEnabled;
      document.getElementById('btn-postprocess-toggle').classList.toggle('on', p.postProcessEnabled);
      document.getElementById('postprocess-controls').classList.toggle('controls-disabled', !p.postProcessEnabled);
      window.shaderDirty = true;
    }

    // Smooth Edges — permanent control at top of postprocess panel.
    // Edge-aware FXAA-lite anti-aliasing applied at the start of grade(),
    // sampling uAccumTex (the pre-pixelation accumulator) at 4 neighbors
    // and blending where local luminance contrast is high.
    window.toggleSmoothEdges = function() {
      var p = window.shaderParams;
      p.smoothEdgesEnabled = !p.smoothEdgesEnabled;
      var btn = document.getElementById('btn-smooth-edges-toggle');
      if (btn) btn.classList.toggle('on', p.smoothEdgesEnabled);
      var row = document.getElementById('smooth-edges-row');
      if (row) row.style.display = p.smoothEdgesEnabled ? '' : 'none';
      window.shaderDirty = true;
    };
    // Sync the toggle button + slider visibility with the current param state
    // (called on init and after loading a flavor).
    window.syncSmoothEdgesUI = function() {
      var p = window.shaderParams;
      var btn = document.getElementById('btn-smooth-edges-toggle');
      if (btn) btn.classList.toggle('on', !!p.smoothEdgesEnabled);
      var row = document.getElementById('smooth-edges-row');
      if (row) row.style.display = p.smoothEdgesEnabled ? '' : 'none';
      var sl = document.getElementById('sSmoothEdges');
      var vl = document.getElementById('vSmoothEdges');
      var amt = (p.smoothEdgesAmount != null) ? p.smoothEdgesAmount : 0.5;
      if (sl) sl.value = amt;
      if (vl) vl.value = amt.toFixed(2);
    };

    function togglePPMenu() {
      var menu = document.getElementById('pp-menu');
      var isOpen = menu.style.display !== 'none';
      if (isOpen) { menu.style.display = 'none'; return; }
      menu.innerHTML = FILTER_MENU.map(function(f) {
        if (f.sep) return '<div style="padding:3px 12px;font-size:9px;color:rgba(255,255,255,0.3);pointer-events:none;border-bottom:1px solid rgba(255,255,255,0.06)">'+f.label+'</div>';
        return '<div style="padding:5px 12px;font-size:11px;color:#ccc;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.06)" ' +
          'onmouseover="this.style.background=\'rgba(255,255,255,0.08)\'" onmouseout="this.style.background=\'\'" ' +
          'onclick="addPPEffect('+f.type+')">' + f.label + '</div>';
      }).join('');
      menu.style.display = '';
    }

    function addPPEffect(typeInt) {
      var p = window.shaderParams;
      if (!p.ppStack) p.ppStack = [];
      if (p.ppStack.length >= 16) return;
      var cat = PP_CATALOG.find(function(c){ return c.type === typeInt; });
      if (!cat) return;
      var item = { type: typeInt, enabled: true, collapsed: false, id: ++ppIdCounter };
      cat.params.forEach(function(pr) { item[pr.key] = pr.def; });
      // Fill types get blend mode
      if (cat.hasBland) { item.blendMode = cat.defBlend || 8; item.hueOff = 0; }
      // Color fill gets color
      if (cat.hasColor) { item.fillColor = '#ffffff'; }
      // Gradient fill gets gradient stops + direction
      if (cat.hasGradient) {
        item.gradStops = [{pos:0,r:0,g:0,b:0,hex:'#000000'},{pos:1,r:255,g:255,b:255,hex:'#ffffff'}];
        item.gradDir = 0; item.radialCenterX = 0; item.radialCenterY = 0; item.radialScale = 1;
      }
      // Opacity Pattern gets patterns
      if (cat.hasOpPattern) {
        item.patterns = [
          {id:1, active:true, grid:[[0,1],[1,0]], hueShift:0.04, hueOpacity:0.92}
        ];
        item.patternIdCounter = 1; item.patternSeed = 0; item.patternMode = 0;
        // Copy from instance if it has existing patterns
        if (inst.opPatterns && inst.opPatterns.length > 0) {
          item.patterns = JSON.parse(JSON.stringify(inst.opPatterns));
          item.patternIdCounter = inst.opPatternIdCounter || item.patterns.length;
          item.patternSeed = inst.opPatternSeed || 0;
          item.patternMode = inst.opPatternMode || 0;
        }
      }
      p.ppStack.push(item);
      renderPPStack();
      document.getElementById('pp-menu').style.display = 'none';
      window.shaderDirty = true;
    }



    function removePPItem(id) {
      var p = window.shaderParams;
      p.ppStack = (p.ppStack || []).filter(function(e){ return e.id !== id; });
      renderPPStack();
      window.shaderDirty = true;
    }

    function togglePPItem(id) {
      var p = window.shaderParams;
      var item = (p.ppStack || []).find(function(e){ return e.id === id; });
      if (!item) return;
      item.enabled = !item.enabled;
      var btn = document.getElementById('pp-toggle-'+id);
      if (btn) btn.classList.toggle('on', item.enabled);
      var body = document.getElementById('pp-body-'+id);
      if (body) body.classList.toggle('controls-disabled', !item.enabled);
      window.shaderDirty = true;
    }

    function renderPPStack() {
      var p = window.shaderParams;
      var list = document.getElementById('pp-stack-list');
      if (!list) return;
      var stack = p.ppStack || [];
      stack.forEach(function(e){ if (e.id >= ppIdCounter) ppIdCounter = e.id + 1; });
      var N = stack.length;

      list.innerHTML = stack.map(function(item, idx) {
        var cat = PP_CATALOG.find(function(c){ return c.type === item.type; });
        if (!cat) return '';
        var isCollapsed = item.collapsed === true;
        var slidersHTML = cat.params.map(function(pr) {
          var val = item[pr.key] != null ? item[pr.key] : pr.def;
          var fmtVal = Number.isInteger(pr.step) ? Math.round(val) : val.toFixed(2);
          return '<div class="row"><label style="font-size:10px">'+pr.label+'</label>' +
            '<input type="range" data-ppid="'+item.id+'" data-ppkey="'+pr.key+'" min="'+pr.min+'" max="'+pr.max+'" step="'+pr.step+'" value="'+val+'">' +
            '<input type="number" class="val" data-ppid="'+item.id+'" data-ppkey="'+pr.key+'" value="'+fmtVal+'" min="'+pr.min+'" max="'+pr.max+'" step="'+pr.step+'">' +
            '</div>';
        }).join('');

        // Blend mode dropdown for fill types
        var blendHTML = '';
        if (cat.hasBland) {
          var bm = item.blendMode != null ? item.blendMode : 8;
          var blendOpts = [['Normal',8],['Overlay',0],['Multiply',1],['Screen',2],['Soft Light',3],['Hard Light',4],['Color Dodge',5],['Color Burn',6],['Linear Light',7],['Hue Shift',9]];
          blendHTML = '<div class="row"><label style="font-size:10px">Blend</label><select data-ppid="'+item.id+'" data-ppkey="_blendMode" style="flex:1;font-size:10px">' +
            blendOpts.map(function(o){ return '<option value="'+o[1]+'"'+(bm===o[1]?' selected':'')+'>'+o[0]+'</option>'; }).join('') +
            '</select></div>';
          if (bm === 9) {
            var ho = item.hueOff || 0;
            blendHTML += '<div class="row"><label style="font-size:10px">Hue Offset</label><input type="range" data-ppid="'+item.id+'" data-ppkey="hueOff" min="0" max="1" step="0.01" value="'+ho+'"><input type="number" class="val" data-ppid="'+item.id+'" data-ppkey="hueOff" value="'+ho.toFixed(2)+'" min="0" max="1" step="0.01"></div>';
          }
        }

        // Color swatch for color fill
        var colorHTML = '';
        if (cat.hasColor) {
          colorHTML = '<div class="row"><label style="font-size:10px">Color</label><div class="color-swatch" id="pp-color-'+item.id+'" style="background:'+(item.fillColor||'#ffffff')+';cursor:pointer;width:36px;height:20px;border-radius:3px;border:1px solid rgba(255,255,255,0.2)" onclick="ppPickColor('+item.id+')"></div></div>';
        }

        // Collapse chevron
        var chevron = '<svg class="collapse-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" style="transform:rotate('+(isCollapsed?'-90':'0')+'deg)" onclick="togglePPCollapse('+item.id+')"><polyline points="6,9 12,15 18,9"/></svg>';

        // Reorder arrows
        var upBtn = idx > 0 ? '<button class="btn-circ" onclick="movePPItem('+item.id+',-1)" title="Move up">▲</button>' : '';
        var dnBtn = idx < N-1 ? '<button class="btn-circ" onclick="movePPItem('+item.id+',1)" title="Move down">▼</button>' : '';
        var dupBtn = '<button class="btn-circ" onclick="dupPPItem('+item.id+')" title="Duplicate">⧉</button>';

        var opPatHTML = '';
        var gradEditorHTML = '';

        return '<div class="group-card" style="margin-bottom:6px" data-ppcard="'+item.id+'">' +
          '<div class="group-header" style="display:flex;align-items:center;gap:3px">' +
          chevron +
          '<span class="g-title" style="flex:1;font-size:11px">'+cat.name+'</span>' +
          upBtn + dnBtn + dupBtn +
          '<button class="btn-circ danger" onclick="removePPItem('+item.id+')" title="Remove">✕</button>' +
          '<button class="toggle-active'+(item.enabled!==false?' on':'')+'" id="pp-toggle-'+item.id+'" onclick="togglePPItem('+item.id+')" style="width:32px;min-width:32px;height:16px"></button>' +
          '</div>' +
          '<div class="group-body'+(item.enabled===false?' controls-disabled':'')+'" id="pp-body-'+item.id+'" style="display:'+(isCollapsed?'none':'')+'">' +
          blendHTML + colorHTML + opPatHTML + gradEditorHTML + slidersHTML + '</div></div>';
      }).join('');

      wirePPStack();
      wirePrePPStack();
    }

    function togglePPCollapse(id) {
      var p = window.shaderParams;
      var item = (p.ppStack || []).find(function(e){ return e.id === id; });
      if (!item) return;
      item.collapsed = !item.collapsed;
      var body = document.getElementById('pp-body-'+id);
      if (body) body.style.display = item.collapsed ? 'none' : '';
      // Update chevron
      var card = document.querySelector('[data-ppcard="'+id+'"]');
      if (card) {
        var svg = card.querySelector('svg');
        if (svg) svg.style.transform = 'rotate('+(item.collapsed?'-90':'0')+'deg)';
      }
    }

    function movePPItem(id, dir) {
      var p = window.shaderParams;
      var stack = p.ppStack || [];
      var idx = stack.findIndex(function(e){ return e.id === id; });
      if (idx < 0) return;
      var newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= stack.length) return;
      var tmp = stack[idx];
      stack[idx] = stack[newIdx];
      stack[newIdx] = tmp;
      renderPPStack();
      window.shaderDirty = true;
    }

    function dupPPItem(id) {
      var p = window.shaderParams;
      var stack = p.ppStack || [];
      if (stack.length >= 16) return;
      var item = stack.find(function(e){ return e.id === id; });
      if (!item) return;
      var dup = JSON.parse(JSON.stringify(item));
      dup.id = ++ppIdCounter;
      var idx = stack.indexOf(item);
      stack.splice(idx + 1, 0, dup);
      renderPPStack();
      window.shaderDirty = true;
    }

    function ppPickColor(id) {
      var p = window.shaderParams;
      var item = (p.ppStack || []).find(function(e){ return e.id === id; });
      if (!item) return;
      openColorPicker(item.fillColor || '#ffffff', function(hex, r, g, b) {
        item.fillColor = hex;
        item.fillR = r / 255; item.fillG = g / 255; item.fillB = b / 255;
        var sw = document.getElementById('pp-color-'+id);
        if (sw) sw.style.background = hex;
        window.shaderDirty = true;
      });
    }

    function wirePrePPStack() {
      var p = window.shaderParams;
      var stack = p.prePPStack || [];
      var list = document.getElementById('prepp-stack-list');
      if (!list) return;
      var ppCats = [
        {name:'Brightness/Contrast'},{name:'Levels'},{name:'Exposure'},
        {name:'Vibrance'},{name:'Color Balance'},{name:'Channel Mixer'},
        {name:'HSL Adjust'},{name:'Posterize'},{name:'Threshold'},
        {name:'Invert'},{name:'Sepia'},{name:'Duotone'},
        {name:'Sharpen'},{name:'Vignette'},
        {name:'Color Fill'},{name:'Gradient Fill'}
      ];
      var html = '';
      stack.forEach(function(item, idx) {
        var cat = ppCats[item.type] || {name:'Unknown'};
        var isC = false;
        var chev = '<svg class="collapse-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" onclick="var b=this.parentNode.nextSibling;if(b)b.style.display=b.style.display===\'none\'?\'\':\'none\';event.stopPropagation()"><polyline points="6,9 12,15 18,9"/></svg>';
        var upB = idx > 0 ? '<button class="btn-circ" onclick="movePrePPItem('+item.id+',-1)" title="Up">&#9650;</button>' : '';
        var dnB = idx < stack.length-1 ? '<button class="btn-circ" onclick="movePrePPItem('+item.id+',1)" title="Down">&#9660;</button>' : '';
        var duB = '<button class="btn-circ" onclick="dupPrePPItem('+item.id+')" title="Duplicate">&#10697;</button>';
        html += '<div class="group-card" style="margin-bottom:4px">';
        html += '<div class="g-hdr" style="display:flex;align-items:center;gap:4px;padding:4px 6px">';
        html += chev + '<span class="g-title" style="flex:1;font-size:11px">'+cat.name+'</span>';
        html += upB + dnB + duB;
        html += '<button class="btn-circ danger" onclick="removePrePPItem('+item.id+')" title="Remove">\u2715</button>';
        html += '<button class="toggle-active'+(item.enabled!==false?' on':'')+'" id="prepp-toggle-'+item.id+'" onclick="togglePrePPItem('+item.id+')" style="width:32px;min-width:32px;height:16px"></button>';
        html += '</div>';
        html += '<div class="group-body'+(item.enabled===false?' controls-disabled':'')+'" id="prepp-body-'+item.id+'" style="padding:4px 8px">';
        // Generate sliders based on type (same as PP)
        var slidersHTML = buildPPSliders('prepp', item);
        html += slidersHTML;
        html += '</div></div>';
      });
      list.innerHTML = html;
      // Wire sliders
      stack.forEach(function(item) { wirePPSliders('prepp', item, function(){ window.shaderDirty = true; }); });
    }

    function buildPPSliders(prefix, item) {
      var t = item.type, p = item.params;
      var h = '';
      function row(label, idx, min, max, step, fmt) {
        fmt = fmt || function(v){return v.toFixed(2)};
        var val = p[idx] != null ? p[idx] : 0;
        h += '<div class="row"><label>'+label+'</label>';
        h += '<input type="range" id="'+prefix+'-s-'+item.id+'-'+idx+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'">';
        h += '<input type="number" class="val" id="'+prefix+'-v-'+item.id+'-'+idx+'" value="'+fmt(val)+'" min="'+min+'" max="'+max+'" step="'+step+'">';
        h += '</div>';
      }
      if(t===0){row('Brightness',0,-1,1,0.01);row('Contrast',1,0,3,0.01);}
      if(t===1){row('Black',0,0,1,0.01);row('White',1,0,1,0.01);row('Gamma',2,0.1,3,0.01);}
      if(t===2){row('Exposure',0,-3,3,0.01);row('Gamma',1,0.1,3,0.01);}
      if(t===3){row('Amount',0,-1,1,0.01);}
      if(t===4){row('Shadows',0,-1,1,0.01);row('Midtones',1,-1,1,0.01);row('Highlights',2,-1,1,0.01);}
      if(t===5){row('R',0,0,2,0.01);row('G',1,0,2,0.01);row('B',2,0,2,0.01);}
      if(t===6){row('Hue',0,-180,180,1,function(v){return Math.round(v)});row('Sat',1,0,2,0.01);row('Light',2,0,2,0.01);}
      if(t===7){row('Levels',0,2,32,1,function(v){return Math.round(v)});}
      if(t===8){row('Threshold',0,0,1,0.01);}
      if(t===9){row('Amount',0,0,1,0.01);}
      if(t===10){row('Amount',0,0,1,0.01);}
      if(t===11){row('Dark H',0,0,360,1,function(v){return Math.round(v)});row('Light H',1,0,360,1,function(v){return Math.round(v)});row('Mix',2,0,1,0.01);}
      if(t===12){row('Amount',0,0,2,0.01);}
      if(t===13){row('Amount',0,0,1,0.01);row('Size',1,0,1,0.01);}
      return h;
    }

    function wirePPSliders(prefix, item, onDirty) {
      item.params.forEach(function(val, idx) {
        var sl = document.getElementById(prefix+'-s-'+item.id+'-'+idx);
        var va = document.getElementById(prefix+'-v-'+item.id+'-'+idx);
        if (!sl || !va) return;
        sl.addEventListener('input', function(){
          var v = parseFloat(sl.value);
          item.params[idx] = v;
          va.value = parseFloat(va.step) >= 1 ? Math.round(v) : v.toFixed(2);
          onDirty();
        });
        va.addEventListener('change', function(){
          var v = parseFloat(va.value);
          if (isNaN(v)) return;
          v = Math.max(parseFloat(sl.min), Math.min(parseFloat(sl.max), v));
          sl.value = v;
          item.params[idx] = v;
          onDirty();
        });
      });
    }

    function wirePPStack() {
      var p = window.shaderParams;
      var stack = p.ppStack || [];
      // Wire all sliders and number inputs
      document.querySelectorAll('#pp-stack-list input[data-ppid]').forEach(function(el) {
        var id = parseInt(el.dataset.ppid);
        var key = el.dataset.ppkey;
        var item = stack.find(function(e){ return e.id === id; });
        if (!item) return;
        var isRange = el.type === 'range';
        var pair = isRange
          ? el.parentElement.querySelector('input[type="number"][data-ppkey="'+key+'"][data-ppid="'+id+'"]')
          : el.parentElement.querySelector('input[type="range"][data-ppkey="'+key+'"][data-ppid="'+id+'"]');

        el.addEventListener(isRange ? 'input' : 'change', function() {
          var v = parseFloat(el.value);
          if (isNaN(v)) return;
          if (!isRange) v = Math.max(parseFloat(el.min), Math.min(parseFloat(el.max), v));
          item[key] = v;
          if (pair) pair.value = Number.isInteger(parseFloat(el.step)) ? Math.round(v) : v.toFixed(2);
          if (!isRange && pair) pair.value = v;
          window.shaderDirty = true;
        });
      });
      // Wire blend mode selects
      document.querySelectorAll('#pp-stack-list select[data-ppid]').forEach(function(sel) {
        var id = parseInt(sel.dataset.ppid);
        var key = sel.dataset.ppkey;
        var item = stack.find(function(e){ return e.id === id; });
        if (!item) return;
        sel.addEventListener('change', function() {
          if (key === '_blendMode') {
            item.blendMode = parseInt(sel.value);
            renderPPStack(); // re-render to show/hide hue offset
          } else {
            item[key] = parseInt(sel.value);
          }
          window.shaderDirty = true;
        });
      });
    }

    function toggleImgPixel() {
      if (typeof activePixelateTab !== 'undefined') { togglePixImgPixel(activePixelateTab); return; }
      var p = window.shaderParams;
      p.imgPixelEnabled = !p.imgPixelEnabled;
      var b = document.getElementById('btn-imgpixel-toggle'); if (b) b.classList.toggle('on', p.imgPixelEnabled);
      var c = document.getElementById('imgpixel-controls'); if (c) c.classList.toggle('controls-disabled', !p.imgPixelEnabled);
      window.shaderDirty = true;
    }

    function toggleImgPixelAffectScale() {
      if (typeof activePixelateTab !== 'undefined') { togglePixImgPixelAffect(activePixelateTab, 'scale'); return; }
      var p = window.shaderParams; p.imgPixelAffectScale = !p.imgPixelAffectScale;
      var b = document.getElementById('btn-imgpixel-scale'); if (b) b.classList.toggle('active', p.imgPixelAffectScale);
      var c = document.getElementById('imgpixel-scale-controls'); if (c) c.style.display = p.imgPixelAffectScale ? '' : 'none';
      window.shaderDirty = true;
    }

    function toggleImgPixelAffectRotate() {
      if (typeof activePixelateTab !== 'undefined') { togglePixImgPixelAffect(activePixelateTab, 'rotate'); return; }
      var p = window.shaderParams; p.imgPixelAffectRotate = !p.imgPixelAffectRotate;
      var b = document.getElementById('btn-imgpixel-rotate'); if (b) b.classList.toggle('active', p.imgPixelAffectRotate);
      var c = document.getElementById('imgpixel-rotate-controls'); if (c) c.style.display = p.imgPixelAffectRotate ? '' : 'none';
      window.shaderDirty = true;
    }

    function toggleImgPixelAffectOffset() {
      if (typeof activePixelateTab !== 'undefined') { togglePixImgPixelAffect(activePixelateTab, 'offset'); return; }
      var p = window.shaderParams; p.imgPixelAffectOffset = !p.imgPixelAffectOffset;
      var b = document.getElementById('btn-imgpixel-offset'); if (b) b.classList.toggle('active', p.imgPixelAffectOffset);
      var c = document.getElementById('imgpixel-offset-controls'); if (c) c.style.display = p.imgPixelAffectOffset ? '' : 'none';
      window.shaderDirty = true;
    }

    function toggleTileGrad() {
      if (typeof activePixelateTab !== 'undefined') { setPixTileGrad(activePixelateTab); return; }
      var p = window.shaderParams; p.tileGradEnabled = !p.tileGradEnabled;
      var b = document.getElementById('btn-tilegrad-toggle'); if (b) b.classList.toggle('on', p.tileGradEnabled);
      var c = document.getElementById('tilegrad-controls'); if (c) c.classList.toggle('controls-disabled', !p.tileGradEnabled);
      window.shaderDirty = true;
    }

    function handleImgPixelUpload(event) {
      var file = event.target.files[0];
      if (!file) return;
      // Try per-instance element first, fall back to static
      var i = typeof activePixelateTab !== 'undefined' ? activePixelateTab : 0;
      var nm = document.getElementById('imgPixelName_' + i) || document.getElementById('imgPixelName');
      if (nm) nm.textContent = file.name;
      var img = new Image();
      img.onload = function() {
        window._imgPixelImage = img;
        if (window.uploadImgPixelTex) window.uploadImgPixelTex(img);
        window.shaderDirty = true;
      };
      img.src = URL.createObjectURL(file);
    }

    // Auto-load tile.png on initialization
    function loadDefaultTileImage() {
      var img = new Image();
      img.onload = function() {
        window._imgPixelImage = img;
        if (window.uploadImgPixelTex) window.uploadImgPixelTex(img);
        window.shaderDirty = true;
      };
      img.onerror = function() {
        // If tile.png doesn't exist, silently ignore
        console.log('tile.png not found, skipping auto-load');
      };
      img.src = 'tile.png';
    }

    // Call on page load
    setTimeout(loadDefaultTileImage, 100);

    function toggleMirror(axis) {
      if (axis === 'x') {
        window.shaderParams.mirrorX ^= 1;
        document.getElementById('btn-mx').classList.toggle('active', window.shaderParams.mirrorX === 1);
      } else {
        window.shaderParams.mirrorY ^= 1;
        document.getElementById('btn-my').classList.toggle('active', window.shaderParams.mirrorY === 1);
      }
      window.shaderDirty = true;
    }

    function toggleFlip(axis) {
      if (axis === 'x') {
        window.shaderParams.flipX ^= 1;
        document.getElementById('btn-fx').classList.toggle('active', window.shaderParams.flipX === 1);
      } else {
        window.shaderParams.flipY ^= 1;
        document.getElementById('btn-fy').classList.toggle('active', window.shaderParams.flipY === 1);
      }
      window.shaderDirty = true;
    }

    function toggleDots() {
      window.shaderParams.showDots = !window.shaderParams.showDots;
      document.getElementById('btn-dots').classList.toggle('active', window.shaderParams.showDots);
      document.getElementById('dots-controls').style.display = window.shaderParams.showDots ? '' : 'none';
      window.shaderDirty = true;
    }

    function toggleSnapGrid() {
      window.shaderParams.snapGrid = !window.shaderParams.snapGrid;
      document.getElementById('btn-snapgrid').classList.toggle('active', window.shaderParams.snapGrid);
      document.getElementById('snapgrid-controls').style.display = window.shaderParams.snapGrid ? '' : 'none';
      window.shaderDirty = true;
    }

    function toggleFastMode() {
      window.shaderParams.fastMode = !window.shaderParams.fastMode;
      document.getElementById('btn-fast').classList.toggle('active', window.shaderParams.fastMode);
      document.getElementById('fast-controls').style.display = window.shaderParams.fastMode ? '' : 'none';
      window.shaderDirty = true;
    }

    function toggleSmooth() {
      var p = window.shaderParams;
      p.smoothEnabled = !p.smoothEnabled;
      document.getElementById('btn-smooth').classList.toggle('active', p.smoothEnabled);
      document.getElementById('smooth-controls').style.display = p.smoothEnabled ? '' : 'none';
      window.shaderDirty = true;
    }

    function toggleMerge() {
      window.shaderParams.mergeEnabled = !window.shaderParams.mergeEnabled;
      document.getElementById('btn-merge').classList.toggle('active', window.shaderParams.mergeEnabled);
      document.getElementById('merge-controls').style.display = window.shaderParams.mergeEnabled ? '' : 'none';
      window.shaderDirty = true;
    }

    function togglePrecompute() {
      window.shaderParams.precompute = !window.shaderParams.precompute;
      document.getElementById('btn-precompute').classList.toggle('active', window.shaderParams.precompute);
      document.getElementById('precompute-controls').style.display = window.shaderParams.precompute ? '' : 'none';
      // Signal shader.js to rebuild/flush the frame buffer
      if (window.resetPrecomputeBuffer) window.resetPrecomputeBuffer();
      window.shaderDirty = true;
    }

    function togglePixelate() {
      var p = window.shaderParams;
      p.pixelate = !p.pixelate;
      var on = p.pixelate;
      document.getElementById('btn-pixelate-toggle').classList.toggle('on', on);
      var wrap = document.getElementById('pixelate-master-wrap');
      if (wrap) wrap.classList.toggle('controls-disabled', !on);
      if (window.forceResize) window.forceResize();
      window.shaderDirty = true;
    }

    // ══════════════════════════════════════════════════
    //  PIXELATE INSTANCE MANAGEMENT
    // ══════════════════════════════════════════════════

