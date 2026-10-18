import * as THREE from 'three';
THREE.ColorManagement.enabled = false;

/* =====================================================================
   BAJANS vs TOURISTS  -  PS1 style 3D fighter
   ===================================================================== */
const RW = 384, RH = 216;            // internal "PlayStation" resolution
const W = 800, GY = 372, PXU = 40;   // 2D logic space (px) -> world units
const wx = x => (x - W / 2) / PXU, wy = y => (GY - y) / PXU;
const $ = id => document.getElementById(id);

/* ---------- renderer + PS1 post pass ---------- */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const rt = new THREE.WebGLRenderTarget(RW, RH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
const post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: rt.texture }, uRes: { value: new THREE.Vector2(RW, RH) } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; varying vec2 vUv;
    const float B[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
    void main(){
      vec3 c=texture2D(tDiffuse,vUv).rgb;
      vec2 p=floor(vUv*uRes);
      int i=int(mod(p.x,4.))+int(mod(p.y,4.))*4;
      float d=B[i]/16.-0.47;
      c=(c-0.5)*1.12+0.5;
      c+=d/22.;
      c=floor(clamp(c,0.,1.)*31.+.5)/31.;
      gl_FragColor=vec4(c,1.);
    }`,
  depthTest: false, depthWrite: false
}));
post.frustumCulled = false;
const postScene = new THREE.Scene(); postScene.add(post);
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/* ---------- materials (vertex snapping = PS1 wobble) ---------- */
function snapPatch(s) {
  s.uniforms.uRes = { value: new THREE.Vector2(RW, RH) };
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nuniform vec2 uRes;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      { float w_=gl_Position.w; vec2 nd=gl_Position.xy/w_; vec2 pp=floor((nd*0.5+0.5)*uRes+0.5); nd=(pp/uRes-0.5)*2.0; gl_Position.xy=nd*w_; }`);
}
function mat(o = {}, snap = true) {
  const m = new THREE.MeshLambertMaterial({ flatShading: true, ...o });
  if (snap) { m.onBeforeCompile = snapPatch; m.customProgramCacheKey = () => 'psx'; }
  return m;
}

/* ---------- pixel texture helpers ---------- */
function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function mkTex(w, h, fn, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; fn(x, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
const px = (x, c, a, b, w = 1, h = 1) => { x.fillStyle = c; x.fillRect(a, b, w, h); };
function speckle(x, w, h, cols, n, seed) { const r = rng(seed); for (let i = 0; i < n; i++) px(x, cols[(r() * cols.length) | 0], (r() * w) | 0, (r() * h) | 0, 1, 1); }

function faceTex(o) {
  return mkTex(16, 16, x => {
    px(x, o.skin, 0, 0, 16, 16);
    if (o.burn) { px(x, o.burn, 1, 7, 4, 4); px(x, o.burn, 11, 7, 4, 4); px(x, o.burn, 3, 1, 10, 2); px(x, o.burn, 0, 3, 16, 1); }
    if (o.shades) {
      px(x, o.shades, 1, 4, 14, 4); px(x, o.shades, 0, 4, 16, 1);
      px(x, o.glint || '#ffffff', 2, 5, 3, 1); px(x, o.glint || '#ffffff', 9, 5, 3, 1);
      if (o.frame) { px(x, o.frame, 1, 3, 14, 1); px(x, o.frame, 7, 4, 2, 1); }
    } else {
      px(x, '#ffffff', 3, 5, 3, 2); px(x, '#ffffff', 10, 5, 3, 2);
      px(x, '#1b3a6b', 4, 5, 1, 2); px(x, '#1b3a6b', 11, 5, 1, 2);
      if (o.scowl) { px(x, o.brow, 2, 3, 3, 1); px(x, o.brow, 5, 4, 2, 1); px(x, o.brow, 11, 3, 3, 1); px(x, o.brow, 9, 4, 2, 1); }
      else { px(x, o.brow || '#5a3a22', 3, 3, 3, 1); px(x, o.brow || '#5a3a22', 10, 3, 3, 1); }
    }
    px(x, o.nose || '#cf5a4a', 7, 7, 2, 3);
    if (o.zinc) { px(x, '#ffffff', 6, 7, 4, 2); }
    switch (o.mouth) {
      case 'grin': px(x, '#7a2a20', 4, 11, 8, 2); px(x, '#ffffff', 5, 11, 6, 1); break;
      case 'open': px(x, '#5a1a14', 5, 11, 6, 3); px(x, '#ffffff', 5, 11, 6, 1); break;
      case 'lips': px(x, '#c4102e', 5, 11, 6, 2); px(x, '#ff6b8a', 6, 11, 2, 1); break;
      case 'grill': px(x, '#2a1a14', 4, 11, 8, 2); px(x, '#ffc726', 5, 11, 6, 1); px(x, '#b8860b', 7, 11, 1, 1); px(x, '#b8860b', 9, 11, 1, 1); break;
      default: px(x, '#7a2a20', 5, 11, 6, 1); px(x, '#7a2a20', 4, 10, 1, 1); px(x, '#7a2a20', 11, 10, 1, 1);
    }
    if (o.stubble) speckle(x, 16, 16, [o.stubble], 24, 5);
  });
}
function diag(x, w, h, th, col) {
  for (let i = 0; i < w; i++) {
    const y1 = Math.round(i * h / w), y2 = Math.round(h - 1 - i * h / w);
    px(x, col, i, y1 - (th >> 1), 1, th); px(x, col, i, y2 - (th >> 1), 1, th);
  }
}
function torsoTex(type, back) {
  return mkTex(32, 40, (x, w, h) => {
    switch (type) {
      case 'flag': // union-jack-ish tee
        px(x, '#1d3b8b', 0, 0, w, h); diag(x, w, h, 6, '#ffffff'); diag(x, w, h, 2, '#c8102e');
        px(x, '#ffffff', 12, 0, 8, h); px(x, '#ffffff', 0, 15, w, 9); px(x, '#c8102e', 14, 0, 4, h); px(x, '#c8102e', 0, 17, w, 5);
        break;
      case 'hawaii': {
        px(x, '#ff6fa5', 0, 0, w, h); const r = rng(back ? 9 : 4);
        for (let i = 0; i < 16; i++) { const a = (r() * 28 + 2) | 0, b = (r() * 36 + 2) | 0; px(x, '#ffe14d', a, b - 1, 1, 3); px(x, '#ffe14d', a - 1, b, 3, 1); px(x, '#ffffff', a, b, 1, 1); px(x, '#1f9d62', a + 2, b + 2, 2, 1); }
        px(x, '#ffffff', 14, 0, 4, 10); break;
      }
      case 'cross': // football shirt, St George cross
        px(x, '#f5f5f5', 0, 0, w, h); px(x, '#c8102e', 13, 0, 6, h); px(x, '#c8102e', 0, 14, w, 6);
        px(x, '#1d3b8b', 0, 0, w, 3); px(x, '#c8102e', 4, 5, 4, 4);
        break;
      case 'queen':
        px(x, '#ff3d8b', 0, 0, w, 18); px(x, '#a15c3a', 0, 18, w, 13); px(x, '#ffd23f', 0, 31, w, 9);
        px(x, '#c42a6c', 0, 17, w, 1); px(x, '#7a3a20', 15, 24, 2, 2);
        if (!back) { for (let i = 0; i < 32; i += 3) px(x, '#ffd23f', i, 22, 1, 1); px(x, '#ffffff', 15, 8, 2, 2); px(x, '#ffffff', 9, 6, 1, 1); px(x, '#ffffff', 22, 10, 1, 1); }
        px(x, '#ffeeaa', 0, 31, w, 1); break;
      case 'don': { // teal fur coat w/ white tee V + chains
        px(x, '#12b5a6', 0, 0, w, h); speckle(x, w, h, ['#7ff3e6', '#0b7d73', '#12b5a6', '#3ee0cf'], 160, back ? 2 : 1);
        if (!back) { for (let i = 0; i < 8; i++) { px(x, '#f2f2f2', 11 + (i >> 1) * 1 + 0, i, 10 - (i >> 1) * 2, 1); } px(x, '#f2f2f2', 12, 0, 8, 3); }
        break;
      }
    }
  });
}
function furTex(base, lite, dark, seed) { return mkTex(16, 16, (x, w, h) => { px(x, base, 0, 0, w, h); speckle(x, w, h, [lite, dark, base], 70, seed); }); }
function noiseTex(w, h, base, cols, n, seed, rep) { return mkTex(w, h, (x) => { px(x, base, 0, 0, w, h); speckle(x, w, h, cols, n, seed); }, rep); }

/* =====================================================================
   FIGHTER RIGS
   ===================================================================== */
const L1 = .7, L2 = .65, FH = .3, UA = .7, FA = .62, TH = 1.25;
const bx = (par, w, h, d, m, x = 0, y = 0, z = 0) => { const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); g.position.set(x, y, z); par.add(g); return g; };
const cyl = (par, rt_, rb, h, seg, m, x = 0, y = 0, z = 0) => { const g = new THREE.Mesh(new THREE.CylinderGeometry(rt_, rb, h, seg), m); g.position.set(x, y, z); par.add(g); return g; };
const tor = (par, r, tube, m, x = 0, y = 0, z = 0) => { const g = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 5, 10), m); g.position.set(x, y, z); par.add(g); return g; };

