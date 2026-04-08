// ═══ Pixelate Instance Panels ═══
// Panel builders, wiring, shape/filter management

    var activePixelateTab = 0;
    var pixelateInstanceIdCounter = 1;

    function defaultPixInstance(overrides) {
      var p = window.shaderParams;
      return Object.assign({
        id: ++pixelateInstanceIdCounter,
        enabled: true,
        resolution: 1,
        overrideResolution: false,
        pixelW: 23, pixelH: 11, pixelScale: 1.0,
        weaveMode: 0, pixelShape: 0,
        shapes: null, activeShapeIdx: 0,
        shapeMargin: 3, shapeBleed: 0, shapeSmoothness: 0, shapeScale: 1.0,
        sdfAffectScale: false, sdfMinScale: 0.5, sdfMaxScale: 2.0,
        sdfAffectRotate: false, sdfMinRotate: -45, sdfMaxRotate: 45,
        sdfAffectOffset: false, sdfMinOffset: -0.3, sdfMaxOffset: 0.3,
        sdfAffectAlpha: false, sdfMinAlpha: 0.0, sdfMaxAlpha: 1.0,
        cellGradStops: [
          {pos:0, r:0,   g:0,   b:0,   hex:'#000000'},
          {pos:1, r:255, g:255, b:255, hex:'#ffffff'}
        ],
        forceSquare: false, maintainThickness: false,
        oblique: false,
        quadSteps: 4, quadEnabled: false, genDiamond: false, twoImage: false,
        quadCurveEnabled: false, quadCurveMin: 0.0, quadCurveMax: 1.0,
        quadCurvePoints: [{x:0,y:0},{x:1,y:1}],
        shapeGradOpacity: 0.2, shapeGradDir: 0,
        tileGradEnabled: true,
        fillMode: 1,
        fillColor: '#ffffff',
        passthrough: false,
        radialCenterX: 0, radialCenterY: 0, radialScale: 1,
        embossBlendMode: 8,
        embossHueOff: 0,
        shapeGradStops: [
          { pos: 0.0, r: 0,   g: 0,   b: 0,   hex: '#000000' },
          { pos: 0.5, r: 255, g: 255, b: 255, hex: '#ffffff' },
          { pos: 1.0, r: 0,   g: 0,   b: 0,   hex: '#000000' }
        ],
        gapColor: '#000000', gapOpacity: 1.0, gapEnabled: false,
        sampleFromGeneral: false,
        instanceBlendMode: -1,
        instanceBlendHueOff: 0,
        instanceOpacity: 1.0,
        opPatterns: [
          { id: 1, active: true, grid: [[0,1],[1,0]], hueShift: 0.04, hueOpacity: 0.92 },
          { id: 2, active: true, grid: [[1],[0]],     hueShift: 0.05, hueOpacity: 1.0  },
          { id: 3, active: true, grid: [[1,0],[1,0]], hueShift: 0.17, hueOpacity: 1.0  },
          { id: 4, active: true, grid: [[1,0,1],[0,1,0]], hueShift: 0.55, hueOpacity: 1.0 }
        ],
        opPatternIdCounter: 4,
        opPatternsEnabled: true,
        filters: [],
        filtersEnabled: true,
        opPatternSeed: 0,
        opPatternMode: 0,
        imgPixelEnabled: false,
        imgPixelCols: 5, imgPixelRows: 5,
        imgPixelBlend: 8, imgPixelOpacity: 1.0, imgPixelHueOff: 0,
        imgPixelAffectScale: false, imgPixelMinScale: -4.0, imgPixelMaxScale: 4.0,
        imgPixelAffectRotate: false, imgPixelMinRotate: -90.0, imgPixelMaxRotate: 90.0,
        imgPixelAffectOffset: false, imgPixelMinOffset: -0.5, imgPixelMaxOffset: 0.5,
        imgPixelMask: false,
        imgPixelName: 'tile.png',
        imgDataURL: null,
        // Oct diamond layer 2 image pixel
        imgPixel2Enabled: false,
        imgPixel2Cols: 5, imgPixel2Rows: 5,
        imgPixel2Blend: 8, imgPixel2Opacity: 1.0, imgPixel2HueOff: 0,
        imgPixel2AffectScale: false, imgPixel2MinScale: -4.0, imgPixel2MaxScale: 4.0,
        imgPixel2AffectRotate: false, imgPixel2MinRotate: -90.0, imgPixel2MaxRotate: 90.0,
        imgPixel2AffectOffset: false, imgPixel2MinOffset: -0.5, imgPixel2MaxOffset: 0.5,
        imgPixel2Mask: false,
        imgPixel2Name: 'tile2.png',
        imgData2URL: null,
      }, overrides || {});
    }

    function initPixelateInstances() {
      var p = window.shaderParams;
      if (!p.pixelateInstances || !p.pixelateInstances.length) {
        // Migrate flat params to first instance
        var inst0 = defaultPixInstance({
          id: 1,
          pixelW: p.pixelW || 23, pixelH: p.pixelH || 11, pixelScale: p.pixelScale || 1,
          weaveMode: p.weaveMode || 0, pixelShape: p.pixelShape || 0,
          shapeMargin: p.shapeMargin || 3, shapeBleed: p.shapeBleed || 0, shapeSmoothness: p.shapeSmoothness || 0, shapeScale: p.shapeScale != null ? p.shapeScale : 1.0,
          forceSquare: false, maintainThickness: false,
          oblique: !!p.oblique,
          quadSteps: p.quadSteps || 4, quadEnabled: !!p.quadEnabled, genDiamond: !!p.genDiamond,
          shapeGradOpacity: p.shapeGradOpacity != null ? p.shapeGradOpacity : 0.2,
          shapeGradDir: p.shapeGradDir || 0,
          tileGradEnabled: p.tileGradEnabled !== false,
          fillMode: p.fillMode || 1,
          fillColor: p.fillColor || '#ffffff',
          passthrough: false,
          radialCenterX: p.radialCenterX || 0, radialCenterY: p.radialCenterY || 0, radialScale: p.radialScale || 1,
          embossBlendMode: p.embossBlendMode != null ? p.embossBlendMode : 8,
          shapeGradStops: p.shapeGradStops ? JSON.parse(JSON.stringify(p.shapeGradStops)) : undefined,
          gapColor: p.gapColor || '#000000', gapOpacity: p.gapOpacity != null ? p.gapOpacity : 1.0, gapEnabled: false,
          sampleFromGeneral: false,
          instanceBlendMode: -1,
          instanceBlendHueOff: 0,
          instanceOpacity: 1.0,
          opPatterns: p.opPatterns ? JSON.parse(JSON.stringify(p.opPatterns)) : undefined,
          opPatternIdCounter: p.opPatternIdCounter || 4,
          opPatternsEnabled: p.opPatternsEnabled !== false,
          filters: [],
          filtersEnabled: true,
          opPatternSeed: p.opPatternSeed || 0, opPatternMode: p.opPatternMode || 0,
          imgPixelEnabled: !!p.imgPixelEnabled,
          imgPixelCols: p.imgPixelCols || 5, imgPixelRows: p.imgPixelRows || 5,
          imgPixelBlend: p.imgPixelBlend != null ? p.imgPixelBlend : 8,
          imgPixelOpacity: p.imgPixelOpacity != null ? p.imgPixelOpacity : 1.0,
          imgPixelAffectScale: !!p.imgPixelAffectScale,
          imgPixelMinScale: p.imgPixelMinScale != null ? p.imgPixelMinScale : -4,
          imgPixelMaxScale: p.imgPixelMaxScale != null ? p.imgPixelMaxScale : 4,
          imgPixelAffectRotate: !!p.imgPixelAffectRotate,
          imgPixelMinRotate: p.imgPixelMinRotate != null ? p.imgPixelMinRotate : -90,
          imgPixelMaxRotate: p.imgPixelMaxRotate != null ? p.imgPixelMaxRotate : 90,
          imgPixelAffectOffset: !!p.imgPixelAffectOffset,
          imgPixelMinOffset: p.imgPixelMinOffset != null ? p.imgPixelMinOffset : -0.5,
          imgPixelMaxOffset: p.imgPixelMaxOffset != null ? p.imgPixelMaxOffset : 0.5,
        });
        p.pixelateInstances = [inst0];
        pixelateInstanceIdCounter = 1;
      } else {
        // Restore id counter
        pixelateInstanceIdCounter = p.pixelateInstances.reduce(function(mx,inst){ return Math.max(mx,inst.id||0); }, 0);
      }
      // Ensure every instance has shapes populated with the latest keys
      p.pixelateInstances.forEach(function(inst) { ensureShapes(inst); });
    }

    function addPixelateInstance() {
      var p = window.shaderParams;
      if (p.pixelateInstances.length >= 8) return;
      var newInst = defaultPixInstance();
      newInst.opPatterns = JSON.parse(JSON.stringify([]));  // start blank
      newInst.opPatternsEnabled = false;
      ensureShapes(newInst);  // populate shapes[0] with defaults right away
      p.pixelateInstances.push(newInst);
      activePixelateTab = p.pixelateInstances.length - 1;
      // Copy default tile image to new instance's GL texture slot
      var newIdx = activePixelateTab;
      if (window._defaultImgPixelImage && window.uploadInstanceImgPixelTex) {
        window.uploadInstanceImgPixelTex(newIdx, window._defaultImgPixelImage);
      }
      if (window._defaultImgPixel2Image && window.uploadInstanceImgPixel2Tex) {
        window.uploadInstanceImgPixel2Tex(newIdx, window._defaultImgPixel2Image);
      }
      if (window.rebuildInstanceFBOs) window.rebuildInstanceFBOs();
      renderPixelateTabs();
      renderPixelateInstancePanel(activePixelateTab);
      window.shaderDirty = true;
    }

    function removePixelateInstance(idx) {
      var p = window.shaderParams;
      if (p.pixelateInstances.length <= 1) return;
      p.pixelateInstances.splice(idx, 1);
      if (activePixelateTab >= p.pixelateInstances.length) activePixelateTab = p.pixelateInstances.length - 1;
      renderPixelateTabs();
      renderPixelateInstancePanel(activePixelateTab);
      window.shaderDirty = true;
    }

    function switchPixelateTab(idx) {
      activePixelateTab = idx;
      renderPixelateTabs();
      renderPixelateInstancePanel(idx);
    }

    function renderPixelateTabs() {
      var p = window.shaderParams;
      var tabsEl = document.getElementById('pix-tabs');
      if (!tabsEl) return;
      tabsEl.innerHTML = '';
      p.pixelateInstances.forEach(function(inst, i) {
        var tab = document.createElement('button');
        tab.className = 'pix-tab' + (i === activePixelateTab ? ' active' : '');
        var label = document.createElement('span');
        label.textContent = 'Pixelate ' + (i + 1);
        tab.appendChild(label);
        if (p.pixelateInstances.length > 1) {
          var cls = document.createElement('button');
          cls.className = 'pix-tab-close';
          cls.textContent = '×';
          cls.title = 'Remove stage';
          cls.onclick = function(e) { e.stopPropagation(); removePixelateInstance(i); };
          tab.appendChild(cls);
        }
        tab.addEventListener('click', function(e) {
          if (e.target.classList.contains('pix-tab-close')) return;
          switchPixelateTab(i);
        });
        tabsEl.appendChild(tab);
      });
    }

    /* ── Per-instance HTML builder ─── */
    function buildInstanceHTML(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      // Ensure shapes array exists and read active shape
      ensureShapes(inst);
      var activeShape = inst.shapes[inst.activeShapeIdx || 0] || inst.shapes[0];
      // Sync active shape properties to instance level for backward compat
      inst.pixelShape = activeShape.pixelShape;
      inst.shapeMargin = activeShape.shapeMargin; inst.shapeBleed = activeShape.shapeBleed;
      inst.shapeSmoothness = activeShape.shapeSmoothness; inst.shapeScale = activeShape.shapeScale;
      inst.forceSquare = activeShape.forceSquare;
      inst.sdfAffectScale = activeShape.sdfAffectScale; inst.sdfMinScale = activeShape.sdfMinScale; inst.sdfMaxScale = activeShape.sdfMaxScale;
      inst.sdfAffectRotate = activeShape.sdfAffectRotate; inst.sdfMinRotate = activeShape.sdfMinRotate; inst.sdfMaxRotate = activeShape.sdfMaxRotate;
      inst.sdfAffectOffset = activeShape.sdfAffectOffset; inst.sdfMinOffset = activeShape.sdfMinOffset; inst.sdfMaxOffset = activeShape.sdfMaxOffset;
      inst.sdfAffectAlpha = activeShape.sdfAffectAlpha; inst.sdfMinAlpha = activeShape.sdfMinAlpha; inst.sdfMaxAlpha = activeShape.sdfMaxAlpha;
      inst.imgPixelEnabled = activeShape.imgPixelEnabled; inst.imgPixelCols = activeShape.imgPixelCols; inst.imgPixelRows = activeShape.imgPixelRows;
      inst.imgPixelOpacity = activeShape.imgPixelOpacity; inst.imgPixelBlend = activeShape.imgPixelBlend;
      inst.imgPixelHueOff = activeShape.imgPixelHueOff; inst.imgPixelMask = activeShape.imgPixelMask;
      inst.imgPixelAffectScale = activeShape.imgPixelAffectScale; inst.imgPixelMinScale = activeShape.imgPixelMinScale; inst.imgPixelMaxScale = activeShape.imgPixelMaxScale;
      inst.imgPixelAffectRotate = activeShape.imgPixelAffectRotate; inst.imgPixelMinRotate = activeShape.imgPixelMinRotate; inst.imgPixelMaxRotate = activeShape.imgPixelMaxRotate;
      inst.imgPixelAffectOffset = activeShape.imgPixelAffectOffset; inst.imgPixelMinOffset = activeShape.imgPixelMinOffset; inst.imgPixelMaxOffset = activeShape.imgPixelMaxOffset;
      inst.twoImage = activeShape.twoImage;
      inst.imgPixel2Enabled = activeShape.imgPixel2Enabled; inst.imgPixel2Cols = activeShape.imgPixel2Cols; inst.imgPixel2Rows = activeShape.imgPixel2Rows;
      inst.imgPixel2Opacity = activeShape.imgPixel2Opacity; inst.imgPixel2Blend = activeShape.imgPixel2Blend;
      inst.imgPixel2HueOff = activeShape.imgPixel2HueOff; inst.imgPixel2Mask = activeShape.imgPixel2Mask;
      inst.imgPixel2AffectScale = activeShape.imgPixel2AffectScale; inst.imgPixel2AffectRotate = activeShape.imgPixel2AffectRotate; inst.imgPixel2AffectOffset = activeShape.imgPixel2AffectOffset;
      inst.imgPixel2MinScale = activeShape.imgPixel2MinScale; inst.imgPixel2MaxScale = activeShape.imgPixel2MaxScale;
      inst.imgPixel2MinRotate = activeShape.imgPixel2MinRotate; inst.imgPixel2MaxRotate = activeShape.imgPixel2MaxRotate;
      inst.imgPixel2MinOffset = activeShape.imgPixel2MinOffset; inst.imgPixel2MaxOffset = activeShape.imgPixel2MaxOffset;
      inst.filters = activeShape.filters; inst.filtersEnabled = activeShape.filtersEnabled;
      inst.blendMode = activeShape.blendMode != null ? activeShape.blendMode : -1;
      inst.blendHueOff = activeShape.blendHueOff || 0;
      inst.blendOpacity = activeShape.blendOpacity != null ? activeShape.blendOpacity : 1.0;
      inst.cellColorMode = activeShape.cellColorMode || 0;
      inst.customCellColor = activeShape.customCellColor || '#ffffff';
      inst.cellGradStops = activeShape.cellGradStops || inst.cellGradStops;

      function s(k) { return k + '_' + i; }
      var rc = inst.resolution || 1;
      var wm = inst.weaveMode || 0;
      var ps = inst.pixelShape || 0;
      var isAutoShape = false; // shapes now user-selectable in all weave modes

      var resHTML = [1,2,4,8,16].map(function(r){
        var lbl = r===1?'Full':'1/'+r;
        return '<button id="'+s('btn-pix-res-'+r)+'" class="'+(rc===r?'active':'')+'" onclick="setPixRes('+i+','+r+')">'+lbl+'</button>';
      }).join('');

      var weaveNames = ['None','Brick','Weave','Hex','Oct'];
      var weaveIds = ['none','brick','weave','hex','oct'];
      var weaveHTML = weaveNames.map(function(t,m){
        return '<button id="'+s('btn-weave-'+weaveIds[m])+'" class="'+(wm===m?'active':'')+'" onclick="setPixWeave('+i+','+m+')">'+t+'</button>';
      }).join('');

      // Shape data: [shaderValue, cssId, label, svg]
      var shapeData = [
        [0,'none','None','<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'],
        [3,'square','Square','<rect x="3" y="3" width="18" height="18" rx="1" fill="currentColor"/>'],
        [1,'pill','Pill','<rect x="3" y="7" width="18" height="10" rx="5" fill="currentColor"/>'],
        [2,'diamond','Diamond','<polygon points="12,2 22,12 12,22 2,12" fill="currentColor"/>'],
        [4,'pointed','Chevron','<polygon points="5,4 19,4 22,12 19,20 5,20 2,12" fill="currentColor"/>'],
        [5,'hex','Hexagon','<polygon points="6,2 18,2 23,12 18,22 6,22 1,12" fill="currentColor"/>'],
        [6,'oct','Octagon','<polygon points="8,2 16,2 22,8 22,16 16,22 8,22 2,16 2,8" fill="currentColor"/>'],
        [7,'cross','Cross +','<rect x="10" y="3" width="4" height="18" rx="2" fill="currentColor"/><rect x="3" y="10" width="18" height="4" rx="2" fill="currentColor"/>'],
        [9,'image','Image','<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2" fill="currentColor"/><polyline points="5,17 10,12 14,15 17,12 19,14"/>'],
      ];
      var shapeHTML = shapeData.map(function(d){
        return '<button id="'+s('btn-shape-'+d[1])+'" class="shape-icon'+(ps===d[0]?' active':'')+'" onclick="setPixShape('+i+','+d[0]+')" title="'+d[2]+'"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'+d[3]+'</svg></button>';
      }).join('');

      var embossOpts = ['Overlay','Multiply','Screen','Soft Light','Hard Light','Color Dodge','Color Burn','Linear Light','Normal','Hue Shift'];
      var embossHTML = embossOpts.map(function(n,v){
        return '<option value="'+v+'"'+(inst.embossBlendMode===v?' selected':'')+'>'+n+'</option>';
      }).join('');

      var opOn = inst.opPatternsEnabled !== false;
      var imgBlendOpts = [['Normal',8],['Overlay',0],['Multiply',1],['Screen',2],['Soft Light',3],['Hard Light',4],['Color Dodge',5],['Color Burn',6],['Linear Light',7],['Hue Shift',9]];
      var imgBlendHTML = imgBlendOpts.map(function(x){
        return '<option value="'+x[1]+'"'+(inst.imgPixelBlend===x[1]?' selected':'')+'>'+x[0]+'</option>';
      }).join('');
      var imgBlend2HTML = imgBlendOpts.map(function(x){
        return '<option value="'+x[1]+'"'+(inst.imgPixel2Blend===x[1]?' selected':'')+'>'+x[0]+'</option>';
      }).join('');

      return [
// ── Per-instance header ──────────────────────────────────────
'<div class="toggle-header" style="margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">',
'  <span class="toggle-label" style="font-size:12px;font-weight:600;letter-spacing:0.04em">Pixelate '+(i+1)+'</span>',
'  <button class="toggle-active'+(inst.enabled!==false?' on':'')+'" id="'+s('btn-pix-enabled')+'" onclick="setPixEnabled('+i+')"></button>',
'</div>',
'<div id="'+s('pix-body')+'" class="'+(inst.enabled===false?'controls-disabled':'')+'" >',
'<div class="row" style="margin-top:4px"><label style="font-size:10px">Instance Blend</label>',
'  <select id="'+s('selInstBlend')+'" onchange="setPixInstBlend('+i+',this.value)" style="flex:1;font-size:10px">',
'    <option value="-1"'+((inst.instanceBlendMode==null||inst.instanceBlendMode<0)?' selected':'')+'>None</option>',
'    <option value="0"'+(inst.instanceBlendMode===0?' selected':'')+'>Overlay</option>',
'    <option value="1"'+(inst.instanceBlendMode===1?' selected':'')+'>Multiply</option>',
'    <option value="2"'+(inst.instanceBlendMode===2?' selected':'')+'>Screen</option>',
'    <option value="3"'+(inst.instanceBlendMode===3?' selected':'')+'>Soft Light</option>',
'    <option value="4"'+(inst.instanceBlendMode===4?' selected':'')+'>Hard Light</option>',
'    <option value="5"'+(inst.instanceBlendMode===5?' selected':'')+'>Color Dodge</option>',
'    <option value="6"'+(inst.instanceBlendMode===6?' selected':'')+'>Color Burn</option>',
'    <option value="7"'+(inst.instanceBlendMode===7?' selected':'')+'>Linear Light</option>',
'    <option value="8"'+(inst.instanceBlendMode===8?' selected':'')+'>Normal</option>',
'    <option value="9"'+(inst.instanceBlendMode===9?' selected':'')+'>Hue Shift</option>',
'  </select>',
'</div>',
'<div id="'+s('instblend-hue-controls')+'" style="display:'+(inst.instanceBlendMode===9?'':'none')+'">',
'  <div class="row"><label style="font-size:10px">Hue Offset</label>',
'    <input type="range" id="'+s('sInstBlendHueOff')+'" min="0" max="1" step="0.01" value="'+(inst.instanceBlendHueOff!=null?inst.instanceBlendHueOff:0)+'">',
'    <input type="number" class="val" id="'+s('vInstBlendHueOff')+'" value="'+(inst.instanceBlendHueOff!=null?inst.instanceBlendHueOff.toFixed(2):'0.00')+'" min="0" max="1" step="0.01">',
'  </div>',
'  </div>',
'</div>',
'</div>',
'<div class="row"><label style="font-size:10px">Instance Opacity</label>',
'  <input type="range" id="'+s('sInstOpacity')+'" min="0" max="1" step="0.01" value="'+(inst.instanceOpacity!=null?inst.instanceOpacity:1)+'">',
'  <input type="number" class="val" id="'+s('vInstOpacity')+'" value="'+(inst.instanceOpacity!=null?inst.instanceOpacity.toFixed(2):'1.00')+'" min="0" max="1" step="0.01">',
'</div>',
'<div class="divider" style="margin:6px 0"></div>',
'<div class="toggle-header" style="margin-top:4px;margin-bottom:4px">',
'  <span class="toggle-label" style="font-size:11px">Sample from General</span>',
'  <button class="toggle-active'+(inst.sampleFromGeneral?' on':'')+'" id="'+s('btn-sample-general')+'" onclick="setPixSampleGeneral('+i+')"></button>',
'</div>',
'<div class="toggle-header" style="margin-top:4px;margin-bottom:4px">',
'  <span class="toggle-label" style="font-size:11px">Override Resolution</span>',
'  <button class="toggle-active'+(inst.overrideResolution?' on':'')+'" id="'+s('btn-override-res')+'" onclick="setPixOverrideRes('+i+')"></button>',
'</div>',
'<div class="row" style="margin-top:4px">',
'  <label style="width:70px;font-size:10px">Resolution</label>',
'  <div class="seg-bar" style="flex:1;margin-bottom:0">'+resHTML+'</div>',
'</div>',
'<div class="row"><label>Pixel Width</label>',
'  <input type="range" id="'+s('sPixelW')+'" min="1" max="500" step="1" value="'+inst.pixelW+'">',
'  <input type="number" class="val" id="'+s('vPixelW')+'" value="'+inst.pixelW+'" min="1" max="500" step="1">',
'</div>',
'<div class="row"><label>Pixel Height</label>',
'  <input type="range" id="'+s('sPixelH')+'" min="1" max="500" step="1" value="'+inst.pixelH+'">',
'  <input type="number" class="val" id="'+s('vPixelH')+'" value="'+inst.pixelH+'" min="1" max="500" step="1">',
'</div>',
'<div class="row"><label>Scale</label>',
'  <input type="range" id="'+s('sPixelScale')+'" min="0.1" max="50" step="0.01" value="'+inst.pixelScale+'">',
'  <input type="number" class="val" id="'+s('vPixelScale')+'" value="'+inst.pixelScale.toFixed(2)+'" min="0.1" max="50" step="0.01">',
'</div>',
'<div class="btn-row"><button id="'+s('btn-oblique')+'" class="'+(inst.oblique?'active':'')+'" onclick="setPixOblique('+i+')">Oblique</button></div>',
'<div class="toggle-header" style="margin-top:4px;margin-bottom:4px">',
'  <span class="toggle-label" style="font-size:11px">Passthrough</span>',
'  <button class="toggle-active'+(inst.passthrough?' on':'')+'" id="'+s('btn-passthrough')+'" onclick="setPixPassthrough('+i+')"></button>',
'</div>',
'<div class="section-title" style="margin-top:6px;display:flex;align-items:center;gap:4px;cursor:pointer" onclick="toggleSectionCollapse(\''+s('sec-quadtree')+'\')">',
'  <svg class="collapse-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6,9 12,15 18,9"/></svg>',
'  Quadtree</div>',
'<div id="'+s('sec-quadtree')+'">',
'<div class="btn-row"><button id="'+s('btn-quadtree')+'" class="'+(inst.quadEnabled?'active':'')+'" onclick="setPixQuad('+i+')">Quadtree</button></div>',
'<div id="'+s('quadtree-controls')+'" style="display:'+(inst.quadEnabled?'':'none')+'">',
'  <div class="row"><label>Steps</label>',
'    <input type="range" id="'+s('sQuadSteps')+'" min="2" max="5" step="1" value="'+inst.quadSteps+'">',
'    <input type="number" class="val" id="'+s('vQuadSteps')+'" value="'+inst.quadSteps+'" min="2" max="5" step="1">',
'  </div>',
'  <div class="toggle-header" style="margin-top:4px">',
'    <span class="toggle-label" style="font-size:11px">Maintain Thickness</span>',
'    <button class="toggle-active'+(inst.maintainThickness?' on':'')+'" id="'+s('btn-maintain-thickness')+'" onclick="setPixMaintainThickness('+i+')"></button>',
'  </div>',
'  <div class="toggle-header" style="margin-top:4px">',
'    <span class="toggle-label" style="font-size:11px">Reverse Sort</span>',
'    <button class="toggle-active'+(inst.quadReverse?' on':'')+'" id="'+s('btn-quad-reverse')+'" onclick="setPixQuadReverse('+i+')"></button>',
'  </div>',
'  <div class="toggle-header" style="margin-top:4px">',
'    <span class="toggle-label" style="font-size:11px">Remap Curvature</span>',
'    <button class="toggle-active'+(inst.quadCurveEnabled?' on':'')+'" id="'+s('btn-quad-curve')+'" onclick="togglePixQuadCurve('+i+')"></button>',
'  </div>',
'  <div id="'+s('quad-curve-editor')+'" class="quad-curve-editor" style="display:'+(inst.quadCurveEnabled?'':'none')+'">',
'    <canvas class="quad-curve-canvas" id="quad-curve-canvas-'+i+'" width="280" height="280"></canvas>',
'    <div class="row" style="margin-top:4px"><label>Min</label>',
'      <input type="range" id="'+s('sQuadCurveMin')+'" min="0" max="1" step="0.01" value="'+(inst.quadCurveMin!=null?inst.quadCurveMin:0)+'">',
'      <input type="number" class="val" id="'+s('vQuadCurveMin')+'" value="'+(inst.quadCurveMin!=null?inst.quadCurveMin.toFixed(2):'0.00')+'" min="0" max="1" step="0.01">',
'    </div>',
'    <div class="row"><label>Max</label>',
'      <input type="range" id="'+s('sQuadCurveMax')+'" min="0" max="1" step="0.01" value="'+(inst.quadCurveMax!=null?inst.quadCurveMax:1)+'">',
'      <input type="number" class="val" id="'+s('vQuadCurveMax')+'" value="'+(inst.quadCurveMax!=null?inst.quadCurveMax.toFixed(2):'1.00')+'" min="0" max="1" step="0.01">',
'    </div>',
'  </div>',
'</div>',
'</div>',
'<div class="section-title" style="margin-top:6px;display:flex;align-items:center;gap:4px;cursor:pointer" onclick="toggleSectionCollapse(\''+s('sec-weave')+'\')">',
'  <svg class="collapse-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6,9 12,15 18,9"/></svg>',
'  Weave</div>',
'<div id="'+s('sec-weave')+'">',
'<div class="seg-bar">'+weaveHTML+'</div>',
'<div id="'+s('gen-diamond-row')+'" class="btn-row" style="display:'+(wm===4?'':'none')+';margin-top:4px">',
'  <button id="'+s('btn-gen-diamond')+'" class="'+(inst.genDiamond?'active':'')+'" onclick="setPixGenDiamond('+i+')">Generate Diamond</button>',
'</div>',
'</div>',
// Shape instance tabs
(function(){
  ensureShapes(inst);
  var shapeTabs = '<div style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap">';
  shapeTabs += '<button class="btn-circ" onclick="addShape('+i+')" title="Add Shape" style="font-size:14px;font-weight:bold">+</button>';
  inst.shapes.forEach(function(sh, si) {
    var isActive = si === (inst.activeShapeIdx || 0);
    var tabStyle = isActive
      ? 'background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.2)'
      : 'background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.08)';
    shapeTabs += '<div style="display:flex;align-items:center;gap:2px;padding:3px 10px;border-radius:14px;font-size:11px;cursor:pointer;'+tabStyle+'" onclick="selectShape('+i+','+si+')">';
    shapeTabs += 'Shape '+(si+1);
    if (inst.shapes.length > 1) shapeTabs += ' <span onclick="removeShape('+i+','+si+');event.stopPropagation()" style="margin-left:4px;opacity:0.4;font-size:10px;cursor:pointer" title="Remove">\u00d7</span>';
    shapeTabs += '</div>';
  });
  shapeTabs += '</div>';
  return shapeTabs;
})()+',',
'<div class="section-title sec-hdr" style="margin-top:8px;font-size:10px;text-transform:uppercase;letter-spacing:0.5px">',
'  <svg class=\"collapse-chev\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"white\" stroke-width=\"3\" onclick=\"toggleSectionCollapse(\''+s('sec-shape-props')+'\');event.stopPropagation()\"><polyline points=\"6,9 12,15 18,9\"/></svg>',
'  <span onclick="toggleSectionCollapse(\''+s('sec-shape-props')+'\')" style="cursor:pointer">Shape '+(1+(inst.activeShapeIdx||0))+' Property</span>',
'  <span style="margin-left:auto;display:flex;gap:4px;align-items:center">',
'    <span id="'+s('twoimage-header')+'" style="display:'+(wm===4 && ps===9?'flex':'none')+';align-items:center">',
'      <button class="btn-circ'+(inst.twoImage?' on':'')+'" id="'+s('btn-twoimage-hdr')+'" onclick="setPixTwoImage('+i+');event.stopPropagation()" title="2-Image (Oct)" style="'+(inst.twoImage?'background:rgba(255,255,255,0.35)':'')+'"><svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"2\" y=\"4\" width=\"10\" height=\"10\" rx=\"1\"/><rect x=\"12\" y=\"10\" width=\"10\" height=\"10\" rx=\"1\"/></svg></button>',
'    </span>',
'    <button class="toggle-active'+((inst.shapes && inst.shapes[(inst.activeShapeIdx||0)] && inst.shapes[(inst.activeShapeIdx||0)].enabled!==false)?' on':'')+'" id="'+s('btn-shape-toggle')+'" onclick="toggleShapeEnabled('+i+');event.stopPropagation()"></button>',
'  </span>',
'</div>',
'<div id="'+s('sec-shape-props')+'">',
'  <div class="seg-bar" style="margin-bottom:6px">'+shapeHTML+'</div>',
'<div class="row" style="margin-bottom:4px"><label>Cell Color</label>',
'  <div class="seg-bar" style="flex:1;margin-bottom:0">',
'    <button id="'+s('btn-cell-color')+'" class="'+((inst.cellColorMode||0)===0?'active':'')+'" onclick="setCellColorMode('+i+',0)">Default</button>',
'    <button id="'+s('btn-cell-custom')+'" class="'+((inst.cellColorMode||0)===1?'active':'')+'" onclick="setCellColorMode('+i+',1)">Custom</button>',
'    <button id="'+s('btn-cell-gradient')+'" class="'+((inst.cellColorMode||0)===2?'active':'')+'" onclick="setCellColorMode('+i+',2)">Gradient</button>',
'  </div>',
'</div>',
'<div id="'+s('cellcustom-rect')+'" class="cellcustom-rect" style="display:'+((inst.cellColorMode||0)===1?'':'none')+';background:'+(inst.customCellColor||'#ffffff')+'"></div>',
'<div id="'+s('cellgrad-editor')+'" class="grad-editor" style="display:'+((inst.cellColorMode||0)===2?'':'none')+'">',
'  <div class="cellgrad-bar" id="cellgrad-bar-'+i+'"></div>',
'  <div class="grad-track" id="cellgrad-track-'+i+'"></div>',
'  <div class="grad-hint">tap bar to add · tap handle to pick · double-tap to delete</div>',
'</div>',
'<div class="row" style="margin-bottom:4px"><label>Blend</label><select id="'+s('selShapeBlend')+'" style="flex:1">',
'  <option value="-1"'+((inst.blendMode||-1)===-1?' selected':'')+'>None</option>',
'  <option value="0"'+((inst.blendMode||0)===0 && inst.blendMode!==-1?' selected':'')+'>Overlay</option>',
'  <option value="1"'+(inst.blendMode===1?' selected':'')+'>Multiply</option>',
'  <option value="2"'+(inst.blendMode===2?' selected':'')+'>Screen</option>',
'  <option value="3"'+(inst.blendMode===3?' selected':'')+'>Soft Light</option>',
'  <option value="4"'+(inst.blendMode===4?' selected':'')+'>Hard Light</option>',
'  <option value="5"'+(inst.blendMode===5?' selected':'')+'>Color Dodge</option>',
'  <option value="6"'+(inst.blendMode===6?' selected':'')+'>Color Burn</option>',
'  <option value="7"'+(inst.blendMode===7?' selected':'')+'>Linear Light</option>',
'  <option value="9"'+(inst.blendMode===9?' selected':'')+'>Hue Shift</option>',
'</select></div>',
'<div id="'+s('shape-magnitude-row')+'" style="display:'+(ps===9?'none':'')+'">',
'  <div class="row" style="margin-bottom:4px"><label>Strength</label>',
'    <input type="range" id="'+s('sShapeStrength')+'" min="0" max="1" step="0.01" value="'+(inst.blendOpacity!=null?inst.blendOpacity:1)+'">',
'    <input type="number" class="val" id="'+s('vShapeStrength')+'" value="'+((inst.blendOpacity!=null?inst.blendOpacity:1).toFixed(2))+'" min="0" max="1" step="0.01">',
'  </div>',
'</div>',
'<div id="'+s('shape-hueoff-row')+'" style="display:'+(inst.blendMode===9?'':'none')+'">',
'  <div class="row"><label>Hue Offset</label>',
'    <input type="range" id="'+s('sShapeHueOff')+'" min="0" max="1" step="0.001" value="'+(inst.blendHueOff||0)+'">',
'    <input type="number" class="val" id="'+s('vShapeHueOff')+'" value="'+((inst.blendHueOff||0).toFixed(3))+'" min="0" max="1" step="0.001">',
'  </div>',
'</div>',
'<div id="'+s('shape-controls')+'" style="display:'+(ps>0||isAutoShape?'':'none')+'">',
'<div id="'+s('sdf-only-controls')+'" style="display:'+(ps===9?'none':'')+'">',
'  <div class="toggle-header" style="margin-top:4px;margin-bottom:4px">',
'    <span class="toggle-label" style="font-size:11px">Force Square Frame</span>',
'    <button class="toggle-active'+(inst.forceSquare?' on':'')+'" id="'+s('btn-force-square')+'" onclick="setPixForceSquare('+i+')"></button>',
'  </div>',
'  <div class="row"><label>Margin</label>',
'    <input type="range" id="'+s('sShapeMargin')+'" min="0" max="50" step="1" value="'+inst.shapeMargin+'">',
'    <input type="number" class="val" id="'+s('vShapeMargin')+'" value="'+inst.shapeMargin+'" min="0" max="50" step="1">',
'  </div>',
'  <div class="row"><label>Bleed</label>',
'    <input type="range" id="'+s('sShapeBleed')+'" min="0" max="50" step="1" value="'+inst.shapeBleed+'">',
'    <input type="number" class="val" id="'+s('vShapeBleed')+'" value="'+inst.shapeBleed+'" min="0" max="50" step="1">',
'  </div>',
'  <div class="row"><label>Smoothness</label>',
'    <input type="range" id="'+s('sShapeSmoothness')+'" min="0" max="2" step="0.01" value="'+(inst.shapeSmoothness!=null?inst.shapeSmoothness:0)+'">',
'    <input type="number" class="val" id="'+s('vShapeSmoothness')+'" value="'+(inst.shapeSmoothness!=null?inst.shapeSmoothness.toFixed(2):'0.00')+'" min="0" max="2" step="0.01">',
'  </div>',
'  <div class="row"><label>Shape Scale</label>',
'    <input type="range" id="'+s('sShapeScale')+'" min="0" max="2" step="0.01" value="'+(inst.shapeScale!=null?inst.shapeScale:1.0)+'">',
'    <input type="number" class="val" id="'+s('vShapeScale')+'" value="'+(inst.shapeScale!=null?inst.shapeScale.toFixed(2):'1.00')+'" min="0" max="2" step="0.01">',
'  </div>',
'  <div class="section-title sec-hdr" style="margin-top:6px;font-size:10px" onclick="toggleSectionCollapse(\''+s('sec-sdf-lum')+'\')">',
'<svg class="collapse-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="6,9 12,15 18,9"/></svg>',
'    Luminance Effectors</div>',
'  <div id="'+s('sec-sdf-lum')+'">',
'  <div class="seg-bar" style="margin-bottom:8px">',
'    <button id="'+s('btn-sdf-scale')+'" class="'+(inst.sdfAffectScale?'active':'')+'" onclick="toggleSdfAffect('+i+',\'scale\')">SCALE</button>',
'    <button id="'+s('btn-sdf-rotate')+'" class="'+(inst.sdfAffectRotate?'active':'')+'" onclick="toggleSdfAffect('+i+',\'rotate\')">ROTATE</button>',
'    <button id="'+s('btn-sdf-offset')+'" class="'+(inst.sdfAffectOffset?'active':'')+'" onclick="toggleSdfAffect('+i+',\'offset\')">OFFSET</button>',
'    <button id="'+s('btn-sdf-alpha')+'" class="'+(inst.sdfAffectAlpha?'active':'')+'" onclick="toggleSdfAffect('+i+',\'alpha\')">ALPHA</button>',
'  </div>',
'  <div id="'+s('sdf-scale-controls')+'" style="display:'+(inst.sdfAffectScale?'':'none')+'">',
'    <div class="row"><label>S Min</label><input type="range" id="'+s('sSdfMinScale')+'" min="0" max="4" step="0.01" value="'+(inst.sdfMinScale!=null?inst.sdfMinScale:0.5)+'"><input type="number" class="val" id="'+s('vSdfMinScale')+'" value="'+(inst.sdfMinScale!=null?inst.sdfMinScale.toFixed(2):'0.50')+'" min="0" max="4" step="0.01"></div>',
'    <div class="row"><label>S Max</label><input type="range" id="'+s('sSdfMaxScale')+'" min="0" max="4" step="0.01" value="'+(inst.sdfMaxScale!=null?inst.sdfMaxScale:2)+'"><input type="number" class="val" id="'+s('vSdfMaxScale')+'" value="'+(inst.sdfMaxScale!=null?inst.sdfMaxScale.toFixed(2):'2.00')+'" min="0" max="4" step="0.01"></div>',
'  </div>',
'  <div id="'+s('sdf-rotate-controls')+'" style="display:'+(inst.sdfAffectRotate?'':'none')+'">',
'    <div class="row"><label>R Min</label><input type="range" id="'+s('sSdfMinRotate')+'" min="-180" max="180" step="1" value="'+(inst.sdfMinRotate!=null?inst.sdfMinRotate:-45)+'"><input type="number" class="val" id="'+s('vSdfMinRotate')+'" value="'+(inst.sdfMinRotate!=null?inst.sdfMinRotate:-45)+'" min="-180" max="180" step="1"></div>',
'    <div class="row"><label>R Max</label><input type="range" id="'+s('sSdfMaxRotate')+'" min="-180" max="180" step="1" value="'+(inst.sdfMaxRotate!=null?inst.sdfMaxRotate:45)+'"><input type="number" class="val" id="'+s('vSdfMaxRotate')+'" value="'+(inst.sdfMaxRotate!=null?inst.sdfMaxRotate:45)+'" min="-180" max="180" step="1"></div>',
'  </div>',
'  <div id="'+s('sdf-offset-controls')+'" style="display:'+(inst.sdfAffectOffset?'':'none')+'">',
'    <div class="row"><label>O Min</label><input type="range" id="'+s('sSdfMinOffset')+'" min="-1" max="1" step="0.01" value="'+(inst.sdfMinOffset!=null?inst.sdfMinOffset:-0.3)+'"><input type="number" class="val" id="'+s('vSdfMinOffset')+'" value="'+(inst.sdfMinOffset!=null?inst.sdfMinOffset.toFixed(2):'-0.30')+'" min="-1" max="1" step="0.01"></div>',
'    <div class="row"><label>O Max</label><input type="range" id="'+s('sSdfMaxOffset')+'" min="-1" max="1" step="0.01" value="'+(inst.sdfMaxOffset!=null?inst.sdfMaxOffset:0.3)+'"><input type="number" class="val" id="'+s('vSdfMaxOffset')+'" value="'+(inst.sdfMaxOffset!=null?inst.sdfMaxOffset.toFixed(2):'0.30')+'" min="-1" max="1" step="0.01"></div>',
'  </div>',
'  <div id="'+s('sdf-alpha-controls')+'" style="display:'+(inst.sdfAffectAlpha?'':'none')+'">',
'    <div class="row"><label>A Min</label><input type="range" id="'+s('sSdfMinAlpha')+'" min="0" max="1" step="0.01" value="'+(inst.sdfMinAlpha!=null?inst.sdfMinAlpha:0)+'"><input type="number" class="val" id="'+s('vSdfMinAlpha')+'" value="'+(inst.sdfMinAlpha!=null?inst.sdfMinAlpha.toFixed(2):'0.00')+'" min="0" max="1" step="0.01"></div>',
'    <div class="row"><label>A Max</label><input type="range" id="'+s('sSdfMaxAlpha')+'" min="0" max="1" step="0.01" value="'+(inst.sdfMaxAlpha!=null?inst.sdfMaxAlpha:1)+'"><input type="number" class="val" id="'+s('vSdfMaxAlpha')+'" value="'+(inst.sdfMaxAlpha!=null?inst.sdfMaxAlpha.toFixed(2):'1.00')+'" min="0" max="1" step="0.01"></div>',
'  </div>',
'  </div>',
'</div>',
'<div id="'+s('imgshape-controls')+'" style="display:'+(ps===9?'':'none')+'">',
'<div id="'+s('imgshape-oct-label')+'" style="display:'+(inst.twoImage?'':'none')+'">',
'  <div class="section-title sec-hdr" style="font-size:10px;color:rgba(255,255,255,0.5)" onclick="toggleSectionCollapse(\''+s('sec-oct-img')+'\')">',
'<svg class="collapse-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="6,9 12,15 18,9"/></svg>',
'    OCTAGON IMAGE</div>',
'</div>',
'<div id="'+s('sec-oct-img')+'">',
'  <div class="btn-row" style="margin-bottom:8px"><button onclick="document.getElementById(\''+s('imgPixelInput')+'\').click()">Upload Image</button>',
'    <span id="'+s('imgPixelName')+'" style="color:rgba(255,255,255,0.35);font-size:10px;margin-left:6px">'+(inst.imgPixelName||'tile.png')+'</span></div>',
'  <input type="file" id="'+s('imgPixelInput')+'" accept="image/*" style="display:none" onchange="handlePixImgPixelUpload(event,'+i+')">',
'  <div class="row"><label>Columns</label><input type="range" id="'+s('sImgPixelCols')+'" min="1" max="10" step="1" value="'+inst.imgPixelCols+'"><input type="number" class="val" id="'+s('vImgPixelCols')+'" value="'+inst.imgPixelCols+'" min="1" max="10" step="1"></div>',
'  <div class="row"><label>Rows</label><input type="range" id="'+s('sImgPixelRows')+'" min="1" max="10" step="1" value="'+inst.imgPixelRows+'"><input type="number" class="val" id="'+s('vImgPixelRows')+'" value="'+inst.imgPixelRows+'" min="1" max="10" step="1"></div>',
'  <div class="row"><label>Scale</label><input type="range" id="'+s('sImgShapeScale')+'" min="0" max="4" step="0.01" value="'+(inst.shapeScale!=null?inst.shapeScale:1)+'"><input type="number" class="val" id="'+s('vImgShapeScale')+'" value="'+(inst.shapeScale!=null?inst.shapeScale.toFixed(2):'1.00')+'" min="0" max="4" step="0.01"></div>',
'  <div class="row"><label>Opacity</label><input type="range" id="'+s('sImgPixelOpacity')+'" min="0" max="1" step="0.01" value="'+inst.imgPixelOpacity+'"><input type="number" class="val" id="'+s('vImgPixelOpacity')+'" value="'+inst.imgPixelOpacity.toFixed(2)+'" min="0" max="1" step="0.01"></div>',
'  <div class="row"><label>Mask (Alpha)</label><button class="toggle-active'+(inst.imgPixelMask?' on':'')+'" id="'+s('btn-imgpixel-mask')+'" onclick="togglePixImgPixelMask('+i+',1)" style="width:42px;height:20px;min-width:42px"></button></div>',
'  <div class="section-title sec-hdr" style="margin-top:6px;font-size:10px" onclick="toggleSectionCollapse(\''+s('sec-oct-lum')+'\')">',
'<svg class="collapse-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="6,9 12,15 18,9"/></svg>',
'    Luminance Effectors</div>',
'  <div id="'+s('sec-oct-lum')+'">',
'  <div class="seg-bar" style="margin-bottom:8px">',
'    <button id="'+s('btn-imgpixel-scale')+'" class="'+(inst.imgPixelAffectScale?'active':'')+'" onclick="togglePixImgPixelAffect('+i+',\'scale\')">SCALE</button>',
'    <button id="'+s('btn-imgpixel-rotate')+'" class="'+(inst.imgPixelAffectRotate?'active':'')+'" onclick="togglePixImgPixelAffect('+i+',\'rotate\')">ROTATE</button>',
'    <button id="'+s('btn-imgpixel-offset')+'" class="'+(inst.imgPixelAffectOffset?'active':'')+'" onclick="togglePixImgPixelAffect('+i+',\'offset\')">OFFSET</button>',
'  </div>',
'  <div id="'+s('imgpixel-scale-controls')+'" style="display:'+(inst.imgPixelAffectScale?'':'none')+'">',
'    <div class="row"><label>S Min</label><input type="range" id="'+s('sImgPixelMinScale')+'" min="-4" max="4" step="0.01" value="'+inst.imgPixelMinScale+'"><input type="number" class="val" id="'+s('vImgPixelMinScale')+'" value="'+inst.imgPixelMinScale.toFixed(2)+'" min="-4" max="4" step="0.01"></div>',
'    <div class="row"><label>S Max</label><input type="range" id="'+s('sImgPixelMaxScale')+'" min="-4" max="4" step="0.01" value="'+inst.imgPixelMaxScale+'"><input type="number" class="val" id="'+s('vImgPixelMaxScale')+'" value="'+inst.imgPixelMaxScale.toFixed(2)+'" min="-4" max="4" step="0.01"></div>',
'  </div>',
'  <div id="'+s('imgpixel-rotate-controls')+'" style="display:'+(inst.imgPixelAffectRotate?'':'none')+'">',
'    <div class="row"><label>R Min</label><input type="range" id="'+s('sImgPixelMinRotate')+'" min="-180" max="180" step="1" value="'+inst.imgPixelMinRotate+'"><input type="number" class="val" id="'+s('vImgPixelMinRotate')+'" value="'+inst.imgPixelMinRotate+'" min="-180" max="180" step="1"></div>',
'    <div class="row"><label>R Max</label><input type="range" id="'+s('sImgPixelMaxRotate')+'" min="-180" max="180" step="1" value="'+inst.imgPixelMaxRotate+'"><input type="number" class="val" id="'+s('vImgPixelMaxRotate')+'" value="'+inst.imgPixelMaxRotate+'" min="-180" max="180" step="1"></div>',
'  </div>',
'  <div id="'+s('imgpixel-offset-controls')+'" style="display:'+(inst.imgPixelAffectOffset?'':'none')+'">',
'    <div class="row"><label>O Min</label><input type="range" id="'+s('sImgPixelMinOffset')+'" min="-1" max="1" step="0.01" value="'+inst.imgPixelMinOffset+'"><input type="number" class="val" id="'+s('vImgPixelMinOffset')+'" value="'+inst.imgPixelMinOffset.toFixed(2)+'" min="-1" max="1" step="0.01"></div>',
'    <div class="row"><label>O Max</label><input type="range" id="'+s('sImgPixelMaxOffset')+'" min="-1" max="1" step="0.01" value="'+inst.imgPixelMaxOffset+'"><input type="number" class="val" id="'+s('vImgPixelMaxOffset')+'" value="'+inst.imgPixelMaxOffset.toFixed(2)+'" min="-1" max="1" step="0.01"></div>',
'  </div>',
'  </div>',
'</div>',
'  <div id="'+s('twoimage-row')+'" style="display:none"></div>',
'<div id="'+s('imgshape-diamond')+'" style="display:'+(inst.twoImage?'':'none')+';margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08)">',
'<div class="section-title sec-hdr" style="font-size:10px;color:rgba(255,255,255,0.5)" onclick="toggleSectionCollapse(\''+s('sec-dia-img')+'\')">',
'<svg class="collapse-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="6,9 12,15 18,9"/></svg>',
'  DIAMOND IMAGE</div>',
'<div id="'+s('sec-dia-img')+'">',
'  <div class="btn-row" style="margin-bottom:8px;margin-top:4px"><button onclick="document.getElementById(\''+s('imgPixel2Input')+'\').click()">Upload Image</button>',
'    <span id="'+s('imgPixel2Name')+'" style="color:rgba(255,255,255,0.35);font-size:10px;margin-left:6px">'+(inst.imgPixel2Name||'tile2.png')+'</span></div>',
'  <input type="file" id="'+s('imgPixel2Input')+'" accept="image/*" style="display:none" onchange="handlePixImgPixel2Upload(event,'+i+')">',
'  <div class="row"><label>Columns</label><input type="range" id="'+s('sImgPixel2Cols')+'" min="1" max="10" step="1" value="'+(inst.imgPixel2Cols||5)+'"><input type="number" class="val" id="'+s('vImgPixel2Cols')+'" value="'+(inst.imgPixel2Cols||5)+'" min="1" max="10" step="1"></div>',
'  <div class="row"><label>Rows</label><input type="range" id="'+s('sImgPixel2Rows')+'" min="1" max="10" step="1" value="'+(inst.imgPixel2Rows||5)+'"><input type="number" class="val" id="'+s('vImgPixel2Rows')+'" value="'+(inst.imgPixel2Rows||5)+'" min="1" max="10" step="1"></div>',
'  <div class="row"><label>Opacity</label><input type="range" id="'+s('sImgPixel2Opacity')+'" min="0" max="1" step="0.01" value="'+(inst.imgPixel2Opacity!=null?inst.imgPixel2Opacity:1)+'"><input type="number" class="val" id="'+s('vImgPixel2Opacity')+'" value="'+(inst.imgPixel2Opacity!=null?inst.imgPixel2Opacity.toFixed(2):'1.00')+'" min="0" max="1" step="0.01"></div>',
'  <div class="row"><label>Mask (Alpha)</label><button class="toggle-active'+(inst.imgPixel2Mask?' on':'')+'" id="'+s('btn-imgpixel2-mask')+'" onclick="togglePixImgPixelMask('+i+',2)" style="width:42px;height:20px;min-width:42px"></button></div>',
'  <div class="section-title sec-hdr" style="margin-top:6px;font-size:10px" onclick="toggleSectionCollapse(\''+s('sec-dia-lum')+'\')">',
'<svg class="collapse-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="6,9 12,15 18,9"/></svg>',
'    Luminance Effectors</div>',
'  <div id="'+s('sec-dia-lum')+'">',
'  <div class="seg-bar" style="margin-bottom:8px">',
'    <button id="'+s('btn-imgpixel2-scale')+'" class="'+(inst.imgPixel2AffectScale?'active':'')+'" onclick="togglePixImgPixel2Affect('+i+',\'scale\')">SCALE</button>',
'    <button id="'+s('btn-imgpixel2-rotate')+'" class="'+(inst.imgPixel2AffectRotate?'active':'')+'" onclick="togglePixImgPixel2Affect('+i+',\'rotate\')">ROTATE</button>',
'    <button id="'+s('btn-imgpixel2-offset')+'" class="'+(inst.imgPixel2AffectOffset?'active':'')+'" onclick="togglePixImgPixel2Affect('+i+',\'offset\')">OFFSET</button>',
'  </div>',
'  <div id="'+s('imgpixel2-scale-controls')+'" style="display:'+(inst.imgPixel2AffectScale?'':'none')+'">',
'    <div class="row"><label>S Min</label><input type="range" id="'+s('sImgPixel2MinScale')+'" min="-4" max="4" step="0.01" value="'+(inst.imgPixel2MinScale!=null?inst.imgPixel2MinScale:-4)+'"><input type="number" class="val" id="'+s('vImgPixel2MinScale')+'" value="'+((inst.imgPixel2MinScale!=null?inst.imgPixel2MinScale:-4).toFixed(2))+'" min="-4" max="4" step="0.01"></div>',
'    <div class="row"><label>S Max</label><input type="range" id="'+s('sImgPixel2MaxScale')+'" min="-4" max="4" step="0.01" value="'+(inst.imgPixel2MaxScale!=null?inst.imgPixel2MaxScale:4)+'"><input type="number" class="val" id="'+s('vImgPixel2MaxScale')+'" value="'+((inst.imgPixel2MaxScale!=null?inst.imgPixel2MaxScale:4).toFixed(2))+'" min="-4" max="4" step="0.01"></div>',
'  </div>',
'  <div id="'+s('imgpixel2-rotate-controls')+'" style="display:'+(inst.imgPixel2AffectRotate?'':'none')+'">',
'    <div class="row"><label>R Min</label><input type="range" id="'+s('sImgPixel2MinRotate')+'" min="-180" max="180" step="1" value="'+(inst.imgPixel2MinRotate!=null?inst.imgPixel2MinRotate:-90)+'"><input type="number" class="val" id="'+s('vImgPixel2MinRotate')+'" value="'+(inst.imgPixel2MinRotate!=null?inst.imgPixel2MinRotate:-90)+'" min="-180" max="180" step="1"></div>',
'    <div class="row"><label>R Max</label><input type="range" id="'+s('sImgPixel2MaxRotate')+'" min="-180" max="180" step="1" value="'+(inst.imgPixel2MaxRotate!=null?inst.imgPixel2MaxRotate:90)+'"><input type="number" class="val" id="'+s('vImgPixel2MaxRotate')+'" value="'+(inst.imgPixel2MaxRotate!=null?inst.imgPixel2MaxRotate:90)+'" min="-180" max="180" step="1"></div>',
'  </div>',
'  <div id="'+s('imgpixel2-offset-controls')+'" style="display:'+(inst.imgPixel2AffectOffset?'':'none')+'">',
'    <div class="row"><label>O Min</label><input type="range" id="'+s('sImgPixel2MinOffset')+'" min="-1" max="1" step="0.01" value="'+(inst.imgPixel2MinOffset!=null?inst.imgPixel2MinOffset:-0.5)+'"><input type="number" class="val" id="'+s('vImgPixel2MinOffset')+'" value="'+((inst.imgPixel2MinOffset!=null?inst.imgPixel2MinOffset:-0.5).toFixed(2))+'" min="-1" max="1" step="0.01"></div>',
'    <div class="row"><label>O Max</label><input type="range" id="'+s('sImgPixel2MaxOffset')+'" min="-1" max="1" step="0.01" value="'+(inst.imgPixel2MaxOffset!=null?inst.imgPixel2MaxOffset:0.5)+'"><input type="number" class="val" id="'+s('vImgPixel2MaxOffset')+'" value="'+((inst.imgPixel2MaxOffset!=null?inst.imgPixel2MaxOffset:0.5).toFixed(2))+'" min="-1" max="1" step="0.01"></div>',
'  </div>',
'</div>',
'</div>',
'</div>', // close imgshape-diamond
'</div>', // close imgshape-controls  
'</div>', // close shape-controls
'<div class="divider" style="margin:6px 0"></div>',
'<div class="toggle-header" style="cursor:pointer" onclick="toggleSectionCollapse(\''+s('sec-filter-body')+'\')">',
'  <svg class=\"collapse-chev\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"><polyline points=\"6,9 12,15 18,9\"/></svg>',
'  <span class="toggle-label" style="font-size:11px">Filter</span>',
'  <span style="margin-left:auto;display:flex;gap:4px;align-items:center">',
'    <button class="toggle-active'+(inst.filtersEnabled!==false?' on':'')+'" id="'+s('btn-filters-toggle')+'" onclick="toggleInstFilters('+i+');event.stopPropagation()"></button>',
'    <button class="btn-filter-add-circle" onclick="toggleInstFilterMenu('+i+');event.stopPropagation()" title="Add Filter">+</button>',
'  </span>',
'</div>',
'<div id="'+s('sec-filter-body')+'">',
'<div id="'+s('filter-menu')+'" style="display:none;margin:4px 0 8px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:4px 0;max-height:280px;overflow-y:auto"></div>',
'<div id="'+s('filter-controls')+'" class="'+(inst.filtersEnabled===false?'controls-disabled':'')+'">',
'  <div id="'+s('filter-stack-list')+'"></div>',
'</div>',
'</div>',  // close sec-filter-body
'<div class="toggle-header" style="margin-top:6px">',
'  <svg class="collapse-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" onclick="toggleSectionCollapse(\''+s('sec-gap')+'\')" style="cursor:pointer"><polyline points="6,9 12,15 18,9"/></svg>',
'  <span class="toggle-label" style="font-size:11px">Gap</span>',
'  <button class="toggle-active'+(inst.gapEnabled!==false?' on':'')+'" id="'+s('btn-gap-toggle')+'" onclick="setPixGapEnabled('+i+')"></button>',
'</div>',
'<div id="'+s('sec-gap')+'">',
'<div id="'+s('gap-controls')+'" class="'+(inst.gapEnabled===false?'controls-disabled':'')+'">',
'  <div class="toggle-header" style="margin-bottom:4px">',
'    <span class="toggle-label" style="font-size:10px">Filtered</span>',
'    <button class="toggle-active'+(inst.gapFiltered?' on':'')+'" id="'+s('btn-gap-filtered')+'" onclick="setPixGapFiltered('+i+')" style="width:36px;height:18px;min-width:36px"></button>',
'  </div>',
'  <div class="row"><label>Opacity</label>',
'    <input type="range" id="'+s('sGapOpacity')+'" min="0" max="1" step="0.01" value="'+inst.gapOpacity+'">',
'    <input type="number" class="val" id="'+s('vGapOpacity')+'" value="'+inst.gapOpacity.toFixed(2)+'" min="0" max="1" step="0.01">',
'    <div class="color-swatch" id="'+s('gapSwatch')+'" style="background:'+inst.gapColor+';cursor:pointer"></div>',
'  </div>',
'</div>',
'</div>',
// Gradient Editor (moved to Filter cards)
'<div style="display:none">',
'<div class="toggle-header" style="margin-top:8px">',
'  <span class="toggle-label">Gradient Editor</span>',
'  <button class="toggle-active'+(inst.tileGradEnabled!==false?' on':'')+'" id="'+s('btn-tilegrad-toggle')+'" onclick="setPixTileGrad('+i+')"></button>',
'</div>',
'<div id="'+s('tilegrad-controls')+'" class="'+(inst.tileGradEnabled===false?'controls-disabled':'')+'">',
'  <div class="seg-bar" style="margin-bottom:6px">',
'    <button id="'+s('btn-fill-color')+'" class="'+(inst.fillMode===0?'active':'')+'" onclick="setPixFillMode('+i+',0)">Color</button>',
'    <button id="'+s('btn-fill-gradient')+'" class="'+((inst.fillMode||1)===1?'active':'')+'" onclick="setPixFillMode('+i+',1)">Gradient</button>',
'  </div>',
'  <div class="row"><label>Blend</label><select id="'+s('selEmbossBlend')+'">'+embossHTML+'</select></div>',
'  <div class="row" id="'+s('embossHueOffRow')+'" style="display:'+(inst.embossBlendMode===9?'':'none')+'"><label>Hue Offset</label>',
'    <input type="range" id="'+s('sEmbossHueOff')+'" min="0" max="1" step="0.001" value="'+(inst.embossHueOff||0)+'">',
'    <input type="number" class="val" id="'+s('vEmbossHueOff')+'" value="'+((inst.embossHueOff||0).toFixed(3))+'" min="0" max="1" step="0.001">',
'  </div>',
'  <div class="row"><label>Opacity</label>',
'    <input type="range" id="'+s('sShapeGradOpacity')+'" min="0" max="1" step="0.01" value="'+inst.shapeGradOpacity+'">',
'    <input type="number" class="val" id="'+s('vShapeGradOpacity')+'" value="'+inst.shapeGradOpacity.toFixed(2)+'" min="0" max="1" step="0.01">',
'  </div>',
'  <div id="'+s('fill-color-controls')+'" style="display:'+(inst.fillMode===0?'':'none')+'">',
'    <div class="row"><label>Color</label>',
'      <div class="color-swatch" id="'+s('fillColorSwatch')+'" style="background:'+(inst.fillColor||'#ffffff')+';cursor:pointer;width:36px;height:20px;border-radius:3px;border:1px solid rgba(255,255,255,0.2)"></div>',
'    </div>',
'  </div>',
'  <div id="'+s('fill-gradient-controls')+'" style="display:'+((inst.fillMode||1)===1?'':'none')+'">',
'    <div class="grad-editor" id="'+s('shapeGradEditor')+'">',
'      <canvas class="grad-bar" id="'+s('shapeGradBar')+'" height="24"></canvas>',
'      <div class="grad-track" id="'+s('shapeGradTrack')+'"></div>',
'      <div class="grad-hint">tap bar to add · tap handle to pick color · double-tap to delete</div>',
'    </div>',
'    <div class="seg-bar">',
'      <button id="'+s('btn-sgdir-0')+'" class="'+(inst.shapeGradDir===0?'active':'')+'" onclick="setPixSGDir('+i+',0)">0°</button>',
'      <button id="'+s('btn-sgdir-1')+'" class="'+(inst.shapeGradDir===1?'active':'')+'" onclick="setPixSGDir('+i+',1)">45°</button>',
'      <button id="'+s('btn-sgdir-2')+'" class="'+(inst.shapeGradDir===2?'active':'')+'" onclick="setPixSGDir('+i+',2)">90°</button>',
'      <button id="'+s('btn-sgdir-3')+'" class="'+(inst.shapeGradDir===3?'active':'')+'" onclick="setPixSGDir('+i+',3)">135°</button>',
'      <button id="'+s('btn-sgdir-4')+'" class="'+(inst.shapeGradDir===4?'active':'')+'" onclick="setPixSGDir('+i+',4)">Radial</button>',
'    </div>',
'    <div id="'+s('radial-controls')+'" style="display:'+(inst.shapeGradDir===4?'':'none')+'">',
'      <div class="row"><label>Center X</label>',
'        <input type="range" id="'+s('sRadialX')+'" min="-1" max="1" step="0.01" value="'+inst.radialCenterX+'">',
'        <input type="number" class="val" id="'+s('vRadialX')+'" value="'+inst.radialCenterX.toFixed(2)+'" min="-1" max="1" step="0.01">',
'      </div>',
'      <div class="row"><label>Center Y</label>',
'        <input type="range" id="'+s('sRadialY')+'" min="-1" max="1" step="0.01" value="'+inst.radialCenterY+'">',
'        <input type="number" class="val" id="'+s('vRadialY')+'" value="'+inst.radialCenterY.toFixed(2)+'" min="-1" max="1" step="0.01">',
'      </div>',
'      <div class="row"><label>Scale</label>',
'        <input type="range" id="'+s('sRadialScale')+'" min="0" max="4" step="0.01" value="'+(inst.radialScale||1)+'">',
'        <input type="number" class="val" id="'+s('vRadialScale')+'" value="'+(inst.radialScale||1).toFixed(2)+'" min="0" max="4" step="0.01">',
'      </div>',
'    </div>',
'  </div>',
'</div>',
'</div>', // close hidden gradient editor wrapper
// Opacity Pattern (moved to Filter cards)
'<div style="display:none">',
'<div class="divider"></div>',
'<div class="toggle-header">',
'  <span class="toggle-label">Opacity Pattern</span>',
'  <div style="display:flex;gap:4px;align-items:center">',
'    <button class="small" onclick="addPixOpPattern('+i+')">+ Add</button>',
'    <button class="toggle-active'+(opOn?' on':'')+'" id="'+s('btn-oppattern-toggle')+'" onclick="togglePixOpPatterns('+i+')"></button>',
'  </div>',
'</div>',
'<div id="'+s('oppattern-controls')+'" class="'+(opOn?'':'controls-disabled')+'">',
'  <div class="row" id="'+s('oppattern-seed-row')+'"><label>Seed</label>',
'    <input type="range" id="'+s('sOpPatSeed')+'" min="0" max="1000" step="1" value="'+inst.opPatternSeed+'">',
'    <input type="number" class="val" id="'+s('vOpPatSeed')+'" value="'+inst.opPatternSeed+'" min="0" max="1000" step="1">',
'  </div>',
'  <div id="'+s('oppattern-mode-row')+'" class="row"><label>Group By</label>',
'    <div class="seg-bar">',
'      <button id="'+s('btn-oppat-color')+'" class="'+((inst.opPatternMode||0)===0?'active':'')+'" onclick="setPixOpPatMode('+i+',0)">Color</button>',
'      <button id="'+s('btn-oppat-shape')+'" class="'+((inst.opPatternMode||0)===1?'active':'')+'" onclick="setPixOpPatMode('+i+',1)">Shape</button>',
'    </div>',
'  </div>',
'  <div id="'+s('oppattern-list')+'"></div>',
'</div>',
'</div>', // close hidden opacity pattern wrapper
'</div>', // close sec-shape-props
'</div>', // close pix-body
      ].join('\n');
    }

    /* ── Render the active instance into the panel ─── */
    function renderPixelateInstancePanel(idx) {
      var panel = document.getElementById('pix-instance-panel');
      if (!panel) return;
      panel.innerHTML = buildInstanceHTML(idx);
      wirePixelateInstance(idx);
      // Initialize shape gradient — wait two animation frames so the canvas has
      // been laid out and clientWidth is non-zero before we paint the bar.
      requestAnimationFrame(function() {
        requestAnimationFrame(function() { initPixShapeGrad(idx); });
      });
      // Render op patterns
      renderPixOpPatterns(idx);
      renderInstFilterStack(idx);
      // Wire gap swatch
      var swatch = document.getElementById('gapSwatch_' + idx);
      if (swatch) {
        swatch.onclick = function() {
          var inst = window.shaderParams.pixelateInstances[idx];
          openColorPicker(inst.gapColor || '#000000', function(hex) {
            inst.gapColor = hex;
            swatch.style.background = hex;
            window.shaderDirty = true;
          });
        };
      }
      // Wire fill color swatch
      var fillSwatch = document.getElementById('fillColorSwatch_' + idx);
      if (fillSwatch) {
        fillSwatch.onclick = function() {
          var inst = window.shaderParams.pixelateInstances[idx];
          openColorPicker(inst.fillColor || '#ffffff', function(hex) {
            inst.fillColor = hex;
            fillSwatch.style.background = hex;
            window.shaderDirty = true;
          });
        };
      }
      // Wire custom cell color rectangle (full-width clickable color)
      var customRect = document.getElementById('cellcustom-rect_' + idx);
      if (customRect) {
        customRect.onclick = function() {
          var inst = window.shaderParams.pixelateInstances[idx];
          openColorPicker(inst.customCellColor || '#ffffff', function(hex) {
            inst.customCellColor = hex;
            syncKeyToShape(idx, 'customCellColor', hex);
            customRect.style.background = hex;
            window.shaderDirty = true;
          });
        };
      }
      // Initialize cell color gradient editor — always run so it's ready
      // even if user later switches modes. Inits handles + bar regardless of
      // current visibility (works on hidden elements via class-based selector).
      initCellGradEditor(idx);
      // Initialize quad curve editor if enabled
      var pInst = window.shaderParams.pixelateInstances[idx];
      if (pInst && pInst.quadCurveEnabled) {
        initQuadCurveEditor(idx);
      }
    }
    function wirePixelateInstance(i) {
      function s(k) { return k + '_' + i; }
      var inst = window.shaderParams.pixelateInstances[i];

      function wireInstToShape(key, v) {
        if (inst.shapes && inst.shapes[inst.activeShapeIdx || 0]) {
          inst.shapes[inst.activeShapeIdx || 0][key] = v;
        }
      }
      function wireInst(slId, valId, key, fmt) {
        var sl = document.getElementById(slId);
        var va = document.getElementById(valId);
        if (!sl || !va) return;
        sl.addEventListener('input', function() {
          var v = parseFloat(sl.value);
          inst[key] = v;
          wireInstToShape(key, v);
          va.value = fmt(v);
          window.shaderDirty = true;
        });
        va.addEventListener('change', function() {
          var v = parseFloat(va.value);
          if (isNaN(v)) return;
          v = Math.max(parseFloat(sl.min), Math.min(parseFloat(sl.max), v));
          sl.value = v;
          inst[key] = v;
          wireInstToShape(key, v);
          va.value = fmt(v);
          window.shaderDirty = true;
        });
      }
      wireInst(s('sPixelW'),  s('vPixelW'),  'pixelW',  function(v){return Math.round(v);});
      wireInst(s('sPixelH'),  s('vPixelH'),  'pixelH',  function(v){return Math.round(v);});
      wireInst(s('sPixelScale'), s('vPixelScale'), 'pixelScale', function(v){return v.toFixed(2);});
      wireInst(s('sQuadSteps'), s('vQuadSteps'), 'quadSteps', function(v){return Math.round(v);});
      wireInst(s('sQuadCurveMin'), s('vQuadCurveMin'), 'quadCurveMin', function(v){return v.toFixed(2);});
      wireInst(s('sQuadCurveMax'), s('vQuadCurveMax'), 'quadCurveMax', function(v){return v.toFixed(2);});
      wireInst(s('sShapeMargin'), s('vShapeMargin'), 'shapeMargin', function(v){return Math.round(v);});
      var sbSel = document.getElementById(s('selShapeBlend'));
      if (sbSel) sbSel.onchange = function(){
        inst.blendMode = parseInt(this.value);
        syncKeyToShape(i, 'blendMode', inst.blendMode);
        var hr = document.getElementById(s('shape-hueoff-row'));
        if (hr) hr.style.display = (inst.blendMode === 9) ? '' : 'none';
        window.shaderDirty = true;
      };
      wireInst(s('sShapeStrength'), s('vShapeStrength'), 'blendOpacity', function(v){return v.toFixed(2);});
      wireInst(s('sShapeHueOff'), s('vShapeHueOff'), 'blendHueOff', function(v){return v.toFixed(3);});
      wireInst(s('sShapeBleed'), s('vShapeBleed'), 'shapeBleed', function(v){return Math.round(v);});
      wireInst(s('sShapeSmoothness'), s('vShapeSmoothness'), 'shapeSmoothness', function(v){return v.toFixed(2);});
      wireInst(s('sInstBlendHueOff'), s('vInstBlendHueOff'), 'instanceBlendHueOff', function(v){return v.toFixed(2);});
      wireInst(s('sInstOpacity'), s('vInstOpacity'), 'instanceOpacity', function(v){return v.toFixed(2);});
      wireInst(s('sShapeScale'), s('vShapeScale'), 'shapeScale', function(v){return v.toFixed(2);});
      wireInst(s('sImgShapeScale'), s('vImgShapeScale'), 'shapeScale', function(v){return v.toFixed(2);});
      wireInst(s('sSdfMinScale'), s('vSdfMinScale'), 'sdfMinScale', function(v){return v.toFixed(2);});
      wireInst(s('sSdfMaxScale'), s('vSdfMaxScale'), 'sdfMaxScale', function(v){return v.toFixed(2);});
      wireInst(s('sSdfMinRotate'), s('vSdfMinRotate'), 'sdfMinRotate', function(v){return Math.round(v);});
      wireInst(s('sSdfMaxRotate'), s('vSdfMaxRotate'), 'sdfMaxRotate', function(v){return Math.round(v);});
      wireInst(s('sSdfMinOffset'), s('vSdfMinOffset'), 'sdfMinOffset', function(v){return v.toFixed(2);});
      wireInst(s('sSdfMaxOffset'), s('vSdfMaxOffset'), 'sdfMaxOffset', function(v){return v.toFixed(2);});
      wireInst(s('sSdfMinAlpha'), s('vSdfMinAlpha'), 'sdfMinAlpha', function(v){return v.toFixed(2);});
      wireInst(s('sSdfMaxAlpha'), s('vSdfMaxAlpha'), 'sdfMaxAlpha', function(v){return v.toFixed(2);});
      wireInst(s('sGapOpacity'), s('vGapOpacity'), 'gapOpacity', function(v){return v.toFixed(2);});
      wireInst(s('sShapeGradOpacity'), s('vShapeGradOpacity'), 'shapeGradOpacity', function(v){return v.toFixed(2);});
      wireInst(s('sRadialX'), s('vRadialX'), 'radialCenterX', function(v){return v.toFixed(2);});
      wireInst(s('sRadialY'), s('vRadialY'), 'radialCenterY', function(v){return v.toFixed(2);});
      wireInst(s('sRadialScale'), s('vRadialScale'), 'radialScale', function(v){return v.toFixed(2);});
      wireInst(s('sOpPatSeed'), s('vOpPatSeed'), 'opPatternSeed', function(v){return Math.round(v);});
      wireInst(s('sImgPixelCols'), s('vImgPixelCols'), 'imgPixelCols', function(v){return Math.round(v);});
      wireInst(s('sImgPixelRows'), s('vImgPixelRows'), 'imgPixelRows', function(v){return Math.round(v);});
      wireInst(s('sImgPixelOpacity'), s('vImgPixelOpacity'), 'imgPixelOpacity', function(v){return v.toFixed(2);});
      wireInst(s('sImgPixelMinScale'), s('vImgPixelMinScale'), 'imgPixelMinScale', function(v){return v.toFixed(2);});
      wireInst(s('sImgPixelMaxScale'), s('vImgPixelMaxScale'), 'imgPixelMaxScale', function(v){return v.toFixed(2);});
      wireInst(s('sImgPixelMinRotate'), s('vImgPixelMinRotate'), 'imgPixelMinRotate', function(v){return Math.round(v);});
      wireInst(s('sImgPixelMaxRotate'), s('vImgPixelMaxRotate'), 'imgPixelMaxRotate', function(v){return Math.round(v);});
      wireInst(s('sImgPixelMinOffset'), s('vImgPixelMinOffset'), 'imgPixelMinOffset', function(v){return v.toFixed(2);});
      wireInst(s('sImgPixelMaxOffset'), s('vImgPixelMaxOffset'), 'imgPixelMaxOffset', function(v){return v.toFixed(2);});

      // Layer 2 image pixel sliders
      wireInst(s('sImgPixel2Cols'), s('vImgPixel2Cols'), 'imgPixel2Cols', function(v){return Math.round(v);});
      wireInst(s('sImgPixel2Rows'), s('vImgPixel2Rows'), 'imgPixel2Rows', function(v){return Math.round(v);});
      wireInst(s('sImgPixel2Opacity'), s('vImgPixel2Opacity'), 'imgPixel2Opacity', function(v){return v.toFixed(2);});
      wireInst(s('sImgPixel2MinScale'), s('vImgPixel2MinScale'), 'imgPixel2MinScale', function(v){return v.toFixed(2);});
      wireInst(s('sImgPixel2MaxScale'), s('vImgPixel2MaxScale'), 'imgPixel2MaxScale', function(v){return v.toFixed(2);});
      wireInst(s('sImgPixel2MinRotate'), s('vImgPixel2MinRotate'), 'imgPixel2MinRotate', function(v){return Math.round(v);});
      wireInst(s('sImgPixel2MaxRotate'), s('vImgPixel2MaxRotate'), 'imgPixel2MaxRotate', function(v){return Math.round(v);});
      wireInst(s('sImgPixel2MinOffset'), s('vImgPixel2MinOffset'), 'imgPixel2MinOffset', function(v){return v.toFixed(2);});
      wireInst(s('sImgPixel2MaxOffset'), s('vImgPixel2MaxOffset'), 'imgPixel2MaxOffset', function(v){return v.toFixed(2);});

      // Hue offset sliders for hue-shift blend mode
      wireInst(s('sEmbossHueOff'),    s('vEmbossHueOff'),    'embossHueOff',    function(v){return v.toFixed(3);});
      wireInst(s('sImgPixelHueOff'),  s('vImgPixelHueOff'),  'imgPixelHueOff',  function(v){return v.toFixed(3);});
      wireInst(s('sImgPixel2HueOff'), s('vImgPixel2HueOff'), 'imgPixel2HueOff', function(v){return v.toFixed(3);});

      // Selects — update value and show/hide hue offset row
      var emSel = document.getElementById(s('selEmbossBlend'));
      if (emSel) emSel.onchange = function(){
        inst.embossBlendMode = parseInt(this.value);
        var r = document.getElementById(s('embossHueOffRow'));
        if (r) r.style.display = (inst.embossBlendMode === 9) ? '' : 'none';
        window.shaderDirty = true;
      };
    }


    // ── Per-instance Filter functions ─────────────────────────
    var instFilterIdCounter = 100;

    function setInstFilterGradDir(i, filterId, dir) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      var item = (inst.filters || []).find(function(e){ return e.id === filterId; });
      if (!item) return;
      item.gradDir = dir;
      for (var d = 0; d < 5; d++) {
        var btn = document.getElementById('ifgrad-dir'+d+'-'+i+'-'+filterId);
        if (btn) btn.classList.toggle('active', d === dir);
      }
      var rc = document.getElementById('ifgrad-radial-'+i+'-'+filterId);
      if (rc) rc.style.display = dir === 4 ? '' : 'none';
      pixInstDirty(i);
    }

    function initCellGradEditor(instIdx) {
      var inst = window.shaderParams.pixelateInstances[instIdx];
      if (!inst) return;
      // Look up bar/track INSIDE the editor div by class — more reliable than
      // getElementById in case the panel re-render left stale duplicate IDs.
      var ed = document.getElementById('cellgrad-editor_'+instIdx);
      if (!ed) return;
      var bar = ed.querySelector('.cellgrad-bar');
      var track = ed.querySelector('.grad-track');
      if (!bar || !track) return;
      if (!inst.cellGradStops || inst.cellGradStops.length < 2) {
        inst.cellGradStops = [
          {pos:0, r:0,   g:0,   b:0,   hex:'#000000'},
          {pos:1, r:255, g:255, b:255, hex:'#ffffff'}
        ];
        syncKeyToShape(instIdx, 'cellGradStops', inst.cellGradStops);
      }
      function sortedStops() { return inst.cellGradStops.slice().sort(function(a,b){ return a.pos-b.pos; }); }
      function stopHex(s) {
        // Defensive: if hex missing, derive from r/g/b; if those missing too, use black
        if (s.hex && /^#[0-9a-fA-F]{6}$/.test(s.hex)) return s.hex;
        var r = (s.r != null ? s.r : 0), g = (s.g != null ? s.g : 0), b = (s.b != null ? s.b : 0);
        return '#' + [r,g,b].map(function(c){ return Math.max(0,Math.min(255,c|0)).toString(16).padStart(2,'0'); }).join('');
      }
      // CSS-based gradient bar — works regardless of layout state, no canvas race
      function renderBar() {
        var stops = sortedStops();
        if (stops.length < 2) return;
        var css = stops.map(function(s){ return stopHex(s) + ' ' + (s.pos*100).toFixed(2) + '%'; }).join(', ');
        var gradient = 'linear-gradient(to right, ' + css + ')';
        bar.style.backgroundImage = gradient;
        bar.style.backgroundColor = 'transparent';
      }
      function renderHandles() {
        track.innerHTML = '';
        inst.cellGradStops.forEach(function(stop) {
          // Repair stop.hex if missing/invalid so it stays consistent for picker etc.
          var hex = stopHex(stop);
          if (stop.hex !== hex) stop.hex = hex;
          var handle = document.createElement('div'); handle.className = 'grad-handle';
          handle.style.left = (stop.pos*100)+'%'; handle.style.background = hex;
          handle.style.touchAction = 'none';
          var dragging = false, hasMoved = false, tapTimer = null, tapCount = 0;
          function startDrag(){ dragging=true; hasMoved=false; handle.classList.add('dragging'); }
          function moveDrag(cx) {
            if(!dragging) return; hasMoved=true;
            var tr = track.getBoundingClientRect();
            stop.pos = Math.max(0,Math.min(1,(cx-tr.left)/tr.width));
            handle.style.left = (stop.pos*100)+'%'; renderBar();
            syncKeyToShape(instIdx, 'cellGradStops', inst.cellGradStops);
            window.shaderDirty = true;
          }
          function endDrag() {
            var wasDrag = hasMoved; dragging=false; hasMoved=false; handle.classList.remove('dragging');
            if(!wasDrag){
              tapCount++;
              if(tapCount===1){ tapTimer=setTimeout(function(){
                tapCount=0;
                openColorPicker(stop.hex,function(hex,r,g,b){
                  stop.r=r;stop.g=g;stop.b=b;stop.hex=hex;
                  handle.style.background=hex; renderBar();
                  syncKeyToShape(instIdx, 'cellGradStops', inst.cellGradStops);
                  window.shaderDirty = true;
                });
              },250); }
              else if(tapCount>=2){ clearTimeout(tapTimer);tapCount=0;
                if(inst.cellGradStops.length>2){
                  inst.cellGradStops.splice(inst.cellGradStops.indexOf(stop),1);
                  renderHandles(); renderBar();
                  syncKeyToShape(instIdx, 'cellGradStops', inst.cellGradStops);
                  window.shaderDirty = true;
                }
              }
            } else { tapCount=0; }
          }
          handle.addEventListener('mousedown',function(e){
            e.preventDefault();e.stopPropagation();startDrag();
            var onM=function(ev){moveDrag(ev.clientX)};
            var onU=function(){endDrag();window.removeEventListener('mousemove',onM);window.removeEventListener('mouseup',onU)};
            window.addEventListener('mousemove',onM);window.addEventListener('mouseup',onU);
          });
          handle.addEventListener('touchstart',function(e){if(e.touches.length!==1)return;e.preventDefault();e.stopPropagation();startDrag();},{passive:false});
          handle.addEventListener('touchmove',function(e){e.preventDefault();if(e.touches.length===1)moveDrag(e.touches[0].clientX);},{passive:false});
          handle.addEventListener('touchend',function(e){e.preventDefault();endDrag();},{passive:false});
          track.appendChild(handle);
        });
      }
      bar.onclick = function(e) {
        var rect = bar.getBoundingClientRect();
        var pos = (e.clientX - rect.left) / rect.width;
        var stops = sortedStops();
        var lo=stops[0],hi=stops[stops.length-1];
        for(var j=0;j<stops.length-1;j++){if(pos>=stops[j].pos&&pos<=stops[j+1].pos){lo=stops[j];hi=stops[j+1];break;}}
        var range=hi.pos-lo.pos, f=range<0.0001?0:(pos-lo.pos)/range;
        var r=Math.round(lo.r+(hi.r-lo.r)*f),g=Math.round(lo.g+(hi.g-lo.g)*f),b=Math.round(lo.b+(hi.b-lo.b)*f);
        inst.cellGradStops.push({pos:pos,r:r,g:g,b:b,hex:'#'+[r,g,b].map(function(c){return c.toString(16).padStart(2,'0');}).join('')});
        renderHandles(); renderBar();
        syncKeyToShape(instIdx, 'cellGradStops', inst.cellGradStops);
        window.shaderDirty = true;
      };
      // CSS gradient + DOM handles — both work synchronously with no layout race
      renderBar();
      renderHandles();
    }

    function initFilterGradEditor(instIdx, item) {      var barId = 'ifgrad-bar-'+instIdx+'-'+item.id;
      var trackId = 'ifgrad-track-'+instIdx+'-'+item.id;
      var bar = document.getElementById(barId);
      var track = document.getElementById(trackId);
      if (!bar || !track) return;
      if (!item.gradStops || item.gradStops.length < 2) {
        item.gradStops = [{pos:0,r:0,g:0,b:0,hex:'#000000'},{pos:1,r:255,g:255,b:255,hex:'#ffffff'}];
      }
      function sortedStops() { return item.gradStops.slice().sort(function(a,b){ return a.pos-b.pos; }); }
      function renderBar() {
        var w = bar.clientWidth || 200; if (w < 2) { requestAnimationFrame(renderBar); return; }
        bar.width = w; var ctx = bar.getContext('2d'); var h2 = bar.height;
        var stops = sortedStops(); var grad = ctx.createLinearGradient(0,0,w,0);
        stops.forEach(function(s){ grad.addColorStop(s.pos, s.hex); });
        ctx.fillStyle = grad; ctx.fillRect(0,0,w,h2);
      }
      function renderHandles() {
        track.innerHTML = '';
        item.gradStops.forEach(function(stop, idx) {
          var handle = document.createElement('div'); handle.className = 'grad-handle';
          handle.style.left = (stop.pos*100)+'%'; handle.style.background = stop.hex;
          handle.style.touchAction = 'none';
          var dragging = false, hasMoved = false, tapTimer = null, tapCount = 0;
          function startDrag(){ dragging=true; hasMoved=false; handle.classList.add('dragging'); }
          function moveDrag(cx) {
            if(!dragging) return; hasMoved=true;
            var tr = track.getBoundingClientRect();
            stop.pos = Math.max(0,Math.min(1,(cx-tr.left)/tr.width));
            handle.style.left = (stop.pos*100)+'%'; renderBar(); window.shaderDirty=true;
          }
          function endDrag() {
            var wasDrag = hasMoved; dragging=false; hasMoved=false; handle.classList.remove('dragging');
            if(!wasDrag){
              tapCount++;
              if(tapCount===1){ tapTimer=setTimeout(function(){
                tapCount=0;
                openColorPicker(stop.hex,function(hex,r,g,b){
                  stop.r=r;stop.g=g;stop.b=b;stop.hex=hex;
                  handle.style.background=hex; renderBar(); window.shaderDirty=true;
                });
              },250); }
              else if(tapCount>=2){ clearTimeout(tapTimer);tapCount=0;
                if(item.gradStops.length>2){ item.gradStops.splice(item.gradStops.indexOf(stop),1); renderHandles();renderBar();window.shaderDirty=true; }
              }
            } else { tapCount=0; }
          }
          handle.addEventListener('mousedown',function(e){
            e.preventDefault();e.stopPropagation();startDrag();
            var onM=function(ev){moveDrag(ev.clientX)};
            var onU=function(){endDrag();window.removeEventListener('mousemove',onM);window.removeEventListener('mouseup',onU)};
            window.addEventListener('mousemove',onM);window.addEventListener('mouseup',onU);
          });
          handle.addEventListener('touchstart',function(e){if(e.touches.length!==1)return;e.preventDefault();e.stopPropagation();startDrag();},{passive:false});
          handle.addEventListener('touchmove',function(e){e.preventDefault();if(e.touches.length===1)moveDrag(e.touches[0].clientX);},{passive:false});
          handle.addEventListener('touchend',function(e){e.preventDefault();endDrag();},{passive:false});
          track.appendChild(handle);
        });
      }
      bar.onclick = function(e) {
        var rect = e.target.getBoundingClientRect();
        var pos = (e.clientX - rect.left) / rect.width;
        var stops = sortedStops();
        var lo=stops[0],hi=stops[stops.length-1];
        for(var j=0;j<stops.length-1;j++){if(pos>=stops[j].pos&&pos<=stops[j+1].pos){lo=stops[j];hi=stops[j+1];break;}}
        var range=hi.pos-lo.pos, f=range<0.0001?0:(pos-lo.pos)/range;
        var r=Math.round(lo.r+(hi.r-lo.r)*f),g=Math.round(lo.g+(hi.g-lo.g)*f),b=Math.round(lo.b+(hi.b-lo.b)*f);
        item.gradStops.push({pos:pos,r:r,g:g,b:b,hex:'#'+[r,g,b].map(function(c){return c.toString(16).padStart(2,'0');}).join('')});
        renderHandles();renderBar();window.shaderDirty=true;
      };
      renderBar(); renderHandles();
    }

    function setInstFilterPatMode(instIdx, filterId, mode) {
      var inst = window.shaderParams.pixelateInstances[instIdx];
      if (!inst) return;
      var item = (inst.filters || []).find(function(e){ return e.id === filterId; });
      if (!item) return;
      item.patternMode = mode;
      renderInstFilterStack(instIdx);
      pixInstDirty(instIdx);
    }

    function addInstFilterPat(instIdx, filterId) {
      var inst = window.shaderParams.pixelateInstances[instIdx];
      if (!inst) return;
      var item = (inst.filters || []).find(function(e){ return e.id === filterId; });
      if (!item || !item.patterns) return;
      if (item.patterns.length >= 4) return;
      item.patternIdCounter = (item.patternIdCounter || 0) + 1;
      item.patterns.push({id: item.patternIdCounter, active:true, grid:[[1,0],[0,1]], hueShift:0.1, hueOpacity:1.0});
      renderInstFilterStack(instIdx);
      pixInstDirty(instIdx);
    }

    function ensureShapes(inst) {
      if (inst.shapes && inst.shapes.length > 0) {
        // Backfill any missing keys on existing shapes (for configs from older versions)
        inst.shapes.forEach(function(sh) {
          if (sh.blendMode == null) sh.blendMode = -1;
          if (sh.blendHueOff == null) sh.blendHueOff = 0;
          if (sh.blendOpacity == null) sh.blendOpacity = 1.0;
          if (sh.cellColorMode == null) sh.cellColorMode = 0;
          if (sh.customCellColor == null) sh.customCellColor = '#ffffff';
          if (sh.sdfAffectAlpha == null) sh.sdfAffectAlpha = false;
          if (sh.sdfMinAlpha == null) sh.sdfMinAlpha = 0.0;
          if (sh.sdfMaxAlpha == null) sh.sdfMaxAlpha = 1.0;
          if (!sh.cellGradStops || sh.cellGradStops.length < 2) {
            sh.cellGradStops = [
              {pos:0, r:0,   g:0,   b:0,   hex:'#000000'},
              {pos:1, r:255, g:255, b:255, hex:'#ffffff'}
            ];
          }
        });
        return;
      }
      // Migrate single-shape instance into shapes array
      inst.shapes = [{
        id: 1, name: 'Shape 1',
        pixelShape: inst.pixelShape || 0,
        shapeMargin: inst.shapeMargin || 3, shapeBleed: inst.shapeBleed || 0,
        shapeSmoothness: inst.shapeSmoothness || 0, shapeScale: inst.shapeScale != null ? inst.shapeScale : 1.0,
        forceSquare: inst.forceSquare || false,
        sdfAffectScale: inst.sdfAffectScale || false, sdfMinScale: inst.sdfMinScale != null ? inst.sdfMinScale : 0.5, sdfMaxScale: inst.sdfMaxScale != null ? inst.sdfMaxScale : 2.0,
        sdfAffectRotate: inst.sdfAffectRotate || false, sdfMinRotate: inst.sdfMinRotate != null ? inst.sdfMinRotate : -45, sdfMaxRotate: inst.sdfMaxRotate != null ? inst.sdfMaxRotate : 45,
        sdfAffectOffset: inst.sdfAffectOffset || false, sdfMinOffset: inst.sdfMinOffset != null ? inst.sdfMinOffset : -0.3, sdfMaxOffset: inst.sdfMaxOffset != null ? inst.sdfMaxOffset : 0.3,
        sdfAffectAlpha: inst.sdfAffectAlpha || false, sdfMinAlpha: inst.sdfMinAlpha != null ? inst.sdfMinAlpha : 0.0, sdfMaxAlpha: inst.sdfMaxAlpha != null ? inst.sdfMaxAlpha : 1.0,
        imgPixelEnabled: inst.imgPixelEnabled || false, imgPixelCols: inst.imgPixelCols || 5, imgPixelRows: inst.imgPixelRows || 5,
        imgPixelOpacity: inst.imgPixelOpacity != null ? inst.imgPixelOpacity : 1, imgPixelBlend: inst.imgPixelBlend || 8,
        imgPixelHueOff: inst.imgPixelHueOff || 0, imgPixelMask: inst.imgPixelMask || false,
        imgPixelAffectScale: inst.imgPixelAffectScale || false, imgPixelMinScale: inst.imgPixelMinScale != null ? inst.imgPixelMinScale : -4, imgPixelMaxScale: inst.imgPixelMaxScale != null ? inst.imgPixelMaxScale : 4,
        imgPixelAffectRotate: inst.imgPixelAffectRotate || false, imgPixelMinRotate: inst.imgPixelMinRotate != null ? inst.imgPixelMinRotate : -180, imgPixelMaxRotate: inst.imgPixelMaxRotate != null ? inst.imgPixelMaxRotate : 180,
        imgPixelAffectOffset: inst.imgPixelAffectOffset || false, imgPixelMinOffset: inst.imgPixelMinOffset != null ? inst.imgPixelMinOffset : -1, imgPixelMaxOffset: inst.imgPixelMaxOffset != null ? inst.imgPixelMaxOffset : 1,
        twoImage: inst.twoImage || false,
        imgPixel2Enabled: inst.imgPixel2Enabled || false, imgPixel2Cols: inst.imgPixel2Cols || 5, imgPixel2Rows: inst.imgPixel2Rows || 5,
        imgPixel2Opacity: inst.imgPixel2Opacity != null ? inst.imgPixel2Opacity : 1, imgPixel2Blend: inst.imgPixel2Blend || 8,
        imgPixel2HueOff: inst.imgPixel2HueOff || 0, imgPixel2Mask: inst.imgPixel2Mask || false,
        imgPixel2AffectScale: inst.imgPixel2AffectScale || false, imgPixel2MinScale: inst.imgPixel2MinScale, imgPixel2MaxScale: inst.imgPixel2MaxScale,
        imgPixel2AffectRotate: inst.imgPixel2AffectRotate || false, imgPixel2MinRotate: inst.imgPixel2MinRotate, imgPixel2MaxRotate: inst.imgPixel2MaxRotate,
        imgPixel2AffectOffset: inst.imgPixel2AffectOffset || false, imgPixel2MinOffset: inst.imgPixel2MinOffset, imgPixel2MaxOffset: inst.imgPixel2MaxOffset,
        filters: inst.filters || [],
        filtersEnabled: inst.filtersEnabled !== false ? true : false,
        blendMode: -1, blendHueOff: 0, blendOpacity: 1.0,
        cellColorMode: 0, customCellColor: '#ffffff',
        cellGradStops: inst.cellGradStops ? JSON.parse(JSON.stringify(inst.cellGradStops)) : [
          {pos:0, r:0,   g:0,   b:0,   hex:'#000000'},
          {pos:1, r:255, g:255, b:255, hex:'#ffffff'}
        ]
      }];
      inst.activeShapeIdx = 0;
      inst.shapeIdCounter = 1;
    }

    function addShape(instIdx) {
      var inst = window.shaderParams.pixelateInstances[instIdx];
      if (!inst) return;
      ensureShapes(inst);
      if (inst.shapes.length >= 8) return;
      inst.shapeIdCounter = (inst.shapeIdCounter || inst.shapes.length) + 1;
      inst.shapes.push({
        id: inst.shapeIdCounter, name: 'Shape ' + inst.shapeIdCounter,
        pixelShape: 1,
        shapeMargin: 3, shapeBleed: 0, shapeSmoothness: 0, shapeScale: 1.0, forceSquare: false,
        sdfAffectScale: false, sdfMinScale: 0.5, sdfMaxScale: 2.0,
        sdfAffectRotate: false, sdfMinRotate: -45, sdfMaxRotate: 45,
        sdfAffectOffset: false, sdfMinOffset: -0.3, sdfMaxOffset: 0.3,
        sdfAffectAlpha: false, sdfMinAlpha: 0.0, sdfMaxAlpha: 1.0,
        imgPixelEnabled: false, imgPixelCols: 5, imgPixelRows: 5,
        imgPixelOpacity: 1, imgPixelBlend: 8, imgPixelHueOff: 0, imgPixelMask: false,
        imgPixelAffectScale: false, imgPixelMinScale: -4, imgPixelMaxScale: 4,
        imgPixelAffectRotate: false, imgPixelMinRotate: -180, imgPixelMaxRotate: 180,
        imgPixelAffectOffset: false, imgPixelMinOffset: -1, imgPixelMaxOffset: 1,
        twoImage: false,
        imgPixel2Enabled: false, imgPixel2Cols: 5, imgPixel2Rows: 5,
        imgPixel2Opacity: 1, imgPixel2Blend: 8, imgPixel2HueOff: 0, imgPixel2Mask: false,
        imgPixel2AffectScale: false, imgPixel2AffectRotate: false, imgPixel2AffectOffset: false,
        filters: [], filtersEnabled: false,
        blendMode: -1, blendHueOff: 0, blendOpacity: 1.0, enabled: true,
        cellColorMode: 0, customCellColor: '#ffffff',
        cellGradStops: [
          {pos:0, r:0,   g:0,   b:0,   hex:'#000000'},
          {pos:1, r:255, g:255, b:255, hex:'#ffffff'}
        ]
      });
      inst.activeShapeIdx = inst.shapes.length - 1;
      renderPixelateInstancePanel(instIdx);
      pixInstDirty(instIdx);
    }

    function removeShape(instIdx, shapeIdx) {
      var inst = window.shaderParams.pixelateInstances[instIdx];
      if (!inst || !inst.shapes || inst.shapes.length <= 1) return;
      syncActiveShapeBack(instIdx);
      inst.shapes.splice(shapeIdx, 1);
      if (inst.activeShapeIdx >= inst.shapes.length) inst.activeShapeIdx = inst.shapes.length - 1;
      renderPixelateInstancePanel(instIdx);
      pixInstDirty(instIdx);
    }

    function syncKeyToShape(instIdx, key, val) {
      var inst = window.shaderParams.pixelateInstances[instIdx];
      if (inst && inst.shapes && inst.shapes[inst.activeShapeIdx || 0]) {
        inst.shapes[inst.activeShapeIdx || 0][key] = val;
      }
    }

    function toggleShapeEnabled(instIdx) {
      var inst = window.shaderParams.pixelateInstances[instIdx];
      if (!inst || !inst.shapes) return;
      var sh = inst.shapes[inst.activeShapeIdx || 0];
      if (!sh) return;
      sh.enabled = sh.enabled !== false ? false : true;
      var btn = document.getElementById('btn-shape-toggle_'+instIdx);
      if (btn) btn.classList.toggle('on', sh.enabled !== false);
      pixInstDirty(instIdx);
    }

    function selectShape(instIdx, shapeIdx) {
      var inst = window.shaderParams.pixelateInstances[instIdx];
      if (!inst) return;
      // Save current shape's values BEFORE switching
      syncActiveShapeBack(instIdx);
      inst.activeShapeIdx = shapeIdx;
      renderPixelateInstancePanel(instIdx);
    }

    function toggleSectionCollapse(elId) {
      var el = document.getElementById(elId);
      if (!el) return;
      el.classList.toggle('section-collapsed');
      // Update chevron
      var header = el.previousElementSibling;
      if (header) {
        var chev = header.querySelector('.collapse-chev');
        if (chev) chev.style.transform = el.classList.contains('section-collapsed') ? 'rotate(-90deg)' : '';
      }
    }

    function toggleInstFilters(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      inst.filtersEnabled = !(inst.filtersEnabled !== false);
      syncKeyToShape(i, 'filtersEnabled', inst.filtersEnabled);
      var btn = document.getElementById('btn-filters-toggle_'+i);
      if (btn) btn.classList.toggle('on', inst.filtersEnabled !== false);
      var ctrl = document.getElementById('filter-controls_'+i);
      if (ctrl) ctrl.classList.toggle('controls-disabled', inst.filtersEnabled === false);
      pixInstDirty(i);
    }

    function toggleInstFilterMenu(i) {
      var menu = document.getElementById('filter-menu_'+i);
      if (!menu) return;
      if (menu.style.display !== 'none') { menu.style.display = 'none'; return; }
      menu.innerHTML = FILTER_MENU.map(function(f) {
        if (f.sep) return '<div style="padding:3px 12px;font-size:9px;color:rgba(255,255,255,0.3);pointer-events:none;border-bottom:1px solid rgba(255,255,255,0.06)">'+f.label+'</div>';
        return '<div style="padding:5px 12px;font-size:11px;color:#ccc;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.06)" onmouseover="this.style.background=\'rgba(255,255,255,0.08)\'" onmouseout="this.style.background=\'\'" onclick="addInstFilter('+i+','+f.type+')">'+f.label+'</div>';
      }).join('');
      menu.style.display = '';
    }

    function addInstFilter(i, typeInt) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      if (!inst.filters) inst.filters = [];
      if (inst.filters.length >= 16) return;
      var cat = PP_CATALOG.find(function(c){ return c.type === typeInt; });
      if (!cat) return;
      var item = { type: typeInt, enabled: true, collapsed: false, id: ++instFilterIdCounter };
      cat.params.forEach(function(pr) { item[pr.key] = pr.def; });
      if (cat.hasBland) { item.blendMode = cat.defBlend || 8; item.hueOff = 0; }
      if (cat.hasColor) { item.fillColor = '#ffffff'; item.fillR = 1; item.fillG = 1; item.fillB = 1; }
      if (cat.hasGradient) {
        item.gradStops = [{pos:0,r:0,g:0,b:0,hex:'#000000'},{pos:1,r:255,g:255,b:255,hex:'#ffffff'}];
        item.gradDir = 0; item.radialCenterX = 0; item.radialCenterY = 0; item.radialScale = 1;
      }
      if (cat.hasOpPattern) {
        item.patterns = [{id:1, active:true, grid:[[0,1],[1,0]], hueShift:0.04, hueOpacity:0.92}];
        item.patternIdCounter = 1; item.patternSeed = 0; item.patternMode = 0;
        if (inst.opPatterns && inst.opPatterns.length > 0) {
          item.patterns = JSON.parse(JSON.stringify(inst.opPatterns));
          item.patternIdCounter = inst.opPatternIdCounter || item.patterns.length;
          item.patternSeed = inst.opPatternSeed || 0;
          item.patternMode = inst.opPatternMode || 0;
        }
      }
      inst.filters.push(item);
      renderInstFilterStack(i);
      var menu = document.getElementById('filter-menu_'+i);
      if (menu) menu.style.display = 'none';
      pixInstDirty(i);
    }

    function removeInstFilter(i, id) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      inst.filters = (inst.filters || []).filter(function(e){ return e.id !== id; });
      renderInstFilterStack(i);
      pixInstDirty(i);
    }

    function toggleInstFilter(i, id) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      var item = (inst.filters || []).find(function(e){ return e.id === id; });
      if (!item) return;
      item.enabled = !item.enabled;
      var btn = document.getElementById('if-toggle-'+i+'-'+id);
      if (btn) btn.classList.toggle('on', item.enabled);
      var body = document.getElementById('if-body-'+i+'-'+id);
      if (body) body.classList.toggle('controls-disabled', !item.enabled);
      pixInstDirty(i);
    }

    function collapseInstFilter(i, id) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      var item = (inst.filters || []).find(function(e){ return e.id === id; });
      if (!item) return;
      item.collapsed = !item.collapsed;
      var body = document.getElementById('if-body-'+i+'-'+id);
      if (body) body.style.display = item.collapsed ? 'none' : '';
      var card = document.querySelector('[data-ifcard="'+i+'-'+id+'"]');
      if (card) {
        var svg = card.querySelector('svg');
        if (svg) svg.style.transform = 'rotate('+(item.collapsed?'-90':'0')+'deg)';
      }
    }

    function moveInstFilter(i, id, dir) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      var stack = inst.filters || [];
      var idx = stack.findIndex(function(e){ return e.id === id; });
      if (idx < 0) return;
      var newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= stack.length) return;
      var tmp = stack[idx]; stack[idx] = stack[newIdx]; stack[newIdx] = tmp;
      renderInstFilterStack(i);
      pixInstDirty(i);
    }

    function dupInstFilter(i, id) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      var stack = inst.filters || [];
      if (stack.length >= 16) return;
      var item = stack.find(function(e){ return e.id === id; });
      if (!item) return;
      var dup = JSON.parse(JSON.stringify(item));
      dup.id = ++instFilterIdCounter;
      stack.splice(stack.indexOf(item) + 1, 0, dup);
      renderInstFilterStack(i);
      pixInstDirty(i);
    }

    function instFilterPickColor(i, id) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      var item = (inst.filters || []).find(function(e){ return e.id === id; });
      if (!item) return;
      openColorPicker(item.fillColor || '#ffffff', function(hex, r, g, b) {
        item.fillColor = hex;
        item.fillR = r / 255; item.fillG = g / 255; item.fillB = b / 255;
        var sw = document.getElementById('if-color-'+i+'-'+id);
        if (sw) sw.style.background = hex;
        window.shaderDirty = true;
      });
    }

    function renderInstFilterStack(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      var list = document.getElementById('filter-stack-list_'+i);
      if (!list) return;
      var stack = inst.filters || [];
      stack.forEach(function(e){ if (e.id >= instFilterIdCounter) instFilterIdCounter = e.id + 1; });
      var N = stack.length;

      list.innerHTML = stack.map(function(item, idx) {
        var cat = PP_CATALOG.find(function(c){ return c.type === item.type; });
        if (!cat) return '';
        var isC = item.collapsed === true;
        var slidersHTML = cat.params.map(function(pr) {
          var val = item[pr.key] != null ? item[pr.key] : pr.def;
          var fmtVal = Number.isInteger(pr.step) ? Math.round(val) : val.toFixed(2);
          return '<div class="row"><label style="font-size:10px">'+pr.label+'</label>' +
            '<input type="range" data-ifi="'+i+'" data-ifid="'+item.id+'" data-ifkey="'+pr.key+'" min="'+pr.min+'" max="'+pr.max+'" step="'+pr.step+'" value="'+val+'">' +
            '<input type="number" class="val" data-ifi="'+i+'" data-ifid="'+item.id+'" data-ifkey="'+pr.key+'" value="'+fmtVal+'" min="'+pr.min+'" max="'+pr.max+'" step="'+pr.step+'">' +
            '</div>';
        }).join('');

        var blendHTML = '';
        if (cat.hasBland) {
          var bm = item.blendMode != null ? item.blendMode : 8;
          var bOpts = [['Normal',8],['Overlay',0],['Multiply',1],['Screen',2],['Soft Light',3],['Hard Light',4],['Color Dodge',5],['Color Burn',6],['Linear Light',7],['Hue Shift',9]];
          blendHTML = '<div class="row"><label style="font-size:10px">Blend</label><select data-ifi="'+i+'" data-ifid="'+item.id+'" data-ifkey="_blendMode" style="flex:1;font-size:10px">' +
            bOpts.map(function(o){ return '<option value="'+o[1]+'"'+(bm===o[1]?' selected':'')+'>'+o[0]+'</option>'; }).join('') + '</select></div>';
          if (bm === 9) {
            blendHTML += '<div class="row"><label style="font-size:10px">Hue Offset</label><input type="range" data-ifi="'+i+'" data-ifid="'+item.id+'" data-ifkey="hueOff" min="0" max="1" step="0.01" value="'+(item.hueOff||0)+'"><input type="number" class="val" data-ifi="'+i+'" data-ifid="'+item.id+'" data-ifkey="hueOff" value="'+((item.hueOff||0).toFixed(2))+'" min="0" max="1" step="0.01"></div>';
          }
        }

        var colorHTML = '';
        if (cat.hasColor) {
          colorHTML = '<div class="row"><label style="font-size:10px">Color</label><div class="color-swatch" id="if-color-'+i+'-'+item.id+'" style="background:'+(item.fillColor||'#ffffff')+';cursor:pointer;width:36px;height:20px;border-radius:3px;border:1px solid rgba(255,255,255,0.2)" onclick="instFilterPickColor('+i+','+item.id+')"></div></div>';
        }

        var chev = '<svg class="collapse-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" style="transform:rotate('+(isC?'-90':'0')+'deg)" onclick="collapseInstFilter('+i+','+item.id+')"><polyline points="6,9 12,15 18,9"/></svg>';
        var upB = idx > 0 ? '<button class="btn-circ" onclick="moveInstFilter('+i+','+item.id+',-1)" title="Move up">\u25B2</button>' : '';
        var dnB = idx < N-1 ? '<button class="btn-circ" onclick="moveInstFilter('+i+','+item.id+',1)" title="Move down">\u25BC</button>' : '';
        var duB = '<button class="btn-circ" onclick="dupInstFilter('+i+','+item.id+')" title="Duplicate">\u29C9</button>';

        // Opacity Pattern UI for type 16
        var opPatHTML = '';
        if (cat.hasOpPattern) {
          var pats = item.patterns || [];
          var patListHTML = pats.map(function(pat) {
            var gridStr = (pat.grid||[]).map(function(r){return r.join(',');}).join('\n');
            return '<div class="group-card" style="margin:4px 0"><div class="group-header" style="display:flex;align-items:center;gap:4px">' +
              '<span class="g-title" style="font-size:10px">Pattern</span>' +
              '<button class="toggle-active'+(pat.active!==false?' on':'')+'" data-ifpat-toggle="'+item.id+'-'+pat.id+'" style="width:28px;min-width:28px;height:14px"></button>' +
              '<button class="small danger" data-ifpat-del="'+item.id+'-'+pat.id+'" style="padding:0 3px;font-size:10px">\u2715</button></div>' +
              '<div class="group-body'+(pat.active===false?' controls-disabled':'')+'">' +
              '<div class="row"><label style="font-size:9px">Hue Shift</label><input type="range" data-ifpat-range="'+item.id+'-'+pat.id+'" data-patkey="hueShift" min="-1" max="1" step="0.01" value="'+pat.hueShift+'"><input type="number" class="val" value="'+pat.hueShift.toFixed(2)+'" style="width:40px"></div>' +
              '<div class="row"><label style="font-size:9px">Hue Opacity</label><input type="range" data-ifpat-range="'+item.id+'-'+pat.id+'" data-patkey="hueOpacity" min="0" max="1" step="0.01" value="'+pat.hueOpacity+'"><input type="number" class="val" value="'+pat.hueOpacity.toFixed(2)+'" style="width:40px"></div>' +
              '<div class="row" style="align-items:flex-start"><label style="font-size:9px;margin-top:2px">Grid</label>' +
              '<textarea data-ifpat-grid="'+item.id+'-'+pat.id+'" rows="2" style="flex:1;background:#111;color:#ccc;border:1px solid rgba(255,255,255,0.15);border-radius:3px;padding:3px;font-size:10px;resize:vertical">'+gridStr+'</textarea></div>' +
              '</div></div>';
          }).join('');

          opPatHTML = '<div class="row"><label style="font-size:10px">Seed</label>' +
            '<input type="range" data-ifi="'+i+'" data-ifid="'+item.id+'" data-ifkey="patternSeed" min="0" max="1000" step="1" value="'+(item.patternSeed||0)+'">' +
            '<input type="number" class="val" data-ifi="'+i+'" data-ifid="'+item.id+'" data-ifkey="patternSeed" value="'+(item.patternSeed||0)+'" min="0" max="1000" step="1"></div>' +
            '<div class="row"><label style="font-size:10px">Group By</label>' +
            '<div class="seg-bar"><button class="'+((item.patternMode||0)===0?'active':'')+'" onclick="setInstFilterPatMode('+i+','+item.id+',0)">Color</button>' +
            '<button class="'+((item.patternMode||0)===1?'active':'')+'" onclick="setInstFilterPatMode('+i+','+item.id+',1)">Shape</button></div></div>' +
            '<div style="margin:4px 0"><button class="small" onclick="addInstFilterPat('+i+','+item.id+')" style="font-size:10px">+ Add Pattern</button></div>' +
            '<div id="ifpat-list-'+i+'-'+item.id+'">'+patListHTML+'</div>';
        }

        // Gradient editor HTML for type 15
        var gradEditorHTML = '';
        if (cat.hasGradEditor) {
          var gDir = item.gradDir || 0;
          gradEditorHTML = '<div class="grad-editor" id="ifgrad-editor-'+i+'-'+item.id+'">' +
            '<canvas class="grad-bar" id="ifgrad-bar-'+i+'-'+item.id+'" height="24"></canvas>' +
            '<div class="grad-track" id="ifgrad-track-'+i+'-'+item.id+'"></div>' +
            '<div class="grad-hint" style="font-size:9px;color:rgba(255,255,255,0.25);margin-top:2px">tap bar to add · tap handle to pick · double-tap to delete</div>' +
            '</div>' +
            '<div class="seg-bar" style="margin-top:4px">' +
            '<button id="ifgrad-dir0-'+i+'-'+item.id+'" class="'+(gDir===0?'active':'')+'" onclick="setInstFilterGradDir('+i+','+item.id+',0)">0°</button>' +
            '<button id="ifgrad-dir1-'+i+'-'+item.id+'" class="'+(gDir===1?'active':'')+'" onclick="setInstFilterGradDir('+i+','+item.id+',1)">45°</button>' +
            '<button id="ifgrad-dir2-'+i+'-'+item.id+'" class="'+(gDir===2?'active':'')+'" onclick="setInstFilterGradDir('+i+','+item.id+',2)">90°</button>' +
            '<button id="ifgrad-dir3-'+i+'-'+item.id+'" class="'+(gDir===3?'active':'')+'" onclick="setInstFilterGradDir('+i+','+item.id+',3)">135°</button>' +
            '<button id="ifgrad-dir4-'+i+'-'+item.id+'" class="'+(gDir===4?'active':'')+'" onclick="setInstFilterGradDir('+i+','+item.id+',4)">Radial</button>' +
            '</div>' +
            '<div id="ifgrad-radial-'+i+'-'+item.id+'" style="display:'+(gDir===4?'':'none')+'">' +
            '<div class="row"><label style="font-size:10px">Center X</label><input type="range" data-ifi="'+i+'" data-ifid="'+item.id+'" data-ifkey="radialCenterX" min="-1" max="1" step="0.01" value="'+(item.radialCenterX||0)+'"><input type="number" class="val" data-ifi="'+i+'" data-ifid="'+item.id+'" data-ifkey="radialCenterX" value="'+((item.radialCenterX||0).toFixed(2))+'" min="-1" max="1" step="0.01"></div>' +
            '<div class="row"><label style="font-size:10px">Center Y</label><input type="range" data-ifi="'+i+'" data-ifid="'+item.id+'" data-ifkey="radialCenterY" min="-1" max="1" step="0.01" value="'+(item.radialCenterY||0)+'"><input type="number" class="val" data-ifi="'+i+'" data-ifid="'+item.id+'" data-ifkey="radialCenterY" value="'+((item.radialCenterY||0).toFixed(2))+'" min="-1" max="1" step="0.01"></div>' +
            '<div class="row"><label style="font-size:10px">Scale</label><input type="range" data-ifi="'+i+'" data-ifid="'+item.id+'" data-ifkey="radialScale" min="0" max="4" step="0.01" value="'+(item.radialScale||1)+'"><input type="number" class="val" data-ifi="'+i+'" data-ifid="'+item.id+'" data-ifkey="radialScale" value="'+((item.radialScale||1).toFixed(2))+'" min="0" max="4" step="0.01"></div>' +
            '</div>';
        }

        return '<div class="group-card" style="margin-bottom:6px" data-ifcard="'+i+'-'+item.id+'">' +
          '<div class="group-header" style="display:flex;align-items:center;gap:3px">' +
          chev + '<span class="g-title" style="flex:1;font-size:11px">'+cat.name+'</span>' +
          upB + dnB + duB +
          '<button class="btn-circ danger" onclick="removeInstFilter('+i+','+item.id+')" title="Remove">\u2715</button>' +
          '<button class="toggle-active'+(item.enabled!==false?' on':'')+'" id="if-toggle-'+i+'-'+item.id+'" onclick="toggleInstFilter('+i+','+item.id+')" style="width:32px;min-width:32px;height:16px"></button>' +
          '</div>' +
          '<div class="group-body'+(item.enabled===false?' controls-disabled':'')+'" id="if-body-'+i+'-'+item.id+'" style="display:'+(isC?'none':'')+'">' +
          blendHTML + colorHTML + opPatHTML + gradEditorHTML + slidersHTML + '</div></div>';
      }).join('');

      wireInstFilterStack(i);
      // Initialize gradient editors for gradient fill filters
      var instF = inst.filters || [];
      instF.forEach(function(item) {
        if (item.type === 15) initFilterGradEditor(i, item);
      });
    }

    function wireInstFilterStack(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      var stack = inst.filters || [];
      var list = document.getElementById('filter-stack-list_'+i);
      if (!list) return;
      list.querySelectorAll('input[data-ifid]').forEach(function(el) {
        var id = parseInt(el.dataset.ifid);
        var key = el.dataset.ifkey;
        var item = stack.find(function(e){ return e.id === id; });
        if (!item) return;
        var isRange = el.type === 'range';
        var pair = isRange
          ? el.parentElement.querySelector('input[type="number"][data-ifkey="'+key+'"][data-ifid="'+id+'"]')
          : el.parentElement.querySelector('input[type="range"][data-ifkey="'+key+'"][data-ifid="'+id+'"]');
        el.addEventListener(isRange ? 'input' : 'change', function() {
          var v = parseFloat(el.value);
          if (isNaN(v)) return;
          if (!isRange) v = Math.max(parseFloat(el.min), Math.min(parseFloat(el.max), v));
          item[key] = v;
          if (pair) pair.value = Number.isInteger(parseFloat(el.step)) ? Math.round(v) : v.toFixed(2);
          pixInstDirty(i);
        });
      });
      // Wire opacity pattern controls
      list.querySelectorAll('[data-ifpat-toggle]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var parts = btn.dataset.ifpatToggle.split('-');
          var filterId = parseInt(parts[0]), patId = parseInt(parts[1]);
          var item = stack.find(function(e){ return e.id === filterId; });
          if (!item || !item.patterns) return;
          var pat = item.patterns.find(function(p){ return p.id === patId; });
          if (!pat) return;
          pat.active = !pat.active;
          btn.classList.toggle('on', pat.active);
          btn.closest('.group-card').querySelector('.group-body').classList.toggle('controls-disabled', !pat.active);
          pixInstDirty(i);
        });
      });
      list.querySelectorAll('[data-ifpat-del]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var parts = btn.dataset.ifpatDel.split('-');
          var filterId = parseInt(parts[0]), patId = parseInt(parts[1]);
          var item = stack.find(function(e){ return e.id === filterId; });
          if (!item || !item.patterns) return;
          item.patterns = item.patterns.filter(function(p){ return p.id !== patId; });
          renderInstFilterStack(i);
          pixInstDirty(i);
        });
      });
      list.querySelectorAll('[data-ifpat-range]').forEach(function(el) {
        var parts = el.dataset.ifpatRange.split('-');
        var filterId = parseInt(parts[0]), patId = parseInt(parts[1]);
        var key = el.dataset.patkey;
        var item = stack.find(function(e){ return e.id === filterId; });
        if (!item || !item.patterns) return;
        var pat = item.patterns.find(function(p){ return p.id === patId; });
        if (!pat) return;
        el.addEventListener('input', function() {
          pat[key] = parseFloat(el.value);
          var numEl = el.parentElement.querySelector('input[type="number"]');
          if (numEl) numEl.value = pat[key].toFixed(2);
          pixInstDirty(i);
        });
      });
      list.querySelectorAll('[data-ifpat-grid]').forEach(function(el) {
        var parts = el.dataset.ifpatGrid.split('-');
        var filterId = parseInt(parts[0]), patId = parseInt(parts[1]);
        var item = stack.find(function(e){ return e.id === filterId; });
        if (!item || !item.patterns) return;
        var pat = item.patterns.find(function(p){ return p.id === patId; });
        if (!pat) return;
        el.addEventListener('change', function() {
          pat.grid = el.value.trim().split('\n').map(function(r){ return r.split(',').map(Number); });
          pixInstDirty(i);
        });
      });
      list.querySelectorAll('select[data-ifid]').forEach(function(sel) {
        var id = parseInt(sel.dataset.ifid);
        var item = stack.find(function(e){ return e.id === id; });
        if (!item) return;
        sel.addEventListener('change', function() {
          if (sel.dataset.ifkey === '_blendMode') {
            item.blendMode = parseInt(sel.value);
            renderInstFilterStack(i);
          }
          pixInstDirty(i);
        });
      });
    }

    /* ── Per-instance toggle/set functions ──────────── */
    function syncActiveShapeBack(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst || !inst.shapes) return;
      var sh = inst.shapes[inst.activeShapeIdx || 0];
      if (!sh) return;
      // Sync instance-level shape props back to active shape
      var keys = ['pixelShape','shapeMargin','shapeBleed','shapeSmoothness','shapeScale','forceSquare',
        'sdfAffectScale','sdfMinScale','sdfMaxScale','sdfAffectRotate','sdfMinRotate','sdfMaxRotate',
        'sdfAffectOffset','sdfMinOffset','sdfMaxOffset',
        'sdfAffectAlpha','sdfMinAlpha','sdfMaxAlpha',
        'imgPixelEnabled','imgPixelCols','imgPixelRows','imgPixelOpacity','imgPixelBlend','imgPixelHueOff','imgPixelMask',
        'imgPixelAffectScale','imgPixelMinScale','imgPixelMaxScale',
        'imgPixelAffectRotate','imgPixelMinRotate','imgPixelMaxRotate',
        'imgPixelAffectOffset','imgPixelMinOffset','imgPixelMaxOffset',
        'twoImage','imgPixel2Enabled','imgPixel2Cols','imgPixel2Rows','imgPixel2Opacity','imgPixel2Blend',
        'imgPixel2HueOff','imgPixel2Mask','imgPixel2AffectScale','imgPixel2AffectRotate','imgPixel2AffectOffset',
        'imgPixel2MinScale','imgPixel2MaxScale','imgPixel2MinRotate','imgPixel2MaxRotate',
        'imgPixel2MinOffset','imgPixel2MaxOffset',
        'filters','filtersEnabled','blendMode','blendHueOff','blendOpacity','cellColorMode','customCellColor','cellGradStops'];
      keys.forEach(function(k) { if (inst[k] !== undefined) sh[k] = inst[k]; });
    }

    function pixInstDirty(i) {
      syncActiveShapeBack(i);
      var inst = window.shaderParams.pixelateInstances[i];
      if (inst && inst.enabled === false) return;
      window.shaderDirty = true;
    }

    function setCellColorMode(i, mode) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      inst.cellColorMode = mode;
      syncKeyToShape(i, 'cellColorMode', mode);
      var b0 = document.getElementById('btn-cell-color_'+i);
      var b1 = document.getElementById('btn-cell-custom_'+i);
      var b2 = document.getElementById('btn-cell-gradient_'+i);
      if (b0) b0.classList.toggle('active', mode===0);
      if (b1) b1.classList.toggle('active', mode===1);
      if (b2) b2.classList.toggle('active', mode===2);
      var customRect = document.getElementById('cellcustom-rect_'+i);
      if (customRect) customRect.style.display = mode===1 ? '' : 'none';
      var ed = document.getElementById('cellgrad-editor_'+i);
      if (ed) {
        ed.style.display = mode===2 ? '' : 'none';
        if (mode===2) initCellGradEditor(i);
      }
      pixInstDirty(i);
    }

    function setPixForceSquare(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      inst.forceSquare = !inst.forceSquare;
      var btn = document.getElementById('btn-force-square_'+i);
      if (btn) btn.classList.toggle('on', !!inst.forceSquare);
      pixInstDirty(i);
    }

    function setPixQuadReverse(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      inst.quadReverse = !inst.quadReverse;
      var btn = document.getElementById('btn-quad-reverse_'+i);
      if (btn) btn.classList.toggle('on', inst.quadReverse);
      window.shaderDirty = true;
    }

    function togglePixQuadCurve(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      inst.quadCurveEnabled = !inst.quadCurveEnabled;
      if (inst.quadCurveEnabled && (!inst.quadCurvePoints || inst.quadCurvePoints.length < 2)) {
        inst.quadCurvePoints = [{x:0,y:0},{x:1,y:1}];
      }
      var btn = document.getElementById('btn-quad-curve_'+i);
      if (btn) btn.classList.toggle('on', !!inst.quadCurveEnabled);
      var ed = document.getElementById('quad-curve-editor_'+i);
      if (ed) ed.style.display = inst.quadCurveEnabled ? '' : 'none';
      if (inst.quadCurveEnabled) initQuadCurveEditor(i);
      window.shaderDirty = true;
    }

    function initQuadCurveEditor(instIdx) {
      var inst = window.shaderParams.pixelateInstances[instIdx];
      if (!inst) return;
      var canvas = document.getElementById('quad-curve-canvas-'+instIdx);
      if (!canvas) return;
      if (!inst.quadCurvePoints || inst.quadCurvePoints.length < 2) {
        inst.quadCurvePoints = [{x:0,y:0},{x:1,y:1}];
      }
      var dpr = window.devicePixelRatio || 1;
      function resize() {
        var cssW = canvas.clientWidth || 280;
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssW * dpr);
        draw();
      }
      function sortedPts() { return inst.quadCurvePoints.slice().sort(function(a,b){return a.x-b.x;}); }
      function smoothInterp(pts, x) {
        // Smoothstep interpolation between adjacent points (matches engine bake)
        var lo = pts[0], hi = pts[pts.length-1];
        for (var j = 0; j < pts.length-1; j++) {
          if (x >= pts[j].x && x <= pts[j+1].x) { lo = pts[j]; hi = pts[j+1]; break; }
        }
        var range = hi.x - lo.x;
        var f = range < 0.0001 ? 0 : (x - lo.x) / range;
        var sm = f * f * (3 - 2 * f);
        return lo.y + (hi.y - lo.y) * sm;
      }
      function draw() {
        var ctx = canvas.getContext('2d');
        var w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        // Background
        ctx.fillStyle = 'rgba(20,20,28,0.0)';
        ctx.fillRect(0, 0, w, h);
        // Grid 4x4
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1 * dpr;
        for (var i = 1; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(i * w / 4, 0); ctx.lineTo(i * w / 4, h); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, i * h / 4); ctx.lineTo(w, i * h / 4); ctx.stroke();
        }
        // Diagonal reference (input = output)
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.moveTo(0, h); ctx.lineTo(w, 0); ctx.stroke();
        // Min/Max clamp regions (shaded)
        var mn = inst.quadCurveMin != null ? inst.quadCurveMin : 0;
        var mx = inst.quadCurveMax != null ? inst.quadCurveMax : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, mn * w, h);
        ctx.fillRect(mx * w, 0, (1 - mx) * w, h);
        // Curve
        var pts = sortedPts();
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        for (var i = 0; i <= 100; i++) {
          var x = i / 100;
          var y = smoothInterp(pts, x);
          var px = x * w, py = (1 - y) * h;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        // Control point handles
        pts.forEach(function(p) {
          var px = p.x * w, py = (1 - p.y) * h;
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.lineWidth = 1.5 * dpr;
          ctx.beginPath();
          ctx.rect(px - 5*dpr, py - 5*dpr, 10*dpr, 10*dpr);
          ctx.fill();
          ctx.stroke();
        });
      }
      function pickPoint(cx, cy) {
        var rect = canvas.getBoundingClientRect();
        var px = (cx - rect.left) / rect.width;
        var py = 1 - (cy - rect.top) / rect.height;
        var hitIdx = -1;
        var bestDist = 0.04; // 4% click tolerance
        for (var i = 0; i < inst.quadCurvePoints.length; i++) {
          var p = inst.quadCurvePoints[i];
          var d = Math.max(Math.abs(p.x - px), Math.abs(p.y - py));
          if (d < bestDist) { bestDist = d; hitIdx = i; }
        }
        return { x: px, y: py, idx: hitIdx };
      }
      function bakeAndUpdate() {
        // Engine reads inst.quadCurvePoints directly during render
        window.shaderDirty = true;
        draw();
      }
      function onDown(e) {
        e.preventDefault();
        var cx, cy;
        if (e.touches) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
        else { cx = e.clientX; cy = e.clientY; }
        var hit = pickPoint(cx, cy);
        var idx = hit.idx;
        if (idx < 0) {
          // Add new point at click location
          inst.quadCurvePoints.push({x: Math.max(0,Math.min(1,hit.x)), y: Math.max(0,Math.min(1,hit.y))});
          idx = inst.quadCurvePoints.length - 1;
          bakeAndUpdate();
        }
        var dragIdx = idx;
        var startMs = Date.now();
        var hasMoved = false;
        function onMove(ev) {
          ev.preventDefault();
          var mx, my;
          if (ev.touches) { mx = ev.touches[0].clientX; my = ev.touches[0].clientY; }
          else { mx = ev.clientX; my = ev.clientY; }
          var rect = canvas.getBoundingClientRect();
          var nx = Math.max(0, Math.min(1, (mx - rect.left) / rect.width));
          var ny = Math.max(0, Math.min(1, 1 - (my - rect.top) / rect.height));
          inst.quadCurvePoints[dragIdx].x = nx;
          inst.quadCurvePoints[dragIdx].y = ny;
          hasMoved = true;
          bakeAndUpdate();
        }
        function onUp(ev) {
          ev && ev.preventDefault && ev.preventDefault();
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          window.removeEventListener('touchmove', onMove);
          window.removeEventListener('touchend', onUp);
          // Double-click on existing handle (no drag, quick second click): delete
          if (!hasMoved && (Date.now() - startMs) < 300) {
            // Could implement double-click delete with timer; for now just no-op
          }
        }
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchmove', onMove, {passive:false});
        window.addEventListener('touchend', onUp);
      }
      function onDblClick(e) {
        e.preventDefault();
        var hit = pickPoint(e.clientX, e.clientY);
        if (hit.idx >= 0 && inst.quadCurvePoints.length > 2) {
          inst.quadCurvePoints.splice(hit.idx, 1);
          bakeAndUpdate();
        }
      }
      canvas.addEventListener('mousedown', onDown);
      canvas.addEventListener('touchstart', onDown, {passive:false});
      canvas.addEventListener('dblclick', onDblClick);
      // Use ResizeObserver to redraw when canvas finally has a size
      if (!canvas._quadCurveObs && typeof ResizeObserver !== 'undefined') {
        canvas._quadCurveObs = new ResizeObserver(function() { resize(); });
        canvas._quadCurveObs.observe(canvas);
      }
      resize();
      // Wire min/max sliders to redraw the editor's clamp shading
      var sMin = document.getElementById('sQuadCurveMin_'+instIdx);
      var sMax = document.getElementById('sQuadCurveMax_'+instIdx);
      if (sMin) sMin.addEventListener('input', function(){ draw(); });
      if (sMax) sMax.addEventListener('input', function(){ draw(); });
    }

    function setPixMaintainThickness(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      inst.maintainThickness = !inst.maintainThickness;
      var btn = document.getElementById('btn-maintain-thickness_'+i);
      if (btn) btn.classList.toggle('on', !!inst.maintainThickness);
      pixInstDirty(i);
    }

    function setPixEnabled(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      inst.enabled = !(inst.enabled !== false);
      var btn = document.getElementById('btn-pix-enabled_' + i);
      if (btn) btn.classList.toggle('on', inst.enabled !== false);
      var body = document.getElementById('pix-body_' + i);
      if (body) body.classList.toggle('controls-disabled', !inst.enabled);
      if (window.forceResize) window.forceResize();
      window.shaderDirty = true;
    }

    function setPixRes(i, r) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      inst.resolution = r;
      [1,2,4,8,16].forEach(function(rv) {
        var btn = document.getElementById('btn-pix-res-'+rv+'_'+i);
        if (btn) btn.classList.toggle('active', rv === r);
      });
      window.rebuildInstanceFBOs();
      window.shaderDirty = true;
    }

    function setPixOverrideRes(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      inst.overrideResolution = !inst.overrideResolution;
      var btn = document.getElementById('btn-override-res_'+i);
      if (btn) btn.classList.toggle('on', !!inst.overrideResolution);
      if (window.forceResize) window.forceResize();
      window.shaderDirty = true;
    }

    function setPixGapFiltered(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      inst.gapFiltered = !inst.gapFiltered;
      var btn = document.getElementById('btn-gap-filtered_'+i);
      if (btn) btn.classList.toggle('on', !!inst.gapFiltered);
      pixInstDirty(i);
    }

    function setPixGapEnabled(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      inst.gapEnabled = !(inst.gapEnabled !== false);
      var btn = document.getElementById('btn-gap-toggle_'+i);
      if (btn) btn.classList.toggle('on', inst.gapEnabled !== false);
      var ctrl = document.getElementById('gap-controls_'+i);
      if (ctrl) ctrl.classList.toggle('controls-disabled', inst.gapEnabled === false);
      pixInstDirty(i);
    }

    function setPixSampleGeneral(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      inst.sampleFromGeneral = !inst.sampleFromGeneral;
      var btn = document.getElementById('btn-sample-general_'+i);
      if (btn) btn.classList.toggle('on', !!inst.sampleFromGeneral);
      pixInstDirty(i);
    }

    function setPixInstBlend(i, v) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      inst.instanceBlendMode = parseInt(v);
      var hueCtrl = document.getElementById('instblend-hue-controls_'+i);
      if (hueCtrl) hueCtrl.style.display = (inst.instanceBlendMode === 9) ? '' : 'none';
      pixInstDirty(i);
    }

    function setPixOblique(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      inst.oblique = !inst.oblique;
      var btn = document.getElementById('btn-oblique_'+i);
      if (btn) btn.classList.toggle('active', inst.oblique);
      pixInstDirty(i);
    }

    function toggleSdfAffect(i, which) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      var key = 'sdfAffect' + which.charAt(0).toUpperCase() + which.slice(1);
      inst[key] = !inst[key];
      syncKeyToShape(i, key, inst[key]);
      var btn = document.getElementById('btn-sdf-'+which+'_'+i);
      if (btn) btn.classList.toggle('active', !!inst[key]);
      var ctrl = document.getElementById('sdf-'+which+'-controls_'+i);
      if (ctrl) ctrl.style.display = inst[key] ? '' : 'none';
      pixInstDirty(i);
    }

    function setPixTwoImage(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      inst.twoImage = !inst.twoImage;
      var btn = document.getElementById('btn-twoimage_'+i);
      if (btn) btn.classList.toggle('on', !!inst.twoImage);
      var hdrBtn = document.getElementById('btn-twoimage-hdr_'+i);
      if (hdrBtn) { hdrBtn.classList.toggle('on', !!inst.twoImage); hdrBtn.style.background = inst.twoImage ? 'rgba(255,255,255,0.35)' : ''; }
      // Only hide/show diamond section — octagon image controls always visible
      var dia = document.getElementById('imgshape-diamond_'+i);
      if (dia) dia.style.display = inst.twoImage ? '' : 'none';
      // Show "OCTAGON IMAGE" label only when dual is on (otherwise it's the only image, no label needed)
      var octLabel = document.getElementById('imgshape-oct-label_'+i);
      if (octLabel) octLabel.style.display = inst.twoImage ? '' : 'none';
      if (inst.twoImage) inst.imgPixel2Enabled = true;
      pixInstDirty(i);
    }

    function setPixPassthrough(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      inst.passthrough = !inst.passthrough;
      var btn = document.getElementById('btn-passthrough_'+i);
      if (btn) btn.classList.toggle('on', !!inst.passthrough);
      pixInstDirty(i);
    }

    function setPixFillMode(i, m) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst) return;
      inst.fillMode = m;
      var bc = document.getElementById('btn-fill-color_'+i);
      var bg = document.getElementById('btn-fill-gradient_'+i);
      if (bc) bc.classList.toggle('active', m === 0);
      if (bg) bg.classList.toggle('active', m === 1);
      var cc = document.getElementById('fill-color-controls_'+i);
      var gc = document.getElementById('fill-gradient-controls_'+i);
      if (cc) cc.style.display = m === 0 ? '' : 'none';
      if (gc) gc.style.display = m === 1 ? '' : 'none';
      // Re-init gradient bar if switching to gradient mode
      if (m === 1) setTimeout(function(){ initPixShapeGrad(i); }, 30);
      pixInstDirty(i);
    }

    function setPixQuad(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      inst.quadEnabled = !inst.quadEnabled;
      var btn = document.getElementById('btn-quadtree_'+i);
      if (btn) btn.classList.toggle('active', inst.quadEnabled);
      var ctrl = document.getElementById('quadtree-controls_'+i);
      if (ctrl) ctrl.style.display = inst.quadEnabled ? '' : 'none';
      pixInstDirty(i);
    }

    function setPixWeave(i, m) {
      var inst = window.shaderParams.pixelateInstances[i];
      inst.weaveMode = m;
      ['none','brick','weave','hex','oct'].forEach(function(id,idx) {
        var btn = document.getElementById('btn-weave-'+id+'_'+i);
        if (btn) btn.classList.toggle('active', idx === m);
      });
      // Shape section always enabled — user can choose any shape in any weave mode
      var dr = document.getElementById('gen-diamond-row_'+i);
      if (dr) dr.style.display = m === 4 ? '' : 'none';
      var twHdr = document.getElementById('twoimage-header_'+i);
      if (twHdr) twHdr.style.display = (m === 4 && inst.pixelShape === 9) ? 'flex' : 'none';
      var inst2 = window.shaderParams.pixelateInstances[i];
      var ar = document.getElementById('oct-diamond-imgpixel_'+i);
      if (ar) ar.style.display = (m === 4 && inst2 && inst2.twoImage) ? '' : 'none';
      pixInstDirty(i);
    }

    function setPixGenDiamond(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      inst.genDiamond = !inst.genDiamond;
      var btn = document.getElementById('btn-gen-diamond_'+i);
      if (btn) btn.classList.toggle('active', inst.genDiamond);
      pixInstDirty(i);
    }

    function setPixShape(i, s) {
      var inst = window.shaderParams.pixelateInstances[i];
      inst.pixelShape = s;
      syncKeyToShape(i, 'pixelShape', s);
      ['none','square','pill','diamond','pointed','hex','oct','cross','image'].forEach(function(id) {
        var btn = document.getElementById('btn-shape-'+id+'_'+i);
        if (btn) btn.classList.remove('active');
      });
      var valToId = {0:'none',1:'pill',2:'diamond',3:'square',4:'pointed',5:'hex',6:'oct',7:'cross',9:'image'};
      var activeBtn = document.getElementById('btn-shape-'+(valToId[s]||'none')+'_'+i);
      if (activeBtn) activeBtn.classList.add('active');
      var ctrl = document.getElementById('shape-controls_'+i);
      if (ctrl) ctrl.style.display = s > 0 ? '' : 'none';
      var sdfCtrl = document.getElementById('sdf-only-controls_'+i);
      if (sdfCtrl) sdfCtrl.style.display = (s > 0 && s !== 9) ? '' : 'none';
      var imgCtrl = document.getElementById('imgshape-controls_'+i);
      if (imgCtrl) imgCtrl.style.display = s === 9 ? '' : 'none';
      if (s === 9) { inst.imgPixelEnabled = true; }
      var magRow = document.getElementById('shape-magnitude-row_'+i);
      if (magRow) magRow.style.display = s === 9 ? 'none' : '';
      var hueRow = document.getElementById('shape-hueoff-row_'+i);
      if (hueRow) hueRow.style.display = (inst.blendMode === 9) ? '' : 'none';
      var twHdr = document.getElementById('twoimage-header_'+i);
      if (twHdr) twHdr.style.display = (s === 9 && inst.weaveMode === 4) ? 'flex' : 'none';
      if (s > 0) { setTimeout(function(){ initPixShapeGrad(i); }, 30); }
      pixInstDirty(i);
    }

    // Square sync removed — cross shapes use max(w,h) internally in the shader

    function setPixTileGrad(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      inst.tileGradEnabled = !(inst.tileGradEnabled !== false);
      var btn = document.getElementById('btn-tilegrad-toggle_'+i);
      if (btn) btn.classList.toggle('on', inst.tileGradEnabled !== false);
      var ctrl = document.getElementById('tilegrad-controls_'+i);
      if (ctrl) ctrl.classList.toggle('controls-disabled', !inst.tileGradEnabled);
      pixInstDirty(i);
    }

    function setPixSGDir(i, d) {
      var inst = window.shaderParams.pixelateInstances[i];
      inst.shapeGradDir = d;
      [0,1,2,3,4].forEach(function(idx) {
        var btn = document.getElementById('btn-sgdir-'+idx+'_'+i);
        if (btn) btn.classList.toggle('active', idx === d);
      });
      var rc = document.getElementById('radial-controls_'+i);
      if (rc) rc.style.display = d === 4 ? '' : 'none';
      window.shaderDirty = true;
    }

    function togglePixOpPatterns(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      inst.opPatternsEnabled = !(inst.opPatternsEnabled !== false);
      var btn = document.getElementById('btn-oppattern-toggle_'+i);
      if (btn) btn.classList.toggle('on', inst.opPatternsEnabled !== false);
      var ctrl = document.getElementById('oppattern-controls_'+i);
      if (ctrl) ctrl.classList.toggle('controls-disabled', !inst.opPatternsEnabled);
      uploadAllOpPatterns();
      window.shaderDirty = true;
    }

    function setPixOpPatMode(i, m) {
      var inst = window.shaderParams.pixelateInstances[i];
      inst.opPatternMode = m;
      var cb = document.getElementById('btn-oppat-color_'+i);
      var sb = document.getElementById('btn-oppat-shape_'+i);
      if (cb) cb.classList.toggle('active', m === 0);
      if (sb) sb.classList.toggle('active', m === 1);
      window.shaderDirty = true;
    }

    function togglePixImgPixel(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      inst.imgPixelEnabled = !inst.imgPixelEnabled;
      var btn = document.getElementById('btn-imgpixel-toggle_'+i);
      if (btn) btn.classList.toggle('on', inst.imgPixelEnabled);
      var ctrl = document.getElementById('imgpixel-controls_'+i);
      if (ctrl) ctrl.classList.toggle('controls-disabled', !inst.imgPixelEnabled);
      window.shaderDirty = true;
    }

    function togglePixImgPixelAffect(i, type) {
      var inst = window.shaderParams.pixelateInstances[i];
      var key = 'imgPixelAffect' + type.charAt(0).toUpperCase() + type.slice(1);
      inst[key] = !inst[key];
      syncKeyToShape(i, key, inst[key]);
      var btn = document.getElementById('btn-imgpixel-'+type+'_'+i);
      if (btn) btn.classList.toggle('active', inst[key]);
      var ctrl = document.getElementById('imgpixel-'+type+'-controls_'+i);
      if (ctrl) ctrl.style.display = inst[key] ? '' : 'none';
      window.shaderDirty = true;
    }

    function handlePixImgPixelUpload(event, i) {
      var file = event.target.files[0];
      if (!file) return;
      var inst = window.shaderParams.pixelateInstances[i];
      inst.imgPixelName = file.name;
      var nm = document.getElementById('imgPixelName_'+i);
      if (nm) nm.textContent = file.name;
      var reader = new FileReader();
      reader.onload = function(e) {
        inst.imgDataURL = e.target.result;
        var img = new Image();
        img.onload = function() {
          if (window.uploadInstanceImgPixelTex) window.uploadInstanceImgPixelTex(i, img);
          window.shaderDirty = true;
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function togglePixImgPixelMask(i, layer) {
      var inst = window.shaderParams.pixelateInstances[i];
      var key = layer === 2 ? 'imgPixel2Mask' : 'imgPixelMask';
      var btnId = layer === 2 ? 'btn-imgpixel2-mask_'+i : 'btn-imgpixel-mask_'+i;
      inst[key] = !inst[key];
      var btn = document.getElementById(btnId);
      if (btn) btn.classList.toggle('on', inst[key]);
      window.shaderDirty = true;
    }

    function togglePixImgPixel2(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      inst.imgPixel2Enabled = !inst.imgPixel2Enabled;
      var btn = document.getElementById('btn-imgpixel2-toggle_'+i);
      if (btn) btn.classList.toggle('on', inst.imgPixel2Enabled);
      var ctrl = document.getElementById('imgpixel2-controls_'+i);
      if (ctrl) ctrl.classList.toggle('controls-disabled', !inst.imgPixel2Enabled);
      window.shaderDirty = true;
    }

    function togglePixImgPixel2Affect(i, type) {
      var inst = window.shaderParams.pixelateInstances[i];
      var key = 'imgPixel2Affect' + type.charAt(0).toUpperCase() + type.slice(1);
      inst[key] = !inst[key];
      var btn = document.getElementById('btn-imgpixel2-'+type+'_'+i);
      if (btn) btn.classList.toggle('active', inst[key]);
      var ctrl = document.getElementById('imgpixel2-'+type+'-controls_'+i);
      if (ctrl) ctrl.style.display = inst[key] ? '' : 'none';
      window.shaderDirty = true;
    }

    function handlePixImgPixel2Upload(event, i) {
      var file = event.target.files[0];
      if (!file) return;
      var inst = window.shaderParams.pixelateInstances[i];
      inst.imgPixel2Name = file.name;
      var nm = document.getElementById('imgPixel2Name_'+i);
      if (nm) nm.textContent = file.name;
      var reader = new FileReader();
      reader.onload = function(e) {
        inst.imgData2URL = e.target.result;
        var img = new Image();
        img.onload = function() {
          if (window.uploadInstanceImgPixel2Tex) window.uploadInstanceImgPixel2Tex(i, img);
          window.shaderDirty = true;
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    /* ── Per-instance opacity pattern rendering ──────── */
    function addPixOpPattern(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      if (!inst.opPatterns) inst.opPatterns = [];
      if (inst.opPatterns.length >= 4) return;
      inst.opPatternIdCounter = (inst.opPatternIdCounter || 0) + 1;
      inst.opPatterns.push({ id: inst.opPatternIdCounter, active: true, grid: [[1,0],[0,1]], hueShift: 0.1, hueOpacity: 1.0 });
      renderPixOpPatterns(i);
      uploadAllOpPatterns();
    }

    function removePixOpPattern(i, patId) {
      var inst = window.shaderParams.pixelateInstances[i];
      inst.opPatterns = inst.opPatterns.filter(function(p){ return p.id !== patId; });
      renderPixOpPatterns(i);
      uploadAllOpPatterns();
    }

    function parseGridStr(str) {
      return str.trim().split('\n').map(function(row){
        return row.split(',').map(function(v){ return parseFloat(v.trim()) || 0; });
      });
    }

    function renderPixOpPatterns(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      var listEl = document.getElementById('oppattern-list_'+i);
      if (!listEl) return;
      var pats = inst.opPatterns || [];
      listEl.innerHTML = '';

      pats.forEach(function(pat) {
        var card = document.createElement('div');
        card.className = 'group-card';
        var gridStr = (pat.grid||[]).map(function(r){ return r.join(','); }).join('\n');
        card.innerHTML = '<div class="group-header"><span class="g-title">Pattern</span>' +
          '<button class="toggle-active'+(pat.active!==false?' on':'')+'" data-opaction="toggle" data-opid="'+pat.id+'"></button>' +
          '<div class="g-actions"><button class="small danger" data-opaction="del" data-opid="'+pat.id+'">✕</button></div></div>' +
          '<div class="group-body'+(pat.active!==false?'':' controls-disabled')+'">' +
          '<div class="row"><label>Hue Shift</label>' +
          '<input type="range" min="-1" max="1" step="0.01" value="'+pat.hueShift+'" data-opkey="hueShift" data-opid="'+pat.id+'">' +
          '<input type="number" class="val" id="ophs-'+pat.id+'_'+i+'" value="'+pat.hueShift.toFixed(2)+'"></div>' +
          '<div class="row"><label>Hue Opacity</label>' +
          '<input type="range" min="0" max="1" step="0.01" value="'+pat.hueOpacity+'" data-opkey="hueOpacity" data-opid="'+pat.id+'">' +
          '<input type="number" class="val" id="opho-'+pat.id+'_'+i+'" value="'+pat.hueOpacity.toFixed(2)+'"></div>' +
          '<div class="row" style="align-items:flex-start"><label style="margin-top:2px">Grid</label>' +
          '<textarea data-opkey="grid" data-opid="'+pat.id+'" rows="3" style="flex:1;background:#111;color:#ccc;border:1px solid rgba(255,255,255,0.15);border-radius:3px;padding:4px;font-size:11px;resize:vertical">'+gridStr+'</textarea></div>' +
          '</div>';
        listEl.appendChild(card);
      });

      // Wire toggle
      listEl.querySelectorAll('[data-opaction="toggle"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var patId = parseInt(btn.dataset.opid);
          var pat = pats.find(function(p){ return p.id===patId; });
          if (!pat) return;
          pat.active = !pat.active;
          btn.classList.toggle('on', pat.active);
          var body = btn.closest('.group-card').querySelector('.group-body');
          if(body) body.classList.toggle('controls-disabled', !pat.active);
          uploadAllOpPatterns();
        });
      });
      listEl.querySelectorAll('[data-opaction="del"]').forEach(function(btn) {
        btn.addEventListener('click', function(){ removePixOpPattern(i, parseInt(btn.dataset.opid)); });
      });
      listEl.querySelectorAll('input[type=range][data-opkey]').forEach(function(slider) {
        slider.addEventListener('input', function() {
          var patId = parseInt(slider.dataset.opid);
          var key = slider.dataset.opkey;
          var pat = pats.find(function(p){ return p.id===patId; });
          if (!pat) return;
          pat[key] = parseFloat(slider.value);
          var lbl = document.getElementById((key==='hueShift'?'ophs-':'opho-')+patId+'_'+i);
          if (lbl) { if (lbl.tagName==='INPUT') lbl.value=pat[key].toFixed(2); else lbl.textContent=pat[key].toFixed(2); }
          uploadAllOpPatterns();
        });
      });
      // Two-way: number val inputs update slider + param
      listEl.querySelectorAll('input[type=number].val').forEach(function(inp) {
        var range = inp.previousElementSibling;
        if (!range || range.type !== 'range') return;
        inp.addEventListener('change', function() {
          var v = parseFloat(inp.value);
          if (isNaN(v)) return;
          v = Math.max(parseFloat(range.min), Math.min(parseFloat(range.max), v));
          var patId = parseInt(range.dataset.opid);
          var key = range.dataset.opkey;
          var pat = pats.find(function(p){ return p.id===patId; });
          if (!pat) return;
          pat[key] = v; range.value = v; inp.value = v.toFixed(2);
          uploadAllOpPatterns();
        });
      });
      listEl.querySelectorAll('textarea[data-opkey="grid"]').forEach(function(ta) {
        ta.addEventListener('change', function() {
          var patId = parseInt(ta.dataset.opid);
          var pat = pats.find(function(p){ return p.id===patId; });
          if (!pat) return;
          pat.grid = parseGridStr(ta.value);
          uploadAllOpPatterns();
        });
      });
    }

    // Override uploadAllOpPatterns to use active instance
    function uploadAllOpPatterns() {
      var p = window.shaderParams;
      var instances = p.pixelateInstances;
      if (!instances || !instances.length) return;
      // Upload active instance's patterns (single opPatternTex is shared)
      var inst = instances[activePixelateTab] || instances[0];
      if (!inst) return;
      var opOn = inst.opPatternsEnabled !== false;
      var active = opOn ? (inst.opPatterns || []).filter(function(op){ return op.active !== false; }) : [];
      if (window.uploadOpPatterns) window.uploadOpPatterns(active);
      window.shaderDirty = true;
    }

    /* ── Per-instance shape gradient ──────────────────── */
    function initPixShapeGrad(i) {
      var inst = window.shaderParams.pixelateInstances[i];
      var barId = 'shapeGradBar_'+i;
      var trackId = 'shapeGradTrack_'+i;
      var bar = document.getElementById(barId);
      var track = document.getElementById(trackId);
      if (!bar || !track) return;

      function sortedStops() {
        return (inst.shapeGradStops||[]).slice().sort(function(a,b){ return a.pos-b.pos; });
      }
      function renderBar() {
        var w = bar.clientWidth || bar.parentElement && bar.parentElement.clientWidth || 200;
        if (w < 2) {
          // Layout not ready — retry after a frame
          requestAnimationFrame(renderBar);
          return;
        }
        bar.width = w;
        var ctx = bar.getContext('2d');
        var h = bar.height;
        var stops = sortedStops();
        var grad = ctx.createLinearGradient(0,0,w,0);
        stops.forEach(function(s){ grad.addColorStop(s.pos, s.hex); });
        ctx.fillStyle = grad;
        ctx.fillRect(0,0,w,h);
      }
      function syncToGL() {
        if (window.uploadShapeGradient) window.uploadShapeGradient(sortedStops());
      }
      function renderHandles() {
        track.innerHTML = '';
        var stops = inst.shapeGradStops || [];
        stops.forEach(function(stop, idx) {
          var handle = document.createElement('div');
          handle.className = 'grad-handle';
          handle.style.left = (stop.pos * 100) + '%';
          handle.style.background = stop.hex;
          handle.style.touchAction = 'none';
          var dragging = false, hasMoved = false, tapTimer = null, tapCount = 0;
          function startDrag(cx){ dragging=true; hasMoved=false; handle.classList.add('dragging'); }
          function moveDrag(cx) {
            if(!dragging) return; hasMoved=true;
            var tr = track.getBoundingClientRect();
            stop.pos = Math.max(0,Math.min(1,(cx-tr.left)/tr.width));
            handle.style.left = (stop.pos*100)+'%';
            renderBar(); syncToGL();
          }
          function endDrag() {
            var wasDrag = hasMoved; dragging=false; hasMoved=false; handle.classList.remove('dragging');
            if(!wasDrag){
              tapCount++;
              if(tapCount===1){
                tapTimer=setTimeout(function(){
                  tapCount=0;
                  openColorPicker(stop.hex,function(hex,r,g,b){
                    stop.r=r;stop.g=g;stop.b=b;stop.hex=hex;
                    handle.style.background=hex;
                    renderBar();syncToGL();
                  });
                },250);
              } else if(tapCount>=2){
                clearTimeout(tapTimer);tapCount=0;
                if(stops.length>2){ stops.splice(stops.indexOf(stop),1); renderHandles();renderBar();syncToGL(); }
              }
            } else { tapCount=0; }
          }
          handle.addEventListener('mousedown',function(e){
            e.preventDefault();e.stopPropagation();startDrag(e.clientX);
            var onM=function(ev){moveDrag(ev.clientX)};
            var onU=function(){endDrag();window.removeEventListener('mousemove',onM);window.removeEventListener('mouseup',onU)};
            window.addEventListener('mousemove',onM);window.addEventListener('mouseup',onU);
          });
          handle.addEventListener('touchstart',function(e){if(e.touches.length!==1)return;e.preventDefault();e.stopPropagation();startDrag(e.touches[0].clientX);},{passive:false});
          handle.addEventListener('touchmove',function(e){e.preventDefault();if(e.touches.length===1)moveDrag(e.touches[0].clientX);},{passive:false});
          handle.addEventListener('touchend',function(e){e.preventDefault();endDrag();},{passive:false});
          track.appendChild(handle);
        });
      }

      // Bar click: add stop
      bar.onclick = function(e) {
        var rect = e.target.getBoundingClientRect();
        var pos = (e.clientX - rect.left) / rect.width;
        var stops = sortedStops();
        var lo=stops[0],hi=stops[stops.length-1];
        for(var j=0;j<stops.length-1;j++){ if(pos>=stops[j].pos&&pos<=stops[j+1].pos){lo=stops[j];hi=stops[j+1];break;} }
        var range=hi.pos-lo.pos, f=range<0.0001?0:(pos-lo.pos)/range;
        var r=Math.round(lo.r+(hi.r-lo.r)*f),g=Math.round(lo.g+(hi.g-lo.g)*f),b=Math.round(lo.b+(hi.b-lo.b)*f);
        inst.shapeGradStops.push({pos:pos,r:r,g:g,b:b,hex:'#'+[r,g,b].map(function(c){return c.toString(16).padStart(2,'0');}).join('')});
        renderHandles();renderBar();syncToGL();
      };

      renderBar();
      renderHandles();
      // Don't call syncToGL() here — render loop uploads per-instance gradients

      // Re-render if the panel was hidden when first initialized (e.g. tab not active)
      if (typeof ResizeObserver !== 'undefined') {
        var _ro = new ResizeObserver(function(entries) {
          if (bar.clientWidth > 1) { renderBar(); _ro.disconnect(); }
        });
        _ro.observe(bar);
      }
    }

    // ══════════════════════════════════════════════════
    //  CANVAS SIZE
    // ══════════════════════════════════════════════════

