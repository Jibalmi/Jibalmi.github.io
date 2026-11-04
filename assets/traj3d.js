/* 3D mission trajectories (three.js). Markup written by build.py:
     <div class="traj3d" data-src="assets/traj3d/<slug>/<name>.json" style="height:560px"></div>
   The JSON is made by the .py script next to it in _src/traj3d/<slug>/ and carries "kind": "perci" or "tour".
   Trajectories are computed in Python; this file only interpolates them (cubic Hermite for the PERCI states,
   closed-form J2 node drift for the tour). Time is compressed; the clock shows simulated time.            */
import * as THREE from 'three';
import { OrbitControls } from './vendor/jsm/OrbitControls.js';
import { Line2 } from './vendor/jsm/lines/Line2.js';
import { LineSegments2 } from './vendor/jsm/lines/LineSegments2.js';
import { LineGeometry } from './vendor/jsm/lines/LineGeometry.js';
import { LineSegmentsGeometry } from './vendor/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from './vendor/jsm/lines/LineMaterial.js';

const REDUCE = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const C = { bg: 0x0b0b0c, text: 0xededee, sec: 0x8e8e96, ter: 0x5c5c64, hair: 0x2a2a2f, grid: 0x1c1c20, acc: 0xff5b2e };
const D2R = Math.PI / 180, MINUS = '−';

/* ------------------------------------------------------------------ styles (scoped to .traj3d) */
const CSS = `
.traj-fig .traj3d{position:relative;width:100%;background:#0b0b0c;overflow:hidden;user-select:none;-webkit-user-select:none}
.traj3d canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
.traj3d canvas:active{cursor:grabbing}
.traj3d .t3-lab{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.traj3d .t3-lab span{position:absolute;left:0;top:0;font:400 10.5px/1 var(--mono);letter-spacing:.06em;color:#8e8e96;white-space:nowrap;will-change:transform}
.traj3d .t3-lab span.a{color:#ff5b2e}.traj3d .t3-lab span.w{color:#ededee}
.traj3d .t3-head{position:absolute;left:20px;top:16px;pointer-events:none;display:flex;flex-direction:column;gap:4px;max-width:calc(100% - 40px)}
.traj3d .t3-k{font:400 10.5px/1.4 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:#8e8e96}
.traj3d .t3-clock{font:300 26px/1.1 var(--mono);color:#ededee;font-variant-numeric:tabular-nums;letter-spacing:.01em}
.traj3d .t3-clock small{font:400 10.5px var(--mono);color:#5c5c64;letter-spacing:.08em;margin-left:8px;text-transform:uppercase}
.traj3d .t3-ph{font:400 13px/1.4 var(--sans);color:#ededee}.traj3d .t3-ph i{font-style:normal;color:#8e8e96}
.traj3d .t3-read{position:absolute;right:20px;top:16px;pointer-events:none;display:grid;grid-template-columns:auto auto;gap:3px 14px;text-align:right;font:400 10.5px/1.5 var(--mono);letter-spacing:.06em;color:#8e8e96;text-transform:uppercase}
.traj3d .t3-read b{font:400 12px/1.5 var(--mono);color:#ededee;text-transform:none;letter-spacing:0;font-variant-numeric:tabular-nums}
.traj3d .t3-read b.a{color:#ff5b2e}
.traj3d .m3-bar{position:absolute;left:12px;right:12px;bottom:12px}
.traj3d .m3-b{padding:.4rem .8rem}
.traj3d .t3-sp{flex:1 1 auto}
.traj3d .t3-load{position:absolute;inset:0;display:grid;place-items:center;font:400 11px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:#5c5c64}
.traj-fig figcaption .hint{color:var(--mut);opacity:.75}
@media (max-width:640px){
 .traj3d .t3-head{left:14px;top:12px}.traj3d .t3-clock{font-size:21px}
 .traj3d .t3-read{left:14px;right:14px;top:auto;bottom:54px;text-align:left;grid-template-columns:auto 1fr auto 1fr;gap:2px 8px;font-size:9.5px}
 .traj3d .t3-read b{font-size:11px}
 .traj3d .m3-bar{left:8px;right:8px;bottom:8px;gap:.35rem}.traj3d .m3-b{padding:.38rem .62rem;font-size:.62rem}
 .traj3d .t3-sp{display:none}
}`;
if (!document.getElementById('traj3d-css')) {
  const s = document.createElement('style'); s.id = 'traj3d-css'; s.textContent = CSS; document.head.appendChild(s);
}

/* ------------------------------------------------------------------ small helpers */
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, s) => a + (b - a) * s;
const smooth = (s) => s * s * (3 - 2 * s);
function bsearch(arr, x) { let lo = 0, hi = arr.length - 2; if (x <= arr[0]) return 0; if (x >= arr[hi + 1]) return hi;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (arr[m] <= x) lo = m; else hi = m - 1; } return lo; }
function piecewise(keys, x) { // keys [[x, y], ...] linear
  if (x <= keys[0][0]) return keys[0][1]; const n = keys.length - 1; if (x >= keys[n][0]) return keys[n][1];
  for (let i = 0; i < n; i++) if (x < keys[i + 1][0]) { const s = (x - keys[i][0]) / (keys[i + 1][0] - keys[i][0]); return lerp(keys[i][1], keys[i + 1][1], s); }
  return keys[n][1];
}
const fmt = (v, d = 0) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