function buildFighter(d) {
  const mats = [];
  const mm = (c, o = {}) => { const m = (typeof c === 'object' && !(c instanceof THREE.Color)) ? mat(c) : mat({ color: c, ...o }); mats.push(m); return m; };
  const root = new THREE.Group(), tilt = new THREE.Group(), pelvis = new THREE.Group(), waist = new THREE.Group();
  root.add(tilt); tilt.add(pelvis); pelvis.add(waist);
  const R = { d, mats, root, tilt, pelvis, waist, pose: {}, braids: [], yaw: 0 };

  const mkLeg = (z, fn) => { const j1 = new THREE.Group(); j1.position.z = z; pelvis.add(j1); const j2 = new THREE.Group(); j2.position.y = -L1; j1.add(j2); fn(j1, j2); return { j1, j2 }; };
  const mkArm = (z, fn) => { const j1 = new THREE.Group(); j1.position.set(0, TH - .12, z); waist.add(j1); const j2 = new THREE.Group(); j2.position.y = -UA; j1.add(j2); fn(j1, j2, z); return { j1, j2 }; };
  const head = new THREE.Group(); waist.add(head); R.head = head;

  if (d.style === 'tourist') {
    const skin = mm(d.burn), shorts = mm(d.shorts), sock = mm('#f4f4f4'), stripe = mm(d.sockStripe), shoe = mm('#f6f6f6'), sole = mm('#9a9a9a'), acc = mm(d.shoeAccent), lace = mm('#d8d8d8');
    const shirtFront = mm({ color: 0xffffff, map: torsoTex(d.shirt) }), shirtBack = mm({ color: 0xffffff, map: torsoTex(d.shirt, true) }), shirtSide = mm(d.shirtCol);
    const leg = (j1, j2) => {
      bx(j1, .42, L1 + .04, .44, shorts, 0, -L1 / 2, 0);
      bx(j2, .46, .24, .48, shorts, 0, -.08, 0);
      bx(j2, .28, .12, .28, skin, 0, -.26, 0);
      bx(j2, .32, .42, .34, sock, 0, -.44, 0);
      bx(j2, .34, .05, .36, stripe, 0, -.31, 0); bx(j2, .34, .05, .36, stripe, 0, -.4, 0);
      bx(j2, .98, .3, .54, shoe, .22, -L2 - .15, 0); bx(j2, 1.02, .08, .58, sole, .22, -L2 - .27, 0);
      bx(j2, .32, .22, .56, acc, .55, -L2 - .13, 0); bx(j2, .3, .05, .3, lace, -.02, -L2 + .02, 0);
    };
    R.legN = mkLeg(.27, leg); R.legF = mkLeg(-.27, leg);
    bx(pelvis, .58, .36, 1.0, shorts, 0, 0, 0);
    const depth = d.belly ? .84 : .58;
    bx(waist, depth, TH, 1.0, [shirtFront, shirtBack, shirtSide, shorts, shirtSide, shirtSide], d.belly ? .13 : 0, TH / 2 + .02, 0);
    bx(waist, .22, .16, .22, skin, 0, TH + .06, 0);
    head.position.y = TH + .5;
    const hairM = mm(d.hair || '#c8681f');
    const face = mm({ color: 0xffffff, map: faceTex(d.face) });
    const top = d.hat ? mm(d.face.skin) : mm(d.burn);
    bx(head, .66, .74, .68, [face, hairM, top, skin, skin, skin], 0, 0, 0);
    bx(head, .1, .2, .08, skin, 0, -.03, .38); bx(head, .1, .2, .08, skin, 0, -.03, -.38);
    if (d.hat === 'bucket') {
      const h = mm(d.hatCol);
      cyl(head, .4, .46, .3, 8, h, 0, .52, 0); cyl(head, .66, .66, .06, 8, h, 0, .37, 0); cyl(head, .47, .47, .07, 8, mm(d.hatBand), 0, .41, 0);
    } else if (d.hat === 'sun') {
      const h = mm(d.hatCol);
      cyl(head, .34, .38, .3, 8, h, 0, .53, 0); cyl(head, 1.0, 1.0, .05, 10, h, 0, .38, 0); cyl(head, .4, .4, .09, 8, mm(d.hatBand), 0, .43, 0);
    } else { // nigel: sparse ginger hair
      bx(head, .12, .34, .7, hairM, -.3, .12, 0); bx(head, .1, .12, .1, hairM, .1, .42, .1); bx(head, .1, .12, .1, hairM, -.1, .42, -.15); bx(head, .1, .1, .1, hairM, 0, .43, -.02);
    }
    const arm = (j1, j2) => {
      bx(j1, .38, .36, .38, shirtSide, 0, -.15, 0); bx(j1, .3, .42, .3, skin, 0, -.48, 0);
      bx(j2, .28, FA, .28, skin, 0, -FA / 2, 0); bx(j2, .34, .3, .34, skin, 0, -FA - .08, 0);
    };
    R.armN = mkArm(.68, arm); R.armF = mkArm(-.68, arm);
    if (d.camera) { const k = mm('#222'); bx(waist, .22, .24, .34, k, .4, TH - .62, .08); cyl(waist, .1, .1, .18, 8, mm('#9ad'), .56, TH - .62, .08).rotation.z = Math.PI / 2; bx(waist, .04, .6, .04, k, .12, TH - .3, .2); }
    if (d.pint) { const g = new THREE.Group(); g.position.set(.08, -FA - .12, 0); R.armF.j2.add(g); cyl(g, .2, .16, .44, 6, mm('#f0a500'), .08, .1, 0); cyl(g, .21, .21, .1, 6, mm('#ffffff'), .08, .33, 0); }
  } else if (d.style === 'queen') {
    const skin = mm(d.skin), shorts = mm('#ffd23f'), white = mm('#f6f6f6'), pink = mm('#ff3d8b'), gold = mm('#ffc726');
    const hairM = mm('#1b1210'), maroon = mm('#8c1f4a');
    const tFront = mm({ color: 0xffffff, map: torsoTex('queen') }), tBack = mm({ color: 0xffffff, map: torsoTex('queen', true) }), tSide = mm('#e4559a');
    const leg = (j1, j2) => {
      bx(j1, .36, L1, .38, skin, 0, -L1 / 2, 0); bx(j1, .44, .4, .46, shorts, 0, -.2, 0);
      bx(j2, .3, L2, .32, skin, 0, -L2 / 2, 0);
      bx(j2, .4, .5, .42, white, 0, -.4, 0); bx(j2, .42, .06, .44, pink, 0, -.14, 0);
      bx(j2, .96, .3, .5, white, .2, -L2 - .15, 0); bx(j2, 1.0, .1, .54, pink, .2, -L2 - .26, 0); bx(j2, .44, .05, .44, gold, 0, -.55, 0);
    };
    R.legN = mkLeg(.25, leg); R.legF = mkLeg(-.25, leg);
    bx(pelvis, .5, .34, .92, shorts, 0, 0, 0);
    bx(waist, .5, TH, .92, [tFront, tBack, tSide, shorts, tSide, tSide], 0, TH / 2 + .02, 0);
    bx(waist, .2, .16, .2, skin, 0, TH + .06, 0); tor(waist, .16, .03, gold, 0, TH + .04, 0).rotation.x = Math.PI / 2;
    head.position.y = TH + .5;
    const face = mm({ color: 0xffffff, map: faceTex(d.face) });
    bx(head, .64, .72, .64, [face, hairM, hairM, skin, skin, skin], 0, 0, 0);
    bx(head, .7, .16, .72, hairM, -.02, .4, 0); bx(head, .24, 1.3, .84, hairM, -.38, -.4, 0);
    bx(head, .5, .95, .12, hairM, -.12, -.28, .4); bx(head, .5, .95, .12, hairM, -.12, -.28, -.4); bx(head, .14, .2, .68, hairM, .3, .34, 0);
    cyl(head, .5, .46, .14, 8, maroon, -.04, .53, 0).rotation.z = .14; cyl(head, .12, .12, .08, 6, maroon, -.02, .62, 0);
    tor(head, .17, .03, gold, 0, -.18, .39); tor(head, .17, .03, gold, 0, -.18, -.39);
    const arm = (j1, j2) => {
      bx(j1, .28, UA, .28, skin, 0, -UA / 2, 0); bx(j1, .32, .06, .32, gold, 0, -.5, 0);
      bx(j2, .26, FA, .26, skin, 0, -FA / 2, 0); bx(j2, .3, .05, .3, gold, 0, -.22, 0); bx(j2, .3, .05, .3, gold, 0, -.34, 0);
      bx(j2, .3, .3, .3, skin, 0, -FA - .08, 0); bx(j2, .12, .06, .32, mm('#c4102e'), .12, -FA - .16, 0);
    };
    R.armN = mkArm(.6, arm); R.armF = mkArm(-.6, arm);
  } else { // don
    const skin = mm(d.skin), pants = mm('#1c1c24'), white = mm('#f2f2f2'), gold = mm('#ffc726'), hairM = mm('#150d0a'), sole = mm('#cfcfcf');
    const fur = [mm({ color: 0xffffff, map: torsoTex('don') }), mm({ color: 0xffffff, map: torsoTex('don', true) })];
    const furM = mm({ color: 0xffffff, map: furTex('#12b5a6', '#7ff3e6', '#0b7d73', 3) });
    const leg = (j1, j2) => {
      bx(j1, .42, L1, .44, pants, 0, -L1 / 2, 0); bx(j2, .36, L2, .38, pants, 0, -L2 / 2, 0); bx(j2, .44, .1, .46, pants, 0, -.5, 0);
      bx(j2, .98, .3, .52, white, .22, -L2 - .15, 0); bx(j2, 1.02, .08, .56, sole, .22, -L2 - .27, 0); bx(j2, .4, .07, .54, gold, .1, -L2 - .13, 0);
    };
    R.legN = mkLeg(.27, leg); R.legF = mkLeg(-.27, leg);
    bx(pelvis, .56, .34, .98, pants, 0, 0, 0);
    bx(waist, .72, TH + .08, 1.2, [fur[0], fur[1], furM, furM, furM, furM], 0, TH / 2 + .04, 0);
    bx(waist, .5, .14, .6, mm('#ffffff'), .06, TH + .04, 0);
    bx(waist, .22, .16, .22, skin, 0, TH + .08, 0);
    tor(waist, .3, .035, gold, .06, TH + .0, 0).rotation.x = Math.PI / 2; tor(waist, .34, .03, gold, .12, TH - .24, 0).rotation.x = 1.15;
    bx(waist, .1, .16, .14, gold, .4, TH - .45, 0);
    head.position.y = TH + .52;
    const face = mm({ color: 0xffffff, map: faceTex(d.face) });
    bx(head, .64, .72, .64, [face, hairM, hairM, skin, skin, skin], 0, 0, 0);
    bx(head, .7, .22, .72, hairM, -.02, .4, 0);
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group(); g.position.set(-.34, .28, (i - 3.5) * .17); head.add(g);
      bx(g, .08, .95, .08, hairM, 0, -.48, 0); bx(g, .1, .1, .1, gold, 0, -.95, 0); bx(g, .1, .06, .1, gold, 0, -.55, 0);
      R.braids.push({ g, ph: i * .7 });
    }
    const arm = (j1, j2) => {
      bx(j1, .48, UA, .48, furM, 0, -UA / 2 + .02, 0); bx(j2, .44, FA, .44, furM, 0, -FA / 2, 0);
      bx(j2, .3, .28, .3, skin, 0, -FA - .12, 0); bx(j2, .34, .06, .34, gold, 0, -FA - .02, 0);
    };
    R.armN = mkArm(.72, arm); R.armF = mkArm(-.72, arm);
  }

  // blob shadow
  R.shadow = new THREE.Mesh(new THREE.CircleGeometry(.95, 8), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .38, depthWrite: false }));
  R.shadow.rotation.x = -Math.PI / 2; R.shadow.position.y = .03;
  scene.add(R.shadow);
  scene.add(root);
  return R;
}

