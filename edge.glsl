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
uniform int       uOblique;
uniform int       uBandOutline;
uniform vec3      uGapColor;
uniform float     uGapOpacity;
uniform sampler2D uShapeGradTex;
uniform float     uShapeGradOpacity;
uniform int       uShapeGradDir;
uniform vec2      uRadialCenter;      // radial gradient center offset (-1 to 1)
uniform float     uRadialScale;       // radial gradient scale (0-2)
uniform int       uEmbossBlendMode; // same blend mode set as banding

uniform float     uGradeHue;
uniform float     uGradeSat;
uniform float     uGradeVal;
uniform float     uGradeContrast;

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

vec2 quadtreeGrid(vec2 rawUV, vec2 baseGrid) {
    if(uQuadEnabled==0 || uQuadSteps <= 1) return baseGrid;

    // Sample scene at this pixel's base grid center
    vec2 baseUV = baseGrid / iResolution;
    vec2 baseCell = floor(rawUV / baseUV);
    vec2 baseCenter = (baseCell + 0.5) * baseUV;
    float lum = dot(texture2D(uSceneTex, baseCenter).rgb, vec3(0.299, 0.587, 0.114));
    lum = clamp(lum, 0.0, 1.0);

    // Map luminance to a level: 0=smallest, steps-1=largest
    int lvl = int(floor(lum * float(uQuadSteps)));
    if(lvl >= uQuadSteps) lvl = uQuadSteps - 1;

    // Level 0 = base/8, level 1 = base/4, level 2 = base/2, level steps-1 = base
    // Scale from 1/(2^(steps-1)) up to 1
    // So with 4 steps: 1/8, 1/4, 1/2, 1
    float scale = 1.0;
    int shifts = uQuadSteps - 1 - lvl;
    for(int i = 0; i < 4; i++) {
        if(i < shifts) scale *= 0.5;
    }

    vec2 grid = baseGrid * scale;
    // Ensure minimum 1px
    grid = max(grid, vec2(1.0));
    return grid;
}

