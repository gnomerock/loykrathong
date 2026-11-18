import * as THREE from 'three';

/* =====================================================================
 *  ลอยกระทง 2569 – Loy Krathong idle game  (three.js, 2.5HD)
 *  painted 2D layers + sprite characters living in a real 3D scene
 *  with a perspective camera (parallax), water shader, additive glows.
 * ===================================================================== */

const Q = new URLSearchParams(location.search);
if (Q.get('hud') === '0') document.body.classList.add('nohud');

const BG_W = 768, BG_H = 1376;                    // painted background size = world units (1 unit = 1 bg pixel)
const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/* ---------------------------------------------------------------- scene layout (bg pixel coordinates) */
const WATER_Y = 1000;                             // below this = river
const PIER_SLOTS = [548, 590, 632];               // x where a character stands to float a krathong
const ENTER_X = -80;
const groundY = (x, lane) => {                    // lane 0 = back .. 1 = front, returns bg-pixel y of the feet
  const promenade = 838 + lane * 30;
  const deck = 858 + clamp(x - 440, 0, 400) * 0.115 + lane * 14;
  return lerp(promenade, deck, smooth(420, 470, x));
};

/* ---------------------------------------------------------------- three.js setup */
const stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x07182b);
const scene = new THREE.Scene();
const FOV = 30, ZOOM = 1.06;
const camera = new THREE.PerspectiveCamera(FOV, 9 / 16, 50, 9000);
const CAM_D = (BG_H / ZOOM / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
camera.position.set(0, 0, CAM_D);
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage); resize();

const W = (px, py, z = 0) => new THREE.Vector3(px - BG_W / 2, BG_H / 2 - py, z);   // bg px -> world
const quadB = new THREE.PlaneGeometry(1, 1); quadB.translate(0, 0.5, 0);           // origin bottom-centre
const quadC = new THREE.PlaneGeometry(1, 1);                                       // origin centre
const texLoader = new THREE.TextureLoader();
const loadTex = (url) => new Promise((res) => texLoader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, () => res(null)));

const mkMat = (map, extra = {}) => new THREE.MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, ...extra });

/* soft procedural textures */
function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowTex = canvasTex(128, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); });
const shadowTex = canvasTex(64, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(0,0,0,.75)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); });

/* ---------------------------------------------------------------- assets */
const A = {};          // textures
let MAN = {};          // sprite sizes
async function loadAssets() {
  MAN = await (await fetch('assets/manifest.json')).json();
  const names = ['bg_night.jpg', ...Object.keys(MAN).map((k) => k + '.png')];
  const tex = await Promise.all(names.map((n) => loadTex('assets/' + n)));
  names.forEach((n, i) => { A[n.replace(/\.\w+$/, '')] = tex[i]; });
}

/* ---------------------------------------------------------------- background plane with living water */
let bgMat;
function buildBackground() {
  bgMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: A.bg_night }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D map; uniform float time; varying vec2 vUv;
      void main(){
        vec2 uv = vUv; float yT = 1.0 - uv.y;
        float w = smoothstep(0.715, 0.775, yT);
        float depth = clamp((yT - 0.715) / 0.285, 0.0, 1.0);
        float amp = w * (0.0007 + 0.0042 * depth);
        float wave = sin(yT * 130.0 - time * 1.25 + sin(uv.x * 9.0 + time * 0.4) * 2.0);
        uv.x += wave * amp + sin(uv.x * 28.0 + time * 0.8 + yT * 40.0) * amp * 0.4;
        uv.y += cos(yT * 85.0 - time * 0.9) * amp * 0.35;
        vec4 c = texture2D(map, uv);
        float sh = pow(max(0.0, sin(yT * 210.0 - time * 1.5 + uv.x * 25.0) * sin(uv.x * 17.0 + time * 0.5)), 6.0);
        c.rgb += w * sh * vec3(0.05, 0.07, 0.085) * (0.3 + depth);
        gl_FragColor = vec4(c.rgb, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  const m = new THREE.Mesh(quadC, bgMat); m.scale.set(BG_W, BG_H, 1); m.renderOrder = 0; scene.add(m);
  return m;
}

/* ---------------------------------------------------------------- glows (lamps, windows, lanterns, moon) */
const glows = [];
function addGlow(px, py, size, color, opts = {}) {
  const mat = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, opacity: opts.opacity ?? 0.7 });
  const s = new THREE.Sprite(mat); s.position.copy(W(px, py, opts.z ?? 5)); s.scale.set(size, size, 1); s.renderOrder = 3000;
  scene.add(s); glows.push({ s, base: opts.opacity ?? 0.7, size, ph: Math.random() * 6.28, sp: opts.speed ?? rand(1.5, 3.5), amt: opts.flicker ?? 0.18 });
  return s;
}
function buildGlows() {
  addGlow(516, 190, 520, 0xaad4ff, { opacity: 0.32, flicker: 0.04, speed: 0.4 });                // moon halo
  addGlow(510, 1092, 230, 0xcfe6ff, { opacity: 0.22, flicker: 0.1, speed: 0.8 });                  // moon reflection
  [[522, 782], [609, 826], [724, 813]].forEach(([x, y]) => { addGlow(x, y, 120, 0xffb347, { opacity: 0.85 }); addGlow(x, y + 190, 100, 0xff9a3a, { opacity: 0.25, flicker: 0.3 }); }); // pier lamps + reflection
  [[338, 690], [376, 690], [416, 688], [312, 668]].forEach(([x, y]) => addGlow(x, y, 70, 0xffa43a, { opacity: 0.55, flicker: 0.1 }));  // ubosot windows
  [[23, 553], [85, 590], [125, 600], [157, 575], [18, 665], [40, 690]].forEach(([x, y]) => addGlow(x, y, 78, 0xffa347, { opacity: 0.55 })); // hanging lanterns
  [[210, 640], [260, 700]].forEach(([x, y]) => addGlow(x, y, 160, 0xffc766, { opacity: 0.18, flicker: 0.06 }));                       // stupa warmth
}