/* =====================================================================
   SCENE / STAGE
   ===================================================================== */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7cc8f0);
scene.fog = new THREE.Fog(0xbfe6ff, 40, 110);
const cam = new THREE.PerspectiveCamera(38, RW / RH, .5, 260);
scene.add(new THREE.AmbientLight(0xffffff, 2.0));
const sunL = new THREE.DirectionalLight(0xfff0c8, 1.7); sunL.position.set(7, 12, 10); scene.add(sunL);

const stage = { flags: [], boats: [], clouds: [], sea: null, foam: null };
(function buildStage() {
  // sky: banded gradient
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(320, 150), new THREE.MeshBasicMaterial({
    fog: false, map: mkTex(2, 24, (x, w, h) => { const cs = ['#2f8fe0', '#3b9be6', '#4aa8ec', '#5cb5f0', '#6fc1f3', '#82cdf6', '#96d6f8', '#a8dffa', '#bbe7fb', '#cdeffc', '#def5fd', '#eefaff']; for (let i = 0; i < h; i++) px(x, cs[Math.min(11, Math.floor(i / 2))], 0, i, w, 1); })
  }));
  sky.position.set(0, 50, -110); scene.add(sky);
  // sun
  const sunM = new THREE.MeshBasicMaterial({ color: 0xfff6a0, fog: false });
  const sunD = new THREE.Mesh(new THREE.CircleGeometry(5, 10), sunM); sunD.position.set(38, 30, -108); scene.add(sunD);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(9, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .3, fog: false })); halo.position.set(38, 30, -109); scene.add(halo);
  // clouds
  const cloudT = mkTex(24, 8, (x) => { px(x, '#ffffff', 3, 4, 18, 3); px(x, '#ffffff', 6, 2, 8, 3); px(x, '#ffffff', 12, 1, 6, 3); px(x, '#dbeeff', 3, 7, 18, 1); });
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(26 + (i % 3) * 8, 8.7 + (i % 3) * 2.7), new THREE.MeshBasicMaterial({ map: cloudT, transparent: true, alphaTest: .5, fog: false }));
    c.position.set(-120 + i * 40, 22 + (i * 7 % 22), -100); c.userData.sp = .012 + (i % 3) * .008; scene.add(c); stage.clouds.push(c);
  }
  // distant island
  const isl = new THREE.Mesh(new THREE.ConeGeometry(18, 12, 6), mat({ color: 0x2c8a5a }, false)); isl.position.set(-48, 4, -90); isl.scale.set(1.8, 1, .5); scene.add(isl);
  const isl2 = new THREE.Mesh(new THREE.ConeGeometry(10, 7, 5), mat({ color: 0x35a06a }, false)); isl2.position.set(-30, 2, -85); isl2.scale.set(1.6, 1, .5); scene.add(isl2);
  // sea (animated low-poly)
  const seaT = mkTex(16, 16, (x, w, h) => { px(x, '#1d9ad8', 0, 0, w, h); speckle(x, w, h, ['#37b4ec', '#1585c4', '#5cc8f2'], 40, 7); });
  seaT.wrapS = seaT.wrapT = THREE.RepeatWrapping; seaT.repeat.set(30, 10);
  const seaG = new THREE.PlaneGeometry(300, 90, 30, 12); seaG.rotateX(-Math.PI / 2);
  stage.sea = new THREE.Mesh(seaG, mat({ map: seaT, color: 0xffffff }, false)); stage.sea.position.set(0, -.5, -55); stage.seaBase = seaG.attributes.position.array.slice(); scene.add(stage.sea);
  // sand
  const sandT = noiseTex(16, 16, '#dcbd80', ['#caa766', '#e6cb90', '#bf9c5c'], 60, 11, [60, 12]);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(360, 60), mat({ map: sandT, color: 0xffffff }, false)); sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0, 20); scene.add(sand);
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(360, 4), mat({ color: 0xc9a868 }, false)); wet.rotation.x = -Math.PI / 2; wet.position.set(0, .01, -11.5); scene.add(wet);
  const foamT = mkTex(32, 4, (x, w, h) => { const r = rng(5); for (let i = 0; i < 70; i++) px(x, '#ffffff', (r() * w) | 0, (r() * h) | 0, 1 + (r() * 3 | 0), 1); }, [18, 1]);
  stage.foam = new THREE.Mesh(new THREE.PlaneGeometry(360, 2.6), new THREE.MeshBasicMaterial({ map: foamT, transparent: true, alphaTest: .4, opacity: .95 }));
  stage.foam.rotation.x = -Math.PI / 2; stage.foam.position.set(0, .05, -13.6); scene.add(stage.foam);

  // palms
  const bark = noiseTex(8, 8, '#7a5230', ['#5d3d22', '#8d6038', '#4a2f19'], 22, 3);
  const leaf = mat({ color: 0x2f9e44, side: THREE.DoubleSide }), leaf2 = mat({ color: 0x26853a, side: THREE.DoubleSide });
  const barkM = mat({ map: bark, color: 0xffffff }), coco = mat({ color: 0x5a3a1a });
  function palm(x, z, h, lean) {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const n = 6; let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) {
      const sh = h / n, s = new THREE.Mesh(new THREE.CylinderGeometry(.3 * (1 - (i + 1) / n * .45), .34 * (1 - i / n * .45), sh * 1.05, 6), barkM);
      const ang = lean * (i / n), dx = Math.sin(ang) * sh;
      cx += dx * .5; s.position.set(cx, cy + sh / 2, 0); s.rotation.z = -ang; g.add(s); cx += dx * .5; cy += sh * Math.cos(ang);
    }
    const crown = new THREE.Group(); crown.position.set(cx, cy, 0); g.add(crown);
    for (let i = 0; i < 9; i++) {
      const f = new THREE.Group(); f.rotation.y = i * Math.PI * 2 / 9 + .2; crown.add(f);
      const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0, .5, 2.2, 3), i % 2 ? leaf : leaf2); p1.rotation.z = -Math.PI / 2; p1.scale.set(1, 1, .3); p1.position.set(1.1, .25, 0); p1.rotation.z = -Math.PI / 2 + .3; f.add(p1);
      const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0, .4, 1.8, 3), i % 2 ? leaf2 : leaf); p2.rotation.z = -Math.PI / 2 - .6; p2.scale.set(1, 1, .3); p2.position.set(2.5, .0, 0); f.add(p2);
    }
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(.28, 0), coco); c.position.set(cx + (i - 1) * .3, cy - .25, (i % 2 - .5) * .4); g.add(c); }
    return g;
  }
  palm(-13, -4.5, 8.5, .35); palm(13.6, -5.5, 9.5, -.3); palm(-21, -13, 10, .2); palm(22, -14, 9, -.25); palm(-5, -16, 9, .15); palm(7, -17, 10, -.1);

  // umbrella
  const um = new THREE.Group(); um.position.set(-6.4, 0, -4.8); um.rotation.z = .1; scene.add(um);
  cyl(um, .07, .07, 3.6, 5, mat({ color: 0x8a6a3a }), 0, 1.8, 0);
  const umT = mkTex(8, 1, (x) => { for (let i = 0; i < 8; i++) px(x, i % 2 ? '#ffffff' : '#e53935', i, 0, 1, 1); });
  const can = new THREE.Mesh(new THREE.ConeGeometry(2.3, .95, 8), mat({ map: umT, color: 0xffffff })); can.position.y = 3.9; um.add(can);
  // sign
  const sg = new THREE.Group(); sg.position.set(7.2, 0, -4.2); sg.rotation.y = -.25; scene.add(sg);
  const wood = mat({ color: 0x8a5a30 });
  bx(sg, .16, 2.4, .16, wood, -1.3, 1.2, 0); bx(sg, .16, 2.4, .16, wood, 1.3, 1.2, 0);
  const signT = mkTex(64, 24, (x, w, h) => { px(x, '#c78b4b', 0, 0, w, h); px(x, '#6b4420', 0, 0, w, 1); px(x, '#6b4420', 0, h - 1, w, 1); px(x, '#6b4420', 0, 0, 1, h); px(x, '#6b4420', w - 1, 0, 1, h); x.fillStyle = '#2b1a0c'; x.font = 'bold 9px monospace'; x.textAlign = 'center'; x.fillText('WELCOME TO', 32, 10); x.font = 'bold 11px monospace'; x.fillText('BARBADOS', 32, 21); });
  bx(sg, 3.4, 1.3, .14, [wood, wood, wood, wood, mat({ map: signT, color: 0xffffff }), wood], 0, 2.5, .02);
  // bajan flag
  const fl = new THREE.Group(); fl.position.set(-9.8, 0, -7); scene.add(fl);
  cyl(fl, .07, .07, 6, 5, mat({ color: 0xcccccc }), 0, 3, 0);
  const flagT = mkTex(24, 16, (x, w, h) => { px(x, '#00267f', 0, 0, 8, h); px(x, '#ffc726', 8, 0, 8, h); px(x, '#00267f', 16, 0, 8, h); px(x, '#000', 11, 4, 2, 9); px(x, '#000', 9, 4, 1, 4); px(x, '#000', 14, 4, 1, 4); px(x, '#000', 9, 8, 6, 1); });
  const fg = new THREE.PlaneGeometry(2.8, 1.8, 8, 2); const fm = new THREE.Mesh(fg, mat({ map: flagT, color: 0xffffff, side: THREE.DoubleSide })); fm.position.set(1.5, 5, 0); fl.add(fm);
  stage.flags.push({ m: fm, base: fg.attributes.position.array.slice() });
  // sun loungers
  function lounger(x, z, col) {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const tow = mat({ map: mkTex(8, 8, (c) => { for (let i = 0; i < 8; i++) px(c, i % 2 ? '#ffffff' : col, 0, i, 8, 1); }), color: 0xffffff });
    bx(g, 2.2, .35, 1.0, mat({ color: 0xf4f4f4 }), 0, .35, 0); bx(g, 2.0, .06, .9, tow, 0, .55, 0);
    const back = bx(g, 1.0, .35, 1.0, mat({ color: 0xf4f4f4 }), -1.0, .9, 0); back.rotation.z = -.7;
    bx(g, 1.0, .06, .9, tow, -1.0, 1.08, 0).rotation.z = -.7;
    g.rotation.y = .3; return g;
  }
  lounger(-10.4, -2.4, '#ff8a00'); lounger(9.5, -8.5, '#2ab4c0');
  // sailboats
  function boat(x, z, s) {
    const g = new THREE.Group(); g.position.set(x, -.3, z); g.scale.setScalar(s); scene.add(g);
    bx(g, 5, .9, 1.6, mat({ color: 0xf2f2f2 }, false), 0, .3, 0); bx(g, 5.1, .25, 1.7, mat({ color: 0xc8102e }, false), 0, .05, 0);
    cyl(g, .08, .08, 8, 5, mat({ color: 0x5a3a22 }, false), 0, 4.5, 0);
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(3.4, 0); sh.lineTo(0, 7.4);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); sail.position.set(-.2, 1, 0); g.add(sail);
    const sh2 = new THREE.Shape(); sh2.moveTo(0, 0); sh2.lineTo(-2.6, 0); sh2.lineTo(0, 5.4);
    const jib = new THREE.Mesh(new THREE.ShapeGeometry(sh2), new THREE.MeshBasicMaterial({ color: 0xff4d4d, side: THREE.DoubleSide })); jib.position.set(-.45, 1, 0); g.add(jib);
    stage.boats.push({ g, ph: Math.random() * 6, y: -.3 }); return g;
  }
  boat(18, -34, 1); boat(-26, -52, 1.5);
})();

