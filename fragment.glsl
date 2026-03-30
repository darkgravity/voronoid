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
uniform float uDotRadius;
uniform float uColorSeed;
uniform float uHueOffset;
uniform float uHueRadius;
uniform float uSatSeed;
uniform float uSatMin;
uniform float uSatMax;
uniform float uBrightSeed;
uniform float uGradientSeed;
uniform float uValueMin;
uniform float uValueMax;
uniform float uSpring;
uniform vec3      uBgColor;
uniform int       uColorMode;
uniform int       uColorize;
uniform int       uPreProcess;
uniform float     uCamHue;
uniform float     uCamSat;
uniform float     uCamVal;
uniform float     uCamContrast;
uniform sampler2D uGradientTex;
uniform float uSnapGrid;  // 0=off, >0 = grid cell size in pixels

// Banding (applied here, before pixelation)
uniform int   uBanding;
uniform int   uBandAngleMode;   // 0=all sides, 1=random directional
uniform float uBandAngleSeed;  // seed for random angle assignment
uniform int   uBandRandCount;  // 0=fixed count, 1=random per cell
uniform float uBandRandCountMin; // min fraction of bandCount
uniform float uBandRandCountMax; // max fraction of bandCount
uniform float uBandRandCountSeed;
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
float euclidean(vec2 a, vec2 b) { return length(a-b); }
float hash(float n) { return fract(sin(mod(n, 6283.0))*43758.5453); }

float dist(vec2 a, vec2 b) {
    if(uMode==0) return chebyshev(a,b);
    if(uMode==1) return manhattan(a,b);
    return euclidean(a,b);
}

/* ── Noise uniforms ───────────────────────────────────────── */
uniform int   uNoiseType;        // 0-15
uniform float uNoiseElementSize; // 0.01-2.0
uniform float uNoiseOffsetX;     // 0-1
uniform float uNoiseOffsetY;     // 0-1
uniform int   uNoiseOctaves;     // 1-16
uniform float uNoiseLacunarity;  // 0-4
uniform float uNoiseRoughness;   // 0-1

/* ── Flow mode uniforms ───────────────────────────────────── */
uniform float iTime;          // accumulated play time (seconds)
uniform float uFlowScale;     // spatial zoom (replaces hard-coded 2.0)
uniform float uFlowSpeed;     // time multiplier
uniform float uFlowDistort1;  // first warp strength (was 8.1)
uniform float uFlowDistort2;  // second warp strength (was 4.13)
uniform float uFlowSmoothLo;  // smoothstep low edge (was 0.15)
uniform float uFlowSmoothHi;  // smoothstep high edge (was 0.85)
uniform int   uFlowType;      // 0=flow1, 1=flow2
uniform int   uFlow1Style;    // 0=default 3D simplex, 1-15=2D noise types
uniform float uFlowHueOffset; // 0-1 hue shift applied to raw flow output
uniform float uFlowHueRadius; // 0-1 hue range compression

/* ── Flow 2 uniforms ──────────────────────────────────────── */
uniform float uF2Scale;       // spatial scale, default 6.0
uniform float uF2VelX;        // f() velocity x, default 0.1
uniform float uF2VelY;        // f() velocity y, default 0.2
uniform float uF2Speed;       // mode_2_speed, default 2.5
uniform float uF2Detail;      // mode_1_detail, default 200.0
uniform float uF2Twist;       // mode_1_twist, default 50.0
uniform int   uF2Iter1;       // gradient iterations, default 20
uniform int   uF2Iter2;       // curve iterations (mode C/D), default 20
uniform int   uF2Mode;        // 0=A,1=B,2=C,3=D (encodes fieldMode*2+colorMode)

/* ── Noise building blocks ────────────────────────────────── */
vec2 hash2(vec2 p){
    p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));
    return fract(sin(p)*43758.5453123);
}
vec3 hash3(vec2 p){
    vec3 q=vec3(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)),dot(p,vec2(419.2,371.9)));
    return fract(sin(q)*43758.5453);
}
float hash21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
vec2 grad2(vec2 i){
    float a=hash21(i)*6.2831853;
    return vec2(cos(a),sin(a));
}

// Value noise (Fast)
float valueNoise(vec2 p){
    vec2 i=floor(p),f=fract(p);
    f=f*f*f*(f*(f*6.0-15.0)+10.0);
    float a=hash21(i),b=hash21(i+vec2(1,0)),c=hash21(i+vec2(0,1)),d=hash21(i+vec2(1,1));
    return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}

// Perlin gradient noise
float perlinNoise(vec2 p){
    vec2 i=floor(p),f=fract(p);
    vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0);
    float a=dot(grad2(i),f);
    float b=dot(grad2(i+vec2(1,0)),f-vec2(1,0));
    float c=dot(grad2(i+vec2(0,1)),f-vec2(0,1));
    float d=dot(grad2(i+vec2(1,1)),f-vec2(1,1));
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y)*0.5+0.5;
}

