precision highp float;
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
uniform float uColorSeed;
uniform float uGradientSeed;
uniform float uValueMin;
uniform float uValueMax;
uniform float uSpring;
uniform int       uColorMode;
uniform sampler2D uGradientTex;
uniform float uSnapGrid;  // 0=off, >0 = grid cell size in pixels

// Banding (applied here, before pixelation)
uniform int   uBanding;
uniform float uBandCount;
uniform float uBandLumMin;
uniform float uBandLumMax;
uniform float uBandStrength;
uniform int   uBandRandomize;
uniform int   uBandBlendMode;  // 0=overlay,1=multiply,2=screen,3=soft light,4=hard light,5=color dodge,6=color burn,7=linear light,8=normal
uniform float uBandHueStrength;
uniform float uBandHueRadius;

uniform int   uGroupCount;
uniform int   uGroupActive[8];
uniform vec2  uGroupDisplace[8];
uniform float uGroupThreshold[8];
uniform float uGroupSeed[8];
uniform float uGroupScale[8];

float manhattan(vec2 a, vec2 b) { return abs(a.x-b.x)+abs(a.y-b.y); }
float chebyshev(vec2 a, vec2 b) { return max(abs(a.x-b.x),abs(a.y-b.y)); }
float dist(vec2 a, vec2 b) { return uMode==0 ? chebyshev(a,b) : manhattan(a,b); }
float hash(float n) { return fract(sin(n)*43758.5453); }

vec2 randomPoint(int i) {
    float fi=float(i);
    return vec2(hash(fi*1.7+uSeed*127.1+0.3), hash(fi*3.1+uSeed*127.1+1.9));
}

bool isRemoved(int i, float th, float gs) {
    return hash(float(i)*91.3+(gs/1000.0)*7919.0+5.3) < th;
}

vec2 rotatePoint(vec2 p, vec2 piv, float a) {
    float c=cos(a),s=sin(a); vec2 d=p-piv;
    return piv+vec2(d.x*c-d.y*s, d.x*s+d.y*c);
}

vec4 hsvToRgb(float h,float s,float v) {
    float h6=fract(h)*6.0,f=fract(h6),p=v*(1.0-s),q=v*(1.0-s*f),t=v*(1.0-s*(1.0-f));
    int hi=int(mod(h6,6.0));
    if(hi==0)return vec4(v,t,p,1);if(hi==1)return vec4(q,v,p,1);if(hi==2)return vec4(p,v,t,1);
    if(hi==3)return vec4(p,q,v,1);if(hi==4)return vec4(t,p,v,1);return vec4(v,p,q,1);
}

float cellT(int ci) { return hash(float(ci)*7.31+uColorSeed*53.7+uGradientSeed*17.3+2.9); }

vec4 cellColor(int ci) {
    float t=cellT(ci);
    if(uColorMode==0) return texture2D(uGradientTex, vec2(t,0.5));
    float h=fract(float(ci)*0.618033988+uColorSeed*0.1317);
    return hsvToRgb(h, 0.55, mix(uValueMin,uValueMax,t));
}

vec4 dotColor(int ci) {
    return hsvToRgb(fract(float(ci)*0.618033988+uColorSeed*0.1317+0.13), 0.9, 1.0);
}

/* ── HSV conversion for hue shift ─────────────────────────────── */
vec3 rgb2hsv(vec3 c) {
    float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b)),d=mx-mn,h=0.0;
    if(d>1e-4){if(mx==c.r)h=mod((c.g-c.b)/d,6.0);else if(mx==c.g)h=(c.b-c.r)/d+2.0;else h=(c.r-c.g)/d+4.0;h/=6.0;if(h<0.0)h+=1.0;}
    return vec3(h,mx>1e-4?d/mx:0.0,mx);
}
vec3 hsv2rgb(vec3 c) {
    float h=fract(c.x)*6.0,s=c.y,v=c.z,f=fract(h),p=v*(1.0-s),q=v*(1.0-s*f),t=v*(1.0-s*(1.0-f));
    int hi=int(mod(h,6.0));
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

struct Hit { float d; float d2; int ci; vec4 dotCol; };

void testPoint(vec2 uv, vec2 p, int ci, inout Hit h) {
    float d=dist(uv,p);
    if(d<h.d){h.d2=h.d;h.d=d;h.ci=ci;h.dotCol=dotColor(ci);}
    else if(d<h.d2){h.d2=d;}
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
    if(uMirrorX==1){if(uFlipX==0){if(r.x<piv.x)r.x=2.0*piv.x-r.x;}else{if(r.x>piv.x)r.x=2.0*piv.x-r.x;}}
    if(uMirrorY==1){if(uFlipY==0){if(r.y<piv.y)r.y=2.0*piv.y-r.y;}else{if(r.y>piv.y)r.y=2.0*piv.y-r.y;}}
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

void main() {
    float asp=iResolution.x/iResolution.y;
    vec2 uv=gl_FragCoord.xy/iResolution.xy, uvW=uv;
    if(asp>=1.0)uvW.x*=asp; else uvW.y/=asp;
    vec2 piv=vec2(0.5); if(asp>=1.0)piv.x=0.5*asp; else piv.y=0.5/asp;
    vec2 fL=vec2(0),fH=vec2(1); if(asp>=1.0)fH.x=asp; else fH.y=1.0/asp;

    Hit hit; hit.d=1e9; hit.d2=1e9; hit.ci=0; hit.dotCol=vec4(0);
    queryScene(uvW,piv,fL,fH,hit);

    vec4 col = hit.ci==9999 ? vec4(0,0,0,1) : cellColor(hit.ci);

    if(uShowDots==1 && hit.d<0.008) col=mix(col,hit.dotCol,smoothstep(0.008,0.003,hit.d));

    float borderDist = clamp((hit.d2-hit.d)*0.5/0.15, 0.0, 1.0);

    // ── Banding (before pixelation — mirrors already applied) ──
    if(uBanding==1 && uBandCount>0.0 && hit.ci!=9999) {
        float lum = dot(col.rgb, vec3(0.299,0.587,0.114));
        if(lum >= uBandLumMin && lum <= uBandLumMax) {
            float bi = floor(borderDist * uBandCount);
            bi = min(bi, uBandCount-1.0);
            float bv = (uBandRandomize==1) ? hash(bi*127.1+311.7) : bi/max(uBandCount-1.0,1.0);
            vec3 blended = applyBlend(col.rgb, vec3(bv), uBandBlendMode);
            col.rgb = mix(col.rgb, blended, uBandStrength);

            // Hue shift: bv * hueStrength = shift amount
            // bandHueRadius is now blend opacity: mix(bandedColor, hueShiftedColor, opacity)
            if(uBandHueStrength > 0.0 && uBandHueRadius > 0.0) {
                float hueShift = bv * uBandHueStrength;
                vec3 hsv = rgb2hsv(col.rgb);
                hsv.x = fract(hsv.x + hueShift);
                vec3 hueShifted = hsv2rgb(hsv);
                col.rgb = mix(col.rgb, hueShifted, uBandHueRadius);
            }
        }
    }

    gl_FragColor = vec4(col.rgb, borderDist);
}