/* =====================================================================
   FX: particles, sparks, popups
   ===================================================================== */
const pGeo = new THREE.BoxGeometry(.16, .16, .16), pMats = {};
const parts = [];
function burst(x, y, col, n = 9) {
  const m = pMats[col] || (pMats[col] = new THREE.MeshBasicMaterial({ color: col }));
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(pGeo, m); mesh.position.set(x, y, .3); scene.add(mesh);
    parts.push({ mesh, vx: (Math.random() - .5) * .35, vy: Math.random() * .3 + .05, vz: (Math.random() - .3) * .2, t: 24 });
  }
}
const sparkTex = mkTex(16, 16, x => { px(x, '#ffffff', 7, 0, 2, 16); px(x, '#ffffff', 0, 7, 16, 2); px(x, '#ffe14d', 5, 5, 6, 6); px(x, '#ffffff', 6, 6, 4, 4); px(x, '#ff9a1a', 3, 3, 2, 2); px(x, '#ff9a1a', 11, 3, 2, 2); px(x, '#ff9a1a', 3, 11, 2, 2); px(x, '#ff9a1a', 11, 11, 2, 2); });
const sparks = [];
function spark(x, y, big = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, depthTest: false, fog: false })); s.position.set(x, y, 1); s.scale.setScalar(2.2 * big); s.renderOrder = 10; scene.add(s); sparks.push({ s, t: 9, big });
}
const popsEl = $('pops'), _v = new THREE.Vector3();
function say(x, y, text, col = '#fff') {
  _v.set(x, y, 0).project(cam);
  const d = document.createElement('div'); d.className = 'pop t'; d.textContent = text; d.style.color = col;
  d.style.left = ((_v.x * .5 + .5) * 100) + '%'; d.style.top = ((-_v.y * .5 + .5) * 100) + '%';
  popsEl.appendChild(d); d.addEventListener('animationend', () => d.remove());
}
const bannerEl = $('banner');
function banner(text, sub, hold) {
  bannerEl.className = 't'; void bannerEl.offsetWidth;
  bannerEl.innerHTML = text + (sub ? '<small>' + sub + '</small>' : '');
  bannerEl.classList.add(hold ? 'hold' : 'go');
}