BlockInfo getBlock(vec2 rawUV) {
    BlockInfo b; b.isWarp=false; b.cell=vec2(0);
    if(uPixelate==0){b.uv=rawUV;b.tilePx=vec2(1);b.shapePx=vec2(1);return b;}

    float outerSize = (uOblique==1) ? max(uPixelSize.x, uPixelSize.y) : 0.0;

    // Hexagonal grid (weave mode 3)
    if(uWeaveMode==3){
        float sz = max(uPixelSize.x, uPixelSize.y);
        vec2 actualGrid = quadtreeGrid(rawUV, vec2(sz));
        float cellW = actualGrid.x / iResolution.x;
        float cellH = cellW * 0.866025; // sqrt(3)/2
        float row = floor(rawUV.y / cellH);
        float xOff = mod(row, 2.0) >= 1.0 ? cellW * 0.5 : 0.0;
        float col = floor((rawUV.x - xOff) / cellW);
        vec2 center = vec2((col + 0.5) * cellW + xOff, (row + 0.5) * cellH);
        // Check nearest of 3 candidates for true hex center
        float bestD = 1e9; vec2 bestC = center; vec2 bestCell = vec2(col, row);
        for(int dy = -1; dy <= 1; dy++) {
            float nr = row + float(dy);
            float nxOff = mod(nr, 2.0) >= 1.0 ? cellW * 0.5 : 0.0;
            for(int dx = -1; dx <= 1; dx++) {
                float nc = col + float(dx);
                vec2 cc = vec2((nc + 0.5) * cellW + nxOff, (nr + 0.5) * cellH);
                float dd = length(rawUV - cc);
                if(dd < bestD) { bestD = dd; bestC = cc; bestCell = vec2(nc, nr); }
            }
        }
        b.uv = bestC; b.tilePx = actualGrid; b.shapePx = actualGrid; b.cell = bestCell;
        return b;
    }

    // Octagonal grid (weave mode 4)
    if(uWeaveMode==4){
        float sz = max(uPixelSize.x, uPixelSize.y);
        vec2 actualGrid = quadtreeGrid(rawUV, vec2(sz));
        vec2 tUV = actualGrid / iResolution;
        vec2 ci = floor(rawUV / tUV);
        vec2 sqCenter = (ci + 0.5) * tUV;
        
        if(uGenDiamond==0) {
            // Default mode: L1 distance assigns corner pixels to diamond cells
            vec2 diCI = floor(rawUV / tUV + 0.5);
            vec2 vtx = diCI * tUV;
            vec2 dv = abs(rawUV - vtx) / tUV;
            float l1 = dv.x + dv.y;
            if(l1 < 0.2929) {
                float diaSz = 0.2929 * 2.0 * actualGrid.x;
                b.uv = vtx;
                b.tilePx = vec2(diaSz);
                b.shapePx = vec2(diaSz);
                b.cell = diCI + vec2(5000.0);
                b.isWarp = true;
                return b;
            }
        }
        // genDiamond ON: pure square grid here, diamond overlay layer handles the rest
        
        b.uv = sqCenter; b.tilePx = actualGrid; b.shapePx = actualGrid; b.cell = ci;
        return b;
    }

    if(uWeaveMode==2){
        float ts=max(uPixelSize.x,uPixelSize.y);
        vec2 baseGrid = vec2(ts);
        vec2 actualGrid = quadtreeGrid(rawUV, baseGrid);
        vec2 tUV=actualGrid/iResolution;
        vec2 ci=floor(rawUV/tUV);
        bool warp=mod(ci.x+ci.y,2.0)>=1.0;
        b.isWarp=warp; b.tilePx=actualGrid;
        float ratio = actualGrid.x / ts;
        b.shapePx=warp?vec2(uPixelSize.y,uPixelSize.x)*ratio:uPixelSize*ratio;
        b.uv=(ci+0.5)*tUV;
        b.cell=ci;
        return b;
    }

    vec2 gridSize = (uOblique==1) ? vec2(outerSize) : uPixelSize;
    vec2 actualGrid = quadtreeGrid(rawUV, gridSize);
    vec2 bUV=actualGrid/iResolution;
    vec2 c=floor(rawUV/bUV);
    float ratio = actualGrid.x / gridSize.x;

    if(uWeaveMode==1 && mod(c.y,2.0)>=1.0){
        float sx=rawUV.x-bUV.x*0.5; c.x=floor(sx/bUV.x);
        b.uv=vec2((c.x+0.5)*bUV.x+bUV.x*0.5,(c.y+0.5)*bUV.y);
        b.tilePx=actualGrid; b.shapePx=uPixelSize*ratio; b.cell=c; return b;
    }
    b.uv=(c+0.5)*bUV; b.tilePx=actualGrid; b.shapePx=uPixelSize*ratio; b.cell=c; return b;
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
float shapeSDF(vec2 p,vec2 h,float m){
    if(uPixelShape==1)return pillSDF(p,h,m);
    if(uPixelShape==2)return diamondSDF(p,h,m);
    if(uPixelShape==3)return squareSDF(p,h,m);
    if(uPixelShape==4)return chevronSDF(p,h,m);
    if(uPixelShape==5)return hexSDF(p,h,m);
    if(uPixelShape==6)return octSDF(p,h,m);
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

    bool isOctGap = false; // tracks if pixel is in octagon gap waiting for diamond overlay

    if(uPixelate==1 && effectiveShape>0){
        vec2 posInTile=(obliqueUV-blk.uv)*iResolution;
        vec2 halfShape=blk.shapePx*0.5;
        // For hex/oct auto-shapes, use same margin for all tiles
        float margin = uShapeMargin;
        float d = -1.0;
        if(effectiveShape==1) d=pillSDF(posInTile,halfShape,margin);
        if(effectiveShape==2) d=diamondSDF(posInTile,halfShape,margin);
        if(effectiveShape==3) d=squareSDF(posInTile,halfShape,margin);
        if(effectiveShape==4) d=chevronSDF(posInTile,halfShape,margin);
        if(effectiveShape==5) d=hexSDF(posInTile,halfShape,margin);
        if(effectiveShape==6) d=octSDF(posInTile,halfShape,margin);
        d -= uShapeBleed;
        if(d>0.0){
            if(uWeaveMode==4 && uGenDiamond==1) {
                isOctGap = true;
            } else {
                gl_FragColor=vec4(grade(mix(color,uGapColor,uGapOpacity)),1.0);
                return;
            }
        } else {

        // Emboss gradient overlay on the tile
        if(uShapeGradOpacity>0.0){
            vec2 ss=blk.shapePx;
            float gradT;
            if(uShapeGradDir==0){
                // Horizontal
                gradT=blk.isWarp?(posInTile.y/ss.y)+0.5:(posInTile.x/ss.x)+0.5;
            }else if(uShapeGradDir==1){
                // Vertical
                gradT=blk.isWarp?(posInTile.x/ss.x)+0.5:(posInTile.y/ss.y)+0.5;
            }else{
                // Radial — distance from offset center
                vec2 norm = posInTile / ss; // -0.5 to 0.5
                vec2 center = uRadialCenter * 0.5; // map -1..1 to -0.5..0.5
                float dist = length(norm - center) * 2.0 / max(uRadialScale, 0.001); // 0 at center, 1 at edge
                gradT = clamp(dist, 0.0, 1.0);
            }
            gradT=clamp(gradT,0.0,1.0);
            vec3 gCol=texture2D(uShapeGradTex,vec2(gradT,0.5)).rgb;
            color=mix(color,blendV(color,gCol,uEmbossBlendMode),uShapeGradOpacity);
        }
        } // close else (not in gap)
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
        vec2 basePx = vec2(sz);
        int steps = (uQuadEnabled==1 && uQuadSteps > 1) ? uQuadSteps : 1;

        // Iterate levels: 0 = smallest, steps-1 = largest (on top)
        for(int lvl = 0; lvl < 5; lvl++) {
            if(lvl >= steps) break;

            // Compute grid size for this level
            float scale = 1.0;
            int shifts = steps - 1 - lvl;
            for(int s = 0; s < 4; s++) { if(s < shifts) scale *= 0.5; }
            vec2 lvlPx = max(basePx * scale, vec2(1.0));
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
                if(uShapeGradOpacity > 0.0){
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
                    if(uShapeGradOpacity > 0.0){
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
                }
            }
        }
    }

    gl_FragColor=vec4(grade(color),1.0);
}
