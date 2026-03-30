precision highp float;
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
                    float gT;
                    if(uShapeGradDir==0) gT = onorm.x + 0.5;
                    else if(uShapeGradDir==1) gT = onorm.y + 0.5;
                    else { vec2 rc=uRadialCenter*0.5; gT=clamp(length(onorm-rc)*2.0/max(uRadialScale,0.001),0.0,1.0); }
                    gT = clamp(gT, 0.0, 1.0);
                    vec3 gC = texture2D(uShapeGradTex, vec2(gT,0.5)).rgb;
                    octCol = mix(octCol, blendV(octCol, gC, uEmbossBlendMode), uShapeGradOpacity);
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
                        float gT;
                        if(uShapeGradDir==0) gT = dn.x * 0.5 + 0.5;
                        else if(uShapeGradDir==1) gT = dn.y * 0.5 + 0.5;
                        else { vec2 rc=uRadialCenter*0.5; gT=clamp(length(dn-rc)*2.0/max(uRadialScale,0.001),0.0,1.0); }
                        gT = clamp(gT, 0.0, 1.0);
                        vec3 gC = texture2D(uShapeGradTex, vec2(gT,0.5)).rgb;
                        diaCol = mix(diaCol, blendV(diaCol, gC, uEmbossBlendMode), uShapeGradOpacity);
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
                                color = mix(color, blendV(color,dImgC,uImgPixel2Blend), uImgPixel2Opacity);
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
                vec3 blended=blendV(color,imgColor,ipBlend);
                color=mix(color,blended,ipOp);
            }
        }
    }

    /* ── Tile Gradient (after image pixel) ─────────────────────── */
    if(uTileGradEnabled==1 && uPixelate==1 && uShapeGradOpacity>0.0){
        vec2 posInTile2=(obliqueUV-blk.uv)*iResolution;
        vec2 ss=blk.shapePx;
        float gradT;
        if(uShapeGradDir==0){
            gradT=blk.isWarp?(posInTile2.y/ss.y)+0.5:(posInTile2.x/ss.x)+0.5;
        }else if(uShapeGradDir==1){
            gradT=blk.isWarp?(posInTile2.x/ss.x)+0.5:(posInTile2.y/ss.y)+0.5;
        }else{
            vec2 norm=posInTile2/ss;
            vec2 center=uRadialCenter*0.5;
            float dist=length(norm-center)*2.0/max(uRadialScale,0.001);
            gradT=clamp(dist,0.0,1.0);
        }
        gradT=clamp(gradT,0.0,1.0);
        vec3 gCol=texture2D(uShapeGradTex,vec2(gradT,0.5)).rgb;
        color=mix(color,blendV(color,gCol,uEmbossBlendMode),uShapeGradOpacity);
    }

    // Dither to break 8-bit banding
    vec2 ditherUV = gl_FragCoord.xy;
    float d1 = fract(sin(dot(ditherUV, vec2(12.9898,78.233))) * 43758.5453);
    float d2 = fract(sin(dot(ditherUV, vec2(63.7264,10.873))) * 43758.5453);
    float dither = (d1 + d2 - 1.0) / 255.0;
    vec3 finalColor = grade(color) + vec3(dither);

    gl_FragColor=vec4(finalColor,1.0);
}