function lineMat(color, width, opacity, mats) {
  const m = new LineMaterial({ color, linewidth: width, transparent: true, opacity, depthWrite: false });
  m.userData.o = opacity; mats.push(m); return m;
}
function polyline(pts, color, width, opacity, mats) { // pts: flat [x,y,z,...]
  const g = new LineGeometry(); g.setPositions(pts); const l = new Line2(g, lineMat(color, width, opacity, mats));
  l.userData.n = pts.length / 3 - 1; return l;
}
function circlePts(r, n = 160) { const p = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; p.push(r * Math.cos(a), 0, -r * Math.sin(a)); } return p; }

/* round screen-space dots, constant pixel size; colours given as sRGB 0-1 */
function dotMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { dpr: { value: 1 } }, transparent: true, depthWrite: false,
    vertexShader: 'attribute float size; attribute vec4 rgba; varying vec4 vC; uniform float dpr;' +
      'void main(){ vC = rgba; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * dpr; }',
    fragmentShader: 'varying vec4 vC; void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p);' +
      'float a = smoothstep(0.5, 0.32, d); if (a <= 0.0) discard; gl_FragColor = vec4(vC.rgb, vC.a * a); }',
  });
}
function dots(n, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n).fill(4), 1));
  g.setAttribute('rgba', new THREE.BufferAttribute(new Float32Array(n * 4).fill(1), 4));
  const p = new THREE.Points(g, mat); p.frustumCulled = false; return p;
}
const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
function setDot(P, i, pos, hex, a, size) {
  const g = P.geometry; g.attributes.position.setXYZ(i, pos.x, pos.y, pos.z);
  const c = rgb(hex); g.attributes.rgba.setXYZW(i, c[0], c[1], c[2], a); g.attributes.size.setX(i, size);
}
function dirtyDots(P) { const a = P.geometry.attributes; a.position.needsUpdate = a.rgba.needsUpdate = a.size.needsUpdate = true; }

/* ------------------------------------------------------------------ shell: renderer, controls, HUD, loop */
function shell(el, data, opts) {
  el.innerHTML = '<canvas></canvas><div class="t3-lab"></div><div class="t3-head"><span class="t3-k"></span>' +
    '<span class="t3-clock"></span><span class="t3-ph"></span></div><div class="t3-read"></div><div class="m3-bar"></div>';
  const canvas = el.querySelector('canvas'), labLayer = el.querySelector('.t3-lab'), bar = el.querySelector('.m3-bar');
  const hud = { k: el.querySelector('.t3-k'), clock: el.querySelector('.t3-clock'), ph: el.querySelector('.t3-ph'), read: el.querySelector('.t3-read') };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(C.bg, 1); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const dpr = Math.min(window.devicePixelRatio || 1, 2); renderer.setPixelRatio(dpr);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov || 34, 1, opts.near, opts.far);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.09; controls.enablePan = false; controls.zoomSpeed = 0.9;
  controls.minDistance = opts.minD; controls.maxDistance = opts.maxD;
  const mats = [], dotMats = [];
  const S = { el, data, renderer, scene, camera, controls, mats, dotMats, hud, bar, labLayer, labels: [], w: 1, h: 1, dpr,
    playing: !REDUCE, td: 0, user: false };
  el._traj = S; // handle for testing (set td / playing from the console)

  function size() {
    const w = el.clientWidth || 1, h = el.clientHeight || 1; S.w = w; S.h = h;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    mats.forEach((m) => m.resolution.set(w, h)); dotMats.forEach((m) => (m.uniforms.dpr.value = dpr));
  }
  S.size = size;
  new ResizeObserver(size).observe(el);
  controls.addEventListener('start', () => { S.user = true; if (S.onUser) S.onUser(); });

  S.label = (text, cls = '') => { const s = document.createElement('span'); s.textContent = text; if (cls) s.className = cls; labLayer.appendChild(s); const L = { s, on: true, x: 0, y: 0 }; S.labels.push(L); return L; };
  const v = new THREE.Vector3();
  S.place = (L, world, show = true, dx = 8, dy = -5) => {
    if (!show) { if (L.on) { L.s.style.opacity = 0; L.on = false; } return; }
    v.copy(world).project(camera);
    if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { if (L.on) { L.s.style.opacity = 0; L.on = false; } return; }
    const x = (v.x * 0.5 + 0.5) * S.w + dx, y = (-v.y * 0.5 + 0.5) * S.h + dy;
    L.s.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; if (!L.on) { L.s.style.opacity = 1; L.on = true; }
  };
  // true if the segment camera->p passes through a sphere (centre c, radius r)
  const d = new THREE.Vector3(), oc = new THREE.Vector3();
  S.hidden = (p, c, r) => {
    d.subVectors(p, camera.position); const L = d.length(); d.divideScalar(L); oc.subVectors(camera.position, c);
    const b = oc.dot(d), q = oc.lengthSq() - r * r, disc = b * b - q; if (disc < 0) return false;
    const t0 = -b - Math.sqrt(disc); return t0 > 0 && t0 < L - r * 0.02;
  };
  S.button = (label, fn, pressed) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'm3-b'; b.textContent = label;
    if (pressed !== undefined) b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    b.addEventListener('click', () => fn(b)); bar.appendChild(b); return b;
  };
  S.spacer = () => { const i = document.createElement('span'); i.className = 't3-sp'; bar.appendChild(i); };
  S.readout = (rows) => { hud.read.innerHTML = rows.map(([k, val, cls]) => `<span>${k}</span><b${cls ? ` class="${cls}"` : ''}>${val}</b>`).join(''); };

  // play / pause / restart common buttons
  S.playBtn = S.button(S.playing ? 'Pause' : 'Play', (b) => { S.playing = !S.playing; if (S.playing && S.td >= S.dur) S.td = 0; b.textContent = S.playing ? 'Pause' : 'Play'; });
  S.button('Restart', () => { S.td = 0; S.playing = true; S.playBtn.textContent = 'Pause'; if (S.onRestart) S.onRestart(); });

  let visible = false, last = 0;
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0.02 }).observe(el);
  S.start = () => {
    size();
    (function loop(now) {
      requestAnimationFrame(loop);
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0; last = now;
      if (!visible) { last = 0; return; }
      if (S.playing) { S.td += dt; if (S.td > S.dur) { if (S.loop) S.td = 0; else { S.td = S.dur; S.playing = false; S.playBtn.textContent = 'Play'; } } }
      S.frame(dt);
      controls.update();
      S.post && S.post();
      renderer.render(scene, camera);
    })(0);
  };
  return S;
}