/* ---------- input ---------- */
const keys = {}, pressed = {};
const KMAP = { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], jump: ['KeyW', 'ArrowUp', 'Space'], block: ['KeyS', 'ArrowDown'], punch: ['KeyJ', 'KeyZ'], kick: ['KeyK', 'KeyX'], special: ['KeyL', 'KeyC'] };
for (const a in KMAP) KMAP[a].push('T_' + a);
const isDown = a => KMAP[a].some(c => keys[c]);
const isHit = a => KMAP[a].some(c => pressed[c]);
addEventListener('keydown', e => {
  if (!e.repeat) pressed[e.code] = true;
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyM') muted = !muted;
});
addEventListener('keyup', e => { keys[e.code] = false; });
document.querySelectorAll('#pad button').forEach(b => {
  const k = 'T_' + b.dataset.a;
  const on = e => { e.preventDefault(); keys[k] = true; pressed[k] = true; b.classList.add('on'); };
  const off = e => { e.preventDefault(); keys[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on);
  ['pointerup', 'pointercancel', 'pointerout', 'pointerleave'].forEach(t => b.addEventListener(t, off));
});
addEventListener('contextmenu', e => e.preventDefault());

/* ---------- audio ---------- */
let ac, muted = false;
function sfx(f, d = .08, type = 'square', v = .05) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = v;
    o.connect(g); g.connect(ac.destination); o.start();
    g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + d); o.stop(ac.currentTime + d);
  } catch (e) { }
}

/* =====================================================================
   ROSTER
   ===================================================================== */
const BAJANS = [
  { id: 'queen', style: 'queen', name: 'ISLAND QUEEN', skin: '#8a5a3c', special: 'WINE WAVE!', proj: 'wave', spd: 3.6, dmg: 1,
    face: { skin: '#8a5a3c', shades: '#101018', glint: '#ff9ac8', frame: '#ffc726', brow: '#1b1210', nose: '#7a4a30', mouth: 'lips' } },
  { id: 'don', style: 'don', name: 'BAJAN DON', skin: '#6b4430', special: 'FLYING FISH!', proj: 'fish', spd: 3.4, dmg: 1.05,
    face: { skin: '#6b4430', shades: '#0c0c10', glint: '#7ff3e6', frame: '#ffc726', brow: '#150d0a', nose: '#5a3624', mouth: 'grill', stubble: '#3a2418' } }
];
const TOURISTS = [
  { style: 'tourist', name: 'GARY from Stoke', burn: '#e0705a', shirt: 'flag', shirtCol: '#2a46a0', shorts: '#b9a878', sockStripe: '#c8102e', hat: 'bucket', hatCol: '#e8dcae', hatBand: '#c8102e', shoeAccent: '#c8102e', belly: true, camera: true, hair: '#8a5a2a',
    face: { skin: '#f0b29c', burn: '#e0705a', nose: '#d8412f', brow: '#8a5a2a', mouth: 'grin' },
    special: 'FLYING PINT!', proj: 'pint', spd: 1.7, dmg: .8, hp: 100, rest: 55, aggr: .05, blk: .1 },
  { style: 'tourist', name: 'SHARON from Essex', burn: '#e57e68', shirt: 'hawaii', shirtCol: '#ff6fa5', shorts: '#7f9fb7', sockStripe: '#2a8f6a', hat: 'sun', hatCol: '#f7e7a3', hatBand: '#ff4fa0', shoeAccent: '#2a8f6a', hair: '#e8c46a',
    face: { skin: '#f3b5a2', burn: '#e0705a', shades: '#f4f4f4', glint: '#ffffff', frame: '#ff4fa0', nose: '#d8412f', mouth: 'smile' },
    special: 'FLYING PINT!', proj: 'pint', spd: 2, dmg: .9, hp: 110, rest: 42, aggr: .07, blk: .18 },
  { style: 'tourist', name: 'NIGEL the Lager Lord', burn: '#d4503c', shirt: 'cross', shirtCol: '#e8e8e8', shorts: '#4d6a43', sockStripe: '#1d3b8b', shoeAccent: '#1d3b8b', belly: true, pint: true, hair: '#c8681f',
    face: { skin: '#e8806a', burn: '#d4503c', nose: '#c0301f', brow: '#8a3a10', scowl: true, zinc: true, mouth: 'open' },
    special: 'FLYING PINT!', proj: 'pint', spd: 2.3, dmg: 1, hp: 125, rest: 32, aggr: .09, blk: .26 }
];
BAJANS.forEach(b => b.rig = buildFighter(b));
TOURISTS.forEach(t => t.rig = buildFighter(t));
const ALL_RIGS = [...BAJANS, ...TOURISTS].map(d => d.rig);

const MOVES = {
  punch: { dur: 16, start: 5, end: 9, reach: 62, dmg: 8, kb: 5 },
  kick: { dur: 25, start: 8, end: 13, reach: 82, dmg: 12, kb: 9 },
  special: { dur: 28, start: 12, end: 12, dmg: 16, kb: 7 }
};
const pick = a => a[Math.random() * a.length | 0];

/* =====================================================================
   GAME STATE (logic is ported 1:1 from the 2D build)
   ===================================================================== */
const G = { state: 'select', sel: 0, frame: 0, shake: 0, opp: 0, round: 1, pw: 0, ew: 0, time: 3600, t: 0, rw: null, p: null, e: null, char: null, hitstop: 0 };
let projs = [], menuF = [];

function mk(def, x, face, player, o = {}) {
  const hp = o.hp || 100;
  return {
    def, rig: def.rig, x, y: GY, vx: 0, vy: 0, face, hp, max: hp, trail: hp, spd: def.spd, dmgMul: def.dmg || 1, act: null, cd: 0, spcd: 0, stun: 0,
    stumble: 0, stumbleDir: 1, stumbleT: 120 + (Math.random() * 120 | 0), blockT: 0, blocking: false, walking: false, ground: true,
    flash: 0, anim: Math.random() * 100 | 0, koT: 0, ko: false, player, cheer: false, rest: o.rest || 40, aggr: o.aggr || .06, blk: o.blk || .1
  };
}
const worldTop = f => [wx(f.x), wy(f.y) + 4.3];
function sayAt(f, s, col) { const p = worldTop(f); say(p[0], p[1], s, col); }

function showOnly(fs) { ALL_RIGS.forEach(r => { r.root.visible = false; r.shadow.visible = false; r.pose = {}; r.yaw = undefined; r.mats.forEach(m => m.emissive.setRGB(0, 0, 0)); }); fs.forEach(f => { f.rig.root.visible = true; f.rig.shadow.visible = true; }); }

function newOpponent() { G.pw = 0; G.ew = 0; G.round = 1; startRound(); }
function startRound() {
  const t = TOURISTS[G.opp];
  G.p = mk(G.char, 200, 1, true, { hp: 100 });
  G.e = mk(t, 600, -1, false, { hp: t.hp, rest: t.rest, aggr: t.aggr, blk: t.blk });
  showOnly([G.p, G.e]);
  projs.forEach(clearProj); projs = [];
  G.state = 'intro'; G.t = 110; G.time = 3600; G.hitstop = 0;
  setHud(true); updateHud(); banner('ROUND ' + G.round, TOURISTS[G.opp].name);
}
function startMatch(i) { G.char = BAJANS[i]; G.opp = 0; $('menu').style.display = 'none'; $('end').style.display = 'none'; newOpponent(); sfx(440, .15, 'triangle', .08); }