// Simplex noise (2D)
float simplexNoise(vec2 p){
    const float K1=0.366025404;
    const float K2=0.211324865;
    vec2 i=floor(p+(p.x+p.y)*K1);
    vec2 a=p-i+(i.x+i.y)*K2;
    float m=step(a.y,a.x);
    vec2 o=vec2(m,1.0-m);
    vec2 b=a-o+K2;
    vec2 cc=a-1.0+2.0*K2;
    vec3 h=max(0.5-vec3(dot(a,a),dot(b,b),dot(cc,cc)),0.0);
    h=h*h*h*h;
    vec3 n=h*vec3(dot(a,grad2(i)),dot(b,grad2(i+o)),dot(cc,grad2(i+1.0)));
    return dot(n,vec3(70.0))*0.5+0.5;
}

// Worley cellular noise — returns (F1, F2)
vec2 worleyEuc(vec2 p){
    vec2 i=floor(p); float d1=1e9,d2=1e9;
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
        vec2 nb=vec2(float(x),float(y));
        vec2 pt=hash2(i+nb)+nb-fract(p);
        float d=dot(pt,pt);
        if(d<d1){d2=d1;d1=d;}else if(d<d2){d2=d;}
    }
    return sqrt(vec2(d1,d2));
}
vec2 worleyMan(vec2 p){
    vec2 i=floor(p); float d1=1e9,d2=1e9;
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
        vec2 nb=vec2(float(x),float(y));
        vec2 pt=hash2(i+nb)+nb-fract(p);
        float d=abs(pt.x)+abs(pt.y);
        if(d<d1){d2=d1;d1=d;}else if(d<d2){d2=d;}
    }
    return vec2(d1,d2);
}
vec2 worleyCheb(vec2 p){
    vec2 i=floor(p); float d1=1e9,d2=1e9;
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
        vec2 nb=vec2(float(x),float(y));
        vec2 pt=hash2(i+nb)+nb-fract(p);
        float d=max(abs(pt.x),abs(pt.y));
        if(d<d1){d2=d1;d1=d;}else if(d<d2){d2=d;}
    }
    return vec2(d1,d2);
}

// Alligator noise: abs of Perlin
float alligatorNoise(vec2 p){
    float v=0.0,amp=1.0,freq=1.0,tot=0.0;
    float lac=max(uNoiseLacunarity,0.01);
    for(int i=0;i<16;i++){
        if(i>=uNoiseOctaves)break;
        v+=abs(perlinNoise(p*freq)*2.0-1.0)*amp;
        tot+=amp; freq*=lac; amp*=uNoiseRoughness;
    }
    return v/tot;
}

// Sparse convolution noise
float sparseConvNoise(vec2 p){
    vec2 i=floor(p),f=fract(p);
    float v=0.0;
    for(int y=-2;y<=2;y++) for(int x=-2;x<=2;x++){
        vec2 nb=vec2(float(x),float(y));
        vec2 r=hash2(i+nb);
        vec2 d=nb+r-f;
        float w=exp(-4.0*dot(d,d));
        v+=w*(hash21(i+nb)*2.0-1.0);
    }
    return v*0.5+0.5;
}

// Perlin flow (time-varying, use offset as phase)
float perlinFlowNoise(vec2 p, float phase){
    vec2 i=floor(p),f=fract(p);
    vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0);
    float a=dot(vec2(cos(hash21(i)*6.2831+phase),sin(hash21(i)*6.2831+phase)),f);
    float b=dot(vec2(cos(hash21(i+vec2(1,0))*6.2831+phase),sin(hash21(i+vec2(1,0))*6.2831+phase)),f-vec2(1,0));
    float c=dot(vec2(cos(hash21(i+vec2(0,1))*6.2831+phase),sin(hash21(i+vec2(0,1))*6.2831+phase)),f-vec2(0,1));
    float d=dot(vec2(cos(hash21(i+vec2(1,1))*6.2831+phase),sin(hash21(i+vec2(1,1))*6.2831+phase)),f-vec2(1,1));
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y)*0.5+0.5;
}