/* damped camera follow: moves controls.target and the camera together; distance eased in log space */
function cameraRig(S) {
  const R = { target: new THREE.Vector3(), dist: 1, dir: new THREE.Vector3(0.3, 0.45, 0.84).normalize() };
  const tmp = new THREE.Vector3();
  R.snap = (target, dist) => { R.target.copy(target); S.controls.target.copy(target); S.camera.position.copy(target).addScaledVector(R.dir, dist); R.dist = dist; };
  // tk: target smoothing rate (0 = lock onto the target); dk: distance smoothing rate (0 = leave the user's zoom alone)
  R.step = (target, dist, dt, tk, dk) => {
    tmp.subVectors(S.camera.position, S.controls.target); // keep the camera's offset while the target moves
    if (tmp.lengthSq() < 1e-12) tmp.copy(R.dir).multiplyScalar(dist);
    const newT = tk > 0 ? S.controls.target.clone().lerp(target, 1 - Math.exp(-tk * dt)) : target;
    if (dk > 0) { const cur = tmp.length(); tmp.setLength(Math.exp(lerp(Math.log(cur), Math.log(dist), 1 - Math.exp(-dk * dt)))); }
    S.controls.target.copy(newT); S.camera.position.copy(newT).add(tmp);
  };
  return R;
}