/* ---------------------------------------------------------------- particles & fireflies */
const parts = [];
function spark(px, py, n, color = 0xffd27a, speed = 70, life = 1.1, size = 14) {
  for (let i = 0; i < n; i++) {
    if (parts.length > 260) return;
    const mat = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    const s = new THREE.Sprite(mat); s.renderOrder = 3500; scene.add(s);
    const a = rand(0, 6.28), v = rand(0.3, 1) * speed;
    parts.push({ s, x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.35, life, age: 0, size: size * rand(0.6, 1.3) });
    s.position.copy(W(px, py, 60));
  }
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.age += dt;
    if (p.age >= p.life) { scene.remove(p.s); p.s.material.dispose(); parts.splice(i, 1); continue; }
    p.vy += 40 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const k = p.age / p.life;
    p.s.position.set(p.x - BG_W / 2, BG_H / 2 - p.y, 60);
    p.s.scale.setScalar(p.size * (1 - k * 0.5)); p.s.material.opacity = 1 - k;
  }
}
const flies = [];
function buildFireflies() {
  for (let i = 0; i < 26; i++) {
    const mat = new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1a0, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    const s = new THREE.Sprite(mat); s.renderOrder = 3400; scene.add(s);
    flies.push({ s, cx: rand(20, 740), cy: rand(560, 960), ph: rand(0, 6.28), r: rand(10, 40), sp: rand(0.2, 0.6) });
  }
}

/* ---------------------------------------------------------------- sky lanterns (khom loi) */
const skyL = [];
function launchLantern(px = rand(120, 650), py = rand(560, 760), big = false) {
  if (skyL.length > 36) return;
  const key = 'l' + (1 + ((Math.random() * 4) | 0)); const [w, h] = MAN[key];
  const m = new THREE.Mesh(quadC, mkMat(A[key], { opacity: 0 }));
  const H = (big ? 70 : 46) * rand(0.9, 1.2); m.scale.set(H * w / h, H, 1); m.renderOrder = 60; scene.add(m);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa94a, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, opacity: 0.7 }));
  halo.scale.set(H * 2.4, H * 2.4, 1); halo.renderOrder = 3100; scene.add(halo);
  skyL.push({ m, halo, x: px, y: py, vy: -rand(22, 40), ph: rand(0, 6.28), age: 0, H });
}
function updateSky(dt, t) {
  for (let i = skyL.length - 1; i >= 0; i--) {
    const l = skyL[i]; l.age += dt; l.y += l.vy * dt; l.x += Math.sin(t * 0.6 + l.ph) * 6 * dt + 3 * dt;
    const k = clamp((l.y + 40) / 760, 0, 1);                                  // 1 low .. 0 high => smaller as it rises
    const sc = lerp(0.35, 1, k);
    const a = clamp(l.age / 1.2, 0, 1) * clamp((l.y + 40) / 160, 0, 1);
    l.m.position.copy(W(l.x, l.y, -10)); l.m.scale.set(l.H * sc * MAN_AR(l), l.H * sc, 1);
    l.m.material.opacity = a; l.m.material.color.setRGB(1, 1, 1);
    l.halo.position.copy(W(l.x, l.y + l.H * 0.15 * sc, -9)); l.halo.scale.setScalar(l.H * 2.4 * sc * (1 + Math.sin(t * 5 + l.ph) * 0.06)); l.halo.material.opacity = 0.65 * a;
    if (l.y < -50) { scene.remove(l.m); scene.remove(l.halo); l.m.material.dispose(); l.halo.material.dispose(); skyL.splice(i, 1); }
  }
}
const MAN_AR = (l) => l.m.userData.ar ?? (l.m.userData.ar = l.m.material.map.image.width / l.m.material.map.image.height);