// fBm helper
float fbmPerlin(vec2 p, int oct){
    float v=0.0,a=1.0,t=0.0,freq=1.0;
    float lac=max(uNoiseLacunarity,0.01);
    for(int i=0;i<16;i++){if(i>=oct)break; v+=perlinNoise(p*freq)*a; t+=a; freq*=lac; a*=uNoiseRoughness;}
    return v/t;
}
float fbmSimplex(vec2 p, int oct){
    float v=0.0,a=1.0,t=0.0,freq=1.0;
    float lac=max(uNoiseLacunarity,0.01);
    for(int i=0;i<16;i++){if(i>=oct)break; v+=simplexNoise(p*freq)*a; t+=a; freq*=lac; a*=uNoiseRoughness;}
    return v/t;
}
float fbmValue(vec2 p, int oct){
    float v=0.0,a=1.0,t=0.0,freq=1.0;
    float lac=max(uNoiseLacunarity,0.01);
    for(int i=0;i<16;i++){if(i>=oct)break; v+=valueNoise(p*freq)*a; t+=a; freq*=lac; a*=uNoiseRoughness;}
    return v/t;
}

// Master noise selector
float computeNoise(vec2 uv){
    float sz=max(uNoiseElementSize, 0.01);
    // Scale: smaller sz = bigger detail, larger sz = zoomed out
    // Offset is in normalized space, scaled by 1/sz so pan distance is optically constant
    vec2 p = uv / sz + vec2(uNoiseOffsetX, uNoiseOffsetY) / sz;
    
    if(uNoiseType==0)  return fbmSimplex(p,uNoiseOctaves);
    if(uNoiseType==1)  return valueNoise(p);
    if(uNoiseType==2)  return sparseConvNoise(p);
    if(uNoiseType==3)  return alligatorNoise(p);
    if(uNoiseType==4)  return perlinNoise(p);
    if(uNoiseType==5)  return perlinFlowNoise(p, (uNoiseOffsetX+uNoiseOffsetY)*0.5);
    if(uNoiseType==6)  return simplexNoise(p);
    if(uNoiseType==7)  return worleyEuc(p).x;
    if(uNoiseType==8)  return clamp(worleyEuc(p).y-worleyEuc(p).x,0.0,1.0);
    if(uNoiseType==9)  return worleyMan(p).x;
    if(uNoiseType==10) return clamp(worleyMan(p).y-worleyMan(p).x,0.0,1.0);
    if(uNoiseType==11) return worleyCheb(p).x;
    if(uNoiseType==12) return clamp(worleyCheb(p).y-worleyCheb(p).x,0.0,1.0);
    if(uNoiseType==13) return fbmPerlin(p,uNoiseOctaves);
    if(uNoiseType==14) return fbmSimplex(p,uNoiseOctaves);
    if(uNoiseType==15) return fbmValue(p,uNoiseOctaves);
    return 0.5;
}

/* ── Image source ─────────────────────────────────────────── */
uniform int       uSourceMode;    // 0=pattern, 1=image, 2=camera
uniform sampler2D uImageTex;
uniform float     uImageScale;
uniform float     uImageAspect;   // image width/height

vec2 randomPoint(int i) {
    float fi=float(i);
    float seedOff=mod(uSeed*127.1, 6283.0);
    return vec2(hash(fi*1.7+seedOff+0.3), hash(fi*3.1+seedOff+1.9));
}

bool isRemoved(int i, float th, float gs) {
    return hash(float(i)*91.3+mod(gs*7.919, 6283.0)+5.3) < th;
}

vec2 rotatePoint(vec2 p, vec2 piv, float a) {
    float c=cos(a),s=sin(a); vec2 d=p-piv;
    return piv+vec2(d.x*c-d.y*s, d.x*s+d.y*c);
}

vec4 hsvToRgb(float h,float s,float v) {
    float h6=fract(h)*6.0,f=fract(h6),p=v*(1.0-s),q=v*(1.0-s*f),t=v*(1.0-s*(1.0-f));
    int hi=int(floor(h6));
    if(hi>=6) hi=0;
    if(hi==0)return vec4(v,t,p,1);if(hi==1)return vec4(q,v,p,1);if(hi==2)return vec4(p,v,t,1);
    if(hi==3)return vec4(p,q,v,1);if(hi==4)return vec4(t,p,v,1);return vec4(v,p,q,1);
}

float cellT(int ci) { return hash(float(ci)*7.31+mod(uColorSeed*53.7, 6283.0)+mod(uGradientSeed*17.3, 6283.0)+2.9); }

vec4 cellColor(int ci) {
    // Saturation: randomize per cell if satSeed > 0, else fixed at mix(satMin,satMax,0.5)
    float sat = mix(uSatMin, uSatMax, 0.5);
    if(uSatSeed > 0.0) {
        float sr = hash(float(ci)*13.37 + mod(uSatSeed*41.3, 6283.0) + 5.7);
        sat = mix(uSatMin, uSatMax, sr);
    }
    // Brightness: randomize per cell if brightSeed > 0, else fixed at mix(valueMin,valueMax,0.5)
    float val = mix(uValueMin, uValueMax, 0.5);
    if(uBrightSeed > 0.0) {
        float br = hash(float(ci)*7.31 + mod(uBrightSeed*53.7, 6283.0) + 2.9);
        val = mix(uValueMin, uValueMax, br);
    }
    // Unique per-cell hue (golden ratio distribution)
    float h=fract(float(ci)*0.618033988+mod(uColorSeed*0.1317, 1.0));
    return hsvToRgb(h, sat, val);
}