function startAct(f, type) {
  f.act = { type, t: 0, done: false, ...MOVES[type] };
  f.cd = f.player ? 4 : f.rest + (Math.random() * 25 | 0);
  if (type === 'special') { f.spcd = f.player ? 150 : 260; sayAt(f, f.def.special, '#ffe14d'); }
  sfx(type === 'kick' ? 190 : type === 'punch' ? 300 : 520, .07, 'square', .04);
}
function applyHit(t, sx, dir, dmg, kb) {
  if (t.ko) return false;
  const blocked = t.blocking && (sx - t.x) * t.face > 0;
  const hx = wx(t.x), hy = wy(t.y) + 2.0;
  if (blocked) {
    dmg *= .15; kb *= .35; sayAt(t, 'BLOCK', '#9fd4ff'); sfx(120, .06, 'triangle', .06); spark(hx + t.face * .5, hy + .3, .6);
  } else {
    if (t.stumble > 0) dmg *= 1.6;
    sayAt(t, pick(t.player ? ['OI!', 'BLIMEY!', 'OW!'] : ['BAM!', 'WUH LOSS!', 'LICK!', 'BRAPP!']), t.player ? '#ffd1d1' : '#ffe14d');
    sfx(90, .1, 'sawtooth', .07); G.shake = 7; burst(hx, hy, t.player ? 0xffd1d1 : 0xffe14d); spark(hx + t.face * .4, hy + .2);
    t.act = null; t.flash = 8; t.vy = -4; t.stumble = 0; G.hitstop = 4;
  }
  t.hp -= dmg; t.stun = blocked ? 7 : 15; t.vx = dir * kb;
  if (t.hp <= 0) { t.hp = 0; t.ko = true; t.vx = dir * 7; t.vy = -8; t.act = null; sfx(70, .4, 'sawtooth', .09); G.hitstop = 10; }
  return true;
}
function spawnProj(f) {
  const k = f.def.proj;
  const p = { kind: k, owner: f, x: f.x + f.face * 30, y: k === 'wave' ? GY - 18 : f.y - 78, vx: f.face * (k === 'wave' ? 6 : k === 'fish' ? 8 : 6), t: 100, dmg: MOVES.special.dmg * f.dmgMul };
  p.mesh = projMesh(k); scene.add(p.mesh); projs.push(p);
}
function clearProj(p) { if (p.mesh) { scene.remove(p.mesh); p.mesh = null; } }
function projMesh(k) {
  const g = new THREE.Group();
  if (k === 'wave') {
    const cols = [0xff3d8b, 0xff8ec0, 0xffd23f];
    for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.RingGeometry(.7 + i * .3, .95 + i * .3, 7, 1, -1.1, 2.2), new THREE.MeshBasicMaterial({ color: cols[i], side: THREE.DoubleSide, fog: false })); r.position.x = -i * .5; g.add(r); }
  } else if (k === 'fish') {
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(.55, 0), mat({ color: 0xffc726 })); body.scale.set(1.7, .75, .5); g.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(.4, .7, 3), mat({ color: 0xff8a00 })); tail.rotation.z = Math.PI / 2; tail.position.x = -1.1; g.add(tail);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(.2, .5, 3), mat({ color: 0xff8a00 })); fin.position.y = .5; g.add(fin);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(.14, .14, .14), new THREE.MeshBasicMaterial({ color: 0xffffff })); eye.position.set(.55, .1, .22); g.add(eye);
  } else {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(.28, .22, .6, 6), mat({ color: 0xf0a500 })); g.add(c);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .14, 6), mat({ color: 0xffffff })); f.position.y = .37; g.add(f);
  }
  return g;
}
function tryHit(f, o, a) {
  if (o.ko) return false;
  const dx = (o.x - f.x) * f.face, dy = Math.abs(o.y - f.y);
  if (dx > -10 && dx < a.reach + 18 && dy < 60) return applyHit(o, f.x, f.face, a.dmg * f.dmgMul, a.kb);
  return false;
}
function step(f, o, inp) {
  f.anim++;
  f.vy += .65; f.y += f.vy; f.ground = false;
  if (f.y >= GY) { f.y = GY; f.vy = 0; f.ground = true; }
  f.x += f.vx; f.vx *= f.ground ? .82 : .98;
  f.x = Math.max(30, Math.min(W - 30, f.x));
  if (f.cd > 0) f.cd--; if (f.spcd > 0) f.spcd--; if (f.flash > 0) f.flash--;
  f.blocking = false; f.walking = false;
  if (f.ko) { f.koT++; return; }
  if (f.stun > 0) { f.stun--; return; }
  if (f.stumble > 0) { f.stumble--; f.act = null; f.vx += Math.sin(f.anim * .5) * .5 + f.stumbleDir * .12; return; }
  if (f.act) {
    const a = f.act; a.t++;
    if (!a.done && a.t >= a.start && a.t <= a.end) {
      if (a.type === 'special') { spawnProj(f); a.done = true; }
      else if (tryHit(f, o, a)) a.done = true;
    }
    if (a.t >= a.dur) f.act = null;
    return;
  }
  if (f.ground) f.face = o.x >= f.x ? 1 : -1;
  f.blocking = !!inp.block && f.ground;
  if (!f.blocking) {
    if (inp.left) { f.x -= f.spd; f.walking = true; }
    if (inp.right) { f.x += f.spd; f.walking = true; }
    if (inp.jump && f.ground) f.vy = -13;
    if (inp.special && f.spcd <= 0) startAct(f, 'special');
    else if (inp.kick && f.cd <= 0) startAct(f, 'kick');
    else if (inp.punch && f.cd <= 0) startAct(f, 'punch');
  }
}
function ai(f, o) {
  const inp = {};
  if (f.ko || f.stun > 0 || f.stumble > 0 || f.act) return inp;
  const d = o.x - f.x, ad = Math.abs(d);
  f.stumbleT--;
  if (f.stumbleT <= 0 && f.ground) {
    f.stumble = 42 + (Math.random() * 30 | 0); f.stumbleDir = Math.random() < .5 ? -1 : 1;
    f.stumbleT = 140 + (Math.random() * 200 | 0);
    sayAt(f, pick(['WHOOPS!', 'STEADY ON!', 'OOPS-A-DAISY!', 'TOO MUCH LAGER!']), '#fff');
    return inp;
  }
  if (o.act && o.act.t < 3 && ad < 120 && Math.random() < f.blk * 3) f.blockT = 22;
  if (f.blockT > 0) { f.blockT--; inp.block = true; return inp; }
  if (ad > 78) { if (d > 0) inp.right = true; else inp.left = true; }
  else if (ad < 40 && Math.random() < .03) { if (d > 0) inp.left = true; else inp.right = true; }
  if (f.cd <= 0) {
    if (ad < 85 && Math.random() < f.aggr * 2) inp[Math.random() < .4 ? 'kick' : 'punch'] = true;
    else if (ad > 220 && f.spcd <= 0 && Math.random() < .015) inp.special = true;
  }
  if (f.ground && Math.random() < .004) inp.jump = true;
  return inp;
}
function updateProjs() {
  for (const p of projs) {
    p.x += p.vx; p.t--;
    const tg = p.owner.player ? G.e : G.p;
    if (!tg.ko) {
      let hit = false;
      if (p.kind === 'wave') hit = Math.abs(p.x - tg.x) < 30 && tg.y > GY - 35;
      else hit = Math.abs(p.x - tg.x) < 26 && Math.abs(p.y - (tg.y - 70)) < 55;
      if (hit) { applyHit(tg, p.x, Math.sign(p.vx), p.dmg, 7); p.t = 0; }
    }
    if (p.x < -40 || p.x > W + 40) p.t = 0;
  }
  projs = projs.filter(p => { if (p.t <= 0) { clearProj(p); return false; } return true; });
}
function fightUpdate(live) {
  const p = G.p, e = G.e;
  const pin = live ? { left: isDown('left'), right: isDown('right'), jump: isDown('jump'), block: isDown('block'), punch: isHit('punch'), kick: isHit('kick'), special: isHit('special') } : {};
  step(p, e, pin);
  step(e, p, live ? ai(e, p) : {});
  const dx = e.x - p.x;
  if (Math.abs(dx) < 36 && Math.abs(e.y - p.y) < 40) { const push = (36 - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1); e.x += push; p.x -= push; }
  updateProjs();
}
function checkEnd() {
  const p = G.p, e = G.e; let w = null;
  if (p.ko && e.ko) w = 'draw'; else if (e.ko) w = 'p'; else if (p.ko) w = 'e';
  else if (G.time <= 0) { const a = p.hp / p.max, b = e.hp / e.max; w = a > b ? 'p' : b > a ? 'e' : 'draw'; }
  if (!w) return;
  G.state = 'roundEnd'; G.t = 170; G.rw = w;
  if (w === 'p') { G.pw++; p.cheer = true; } else if (w === 'e') { G.ew++; e.cheer = true; }
  banner(p.ko || e.ko ? 'K.O.!' : 'TIME!', w === 'draw' ? 'DRAW' : w === 'p' ? 'BAJAN WINS THE ROUND' : 'TOURIST WINS THE ROUND', true);
  updateHud();
}
function afterRound() {
  if (G.pw >= 2) { if (G.opp < TOURISTS.length - 1) { G.opp++; newOpponent(); } else endScreen(true); }
  else if (G.ew >= 2) endScreen(false);
  else { G.round++; startRound(); }
}
function endScreen(win) {
  G.state = win ? 'win' : 'lose'; G.t = 0; bannerEl.className = 't';
  $('end').className = 'ov t' + (win ? '' : ' lose'); $('end').style.display = 'block';
  $('endh').textContent = win ? 'BAJAN VICTORY!' : 'SUNBURNT & DEFEATED';
  $('endp').textContent = win ? 'THE TOURISTS HAVE GONE BACK TO THE ALL-INCLUSIVE.' : 'THE TOURISTS TOOK ALL THE SUN LOUNGERS. TRY AGAIN!';
  setHud(false);
}

