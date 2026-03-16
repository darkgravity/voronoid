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
uniform int       uBandOutline;    // 0=outline ignores bands, 1=outline band boundaries too       // 0=normal, 1=45° rotated grid
uniform vec3      uGapColor;
uniform float     uGapOpacity;
uniform sampler2D uShapeGradTex;
uniform float     uShapeGradOpacity;
uniform int       uShapeGradDir;
uniform int       uEmbossBlendMode; // same blend mode set as banding

uniform float     uGradeHue;
uniform float     uGradeSat;
uniform float     uGradeVal;
uniform float     uGradeContrast;

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
struct BlockInfo { vec2 uv; vec2 tilePx; vec2 shapePx; bool isWarp; };

BlockInfo getBlock(vec2 rawUV) {
    BlockInfo b; b.isWarp=false;
    if(uPixelate==0){b.uv=rawUV;b.tilePx=vec2(1);b.shapePx=vec2(1);return b;}

    // Oblique mode: outer grid is always square (max of W,H)
    // Inner shape keeps original W/H for weave
    float outerSize = (uOblique==1) ? max(uPixelSize.x, uPixelSize.y) : 0.0;

    if(uWeaveMode==2){
        float ts=max(uPixelSize.x,uPixelSize.y);
        vec2 tUV=vec2(ts)/iResolution;
        vec2 ci=floor(rawUV/tUV);
        bool warp=mod(ci.x+ci.y,2.0)>=1.0;
        b.isWarp=warp; b.tilePx=vec2(ts);
        b.shapePx=warp?vec2(uPixelSize.y,uPixelSize.x):uPixelSize;
        b.uv=(ci+0.5)*tUV;
        return b;
    }

    // For oblique: use square grid, shape stays at original W/H
    vec2 gridSize = (uOblique==1) ? vec2(outerSize) : uPixelSize;
    vec2 bUV=gridSize/iResolution;
    vec2 c=floor(rawUV/bUV);
    if(uWeaveMode==1 && mod(c.y,2.0)>=1.0){
        float sx=rawUV.x-bUV.x*0.5; c.x=floor(sx/bUV.x);
        b.uv=vec2((c.x+0.5)*bUV.x+bUV.x*0.5,(c.y+0.5)*bUV.y);
        b.tilePx=gridSize; b.shapePx=uPixelSize; return b;
    }
    b.uv=(c+0.5)*bUV; b.tilePx=gridSize; b.shapePx=uPixelSize; return b;
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
float shapeSDF(vec2 p,vec2 h,float m){
    if(uPixelShape==1)return pillSDF(p,h,m);if(uPixelShape==2)return diamondSDF(p,h,m);
    if(uPixelShape==3)return squareSDF(p,h,m);if(uPixelShape==4)return chevronSDF(p,h,m);return-1.0;
}

bool diffCell(vec4 a,vec4 b){vec3 d=abs(a.rgb-b.rgb);return max(d.r,max(d.g,d.b))>0.015||(d.r+d.g+d.b)>0.03;}

/* ── HSV / grading ────────────────────────────────────────────── */
vec3 rgb2hsv(vec3 c){
    float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b)),d=mx-mn,h=0.0;
    if(d>1e-4){if(mx==c.r)h=mod((c.g-c.b)/d,6.0);else if(mx==c.g)h=(c.b-c.r)/d+2.0;else h=(c.r-c.g)/d+4.0;h/=6.0;if(h<0.0)h+=1.0;}
    return vec3(h,mx>1e-4?d/mx:0.0,mx);
}
vec3 hsv2rgb(vec3 c){
    float h=fract(c.x)*6.0,s=c.y,v=c.z,f=fract(h),p=v*(1.0-s),q=v*(1.0-s*f),t=v*(1.0-s*(1.0-f));
    int hi=int(mod(h,6.0));
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
    if(uPixelate==1 && uPixelShape>0){
        vec2 posInTile=(obliqueUV-blk.uv)*iResolution;
        vec2 halfShape=blk.shapePx*0.5;
        float d=shapeSDF(posInTile,halfShape,uShapeMargin)-uShapeBleed;
        if(d>0.0){
            gl_FragColor=vec4(grade(mix(color,uGapColor,uGapOpacity)),1.0);
            return;
        }

        // Emboss gradient overlay on the tile
        if(uShapeGradOpacity>0.0){
            vec2 ss=blk.shapePx;
            float gradT;
            if(uShapeGradDir==0){
                gradT=blk.isWarp?(posInTile.y/ss.y)+0.5:(posInTile.x/ss.x)+0.5;
            }else{
                gradT=blk.isWarp?(posInTile.x/ss.x)+0.5:(posInTile.y/ss.y)+0.5;
            }
            gradT=clamp(gradT,0.0,1.0);
            vec3 gCol=texture2D(uShapeGradTex,vec2(gradT,0.5)).rgb;
            color=mix(color,blendV(color,gCol,uEmbossBlendMode),uShapeGradOpacity);
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

    gl_FragColor=vec4(grade(color),1.0);
}