/* ------------------------------------------------------------------ Scene 1: PERCI at Umbriel */
function perci(el, data) {
  const K = 1e-3; // 1 unit = 1000 km
  const S = shell(el, data, { near: 0.002, far: 20000, minD: 1.2, maxD: 6000, fov: 32 });
  const { scene, mats } = S;
  S.dur = data.warp[data.warp.length - 1][0]; S.loop = true;
  S.hud.k.textContent = 'PERCI · Umbriel flyby · two-body + Uranus';

  scene.add(new THREE.AmbientLight(0xffffff, 0.16));
  const sun = new THREE.DirectionalLight(0xffffff, 2.3); scene.add(sun);
  // system group: local XZ = Uranus equatorial plane (model x, y), local +Y = spin axis; tilted 97.77 deg from the orbit normal
  const sys = new THREE.Group(); scene.add(sys);
  sys.rotation.x = data.tilt_deg * D2R; // world +Y = Uranus's orbit normal; the spin axis (local +Y) is 97.77 deg from it
  sys.updateMatrixWorld();
  const toLocal = (x, y, out) => out.set(x * K, 0, -y * K);
  sun.position.set(-0.55, 0.25, 0.8).multiplyScalar(1000); // fixed direction, illustrative

  // Uranus, rings, axis
  const RU = data.R_U * K;
  const uranus = new THREE.Mesh(new THREE.SphereGeometry(RU, 96, 64), new THREE.MeshStandardMaterial({ color: 0x9cb6ba, roughness: 1, metalness: 0 }));
  uranus.scale.y = 1 - 0.0229; sys.add(uranus);
  data.rings_km.forEach((r, i) => sys.add(polyline(circlePts(r * K, 256), i === data.rings_km.length - 1 ? C.sec : C.ter, 0.75, i === data.rings_km.length - 1 ? 0.55 : 0.28, mats)));
  const axis = polyline([0, -RU * 3.4, 0, 0, RU * 3.4, 0], C.ter, 0.75, 0.6, mats); sys.add(axis);
  const normal = polyline([0, RU * 1.2, 0, 0, RU * 2.1, 0], C.hair, 0.75, 0.9, mats); scene.add(normal);

  // moons
  let tgtOrbit = null;
  const moons = data.moons.map((m) => {
    const isT = m.name === data.target;
    const orbit = polyline(circlePts(m.a * K, 720), isT ? C.ter : C.hair, isT ? 1.0 : 0.75, isT ? 0.95 : 0.9, mats); sys.add(orbit);
    if (isT) tgtOrbit = orbit;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(m.R * K, 64, 48), new THREE.MeshStandardMaterial({ color: isT ? 0x6a6a70 : 0x7a7a80, roughness: 1 }));
    sys.add(mesh);
    return { ...m, isT, mesh, lab: S.label(m.name, isT ? 'w' : ''), pos: new THREE.Vector3(), world: new THREE.Vector3() };
  });
  const tgt = moons.find((m) => m.isT);
  const moonPos = (m, t, out) => { const a = m.n * t + (m.ph || 0); return toLocal(m.a * Math.cos(a), m.a * Math.sin(a), out); };
  const moonKm = (t) => { const a = data.n_t * t, A = tgt.a; return [A * Math.cos(a), A * Math.sin(a)]; };
  const labU = S.label('Uranus'), labAxis = S.label(innerWidth < 640 ? '97.8°' : 'spin axis, 97.8° from orbit normal');

  // Hermite interpolation of model states (km, km/s)
  function herm(T, t) {
    const i = bsearch(T.t, t), t0 = T.t[i], t1 = T.t[i + 1], h = t1 - t0, s = clamp((t - t0) / h, 0, 1);
    const s2 = s * s, s3 = s2 * s, h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    return [h00 * T.x[i] + h10 * h * T.vx[i] + h01 * T.x[i + 1] + h11 * h * T.vx[i + 1],
            h00 * T.y[i] + h10 * h * T.vy[i] + h01 * T.y[i + 1] + h11 * h * T.vy[i + 1]];
  }
  const E = data.ev;
  const flagKm = (t) => herm(data.flag, t);
  const penKm = (t) => {
    if (t <= E.sep) return flagKm(t);
    if (t < E.imp) return herm(data.pen, t);
    const [mx, my] = moonKm(t), a = data.n_t * (t - E.imp), c = Math.cos(a), s = Math.sin(a), b = data.imp_body;
    return [mx + c * b[0] - s * b[1], my + s * b[0] + c * b[1]];
  };

  // paths. Uranus frame (sys) and Umbriel frame (child group that rides on Umbriel)
  const uf = new THREE.Group(); sys.add(uf);
  const F = data.flag, P = data.pen;
  const flagU = []; for (let i = 0; i < F.t.length; i++) flagU.push(F.x[i] * K, 0, -F.y[i] * K);
  const flagUAll = polyline(flagU, C.ter, 0.75, 0.55, mats), flagUDone = polyline(flagU, C.sec, 1.0, 0.95, mats);
  sys.add(flagUAll, flagUDone);
  // Umbriel-relative paths sampled at uniform steps between -7 h and +1.2 h
  const relT = []; for (let t = -7 * 3600; t <= 1.2 * 3600; t += 60) relT.push(t);
  const flagR = []; relT.forEach((t) => { const f = flagKm(t), m = moonKm(t); flagR.push((f[0] - m[0]) * K, 0, -(f[1] - m[1]) * K); });
  const flagRAll = polyline(flagR, C.ter, 0.75, 0.6, mats), flagRDone = polyline(flagR, C.sec, 1.0, 0.95, mats);
  uf.add(flagRAll, flagRDone);
  const penT = []; for (let t = E.sep; t < E.imp; t += 30) penT.push(t); penT.push(E.imp);
  const penR = [], penUpts = [];
  penT.forEach((t) => { const p = penKm(t), m = moonKm(t); penR.push((p[0] - m[0]) * K, 0, -(p[1] - m[1]) * K); penUpts.push(p[0] * K, 0, -p[1] * K); });
  const penRDone = polyline(penR, C.acc, 1.5, 1, mats); uf.add(penRDone);
  const penUDone = polyline(penUpts, C.acc, 1.4, 1, mats); sys.add(penUDone);
  const reveal = (line, times, t) => { line.geometry.instanceCount = clamp(bsearch(times, t) + (t >= times[0] ? 1 : 0), 0, line.userData.n); line.visible = t > times[0]; };

  // craft markers
  const dmat = dotMaterial(); S.dotMats.push(dmat);
  const marks = dots(8, dmat); scene.add(marks);
  const labF = S.label('UOP flagship', 'w'), labP = S.label('PERCI', 'a'), labImp = S.label('', 'a');
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.1, 18), new THREE.MeshBasicMaterial({ color: C.acc }));
  cone.geometry.rotateX(Math.PI / 2); scene.add(cone); // cone axis along +Z
  const plume = polyline([0, 0, 0, 0, 0, 1], C.acc, 1.5, 0.9, mats); plume.frustumCulled = false; scene.add(plume);
  const ringImp = polyline(circlePts(1, 96), C.acc, 1.0, 0.9, mats); scene.add(ringImp);

  // camera: system view <-> Umbriel view
  const rig = cameraRig(S); rig.dir.set(0.42, 0.62, 0.66).normalize();
  let mode = 'auto', want = 0, f = 0; // f: 0 = system, 1 = Umbriel
  const bSys = S.button('System', () => setMode('sys')), bMoon = S.button('Umbriel', () => setMode('moon')), bAuto = S.button('Auto', () => setMode('auto'), true);
  function setMode(m) { mode = m; S.user = m !== 'auto' ? S.user : false; bAuto.setAttribute('aria-pressed', m === 'auto'); bSys.setAttribute('aria-pressed', m === 'sys'); bMoon.setAttribute('aria-pressed', m === 'moon'); if (m !== 'auto') { want = m === 'moon' ? 1 : 0; S.forceDist = true; } }
  bSys.setAttribute('aria-pressed', 'false'); bMoon.setAttribute('aria-pressed', 'false');
  S.onUser = () => { if (mode === 'auto') { mode = 'free'; bAuto.setAttribute('aria-pressed', 'false'); } };
  S.onRestart = () => { if (mode === 'free') setMode('auto'); };
  const sysDist = () => { const tv = Math.tan(S.camera.fov / 2 * D2R), th = tv * S.camera.aspect; return 640 / Math.min(tv, th); };
  const autoF = (td) => piecewise([[0, 0], [7, 0], [10, 1], [S.dur - 0.01, 1]], td);
  const autoD = (td) => Math.exp(piecewise([[7, Math.log(sysDist())], [10, Math.log(36)], [31, Math.log(24)], [36, Math.log(11)], [S.dur, Math.log(11)]], td));

  // simulation time from display time
  const simT = (td) => piecewise(data.warp, td);
  const phases = data.phases;
  const V = { u: new THREE.Vector3(), fw: new THREE.Vector3(), pw: new THREE.Vector3(), tw: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), z: new THREE.Vector3(0, 0, 1) };
  const dirWorld = (d2, out) => out.set(d2[0], 0, -d2[1]).transformDirection(sys.matrixWorld);
  const burnW = dirWorld(data.burn_dir, new THREE.Vector3()), impW = dirWorld(data.imp_dir, new THREE.Vector3());
  const spinW = new THREE.Vector3(0, 1, 0).transformDirection(sys.matrixWorld);
  const dirSys = rig.dir.clone();
  // close-up: 55 deg above Umbriel's orbit plane, on the side the penetrator arrives from
  const dirMoon = dirWorld(data.imp_body, new THREE.Vector3()).multiplyScalar(0.55).addScaledVector(impW, -0.35).addScaledVector(spinW, 0.95).normalize();
  // illustrative sun direction, between the two scripted views and off to one side, so both show a terminator
  sun.position.copy(dirSys).add(dirMoon).normalize().applyAxisAngle(spinW, 0.7).multiplyScalar(1000);
  let tPrev = null;
  const M = data.meta;

  S.frame = (dt) => {
    const t = simT(S.td);
    moons.forEach((m) => { moonPos(m, t, m.pos); m.mesh.position.copy(m.pos); m.world.copy(m.pos).applyMatrix4(sys.matrixWorld); });
    tgt.mesh.rotation.y = data.n_t * t; // tidally locked
    uf.position.copy(tgt.pos);
    const fk = flagKm(t), pk = penKm(t);
    toLocal(fk[0], fk[1], V.fw).applyMatrix4(sys.matrixWorld); toLocal(pk[0], pk[1], V.pw).applyMatrix4(sys.matrixWorld);

    // camera: f (0 system, 1 Umbriel) is eased, the target sits exactly on the eased focus
    if (mode === 'auto') want = autoF(S.td);
    f = S.rigInit ? lerp(f, want, 1 - Math.exp(-2.6 * dt)) : want;
    if (Math.abs(f - want) < 1e-4) f = want;
    const focus = V.tw.set(0, 0, 0).lerp(tgt.world, smooth(clamp(f, 0, 1)));
    const dist = mode === 'auto' ? autoD(S.td) : (want > 0.5 ? 30 : sysDist());
    if (!S.rigInit) { rig.snap(focus, dist); S.rigInit = true; }
    rig.step(focus, dist, dt, 0, mode === 'auto' || S.forceDist ? 2.6 : 0);
    if (S.forceDist && Math.abs(S.camera.position.distanceTo(S.controls.target) / dist - 1) < 0.02) S.forceDist = false;
    if (mode === 'auto') { // scripted view direction: oblique on the system, then above the impact side of Umbriel
      V.b.copy(dirSys).lerp(dirMoon, smooth(clamp(f, 0, 1))).normalize();
      const cd = S.camera.position.distanceTo(S.controls.target);
      S.camera.position.copy(S.controls.target).addScaledVector(V.b, cd);
    }
    tgtOrbit.material.opacity = tgtOrbit.material.userData.o * (1 - 0.75 * f);

    // fade between the Uranus-frame paths and the Umbriel-frame paths
    const fu = 1 - f, fm = f;
    [flagUAll, flagUDone, penUDone].forEach((l) => (l.material.opacity = l.material.userData.o * fu));
    [flagRAll, flagRDone, penRDone].forEach((l) => (l.material.opacity = l.material.userData.o * fm));
    reveal(flagUDone, F.t, t); reveal(flagRDone, relT, t); reveal(penRDone, penT, t); reveal(penUDone, penT, t);
    flagUAll.visible = fu > 0.01; flagUDone.visible = flagUDone.visible && fu > 0.01;
    flagRAll.visible = fm > 0.01; flagRDone.visible = flagRDone.visible && fm > 0.01;
    penUDone.visible = t > E.sep && fu > 0.01; penRDone.visible = t > E.sep && fm > 0.01;

    // markers: flagship, penetrator, moons (dots keep tiny bodies visible from far away)
    const camD = S.camera.position.distanceTo(S.controls.target);
    const sepd = t > E.sep;
    setDot(marks, 0, V.fw, C.text, 1, 5);
    setDot(marks, 1, V.pw, C.acc, sepd ? 1 : 0, 6);
    moons.forEach((m, i) => { const px = (m.R * K) / S.camera.position.distanceTo(m.world) / Math.tan(S.camera.fov / 2 * D2R) * S.h / 2; m.px = px; setDot(marks, 2 + i, m.world, m.isT ? C.text : C.sec, px > 3 ? 0 : 0.9, m.isT ? 5 : 4); });
    dirtyDots(marks);

    // penetrator attitude: burn direction until the burn, slew to the impact-velocity direction over 450 s
    const sl = clamp((t - E.burn) / (E.slew_end - E.burn), 0, 1);
    V.a.copy(burnW).lerp(impW, smooth(sl)).normalize();
    const scl = camD * 0.012;
    cone.visible = sepd && t < E.imp && f > 0.6; cone.position.copy(V.pw); cone.quaternion.setFromUnitVectors(V.z, V.a); cone.scale.setScalar(scl);
    const burning = Math.abs(t - E.burn) < 25 || (S.td > 14 && S.td < 16.2);
    plume.visible = burning && f > 0.5;
    if (plume.visible) { const g = plume.geometry; V.b.copy(V.pw).addScaledVector(burnW, -scl * 4); g.setPositions([V.pw.x, V.pw.y, V.pw.z, V.b.x, V.b.y, V.b.z]); }
    const sinceImp = t - E.imp;
    ringImp.visible = sinceImp >= 0 && f > 0.5;
    if (ringImp.visible) {
      const k = clamp(S.td - piecewise(data.warp.map(([a, b]) => [b, a]), E.imp), 0, 6) / 6; // display seconds since impact
      const n = V.b.subVectors(V.pw, tgt.world).normalize();
      ringImp.position.copy(V.pw).addScaledVector(n, 0.004); ringImp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      ringImp.scale.setScalar(0.03 + 0.25 * smooth(k)); ringImp.material.opacity = 0.95 * (1 - k);
    }

    // labels
    const occl = (p) => S.hidden(p, V.u.set(0, 0, 0), RU) || S.hidden(p, tgt.world, tgt.R * K);
    S.place(labU, V.u.set(RU * 0.75, RU * 0.75, 0), f < 0.5);
    V.u.set(0, RU * 3.45, 0).applyMatrix4(sys.matrixWorld); S.place(labAxis, V.u, f < 0.3);
    moons.forEach((m) => S.place(m.lab, m.world, (m.isT || f < 0.5) && !(f < 0.5 ? S.hidden(m.world, V.u.set(0, 0, 0), RU) : false), 8 + (m.px > 3 ? m.px * 0.75 : 0), -5 - (m.px > 3 ? m.px * 0.75 : 0)));
    S.place(labF, V.fw, !occl(V.fw), 8, -12);
    S.place(labP, V.pw, sepd && t < E.imp + 1 && !occl(V.pw), 9, 6);
    labImp.s.textContent = `impact ${M.v_imp_kms.toFixed(2)} km/s`;
    S.place(labImp, V.pw, sinceImp >= 0 && f > 0.5, 10, 8);

    // HUD
    const T = t / 3600, sg = T < 0 ? MINUS : '+', hh = Math.floor(Math.abs(T)), mm = Math.floor((Math.abs(T) - hh) * 60 + 1e-9);
    S.hud.clock.innerHTML = `T${sg}${hh}:${String(mm).padStart(2, '0')}<small>from flagship closest approach</small>`;
    let ph = phases[0]; for (const p of phases) if (t >= p.t) ph = p;
    S.hud.ph.innerHTML = `${ph.name} <i>· ${ph.text}</i>`;
    const mk = moonKm(t), mk2 = moonKm(t + 1), pk2 = penKm(t + 1);
    const vrel = Math.hypot(pk2[0] - mk2[0] - (pk[0] - mk[0]), pk2[1] - mk2[1] - (pk[1] - mk[1]));
    const alt = Math.hypot(pk[0] - mk[0], pk[1] - mk[1]) - tgt.R, rng = Math.hypot(pk[0] - fk[0], pk[1] - fk[1]);
    S.readout([['Delta-V', t >= E.burn ? `${fmt(M.dv_flown_ms)} m/s` : '0 m/s', t >= E.burn ? 'a' : ''],
      ['vs Umbriel', t >= E.imp ? `${M.v_imp_kms.toFixed(2)} km/s` : `${(vrel).toFixed(2)} km/s`],
      ['Altitude', `${fmt(Math.max(0, alt))} km`], ['To flagship', !sepd ? 'attached' : rng < 50 ? `${rng.toFixed(2)} km` : `${fmt(rng)} km`]]);
    tPrev = t;
  };
  S.start();
  if (REDUCE) { S.td = 38; }
}