vec4 dotColor(int ci) {
    float h = fract(float(ci)*0.618033988+mod(uColorSeed*0.1317, 1.0)+0.13);
    h = fract(h * uHueRadius + uHueOffset);
    return hsvToRgb(h, 0.9, 1.0);
}

/* ── HSV conversion for hue shift ─────────────────────────────── */
vec3 rgb2hsv(vec3 c) {
    float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b)),d=mx-mn,h=0.0;
    if(d>1e-4){
        if(mx==c.r) h=(c.g-c.b)/d+(c.g<c.b?6.0:0.0);
        else if(mx==c.g) h=(c.b-c.r)/d+2.0;
        else h=(c.r-c.g)/d+4.0;
        h/=6.0;
    }
    return vec3(clamp(h,0.0,1.0), mx>1e-4?d/mx:0.0, mx);
}
vec3 hsv2rgb(vec3 c) {
    float h=fract(c.x)*6.0,s=c.y,v=c.z,f=fract(h),p=v*(1.0-s),q=v*(1.0-s*f),t=v*(1.0-s*(1.0-f));
    int hi=int(floor(h));
    if(hi>=6) hi=0;
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

struct Hit { float d; float d2; int ci; int ci2; vec4 dotCol; vec2 nearPt; vec2 nearPt2; };

void testPoint(vec2 uv, vec2 p, int ci, inout Hit h) {
    float d=dist(uv,p);
    if(d<h.d){h.d2=h.d;h.ci2=h.ci;h.nearPt2=h.nearPt;h.d=d;h.ci=ci;h.dotCol=dotColor(ci);h.nearPt=p;}
    else if(d<h.d2){h.d2=d;h.ci2=ci;h.nearPt2=p;}
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
    // Flip X: reflect x coordinate around screen center
    if(uFlipX==1) r.x=2.0*piv.x-r.x;
    // Flip Y: reflect y coordinate around screen center
    if(uFlipY==1) r.y=2.0*piv.y-r.y;
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

/* ── Compute final color for a cell (base + preprocess + colorize) ── */
vec4 computeCellFinalColor(int ci) {
    if(ci==9999) return vec4(uBgColor, 1.0);
    vec4 col = cellColor(ci);

    // Pre-process
    if(uPreProcess==1){
        vec3 hsv=rgb2hsv(col.rgb);
        hsv.x=fract(hsv.x+uCamHue/360.0);
        hsv.y=clamp(hsv.y*uCamSat,0.0,1.0);
        hsv.z=clamp(hsv.z*uCamVal,0.0,1.0);
        col.rgb=hsv2rgb(hsv);
        col.rgb=clamp((col.rgb-0.5)*uCamContrast+0.5,0.0,1.0);
    }

    // Colorize: 0=gradient, 1=hue, 2=raw (skip)
    if(uColorize==1 && uColorMode!=2){
        float t=cellT(ci);
        if(uColorMode==0){
            col=texture2D(uGradientTex, vec2(t,0.5));
        } else {
            float h=fract(float(ci)*0.618033988+mod(uColorSeed*0.1317, 1.0));
            h=fract(h*uHueRadius+uHueOffset);
            float sat = mix(uSatMin, uSatMax, 0.5);
            if(uSatSeed > 0.0) {
                float sr = hash(float(ci)*13.37 + mod(uSatSeed*41.3, 6283.0) + 5.7);
                sat = mix(uSatMin, uSatMax, sr);
            }
            float val = mix(uValueMin, uValueMax, 0.5);
            if(uBrightSeed > 0.0) {
                float br = hash(float(ci)*7.31 + mod(uBrightSeed*53.7, 6283.0) + 2.9);
                val = mix(uValueMin, uValueMax, br);
            }
            col=hsvToRgb(h, sat, val);
        }
    }
    return col;
}

/* ── Flow mode: simplex-noise fluid (CC BY-NC-SA 3.0, shadertoy.com/view/ltKyRR) ─── */
vec3 flow_random3(vec3 c) {
    float j = 4096.0 * sin(dot(c, vec3(17.0, 59.4, 15.0)));
    vec3 r;
    r.z = fract(512.0 * j); j *= 0.125;
    r.x = fract(512.0 * j); j *= 0.125;
    r.y = fract(512.0 * j);
    return r - 0.5;
}
const float F3 = 0.3333333;
const float G3 = 0.1666667;
float flow_simplex3d(vec3 p) {
    vec3 s = floor(p + dot(p, vec3(F3)));
    vec3 x = p - s + dot(s, vec3(G3));
    vec3 e = step(vec3(0.0), x - x.yzx);
    vec3 i1 = e * (1.0 - e.zxy);
    vec3 i2 = 1.0 - e.zxy * (1.0 - e);
    vec3 x1 = x - i1 + G3;
    vec3 x2 = x - i2 + 2.0 * G3;
    vec3 x3 = x - 1.0 + 3.0 * G3;
    vec4 w, d;
    w.x = dot(x,  x);  w.y = dot(x1, x1);
    w.z = dot(x2, x2); w.w = dot(x3, x3);
    w = max(0.6 - w, 0.0);
    d.x = dot(flow_random3(s),      x);
    d.y = dot(flow_random3(s + i1), x1);
    d.z = dot(flow_random3(s + i2), x2);
    d.w = dot(flow_random3(s + 1.0),x3);
    w *= w; w *= w; d *= w;
    return dot(d, vec4(52.0));
}
// Base noise for flow1 — dispatches on uFlow1Style
// Styles 1-15 map the 2D noise library into 3D via z→phase projection
float flow_base_noise(vec3 p) {
    if(uFlow1Style == 0) return flow_simplex3d(p);
    // 2D projection: use xy + small z-derived drift so channels differ smoothly
    vec2 p2 = p.xy + vec2(sin(p.z * 1.7) * 0.4, cos(p.z * 1.3) * 0.4);
    if(uFlow1Style == 1)  return fbmSimplex(p2, 4);
    if(uFlow1Style == 2)  return valueNoise(p2);
    if(uFlow1Style == 3)  return sparseConvNoise(p2);
    if(uFlow1Style == 4)  return alligatorNoise(p2);
    if(uFlow1Style == 5)  return perlinNoise(p2);
    if(uFlow1Style == 6)  return perlinFlowNoise(p2, p.z);
    if(uFlow1Style == 7)  return simplexNoise(p2);
    if(uFlow1Style == 8)  return worleyEuc(p2).x;
    if(uFlow1Style == 9)  return clamp(worleyEuc(p2).y  - worleyEuc(p2).x,  0.0, 1.0);
    if(uFlow1Style == 10) return worleyMan(p2).x;
    if(uFlow1Style == 11) return clamp(worleyMan(p2).y  - worleyMan(p2).x,  0.0, 1.0);
    if(uFlow1Style == 12) return worleyCheb(p2).x;
    if(uFlow1Style == 13) return clamp(worleyCheb(p2).y - worleyCheb(p2).x, 0.0, 1.0);
    if(uFlow1Style == 14) return fbmPerlin(p2, 4);
    if(uFlow1Style == 15) return fbmValue(p2, 4);
    return flow_simplex3d(p);
}

float flow_fractal(vec3 m) {
    float sum = 0.0;
    for (int i = 0; i < 16; ++i) {
        float sc = pow(2.0, float(i));
        sum += flow_base_noise(sc * m) / sc;
    }
    return sum;
}
vec3 flow_texture(vec3 p) {
    float t = iTime * uFlowSpeed;
    vec3 p1 = 0.1 * p + vec3(1.0 + t * 0.0023, 2.0 - t * 0.0017, 4.0 + t * 0.001);
    vec3 p2 = p + uFlowDistort1 * flow_fractal(p1) + 0.5;
    vec3 p3 = p2 + uFlowDistort2 * flow_fractal(0.5 * p2 + vec3(5.0, 4.0, 8.0 + t * 0.01)) + 0.5;
    vec3 ret;
    ret.x = flow_fractal(p3 + vec3(0.0, 0.0, 0.1 + t * 0.1));
    ret.y = flow_fractal(p3 + vec3(0.0, 0.0, 0.2 + t * 0.1));
    ret.z = flow_fractal(p3 + vec3(0.0, 0.0, 0.3 + t * 0.1));
    ret = 0.5 + 0.5 * ret;
    ret = smoothstep(vec3(uFlowSmoothLo), vec3(uFlowSmoothHi), ret);
    return ret;
}

/* ── Flow 2: vector field visualizer (CC BY-SA 4.0, @stormoid / shadertoy) ── */
float flow2_f(vec2 p) {
    return sin(p.x + sin(p.y + iTime * uF2VelX)) * sin(p.y * p.x * 0.1 + iTime * uF2VelY);
}

vec3 flow2_color(vec2 uv0, float asp) {
    // Center, aspect-correct, scale — pan via uDisplace
    vec2 p = (uv0 - 0.5 - uDisplace);
    p.x *= asp;
    p *= uF2Scale;

    // Decode fieldMode (0 or 1) and colorMode (0 or 1) from uF2Mode (0-3)
    int f2field = uF2Mode / 2;           // 0,0,1,1
    int f2color = uF2Mode - f2field * 2; // 0,1,0,1

    vec2 ep = vec2(0.05, 0.0);
    vec2 rz = vec2(0.0);
    vec2 pp = p;

    // Gradient field iteration (shared by all modes)
    for(int i = 0; i < 20; i++) {
        if(i >= uF2Iter1) break;
        float t0 = flow2_f(pp);
        float t1 = flow2_f(pp + ep.xy);
        float t2 = flow2_f(pp + ep.yx);
        vec2 g  = vec2((t1-t0), (t2-t0)) / ep.xx;
        vec2 t  = vec2(-g.y, g.x);
        pp += (uF2Twist * 0.01) * t + g * (1.0 / uF2Detail);
        pp.x += sin(iTime * uF2Speed / 10.0) / 10.0;
        pp.y += cos(iTime * uF2Speed / 10.0) / 10.0;
        rz = g;
    }

    // Field mode C/D: additional curved warp iteration
    if(f2field == 1) {
        for(int i = 1; i < 20; i++) {
            if(i >= uF2Iter2) break;
            pp.x += 0.3 / float(i) * sin(float(i) * 3.0 * pp.y + iTime * uF2Speed) + 0.5;
            pp.y += 0.3 / float(i) * cos(float(i) * 3.0 * pp.x + iTime * uF2Speed) + 0.5;
        }
    }

    vec3 col;
    if(f2color == 0) {
        // Velocity-based color: maps gradient vector into RGB
        col = clamp(vec3(rz * 0.5 + 0.5, 1.0), 0.0, 1.0);
    } else {
        // Position-based color: sinusoidal on iterated position
        col.r = cos(pp.x + pp.y + 1.0) * 0.5 + 0.5;
        col.g = sin(pp.x + pp.y + 1.0) * 0.5 + 0.5;
        col.b = (sin(pp.x + pp.y) + cos(pp.x + pp.y)) * 0.3 + 0.5;
        col = clamp(col, 0.0, 1.0);
    }

    return col * 0.85;
}

void main() {
    float asp=iResolution.x/iResolution.y;
    vec2 uv=gl_FragCoord.xy/iResolution.xy, uvW=uv;
    if(asp>=1.0)uvW.x*=asp; else uvW.y/=asp;
    vec2 piv=vec2(0.5); if(asp>=1.0)piv.x=0.5*asp; else piv.y=0.5/asp;
    vec2 fL=vec2(0),fH=vec2(1); if(asp>=1.0)fH.x=asp; else fH.y=1.0/asp;

    vec4 col;
    float cellIdNorm = 0.0;

    // ── Image source: sample uploaded image ──
    if(uSourceMode==1){
        // Aspect-correct cover: fit image to canvas preserving aspect ratio
        vec2 imgUV = uv;
        float canvasAR = asp;
        float imgAR = max(uImageAspect, 0.001);
        if(imgAR > canvasAR){
            float sc = canvasAR / imgAR;
            imgUV.x = imgUV.x * sc + (1.0-sc)*0.5;
        } else {
            float sc = imgAR / canvasAR;
            imgUV.y = imgUV.y * sc + (1.0-sc)*0.5;
        }
        // Apply scale from center
        imgUV = (imgUV - 0.5) / max(uImageScale, 0.01) + 0.5;
        // Flip Y: GL has Y-up, image has Y-down
        imgUV.y = 1.0 - imgUV.y;
        col = texture2D(uImageTex, clamp(imgUV, vec2(0.001), vec2(0.999)));
        // Pre-process on image
        if(uPreProcess==1){
            vec3 hsv=rgb2hsv(col.rgb);
            hsv.x=fract(hsv.x+uCamHue/360.0);
            hsv.y=clamp(hsv.y*uCamSat,0.0,1.0);
            hsv.z=clamp(hsv.z*uCamVal,0.0,1.0);
            col.rgb=hsv2rgb(hsv);
            col.rgb=clamp((col.rgb-0.5)*uCamContrast+0.5,0.0,1.0);
        }
        // Colorize image: map luminance through gradient or hue
        if(uColorize==1 && uColorMode!=2){
            float imgLum = dot(col.rgb, vec3(0.299,0.587,0.114));
            if(uColorMode==0){
                col = texture2D(uGradientTex, vec2(imgLum, 0.5));
            } else {
                float h = fract(imgLum + uHueOffset);
                h = fract(h * uHueRadius);
                float sat = mix(uSatMin, uSatMax, 0.5);
                float val = mix(uValueMin, uValueMax, imgLum);
                col = hsvToRgb(h, sat, val);
            }
        }
        cellIdNorm = dot(col.rgb, vec3(0.299,0.587,0.114));

    // ── Noise mode (mode==3) ──
    } else if(uMode==3){
        // Pan: subtract uDisplace so drag direction matches visual motion
        vec2 noiseUV = uvW - uDisplace;
        float nv = computeNoise(noiseUV);
        nv = clamp(nv, 0.0, 1.0);

        // Pre-process on noise (treat nv as grayscale)
        vec3 noiseCol = vec3(nv);
        if(uPreProcess==1){
            vec3 hsv=rgb2hsv(noiseCol);
            hsv.x=fract(hsv.x+uCamHue/360.0);
            hsv.y=clamp(hsv.y*uCamSat,0.0,1.0);
            hsv.z=clamp(hsv.z*uCamVal,0.0,1.0);
            noiseCol=hsv2rgb(hsv);
            noiseCol=clamp((noiseCol-0.5)*uCamContrast+0.5,0.0,1.0);
            nv = dot(noiseCol, vec3(0.299,0.587,0.114));
        }

        // Colorize: Raw=smooth grayscale, Gradient=map through gradient, Hue=map through hue
        if(uColorize==1 && uColorMode==0){
            // Gradient: continuous noise value maps smoothly through gradient
            col = texture2D(uGradientTex, vec2(nv, 0.5));
        } else if(uColorize==1 && uColorMode==1){
            // Hue: continuous noise value maps through hue ramp
            float h = fract(nv + uHueOffset);
            h = fract(h * uHueRadius);
            float sat = mix(uSatMin, uSatMax, 0.5);
            float val = mix(uValueMin, uValueMax, nv);
            col = hsvToRgb(h, sat, val);
        } else {
            // Raw: smooth grayscale
            col = vec4(noiseCol, 1.0);
        }
        cellIdNorm = nv;

        // Banding for noise — use raw noise value as band distance
        if(uBanding==1 && uBandCount>0.0) {
            float lum = dot(col.rgb, vec3(0.299,0.587,0.114));
            if(lum >= uBandLumMin && lum <= uBandLumMax) {
                float effectiveCount = uBandCount;
                if(uBandRandCount==1) {
                    float countRand = hash(floor(nv*32.0) * 197.3 + mod(uBandRandCountSeed * 53.1, 6283.0) + 11.7);
                    float t = mix(uBandRandCountMin, uBandRandCountMax, countRand);
                    effectiveCount = max(floor(uBandCount * t), 1.0);
                }
                float bandDist = nv; // use raw noise value as band distance
                float bi = floor(bandDist * effectiveCount);
                bi = min(bi, effectiveCount-1.0);
                float bv = (uBandRandomize==1) ? hash(bi*127.1+311.7) : bi/max(effectiveCount-1.0,1.0);
                vec3 blended = applyBlend(col.rgb, vec3(bv), uBandBlendMode);
                col.rgb = mix(col.rgb, blended, uBandStrength);

                if(uBandHueStrength > 0.0 && uBandHueRadius > 0.0) {
                    float hueShift = bv * uBandHueStrength;
                    vec3 hsv2 = rgb2hsv(col.rgb);
                    hsv2.x = fract(hsv2.x + hueShift);
                    vec3 hueShifted = hsv2rgb(hsv2);
                    col.rgb = mix(col.rgb, hueShifted, uBandHueRadius);
                }
            }
        }

    // ── Flow mode (mode==4) ──
    } else if(uMode==4){

        vec3 fres;
        if(uFlowType == 0) {
            // ── Flow 1: domain-warped noise fluid ──
            vec3 fp = vec3((uvW - uDisplace) * uFlowScale, iTime * 0.0001 * uFlowSpeed);
            fres = flow_texture(fp);
            fres = sqrt(max(fres, vec3(0.0)));
        } else {
            // ── Flow 2: vector field visualizer ──
            fres = flow2_color(uv, asp);
        }

        // ── Flow hue remap: fract(hue * radius + offset) ──
        {
            vec3 fhsv = rgb2hsv(fres);
            fhsv.x = fract(fhsv.x * uFlowHueRadius + uFlowHueOffset);
            fres = hsv2rgb(fhsv);
        }

        float lum = dot(fres, vec3(0.299, 0.587, 0.114));

        if(uPreProcess==1){
            vec3 hsv=rgb2hsv(fres);
            hsv.x=fract(hsv.x+uCamHue/360.0);
            hsv.y=clamp(hsv.y*uCamSat,0.0,1.0);
            hsv.z=clamp(hsv.z*uCamVal,0.0,1.0);
            fres=hsv2rgb(hsv);
            fres=clamp((fres-0.5)*uCamContrast+0.5,0.0,1.0);
            lum = dot(fres, vec3(0.299,0.587,0.114));
        }

        if(uColorize==1 && uColorMode==0){
            col = texture2D(uGradientTex, vec2(lum, 0.5));
        } else if(uColorize==1 && uColorMode==1){
            float h = fract(lum + uHueOffset);
            h = fract(h * uHueRadius);
            float sat = mix(uSatMin, uSatMax, 0.5);
            float val = mix(uValueMin, uValueMax, lum);
            col = hsvToRgb(h, sat, val);
        } else {
            col = vec4(fres, 1.0);
        }
        cellIdNorm = lum;

    // ── Voronoi pattern ──
    } else {
        Hit hit; hit.d=1e9; hit.d2=1e9; hit.ci=0; hit.ci2=0; hit.dotCol=vec4(0); hit.nearPt=vec2(0); hit.nearPt2=vec2(0);
        queryScene(uvW,piv,fL,fH,hit);

        col = computeCellFinalColor(hit.ci);

        if(uShowDots==1 && hit.d<uDotRadius) col=mix(col,hit.dotCol,smoothstep(uDotRadius,uDotRadius*0.4,hit.d));

        float borderDist = clamp((hit.d2-hit.d)*0.5/0.15, 0.0, 1.0);
        cellIdNorm = float(hit.ci) / 64.0;

        // ── Banding (before pixelation — mirrors already applied) ──
        if(uBanding==1 && uBandCount>0.0 && hit.ci!=9999) {
            float bandDist = borderDist;

            if(uBandAngleMode==1) {
                vec2 bandUV = uvW;
                if(uMirrorX==1 && bandUV.x > piv.x) bandUV.x = 2.0*piv.x - bandUV.x;
                if(uMirrorY==1 && bandUV.y > piv.y) bandUV.y = 2.0*piv.y - bandUV.y;
                if(uFlipX==1 && uvW.x > piv.x) bandUV.x = 2.0*piv.x - bandUV.x;
                if(uFlipY==1 && uvW.y > piv.y) bandUV.y = 2.0*piv.y - bandUV.y;
                
                float cellRand = hash(float(hit.ci) * 73.17 + mod(uBandAngleSeed * 31.7, 6283.0) + 19.3);
                
                if(cellRand < 0.66) {
                    int angleIdx;
                    bool twoAngles = cellRand >= 0.33;
                    
                    if(twoAngles) {
                        angleIdx = int(floor(hash(float(hit.ci)*251.3 + mod(uBandAngleSeed*17.3, 6283.0) + 41.7) * 8.0));
                    } else {
                        angleIdx = int(floor(hash(float(hit.ci)*137.9 + mod(uBandAngleSeed*23.1, 6283.0) + 7.1) * 8.0));
                    }
                    if(angleIdx >= 8) angleIdx = 7;
                    
                    float a1 = float(angleIdx) * 0.7853981633974483;
                    vec2 dir1 = vec2(cos(a1), sin(a1));
                    
                    float proj1 = dot(bandUV, dir1);
                    float span = 0.3;
                    float dirDist1 = fract(proj1 / span);
                    
                    if(twoAngles) {
                        float a2 = float(angleIdx + 1) * 0.7853981633974483;
                        vec2 dir2 = vec2(cos(a2), sin(a2));
                        float proj2 = dot(bandUV, dir2);
                        float dirDist2 = fract(proj2 / span);
                        bandDist = min(dirDist1, dirDist2);
                    } else {
                        bandDist = dirDist1;
                    }
                }
            }

            float lum = dot(col.rgb, vec3(0.299,0.587,0.114));
            if(lum >= uBandLumMin && lum <= uBandLumMax) {
                float effectiveCount = uBandCount;
                if(uBandRandCount==1) {
                    float countRand = hash(float(hit.ci) * 197.3 + mod(uBandRandCountSeed * 53.1, 6283.0) + 11.7);
                    float t = mix(uBandRandCountMin, uBandRandCountMax, countRand);
                    effectiveCount = max(floor(uBandCount * t), 1.0);
                }
                
                float bi = floor(bandDist * effectiveCount);
                bi = min(bi, effectiveCount-1.0);
                float bv = (uBandRandomize==1) ? hash(bi*127.1+311.7) : bi/max(effectiveCount-1.0,1.0);
                vec3 blended = applyBlend(col.rgb, vec3(bv), uBandBlendMode);
                col.rgb = mix(col.rgb, blended, uBandStrength);

                if(uBandHueStrength > 0.0 && uBandHueRadius > 0.0) {
                    float hueShift = bv * uBandHueStrength;
                    vec3 hsv = rgb2hsv(col.rgb);
                    hsv.x = fract(hsv.x + hueShift);
                    vec3 hueShifted = hsv2rgb(hsv);
                    col.rgb = mix(col.rgb, hueShifted, uBandHueRadius);
                }
            }
        }
    }

    gl_FragColor = vec4(col.rgb, cellIdNorm);
}