/* ---------------------------------------------------------------- game state / idle economy */
const UPG = [
  { id: 'faith', name: 'ศรัทธา', desc: 'บุญ/กระทง', icon: '🪷', base: 15, mult: 1.45 },
  { id: 'crowd', name: 'ชาวบ้าน', desc: 'คนมาลอยเพิ่ม', icon: '🧑‍🤝‍🧑', base: 40, mult: 1.6 },
  { id: 'candle', name: 'เทียนหอม', desc: 'บุญ/วินาที', icon: '🕯️', base: 25, mult: 1.5 },
  { id: 'luck', name: 'ฤกษ์ดี', desc: 'โบนัสผู้ชม', icon: '🌕', base: 120, mult: 1.9 },
];
const SAVE_KEY = 'loy2569.save.v1';
const fresh = () => ({ merit: 0, total: 0, krathongs: 0, lv: { faith: 0, crowd: 0, candle: 0, luck: 0 }, t: Date.now() });
let S = fresh();
try { const o = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (o) S = { ...fresh(), ...o, lv: { ...fresh().lv, ...o.lv } }; } catch (e) { /* ignore */ }
const floatValue = () => 1 + S.lv.faith;
const viewerMult = () => 1 + S.lv.luck * 0.5;
const npcInterval = () => Math.max(1.6, 12 / (1 + 0.4 * S.lv.crowd));
const passiveRate = () => S.lv.candle * (0.6 + krathongs.length * 0.08);
const cost = (u) => Math.floor(u.base * Math.pow(u.mult, S.lv[u.id]));
const fmt = (n) => { if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toString(); const u = ['K', 'M', 'B', 'T']; let i = -1; while (n >= 1000 && i < 3) { n /= 1000; i++; } return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + u[i]; };
function gain(v) { S.merit += v; S.total += v; }
function save() { S.t = Date.now(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

/* ---------------------------------------------------------------- screen helpers (labels / pops) */
const labelsEl = $('#labels'), popsEl = $('#pops');
const tmpV = new THREE.Vector3();
function toScreen(wx, wy, wz = 0) {
  tmpV.set(wx, wy, wz).project(camera);
  return { x: (tmpV.x * 0.5 + 0.5) * stage.clientWidth, y: (-tmpV.y * 0.5 + 0.5) * stage.clientHeight };
}
function popText(px, py, text) {
  const s = toScreen(px - BG_W / 2, BG_H / 2 - py, 40);
  const e = document.createElement('div'); e.className = 'pop'; e.textContent = text;
  e.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-50%)`; popsEl.appendChild(e); setTimeout(() => e.remove(), 1500);
}
const feedEl = $('#feed');
function feed(cls, text) {
  const li = document.createElement('li'); li.className = 'f-' + cls; li.textContent = text; feedEl.appendChild(li);
  while (feedEl.children.length > 4) feedEl.firstChild.remove();
  setTimeout(() => { li.style.opacity = 0; setTimeout(() => li.remove(), 500); }, 6000);
}

/* ---------------------------------------------------------------- audio (tiny synth chimes) */
let actx = null, muted = false, musicOn = Q.get('music') !== '0';
const AUDIO_KEY = 'loy2569.audio';
try { const a = JSON.parse(localStorage.getItem(AUDIO_KEY) || 'null'); if (a) { muted = !!a.muted; if (Q.get('music') !== '0') musicOn = a.music !== false; } } catch (e) { /* ignore */ }
const saveAudio = () => { try { localStorage.setItem(AUDIO_KEY, JSON.stringify({ muted, music: musicOn })); } catch (e) { /* ignore */ } };
const getCtx = () => (actx = actx || new (window.AudioContext || window.webkitAudioContext)());
/* background song (generated instrumental Loy Krathong melody, loops) */
const BGM_VOL = 0.3;
let bgmBuf = null, bgmSrc = null, bgmGain = null, bgmLoading = false, bgmStarted = false;
async function bgmStart() {
  if (bgmStarted || bgmLoading || !musicOn) return;
  try {
    const c = getCtx(); if (c.state === 'suspended') await c.resume();
    if (!bgmBuf) { bgmLoading = true; const r = await fetch('assets/bgm.mp3'); bgmBuf = await c.decodeAudioData(await r.arrayBuffer()); bgmLoading = false; }
    if (!musicOn || bgmStarted) return;
    bgmGain = c.createGain(); bgmGain.gain.setValueAtTime(0, c.currentTime); bgmGain.gain.linearRampToValueAtTime(BGM_VOL, c.currentTime + 2.5);
    bgmSrc = c.createBufferSource(); bgmSrc.buffer = bgmBuf; bgmSrc.loop = true; bgmSrc.connect(bgmGain).connect(c.destination); bgmSrc.start();
    bgmStarted = true;
  } catch (e) { bgmLoading = false; /* blocked or failed: retried on next tap */ }
}
function bgmStop() {
  if (!bgmStarted) return;
  const c = actx, g = bgmGain, src = bgmSrc; bgmStarted = false;
  try { g.gain.cancelScheduledValues(c.currentTime); g.gain.setValueAtTime(g.gain.value, c.currentTime); g.gain.linearRampToValueAtTime(0, c.currentTime + 0.4); src.stop(c.currentTime + 0.45); } catch (e) { /* ignore */ }
}
// browsers block audio until a gesture: start the song on the first tap/key
['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, () => { if (musicOn && !bgmStarted) bgmStart(); }, { passive: true }));
document.addEventListener('visibilitychange', () => { if (!actx) return; if (document.hidden) actx.suspend(); else actx.resume(); });
function chime(freqs = [880], vol = 0.05) {
  if (muted) return;
  try {
    getCtx();
    freqs.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + i * 0.09;
      o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + 1);
    });
  } catch (e) { /* ignore */ }
}

/* ---------------------------------------------------------------- krathong on the water */
const krathongs = [];
function dropKrathong(x0, y0, x1, y1, opts = {}) {
  const key = opts.key || 'k' + (1 + ((Math.random() * 4) | 0)); const [w, h] = MAN[key];
  const gold = !!opts.gold, size = (gold ? 130 : 80) * rand(0.92, 1.08);
  const body = new THREE.Mesh(quadB, mkMat(A[key])); body.renderOrder = 200; scene.add(body);
  const refl = new THREE.Mesh(quadB, mkMat(A[key], { opacity: 0.22, color: 0x7fb4ff })); refl.renderOrder = 120; scene.add(refl);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: gold ? 0xffd34a : 0xffa94a, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, opacity: 0.8 })); halo.renderOrder = 3050; scene.add(halo);
  krathongs.push({ body, refl, halo, ar: w / h, size, x: x0, y: y0, x1, y1, t: 0, fall: opts.fall ?? 0.9, phase: 'fall', age: 0, ph: rand(0, 6.28), value: opts.value ?? floatValue(), gold, drift: rand(6, 20), sink: rand(2, 6), life: gold ? 130 : rand(70, 95), fading: false });
  if (krathongs.length > 34) { const o = krathongs.find((k) => !k.fading); if (o) o.fading = true; }
}
function updateKrathongs(dt, t) {
  for (let i = krathongs.length - 1; i >= 0; i--) {
    const k = krathongs[i]; k.age += dt;
    let yy, xx, a = 1, lift = 0;
    if (k.phase === 'fall') {
      k.t += dt; const u = clamp(k.t / k.fall, 0, 1);
      xx = lerp(k.x, k.x1, u); yy = lerp(k.y, k.y1, u * u) - Math.sin(u * Math.PI) * 70; lift = 0;
      if (u >= 1) {
        k.phase = 'float'; k.x = k.x1; k.y = k.y1; gain(k.value); S.krathongs++; popText(k.x, k.y - 40, '+' + fmt(k.value));
        spark(k.x, k.y, k.gold ? 26 : 9, k.gold ? 0xffe27a : 0xffc46a, 60, 0.9, 12); chime(k.gold ? [660, 880, 1320] : [784, 1175], 0.035);
        ripple(k.x, k.y);
      }
    } else { k.x -= k.drift * dt; k.y += k.sink * dt; xx = k.x; yy = k.y + Math.sin(t * 1.7 + k.ph) * 1.4; }
    if (k.age > k.life || k.y > 1215) k.fading = true;
    if (k.fading) { k.fade = (k.fade ?? 1) - dt * 0.4; a = Math.max(k.fade, 0); if (a <= 0) { scene.remove(k.body, k.refl, k.halo); k.body.material.dispose(); k.refl.material.dispose(); k.halo.material.dispose(); krathongs.splice(i, 1); continue; } }
    const sc = lerp(0.55, 1.35, clamp((yy - 1000) / 380, 0, 1)) * (k.phase === 'fall' ? 1.05 : 1);
    const H = k.size * sc, Wd = H * k.ar;
    const wp = W(xx, yy, 20);
    k.body.position.set(wp.x, wp.y, 20); k.body.scale.set(Wd, H, 1); k.body.rotation.z = Math.sin(t * 1.3 + k.ph) * 0.05;
    k.body.material.opacity = a; k.body.renderOrder = 200 + (yy | 0);
    k.refl.position.set(wp.x + Math.sin(t * 2 + k.ph) * 2, wp.y - 2, 19); k.refl.scale.set(Wd, -H * 0.55, 1); k.refl.material.opacity = 0.2 * a * (k.phase === 'float' ? 1 : 0);
    k.halo.position.set(wp.x, wp.y + H * 0.62, 21); k.halo.scale.setScalar(H * (1.1 + Math.sin(t * 9 + k.ph) * 0.06)); k.halo.material.opacity = (0.55 + Math.sin(t * 11 + k.ph * 3) * 0.12) * a;
  }
}
const ripples = [];
function ripple(x, y) {
  const m = new THREE.Mesh(quadC, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthTest: false, depthWrite: false, opacity: 0.6 }));
  m.renderOrder = 110; scene.add(m); ripples.push({ m, x, y, age: 0 });
}
const ringTex = canvasTex(128, (g, s) => { g.strokeStyle = 'rgba(200,230,255,.9)'; g.lineWidth = 3; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 6, 0, 6.283); g.stroke(); });
function updateRipples(dt) {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i]; r.age += dt; const u = r.age / 1.6;
    if (u >= 1) { scene.remove(r.m); r.m.material.dispose(); ripples.splice(i, 1); continue; }
    const p = W(r.x, r.y + 4, 15); r.m.position.copy(p); r.m.scale.set(20 + u * 90, (20 + u * 90) * 0.3, 1); r.m.material.opacity = 0.6 * (1 - u);
  }
}

/* ---------------------------------------------------------------- characters */
const chars = [];
const byUser = new Map();
const slotOwner = PIER_SLOTS.map(() => null);
const MAX_CHARS = 14;
const REF_H = 415, CHAR_H = 205;
const labels = new Map();

class Char {
  constructor(opts) {
    this.user = opts.user || null; this.viewer = !!opts.user;
    const id = this.user ? this.user.id : String(Math.random());
    const hh = hash(id);
    this.gender = opts.gender || (hh & 1 ? 'f' : 'm');
    this.variant = opts.variant || (1 + ((hh >> 1) % 4));
    this.key = this.gender + this.variant;
    const [w, h] = MAN[this.key]; this.H = CHAR_H * (h / REF_H); this.Wd = this.H * w / h;
    this.lane = this.laneGoal = rand(0.05, 0.95); this.x = ENTER_X; this.state = 'enter'; this.t = 0; this.phase = rand(0, 6.28); this.dir = 1;
    this.speed = rand(52, 76); this.queue = []; this.carry = false; this.lastActive = performance.now(); this.slot = -1; this.hopT = 0; this.wait = 0;
    this.goal = rand(70, 400); this.stayUntil = 0; this.leaving = false;

    this.g = new THREE.Group(); scene.add(this.g);
    this.shadow = new THREE.Mesh(quadC, mkMat(shadowTex, { opacity: 0.8 })); this.g.add(this.shadow);
    this.body = new THREE.Mesh(quadB, mkMat(A[this.key], { color: 0xffffff })); this.g.add(this.body);
    this.carryM = new THREE.Mesh(quadB, mkMat(A['k' + (1 + ((Math.random() * 4) | 0))])); this.carryM.visible = false; this.g.add(this.carryM);
    this.carryHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa94a, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, opacity: 0.7 })); this.carryHalo.visible = false; this.g.add(this.carryHalo);
    this.body.scale.set(this.Wd, this.H, 1);
    if (this.user) this.makeLabel();
    this.apply(0);
  }
  makeLabel() {
    const el = document.createElement('div'); el.className = 'lab vip';
    el.innerHTML = '<div class="tag"></div>'; this.name = this.user.nickname || this.user.uniqueId || 'guest'; el.firstChild.textContent = this.name;
    labelsEl.appendChild(el); this.label = el; this.bub = null;
  }
  say(text) {
    if (!this.label) return;
    text = String(text).slice(0, 80);
    if (this.bub) this.bub.remove();
    const b = document.createElement('div'); b.className = 'bub'; b.textContent = text; this.label.insertBefore(b, this.label.firstChild); this.bub = b;
    clearTimeout(this.bubT1); clearTimeout(this.bubT2);
    const ms = 3500 + text.length * 55;
    this.bubT1 = setTimeout(() => b.classList.add('out'), ms); this.bubT2 = setTimeout(() => { b.remove(); if (this.bub === b) this.bub = null; }, ms + 450);
  }
  badge(emoji) { if (this.label) this.label.firstChild.textContent = emoji + ' ' + this.name; }
  poke() { this.lastActive = performance.now(); }
  hop() { this.hopT = 0.0001; }
  queueFloat(opts = {}) { this.queue.push(opts); this.poke(); if (this.state === 'idle') this.state = 'idleReady'; }
  y() { return groundY(this.x, this.lane); }
  walkTo(gx, nextState) { this.goal = gx; this.after = nextState; this.state = 'walk'; }
  leave() { if (this.leaving) return; this.leaving = true; this.freeSlot(); this.goal = ENTER_X - 10; this.after = 'gone'; this.state = 'walk'; }
  freeSlot() { if (this.slot >= 0 && slotOwner[this.slot] === this) slotOwner[this.slot] = null; this.slot = -1; }
  takeSlot() { for (let i = 0; i < PIER_SLOTS.length; i++) if (!slotOwner[i]) { slotOwner[i] = this; this.slot = i; return true; } return false; }

  update(dt, t) {
    this.t += dt; this.lane += (this.laneGoal - this.lane) * Math.min(1, dt * 3);
    const now = performance.now();
    switch (this.state) {
      case 'enter': this.walkTo(this.viewer ? rand(80, 380) : PIER_SLOTS[0] - 40, this.viewer ? 'idle' : 'toPier'); break;
      case 'walk': {
        const dx = this.goal - this.x; this.dir = Math.sign(dx) || this.dir;
        const sp = this.speed * (this.carry ? 0.85 : 1); this.x += clamp(dx, -sp * dt, sp * dt); this.phase += dt * sp * 0.115;
        if (Math.abs(dx) < 2) { this.state = this.after; this.t = 0; if (this.state === 'gone') this.dead = true; if (this.state === 'idle') this.nextWander = now + rand(3000, 8000); }
        break;
      }
      case 'idle': case 'idleReady': {
        this.phase += dt * 1.6;
        if (this.queue.length && !this.leaving) { this.carry = true; this.carryKey = 'k' + (1 + ((Math.random() * 4) | 0)); this.carryM.material.map = A[this.carryKey]; this.carryMeta = MAN[this.carryKey]; this.carryM.visible = this.carryHalo.visible = true; this.walkTo(PIER_SLOTS[0], 'toPier'); break; }
        if (now > this.nextWander) { this.nextWander = now + rand(4000, 9000); this.laneGoal = rand(0.05, 0.95); this.walkTo(clamp(this.x + rand(-120, 120), 50, 400), 'idle'); }
        if (this.viewer && now - this.lastActive > 100000 && !this.queue.length) this.leave();
        break;
      }
      case 'toPier': {           // arrived near pier, wait for a free slot then step to it
        if (this.slot < 0 && !this.takeSlot()) { this.phase += dt; this.wait += dt; if (this.wait > 25) { this.carry = false; this.carryM.visible = this.carryHalo.visible = false; this.queue.length = 0; this.leave(); } break; }
        this.laneGoal = 0.5; this.goal = PIER_SLOTS[this.slot]; this.after = 'float'; this.state = 'walk';
        if (!this.carry) { this.carry = true; this.carryM.visible = this.carryHalo.visible = true; }
        break;
      }
      case 'float': {
        this.dir = 1; const u = this.t;
        if (!this.released && u > 1.0) {
          this.released = true; const job = this.queue.shift() || {}; const hand = this.handPos();
          const tx = this.x + rand(34, 70), ty = rand(1008, 1040);
          dropKrathong(hand.x, hand.y, tx, ty, { gold: job.gold, value: job.value ?? floatValue(), fall: 0.95, key: this.carryKey });
          this.carryM.visible = this.carryHalo.visible = false; this.carry = false;
          if (job.gold) { spark(hand.x, hand.y, 24, 0xffe27a, 90); for (let i = 0; i < (job.lanterns ?? 4); i++) setTimeout(() => launchLantern(this.x + rand(-60, 60), rand(620, 760)), i * 140); }
        }
        if (u > 2.9) { this.released = false; this.freeSlot(); this.t = 0;
          if (this.queue.length) { this.carry = true; this.carryKey = 'k' + (1 + ((Math.random() * 4) | 0)); this.carryM.material.map = A[this.carryKey]; this.carryMeta = MAN[this.carryKey]; this.carryM.visible = this.carryHalo.visible = true; this.state = 'toPier'; this.wait = 0; }
          else if (this.viewer) { this.laneGoal = rand(0.05, 0.95); this.walkTo(rand(120, 400), 'idle'); }
          else this.leave();
        }
        break;
      }
    }
    if (this.dead) { this.dispose(); return false; }
    this.apply(dt, t);
    return true;
  }
  handPos() { return { x: this.x + 44, y: this.y() - this.H * 0.16 }; }
  apply(dt, t = 0) {
    const y = this.y(), lane = clamp((y - 836) / 70, 0, 1);
    const sc = 0.95 + 0.1 * clamp((this.lane), 0, 1) * (this.x < 440 ? 1 : 0.5);
    let bob = 0, rot = 0, sy = 1, sx = 1;
    const moving = this.state === 'walk';
    if (moving) { const s = Math.sin(this.phase * 1); bob = Math.abs(s) * 5 * sc; rot = s * 0.055; sy = 1 + Math.abs(s) * 0.025; }
    else { sy = 1 + Math.sin(this.phase) * 0.012; }
    if (this.hopT > 0) { this.hopT += dt; const u = this.hopT / 0.55; if (u >= 1) this.hopT = 0; else { bob += Math.sin(u * Math.PI) * 26; sy *= 1 + Math.sin(u * Math.PI) * 0.06; } }
    let cx = 0, cy = this.carry ? this.H * 0.36 : 0, cs = 0.28;
    if (this.state === 'float') {
      const u = this.t;
      const bend = u < 0.7 ? smooth(0, 0.7, u) : u < 1.5 ? 1 : u < 2.0 ? 1 - smooth(1.5, 2.0, u) : 0;
      const pray = u > 2.0 ? Math.sin(smooth(2.0, 2.3, u) * Math.PI) * 0.5 + (u < 2.8 ? 0.5 : 0.5 * (1 - smooth(2.8, 2.9, u))) : 0;
      rot = -0.2 * bend + pray * 0.08; sy *= 1 - 0.07 * bend - pray * 0.03; bob -= 4 * bend;
      cx = (0.12 + 0.2 * bend) * this.H * this.dir; cy = lerp(this.H * 0.36, this.H * 0.16, bend);
      if (u > 2.0 && u < 2.1 && !this.prayed) { this.prayed = true; spark(this.x + 20, y - this.H * 0.55, 8, 0xfff2b8, 40, 1.2, 10); popText(this.x, y - this.H - 10, '🙏'); }
      if (u < 0.1) this.prayed = false;
    }
    const wp = W(this.x, y, 30 + lane * 40);
    this.g.position.copy(wp); this.g.renderOrder = 0;
    const order = 300 + (y | 0) * 2;
    this.shadow.renderOrder = order - 1; this.body.renderOrder = order; this.carryM.renderOrder = order + 1; this.carryHalo.renderOrder = order + 2;
    this.body.scale.set(this.Wd * sc * this.dir * sx, this.H * sc * sy, 1); this.body.position.set(0, bob, 0); this.body.rotation.z = rot;
    this.shadow.scale.set(this.Wd * 0.85 * sc, this.Wd * 0.2 * sc, 1); this.shadow.position.set(0, 2, -1);
    if (this.carry && this.carryMeta) {
      const [cw, ch] = this.carryMeta; const kh = this.H * cs * sc; this.carryM.scale.set(kh * cw / ch, kh, 1);
      this.carryM.position.set(cx + this.dir * this.Wd * 0.1, cy * sc + bob, 1); this.carryHalo.position.set(cx + this.dir * this.Wd * 0.1, cy * sc + bob + kh * 0.65, 2); this.carryHalo.scale.setScalar(kh * (0.9 + Math.sin(t * 9) * 0.05)); this.carryHalo.material.opacity = 0.32;
    }
    // moonlit cool tint, warmed by the lamps near the pier
    const warm = smooth(470, 640, this.x), flick = 1 + Math.sin(t * 7 + this.phase) * 0.02;
    this.body.material.color.setRGB(lerp(0.72, 1.0, warm) * flick, lerp(0.8, 0.9, warm), lerp(0.98, 0.78, warm));
    // label
    if (this.label) {
      const s = toScreen(wp.x, wp.y + (this.H * sc + bob) + 10, wp.z);
      this.labelPos = s;
    }
  }
  dispose() {
    this.freeSlot(); scene.remove(this.g); this.body.material.dispose(); this.shadow.material.dispose(); this.carryM.material.dispose(); this.carryHalo.material.dispose();
    if (this.label) { this.label.remove(); } if (this.user && byUser.get(this.user.id) === this) byUser.delete(this.user.id);
  }
}

function spawnNPC() {
  if (chars.length >= MAX_CHARS) return;
  const c = new Char({ gender: Math.random() < 0.5 ? 'm' : 'f', variant: 1 + ((Math.random() * 4) | 0) });
  c.queue.push({}); c.carry = true; c.carryKey = 'k' + (1 + ((Math.random() * 4) | 0)); c.carryM.material.map = A[c.carryKey]; c.carryMeta = MAN[c.carryKey]; c.carryM.visible = c.carryHalo.visible = true;
  chars.push(c);
}
function ensureChar(user) {
  let c = byUser.get(user.id);
  if (c && !c.dead && !c.leaving) { c.poke(); return c; }
  if (chars.length >= MAX_CHARS) { const npc = chars.find((x) => !x.viewer && !x.leaving) || chars.find((x) => x.viewer && x.state === 'idle'); if (npc) npc.leave(); if (chars.length >= MAX_CHARS + 4) return null; }
  c = new Char({ user }); byUser.set(user.id, c); chars.push(c); return c;
}

/* ---------------------------------------------------------------- TikTok / test events */
const dispName = (u) => (u && (u.nickname || u.uniqueId)) || 'guest';
function handleEvent(m) {
  const mult = viewerMult();
  switch (m.type) {
    case 'chat': { const c = m.user && ensureChar(m.user); if (c) { c.say(m.comment); c.hop(); } gain(2 * mult); feed('chat', `${dispName(m.user)}: ${String(m.comment).slice(0, 40)}`); chime([1046], 0.02); break; }
    case 'join': { const c = m.user && ensureChar(m.user); if (c) c.hop(); gain(1 * mult); feed('join', `${dispName(m.user)} มาร่วมงาน`); break; }
    case 'follow': { const c = m.user && ensureChar(m.user); if (c) { c.badge('💛'); c.queueFloat({ value: floatValue() * 10 * mult }); c.say('ขอพร ลอยกระทงให้ช่อง 💛'); } feed('follow', `💛 ${dispName(m.user)} ติดตาม → ลอยกระทง!`); launchLantern(rand(200, 600), rand(640, 780)); break; }
    case 'share': { const c = m.user && ensureChar(m.user); if (c) { c.badge('↗'); c.queueFloat({ value: floatValue() * 5 * mult }); c.hop(); } feed('follow', `↗ ${dispName(m.user)} แชร์`); for (let i = 0; i < 3; i++) setTimeout(() => launchLantern(), i * 200); break; }
    case 'like': { const c = m.user && byUser.get(m.user.id); if (c && !c.dead) { c.hop(); c.poke(); popText(c.x, c.y() - c.H - 6, '❤'); } gain(0.3 * (m.count || 1) * mult); if (Math.random() < 0.35) launchLantern(); break; }
    case 'gift': {
      const d = Math.max(1, m.diamonds || 1); const c = m.user && ensureChar(m.user);
      const v = floatValue() * (20 + d * 2) * mult;
      if (c) { c.badge('🎁'); c.queueFloat({ gold: true, value: v, lanterns: Math.min(12, 3 + (d / 5 | 0)) }); c.say(`🎁 ${m.giftName || 'gift'} x${m.count || 1}`); c.hop(); }
      feed('gift', `🎁 ${dispName(m.user)} ส่ง ${m.giftName || 'gift'}`); break;
    }
    case 'viewers': $('#viewers').textContent = fmt(m.count || 0); break;
    case 'status': setConn(m); break;
  }
}

/* demo / manual test events */
const DEMO_NAMES = ['Nune', 'Beam', 'น้องมะลิ', 'Tae', 'พี่ปอ', 'Mina', 'ข้าวหอม', 'Joy', 'Boss', 'ฝน', 'Aom', 'Kla'];
const DEMO_SAY = ['สวัสดีค่ะ 🪷', 'ลอยกระทงปีนี้สวยมาก', 'ขอให้ร้ายๆ ลอยไปกับน้ำ', 'สาธุ 🙏', 'พระจันทร์สวยจัง 🌕', 'ขอพรให้ได้โชค', 'Happy Loy Krathong!', 'มาแล้วจ้าา'];
const demoUser = () => { const n = pick(DEMO_NAMES); return { id: 'demo-' + n, uniqueId: n.toLowerCase(), nickname: n }; };
function fire(type) { const m = { type, user: demoUser() }; if (type === 'chat') m.comment = pick(DEMO_SAY); if (type === 'gift') { m.giftName = 'Rose'; m.diamonds = pick([1, 5, 30, 99]); m.count = 1; } if (type === 'like') m.count = 5; handleEvent(m); }
let demoTimer = 0;
if (Q.get('demo') === '1') demoTimer = setInterval(() => { const r = Math.random(); fire(r < 0.4 ? 'chat' : r < 0.55 ? 'join' : r < 0.75 ? 'follow' : r < 0.88 ? 'like' : r < 0.94 ? 'share' : 'gift'); }, 1500);

/* ---------------------------------------------------------------- relay websocket */
const HOSTED = /itch\.(zone|io)$|\.itch\./.test(location.hostname);   // static hosting (itch.io): no relay on the same host -> use the streamer's local relay
let ws = null, wsUrl = Q.get('ws') || (location.protocol.startsWith('http') && !HOSTED ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws` : 'ws://localhost:8080/ws'), wsWant = Q.get('demo') !== '1';
const connDot = $('#conn'), wsState = $('#wsState');
function setConn(m) {
  const map = { live: ['on', 'LIVE @' + (m.username || '')], connecting: ['wait', 'connecting…'], offline: ['wait', 'not live yet – retrying'], disconnected: ['wait', 'disconnected'], error: ['off', m.message || 'error'], idle: ['on', 'relay ok (no TikTok user)'], demo: ['demo', 'server demo'], ended: ['wait', 'stream ended'] };
  const [cls, txt] = map[m.state] || ['off', m.state]; connDot.className = 'dot ' + cls; wsState.textContent = txt; connDot.title = txt;
}
function connectWS() {
  if (!wsWant) return;
  try { ws = new WebSocket(wsUrl); } catch (e) { setTimeout(connectWS, 4000); return; }
  ws.onopen = () => { connDot.className = 'dot wait'; wsState.textContent = 'relay connected'; };
  ws.onmessage = (e) => { try { handleEvent(JSON.parse(e.data)); } catch (err) { /* ignore */ } };
  ws.onclose = () => { connDot.className = 'dot off'; wsState.textContent = 'relay offline – retrying'; setTimeout(connectWS, 4000); };
  ws.onerror = () => { try { ws.close(); } catch (e) { /* ignore */ } };
}

/* ---------------------------------------------------------------- UI: shop, settings, input */
const shopEl = $('#shop');
UPG.forEach((u) => {
  const b = document.createElement('button'); b.className = 'up'; b.dataset.id = u.id;
  b.innerHTML = `<span class="lv"></span><span class="i">${u.icon}</span><span class="n">${u.name}</span><span class="d">${u.desc}</span><span class="c"></span>`;
  b.onclick = () => { const c = cost(u); if (S.merit >= c) { S.merit -= c; S.lv[u.id]++; chime([523, 659, 784], 0.04); save(); } };
  shopEl.appendChild(b);
});
function refreshHud() {
  $('#merit').textContent = fmt(S.merit); $('#kcount').textContent = fmt(S.krathongs);
  const npc = floatValue() / npcInterval();
  $('#rate').textContent = `+${fmt(passiveRate() + npc)} บุญ/วิ · ลอย ${fmt(floatValue())}/กระทง`;
  shopEl.querySelectorAll('.up').forEach((b) => { const u = UPG.find((x) => x.id === b.dataset.id); const c = cost(u); b.querySelector('.lv').textContent = 'Lv' + S.lv[u.id]; b.querySelector('.c').textContent = fmt(c); b.classList.toggle('can', S.merit >= c); });
}
$('#gear').onclick = () => $('#settings').classList.toggle('hidden');
$('#closeSet').onclick = () => $('#settings').classList.add('hidden');
$('#wsUrl').value = wsUrl;
$('#wsGo').onclick = () => { wsUrl = $('#wsUrl').value.trim(); wsWant = true; try { ws && ws.close(); } catch (e) { /* ignore */ } setTimeout(connectWS, 100); };
document.querySelectorAll('#settings [data-ev]').forEach((b) => (b.onclick = () => fire(b.dataset.ev)));
const muteBtn = $('#muteBtn'), musicBtn = $('#musicBtn');
const paintAudioBtns = () => { muteBtn.textContent = muted ? '🔇 เอฟเฟกต์' : '🔊 เอฟเฟกต์'; musicBtn.textContent = musicOn ? '🎵 เพลง' : '🔕 เพลง'; };
muteBtn.onclick = () => { muted = !muted; saveAudio(); paintAudioBtns(); };
musicBtn.onclick = () => { musicOn = !musicOn; saveAudio(); paintAudioBtns(); if (musicOn) bgmStart(); else bgmStop(); };
paintAudioBtns();
$('#resetBtn').onclick = () => { if (confirm('รีเซ็ตเซฟทั้งหมด?')) { S = fresh(); save(); } };

// tap the scene: water -> float your own krathong, sky -> release a sky lantern, character -> they cheer
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
let lastTap = 0;
$('#gl').parentElement.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#hud button, #shop, #settings')) return;
  const r = stage.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  if (!ray.ray.intersectPlane(plane, hit)) return;
  const px = hit.x + BG_W / 2, py = BG_H / 2 - hit.y;
  const now = performance.now(); if (now - lastTap < 140) return; lastTap = now;
  const c = chars.find((ch) => Math.abs(px - ch.x) < ch.Wd * 0.5 && py < ch.y() + 6 && py > ch.y() - ch.H);
  if (c) { c.hop(); popText(c.x, c.y() - c.H, c.viewer ? '💛' : 'สาธุ'); gain(0.5); chime([988], 0.03); return; }
  if (py > WATER_Y + 10) { dropKrathong(px, py - 150, px, py, { fall: 0.6, value: floatValue() * 0.5 }); }
  else if (py < 700) { launchLantern(px, py, true); chime([1319], 0.02); }
});