/* ------------------------------------------------------------------ Scene 2: debris tour */
function tour(el, data, coast) {
  const K = 1e-3;
  const S = shell(el, data, { near: 0.01, far: 2000, minD: 0.4, maxD: 140, fov: 34 });
  const { scene, mats } = S;
  S.hud.k.textContent = 'Debris tour · SL-8 rocket bodies · J2 node drift';
  scene.add(new THREE.AmbientLight(0xffffff, 0.22));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(-0.6, 0.35, 0.75); scene.add(sun);
  const RE = data.RE * K;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(RE, 96, 64), new THREE.MeshStandardMaterial({ color: 0x39414c, roughness: 1 }));
  scene.add(earth);
  if (coast) { // coastlines, lon/lat x100, drawn faint (Earth is not rotated: the frame turns with the start plane's node)
    const p = [];
    coast.lines.forEach((ln) => { for (let i = 0; i + 3 < ln.length; i += 2) {
      for (const j of [i, i + 2]) { const lo = ln[j] / 100 * D2R, la = ln[j + 1] / 100 * D2R, r = RE * 1.001; p.push(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo)); } } });
    const g = new LineSegmentsGeometry(); g.setPositions(p); const l = new LineSegments2(g, lineMat(C.ter, 0.6, 0.5, mats)); scene.add(l);
  }
  // ECI (x, y, z) -> three (x, z, -y); y-up is the pole
  const O = data.objs, L = data.legs, ref = data.ref_rate, N = O.length;
  function pos(a, i, Om, u, out) {
    const cO = Math.cos(Om * D2R), sO = Math.sin(Om * D2R), ci = Math.cos(i * D2R), si = Math.sin(i * D2R), cu = Math.cos(u * D2R), su = Math.sin(u * D2R);
    const x = a * (cO * cu - sO * ci * su), y = a * (sO * cu + cO * ci * su), z = a * si * su;
    return out.set(x * K, z * K, -y * K);
  }
  const nodeOf = (k, t) => O[k].O + (O[k].r - ref) * t; // display node: frame turns with the start object's node

  // pool rings (one LineSegments2, updated in place) and target rings
  const SEG = 72;
  const ringGeo = (n) => { const g = new LineSegmentsGeometry(); g.setPositions(new Float32Array(n * SEG * 6)); return g; };
  const poolRings = new LineSegments2(ringGeo(N), lineMat(C.sec, 0.6, 0.11, mats)); poolRings.frustumCulled = false; scene.add(poolRings);
  const seq = data.seq, inTour = new Map(seq.map((k, j) => [k, j]));
  const nextRing = new LineSegments2(ringGeo(1), lineMat(C.sec, 1.0, 0.75, mats)); nextRing.frustumCulled = false; scene.add(nextRing);
  const svcRing = new LineSegments2(ringGeo(1), lineMat(C.acc, 0.9, 0.45, mats)); svcRing.frustumCulled = false; scene.add(svcRing);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  function writeRing(arr, off, a, i, Om) {
    for (let s = 0; s < SEG; s++) {
      pos(a, i, Om, s / SEG * 360, tmp); pos(a, i, Om, (s + 1) / SEG * 360, tmp2);
      arr[off++] = tmp.x; arr[off++] = tmp.y; arr[off++] = tmp.z; arr[off++] = tmp2.x; arr[off++] = tmp2.y; arr[off++] = tmp2.z;
    } return off;
  }
  const arrOf = (ls) => ls.geometry.attributes.instanceStart.data;

  // servicer state along the tour
  const legFrac = 0.06; // drawn share of the leg spent lowering / climbing (the real burns are short)
  const dU = (a, b) => ((b - a + 540) % 360) - 180;
  function svc(t) {
    let k = 0; while (k < L.length - 1 && t > L[k].t1) k++;
    const g = L[k];
    if (t <= 0) { const o = O[seq[0]]; return { k: -1, a: o.a, i: o.i, Om: nodeOf(seq[0], 0), u: o.u }; }
    if (t >= g.t1 && k === L.length - 1) { const o = O[g.to]; return { k: L.length, a: o.a, i: o.i, Om: nodeOf(g.to, t), u: o.u }; }
    const s = clamp((t - g.t0) / (g.t1 - g.t0), 0, 1);
    const down = smooth(clamp(s / legFrac, 0, 1)), up = smooth(clamp((s - (1 - legFrac)) / legFrac, 0, 1));
    const a = up > 0 ? lerp(g.a_d, g.a_to, up) : lerp(g.a_from, g.a_d, down);
    const i = lerp(g.i_from, g.i_to, up);
    const Om = g.O0 + g.rc * (t - g.t0) - ref * t;
    const u = O[g.fr].u + dU(O[g.fr].u, O[g.to].u) * smooth(s);
    return { k, a, i, Om, u, s };
  }

  // trail: the servicer's drawn path, precomputed, revealed with time
  const PER = 90, trailT = [], trailP = [];
  L.forEach((g) => { for (let j = 0; j <= PER; j++) { const t = g.t0 + (g.t1 - g.t0) * j / PER; if (j === 0 && trailT.length) continue; const s = svc(Math.min(t, g.t1 - 1e-6)); pos(s.a, s.i, s.Om, s.u, tmp); trailT.push(t); trailP.push(tmp.x, tmp.y, tmp.z); } });
  const trail = polyline(trailP, C.acc, 1.3, 0.9, mats); scene.add(trail);

  // dots: pool, visited, next, servicer
  const dmat = dotMaterial(); S.dotMats.push(dmat);
  const pd = dots(N + 1, dmat); scene.add(pd);
  const labS = S.label('servicer', 'a'), labN = S.label('', 'w'), labStart = S.label('start', '');

  // display timing: each leg gets time that grows with the square root of its wait, plus a short hold at arrival
  const HOLD = 0.5, segs = []; let acc = 1.2; // 1.2 s intro hold
  L.forEach((g) => { const d = 0.7 + 1.15 * Math.sqrt((g.t1 - g.t0) / 100); segs.push([acc, acc + d, g.t0, g.t1]); acc += d + HOLD; });
  S.dur = acc + 2.5; S.loop = true;
  const simT = (td) => { if (td < segs[0][0]) return 0; for (const [d0, d1, t0, t1] of segs) { if (td < d1) return lerp(t0, t1, clamp((td - d0) / (d1 - d0), 0, 1)); if (td < d1 + HOLD) return t1; } return L[L.length - 1].t1; };

  // camera
  const rig = cameraRig(S); rig.dir.set(0.42, 0.78, 0.46).normalize(); // from high latitude, so the node fan reads
  let mode = 'shell';
  const bShell = S.button('Whole shell', () => setMode('shell'), true), bFollow = S.button('Follow servicer', () => setMode('follow'), false);
  function setMode(m) { mode = m; bShell.setAttribute('aria-pressed', m === 'shell'); bFollow.setAttribute('aria-pressed', m === 'follow'); S.forceDist = true; }
  const shellDist = () => { const tv = Math.tan(S.camera.fov / 2 * D2R), th = tv * S.camera.aspect; return 8.6 / Math.min(tv, th); };
  const sp = new THREE.Vector3(), M = data.meta;

  S.frame = (dt) => {
    const t = simT(S.td);
    // rings
    const pa = arrOf(poolRings); let off = 0;
    for (let k = 0; k < N; k++) off = writeRing(pa.array, off, O[k].a, O[k].i, nodeOf(k, t));
    pa.needsUpdate = true;
    const s = svc(t);
    const nextK = s.k >= 0 && s.k < L.length ? L[s.k].to : (s.k < 0 ? L[0].to : -1);
    if (nextK >= 0) { writeRing(arrOf(nextRing).array, 0, O[nextK].a, O[nextK].i, nodeOf(nextK, t)); arrOf(nextRing).needsUpdate = true; }
    nextRing.visible = nextK >= 0;
    writeRing(arrOf(svcRing).array, 0, s.a, s.i, s.Om); arrOf(svcRing).needsUpdate = true;
    pos(s.a, s.i, s.Om, s.u, sp);

    // dots
    const visited = s.k < 0 ? 1 : (s.k >= L.length ? seq.length : s.k + 1 + (s.s >= 1 ? 1 : 0));
    for (let k = 0; k < N; k++) {
      pos(O[k].a, O[k].i, nodeOf(k, t), O[k].u, tmp);
      const j = inTour.get(k); let hex = C.ter, al = 0.75, sz = 2.6;
      if (j !== undefined) { if (j < visited) { hex = C.text; al = 0.95; sz = 4; } else { hex = C.sec; al = 0.9; sz = 3; } }
      if (k === nextK) { hex = C.text; al = 1; sz = 6; }
      setDot(pd, k, tmp, hex, al, sz);
    }
    setDot(pd, N, sp, C.acc, 1, 7); dirtyDots(pd);
    trail.geometry.instanceCount = clamp(bsearch(trailT, t) + 1, 0, trail.userData.n); trail.visible = t > 0;

    // camera
    if (!S.rigInit) { rig.snap(new THREE.Vector3(), shellDist()); S.rigInit = true; }
    const follow = mode === 'follow', focus = (follow ? sp : tmp.set(0, 0, 0)).clone(), dist = follow ? 6 : shellDist();
    rig.step(focus, dist, dt, S.forceDist ? 10 : 0, S.forceDist || (!S.user && !follow) ? 3 : 0);
    if (follow && !S.user) { // sit above and slightly behind the servicer, so Earth's limb and the neighbouring orbits stay in frame
      tmp2.copy(sp).normalize(); tmp2.y += 0.35; tmp2.normalize().multiplyScalar(S.camera.position.distanceTo(S.controls.target)).add(S.controls.target);
      S.camera.position.lerp(tmp2, 1 - Math.exp(-2 * dt));
    }
    if (S.forceDist && S.controls.target.distanceTo(focus) < 0.6 && Math.abs(S.camera.position.distanceTo(S.controls.target) / dist - 1) < 0.05) S.forceDist = false;

    // labels
    S.place(labS, sp, !S.hidden(sp, tmp2.set(0, 0, 0), RE), 9, 6);
    if (nextK >= 0) { pos(O[nextK].a, O[nextK].i, nodeOf(nextK, t), O[nextK].u, tmp2); labN.s.textContent = `${s.s >= 1 ? 'at' : 'next:'} NORAD ${O[nextK].n}`; S.place(labN, tmp2, !S.hidden(tmp2, new THREE.Vector3(), RE) && tmp2.distanceTo(sp) * 1 > 0.05, 9, -12); }
    else S.place(labN, tmp2, false);
    pos(O[seq[0]].a, O[seq[0]].i, nodeOf(seq[0], t), O[seq[0]].u, tmp2); S.place(labStart, tmp2, t < 30 && !S.hidden(tmp2, new THREE.Vector3(), RE), 9, -12);

    // HUD
    const months = t / 30.4375;
    S.hud.clock.innerHTML = `Month ${months.toFixed(1)}<small>${(t / 365.25).toFixed(2)} yr of ${M.life_yr}</small>`;
    let dv = 0; for (let k = 0; k < L.length; k++) { if (t >= L[k].t1) dv += L[k].dv; else if (t > L[k].t0) dv += L[k].dv_split[0]; }
    if (s.k < 0) S.hud.ph.innerHTML = `Start <i>· servicer inserted at NORAD ${O[seq[0]].n}</i>`;
    else if (s.k >= L.length || (s.k === L.length - 1 && s.s >= 1)) S.hud.ph.innerHTML = `Done <i>· ${seq.length} objects, ${fmt(M.dv_total, 1)} m/s, ${fmt(M.days_total, 0)} d</i>`;
    else { const g = L[s.k], ph = s.s < legFrac ? 'lowering' : s.s > 1 - legFrac ? 'climbing to the target' : `drifting ${g.h_low} km low`; S.hud.ph.innerHTML = `Leg ${g.leg} of ${L.length} <i>· ${ph}, ${fmt(g.t1 - g.t0)} d wait</i>`; }
    S.readout([['Visited', `${visited} / ${seq.length}`], ['Delta-V', `${fmt(dv)} / ${fmt(M.dv_budget)} m/s`, 'a'], ['Elapsed', `${months.toFixed(1)} months`],
      ['Node vs start', `${(s.Om - nodeOf(seq[0], 0)).toFixed(1)}°`]]);
  };
  S.onUser = () => {};
  S.onRestart = () => { S.user = false; };
  S.start();
  if (REDUCE) S.td = S.dur;
}

/* ------------------------------------------------------------------ mount */
function mount(el) {
  el.innerHTML = '<div class="t3-load">Loading trajectory</div>';
  const src = el.dataset.src;
  fetch(src).then((r) => r.json()).then(async (data) => {
    if (data.kind === 'perci') perci(el, data);
    else {
      let coast = null;
      try { coast = await fetch(new URL('../../globe/coast110.json', new URL(src, location.href))).then((r) => (r.ok ? r.json() : null)); } catch (e) { coast = null; }
      tour(el, data, coast);
    }
  }).catch((err) => { el.innerHTML = '<div class="t3-load">Trajectory could not load</div>'; console.error(err); });
}

document.querySelectorAll('.traj3d').forEach((el) => {
  const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); mount(el); } }, { rootMargin: '300px' });
  io.observe(el);
});