/* ---------- select screen ---------- */
function toSelect() {
  G.state = 'select'; $('end').style.display = 'none'; $('menu').style.display = 'block'; setHud(false); bannerEl.className = 't';
  projs.forEach(clearProj); projs = [];
  menuF = [mk(BAJANS[0], -3.4 * PXU + W / 2, 1, true), mk(BAJANS[1], 3.4 * PXU + W / 2, -1, false), mk(TOURISTS[0], W / 2, -1, false)];
  menuF[2].stumbleDemo = true; menuF[2].zOff = -7;
  showOnly(menuF); applySel();
}
function applySel() { $('pk0').classList.toggle('sel', G.sel === 0); $('pk1').classList.toggle('sel', G.sel === 1); }

/* ---------- update (60 Hz) ---------- */
function update() {
  G.frame++;
  const S = G.state;
  if (G.hitstop > 0 && (S === 'fight' || S === 'roundEnd')) { G.hitstop--; return; }
  if (S === 'select') {
    menuF.forEach(f => f.anim++);
    if (isHit('left') || pressed.Digit1) { G.sel = 0; applySel(); }
    if (isHit('right') || pressed.Digit2) { G.sel = 1; applySel(); }
    if (pressed.Enter || pressed.Space || pressed.KeyJ || pressed.T_punch) startMatch(G.sel);
  } else if (S === 'intro') {
    G.t--; fightUpdate(false);
    if (G.t === 45) banner('FIGHT!', '', false);
    if (G.t <= 0) { G.state = 'fight'; sfx(660, .2, 'square', .06); }
  } else if (S === 'fight') {
    G.time--; fightUpdate(true); checkEnd();
  } else if (S === 'roundEnd') {
    G.t--; fightUpdate(false);
    if (G.t <= 0) afterRound();
  } else if (S === 'win' || S === 'lose') {
    fightUpdate(false); G.t++;
    if (G.t > 40 && (pressed.Enter || pressed.Space || pressed.KeyJ || pressed.T_punch || tapped)) toSelect();
  }
  tapped = false;
}
let tapped = false;
$('stage').addEventListener('pointerdown', e => {
  if (ac && ac.state === 'suspended') ac.resume();
  const r = $('stage').getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  if (G.state === 'select') { if (y > .2) { G.sel = x < .5 ? 0 : 1; applySel(); startMatch(G.sel); } }
  else if (G.state === 'win' || G.state === 'lose') tapped = true;
});

/* =====================================================================
   POSING / RENDER
   ===================================================================== */
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

function targets(f, selected) {
  const a = f.act, A = f.anim, s = Math.sin(A * .1) * .04;
  const T = { lean: -.06, twist: 0, nSh: .55 + s * 1.5, nEl: 1.9, fSh: .9 - s, fEl: 1.9, nTh: .35 + s, nKn: -.7 - s, fTh: -.25 - s, fKn: -.5 + s, tilt: 0, hop: 0, k: .38 };
  if (f.ko) { const k = Math.min(1, f.koT / 12); Object.assign(T, { tilt: 1.5 * k, lean: 0, nSh: 2.3, nEl: .5, fSh: 2.0, fEl: .4, nTh: .15, nKn: -.1, fTh: -.1, fKn: -.1, k: .35 }); }
  else if (f.cheer) { const c = Math.sin(A * .3); Object.assign(T, { lean: .05, nSh: 2.7 + c * .3, nEl: .4, fSh: 2.7 - c * .3, fEl: .4, nTh: .15, nKn: -.3, fTh: -.15, fKn: -.3, hop: Math.abs(Math.sin(A * .2)) * .5 }); }
  else if (f.stumble > 0 || f.stumbleDemo) {
    const w = Math.sin(A * .45);
    Object.assign(T, { lean: w * .45, twist: Math.sin(A * .3) * .4, nSh: 1 + Math.sin(A * .55) * 1.5, fSh: 1 - Math.sin(A * .55) * 1.5, nEl: .3, fEl: .3, nTh: Math.sin(A * .4) * .8, fTh: -Math.sin(A * .4) * .8, nKn: -.3, fKn: -.3, k: .5 });
  }
  else if (f.stun > 0) Object.assign(T, { lean: .38, nSh: -.5, nEl: .6, fSh: -.3, fEl: .4, nTh: .2, nKn: -.5, k: .6 });
  else if (f.blocking) Object.assign(T, { lean: -.15, nSh: 1.45, nEl: 2.2, fSh: 1.5, fEl: 2.3, nTh: .7, nKn: -1.2, fTh: -.2, fKn: -.8 });
  else if (a) {
    const t = a.t; T.k = .7;
    if (a.type === 'punch') {
      let sh, el, tw;
      if (t < a.start) { const u = t / a.start; sh = lerp(.55, -.5, u); el = lerp(1.9, 2.0, u); tw = -.3 * u; }
      else if (t <= a.end) { sh = 1.55; el = .05; tw = .5; }
      else { const u = (t - a.end) / (a.dur - a.end); sh = lerp(1.55, .55, u); el = lerp(.05, 1.9, u); tw = lerp(.5, 0, u); }
      Object.assign(T, { nSh: sh, nEl: el, twist: tw, lean: -.12, nTh: .6, nKn: -.9, fTh: -.4, fKn: -.4 });
    } else if (a.type === 'kick') {
      let th, kn;
      if (t < a.start) { const u = t / a.start; th = lerp(.35, -.2, u); kn = lerp(-.7, -1.5, u); }
      else if (t <= a.end) { th = 1.5; kn = -.05; }
      else { const u = (t - a.end) / (a.dur - a.end); th = lerp(1.5, .35, u); kn = lerp(-.05, -.7, u); }
      Object.assign(T, { nTh: th, nKn: kn, fTh: -.1, fKn: -.25, lean: t <= a.end ? .3 : .15, nSh: .2, nEl: 1.6, fSh: -.6, fEl: .6 });
    } else {
      let sh, el;
      if (t < a.start) { const u = t / a.start; sh = lerp(.7, -.3, u); el = lerp(1.9, 2.0, u); }
      else if (t <= a.start + 6) { sh = 1.55; el = .08; }
      else { const u = (t - a.start - 6) / (a.dur - a.start - 6); sh = lerp(1.55, .7, u); el = lerp(.08, 1.9, u); }
      Object.assign(T, { nSh: sh, fSh: sh, nEl: el, fEl: el, lean: -.15, nTh: .55, nKn: -.8, fTh: -.35, fKn: -.5 });
    }
  }
  else if (!f.ground) Object.assign(T, { nSh: .9, nEl: 1.4, fSh: 1.2, fEl: 1.4, nTh: .9, nKn: -1.3, fTh: -.2, fKn: -.9, lean: -.05 });
  else if (f.walking) {
    const ph = A * .3, sn = Math.sin(ph), cs = Math.cos(ph);
    Object.assign(T, { nTh: .7 * sn, fTh: -.7 * sn, nKn: -.2 - .8 * Math.max(0, cs), fKn: -.2 - .8 * Math.max(0, -cs), nSh: .55 + sn * .15, fSh: .9 - sn * .15, lean: -.1 });
  }
  return T;
}
const sm = (R, k, t, kk) => { const c = R.pose[k] === undefined ? t : R.pose[k]; return R.pose[k] = c + (t - c) * kk; };