/* ---------------------------------------------------------------- main loop */
let npcTimer = 3, saveTimer = 0, uiTimer = 0;
function offlineEarnings() {
  const secs = clamp((Date.now() - (S.t || Date.now())) / 1000, 0, 8 * 3600);
  if (secs > 60) { const g = secs * (floatValue() / npcInterval() * 0.5 + S.lv.candle * 0.6 * 0.5); if (g >= 1) { gain(g); feed('gift', `ยินดีต้อนรับกลับ! ระหว่างไม่อยู่ได้บุญ +${fmt(g)}`); } }
}
const clock = new THREE.Clock(); const DT_MAX = Number(Q.get('dtmax')) || 0.05;   // ?dtmax=0.5 lets slow machines / tests fast-forward
let bgMesh;
let simT = 0;
function tick(dt) {
  simT += dt; const t = simT;
  bgMat.uniforms.time.value = t;
  // gentle camera drift = parallax between painted plane and the sprites in front
  camera.position.x = Math.sin(t * 0.17) * 12; camera.position.y = Math.sin(t * 0.23) * 7; camera.lookAt(camera.position.x * 0.25, camera.position.y * 0.25, 0);

  npcTimer -= dt; if (npcTimer <= 0) { npcTimer = npcInterval() * rand(0.7, 1.3); spawnNPC(); }
  gain(passiveRate() * dt);
  if (Math.random() < dt * 0.12) launchLantern();
  for (let i = chars.length - 1; i >= 0; i--) if (!chars[i].update(dt, t)) chars.splice(i, 1);
  updateKrathongs(dt, t); updateRipples(dt); updateSky(dt, t); updateParts(dt);
  glows.forEach((g) => { g.s.material.opacity = g.base * (1 + Math.sin(t * g.sp + g.ph) * g.amt + Math.sin(t * g.sp * 2.7 + g.ph) * g.amt * 0.5); });
  flies.forEach((f) => { const a = f.ph + t * f.sp; const p = W(f.cx + Math.cos(a) * f.r * 2, f.cy + Math.sin(a * 1.3) * f.r, 50); f.s.position.copy(p); f.s.scale.setScalar(7 + Math.sin(t * 3 + f.ph) * 3); f.s.material.opacity = 0.35 + 0.45 * Math.max(0, Math.sin(t * 1.5 + f.ph * 5)); });

  uiTimer -= dt; if (uiTimer <= 0) { uiTimer = 0.2; refreshHud(); }
  saveTimer -= dt; if (saveTimer <= 0) { saveTimer = 5; save(); }
}
function frame() {
  requestAnimationFrame(frame);
  tick(Math.min(clock.getDelta(), DT_MAX));
  // labels follow characters
  chars.forEach((c) => { if (c.label && c.labelPos) { const el = c.label, hw = (el.offsetWidth || 80) / 2; const x = clamp(c.labelPos.x, hw + 4, stage.clientWidth - hw - 4); el.style.transform = `translate(${x}px,${c.labelPos.y}px) translate(-50%,-100%)`; el.style.zIndex = Math.round(c.labelPos.y); } });
  renderer.render(scene, camera);
}

/* ---------------------------------------------------------------- boot */
(async function boot() {
  await loadAssets();
  bgMesh = buildBackground(); buildGlows(); buildFireflies();
  offlineEarnings();
  for (let i = 0; i < 3; i++) setTimeout(() => launchLantern(rand(100, 680), rand(300, 700)), i * 300);
  for (let i = 0; i < 2; i++) { spawnNPC(); }
  chars.forEach((c, i) => { c.x = ENTER_X + i * -60; });
  connectWS(); refreshHud(); frame();
  window.addEventListener('beforeunload', save);
  window.__game = { audio: () => ({ started: bgmStarted, ctx: actx && actx.state, music: musicOn, dur: bgmBuf && bgmBuf.duration }), get S() { return S; }, chars, krathongs, handleEvent, fire, scene, camera, ff: (sec) => { for (let i = 0; i < sec * 20; i++) tick(0.05); } };   // handy for debugging in devtools
})();