function poseFighter(f, yawOverride, scale = 1) {
  const R = f.rig, T = targets(f), kk = T.k, P = k => sm(R, k, T[k], kk);
  const nTh = P('nTh'), nKn = P('nKn'), fTh = P('fTh'), fKn = P('fKn');
  R.legN.j1.rotation.z = nTh; R.legN.j2.rotation.z = nKn; R.legF.j1.rotation.z = fTh; R.legF.j2.rotation.z = fKn;
  R.armN.j1.rotation.z = P('nSh'); R.armN.j2.rotation.z = P('nEl'); R.armF.j1.rotation.z = P('fSh'); R.armF.j2.rotation.z = P('fEl');
  R.waist.rotation.z = P('lean'); R.waist.rotation.y = P('twist');
  R.tilt.rotation.z = P('tilt'); R.tilt.position.y = P('tilt') * .23;
  const foot = (th, kn) => L1 * Math.cos(th) + L2 * Math.cos(th + kn) + FH * Math.cos(th + kn);
  const py = f.ko ? .9 : Math.max(foot(nTh, nKn), foot(fTh, fKn));
  R.pelvis.position.y = py + P('hop');
  R.head.rotation.z = f.stun > 0 ? .3 : -.04 + Math.sin(f.anim * .1) * .02;
  R.braids.forEach(b => { b.g.rotation.z = Math.sin(f.anim * .1 + b.ph) * .1 + (f.walking ? .2 : 0) + (f.stun > 0 ? .5 : 0); });

  const want = yawOverride !== undefined ? yawOverride : (f.face > 0 ? -.38 : Math.PI + .38);
  if (R.yaw === undefined) R.yaw = want; R.yaw += angDiff(R.yaw, want) * .22;
  R.root.rotation.y = R.yaw; R.root.scale.setScalar(scale);
  const x3 = wx(f.x), y3 = wy(f.y), z3 = f.zOff || 0;
  R.root.position.set(x3, y3, z3);
  R.shadow.position.set(x3, .03, z3);
  const sh = Math.max(.35, 1 - y3 / 6) * scale; R.shadow.scale.set(sh, sh, sh);
  const fl = f.flash > 0 && f.flash % 4 < 2 ? .75 : 0;
  R.mats.forEach(m => m.emissive.setRGB(fl, fl, fl));
}

let camX = 0, camY = 3.4, camZ = 17, lookX = 0, lookY = 2.3;
function updateCam() {
  let tx = 0, ty = 3.4, tz = 17, lx = 0, ly = 2.3;
  if (G.state === 'select') { tz = 10.8; ty = 2.7; ly = 2.0; }
  else if (G.p && G.e) {
    const a = wx(G.p.x), b = wx(G.e.x), d = Math.abs(a - b);
    tx = (a + b) / 2 * .78; lx = tx; tz = Math.max(14.5, Math.min(19, (d + 7.5) / 1.18));
    ty = 2.6 + tz * .05; ly = 2.2;
  }
  camX += (tx - camX) * .08; camY += (ty - camY) * .08; camZ += (tz - camZ) * .08; lookX += (lx - lookX) * .08; lookY += (ly - lookY) * .08;
  const sx = (Math.random() - .5) * G.shake * .06, sy = (Math.random() - .5) * G.shake * .06;
  if (G.shake > 0) { G.shake *= .85; if (G.shake < .3) G.shake = 0; }
  cam.position.set(camX + sx, camY + sy, camZ); cam.lookAt(lookX, lookY, 0);
}

function setHud(on) { $('hud').style.display = on ? 'block' : 'none'; }
function updateHud() {
  if (!G.p || !G.e) return;
  $('n1').textContent = G.char.name; $('n2').textContent = G.e.def.name;
  [[G.p, 1], [G.e, 2]].forEach(([f, n]) => {
    const pct = Math.max(0, f.hp / f.max * 100); f.trail += (f.hp - f.trail) * .06; if (Math.abs(f.trail - f.hp) < .1) f.trail = f.hp;
    $('h' + n).style.width = pct + '%'; $('t' + n).style.width = Math.max(0, f.trail / f.max * 100) + '%';
  });
  const pp = $('p1').children, ep = $('p2').children;
  for (let i = 0; i < 2; i++) { pp[i].className = i < G.pw ? 'on' : ''; ep[i].className = i < G.ew ? 'on' : ''; }
  $('tm').textContent = Math.max(0, Math.ceil(G.time / 60));
  $('oppn').textContent = 'TOURIST ' + (G.opp + 1) + '/3';
}

function render(ts) {
  const t = ts / 1000;
  // animate world
  if (stage.sea) {
    const pa = stage.sea.geometry.attributes.position, base = stage.seaBase;
    for (let i = 0; i < pa.count; i++) { const x = base[i * 3], z = base[i * 3 + 2]; pa.array[i * 3 + 1] = Math.sin(x * .25 + t * 1.3) * .22 + Math.cos(z * .3 + t) * .18; }
    pa.needsUpdate = true; stage.sea.geometry.computeVertexNormals();
  }
  stage.foam.position.z = -13.6 + Math.sin(t * .8) * .7; stage.foam.material.opacity = .6 + Math.sin(t * .8) * .35;
  stage.clouds.forEach(c => { c.position.x += c.userData.sp; if (c.position.x > 170) c.position.x = -170; });
  stage.boats.forEach(b => { b.g.position.y = -.3 + Math.sin(t + b.ph) * .15; b.g.rotation.z = Math.sin(t * .8 + b.ph) * .05; });
  stage.flags.forEach(f => { const pa = f.m.geometry.attributes.position; for (let i = 0; i < pa.count; i++) { const x = f.base[i * 3]; pa.array[i * 3 + 2] = Math.sin(x * 2.6 - t * 5) * .16 * (x + 1.4) / 2.8; } pa.needsUpdate = true; });
  // fighters
  if (G.state === 'select') {
    menuF.forEach((f, i) => {
      if (i < 2) {
        const sel = G.sel === i, want = sel ? (f.rig.yaw === undefined ? 0 : f.rig.yaw + .045) : (i === 0 ? -.4 : Math.PI + .4);
        poseFighter(f, sel ? want : want, sel ? 1.12 : .96);
      } else poseFighter(f, Math.PI + .45, .95);
    });
  } else if (G.p) {
    poseFighter(G.p); poseFighter(G.e);
  }
  // fx
  for (const p of parts) { p.mesh.position.x += p.vx; p.mesh.position.y += p.vy; p.mesh.position.z += p.vz; p.vy -= .02; p.t--; if (p.t <= 0) scene.remove(p.mesh); }
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].t <= 0) parts.splice(i, 1);
  for (const s of sparks) { s.t--; s.s.scale.setScalar(2.2 * s.big * s.t / 9); s.s.material.rotation += .3; if (s.t <= 0) { scene.remove(s.s); s.s.material.dispose(); } }
  for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].t <= 0) sparks.splice(i, 1);
  projs.forEach(p => {
    if (!p.mesh) return; p.mesh.position.set(wx(p.x), wy(p.y), 0);
    p.mesh.scale.x = Math.sign(p.vx) || 1;
    if (p.kind === 'pint') p.mesh.rotation.z = G.frame * -.4 * Math.sign(p.vx);
    if (p.kind === 'fish') p.mesh.rotation.z = Math.sin(G.frame * .5) * .25;
  });
  updateCam();
  if (G.state !== 'select') updateHud();
  renderer.setRenderTarget(rt); renderer.render(scene, cam);
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}

/* ---------- boot / loop ---------- */
function fit() {
  const w = $('stage').clientWidth; document.documentElement.style.setProperty('--u', (w / 100) + 'px');
}
addEventListener('resize', fit); fit();
toSelect();
let last = 0, acc = 0;
function loop(ts) {
  acc += Math.min(100, ts - last); last = ts;
  while (acc >= 16.67) { update(); acc -= 16.67; for (const k in pressed) delete pressed[k]; }
  render(ts); requestAnimationFrame(loop);
}
requestAnimationFrame(ts => { last = ts; loop(ts); });
window.__G = G; // handy for debugging
