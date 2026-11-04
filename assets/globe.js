/* Debris globe: every catalogued object at one SGP4 epoch, one dot each, graded by radar cross-section.
   Markup:  <div class="globe3d" data-src="../assets/globe/debris_positions.json"></div>
            <script type="module" src="../assets/globe.js"></script>   (needs the "three" import map)
   Data:    debris_positions.json (header) + debris_positions.bin + coast110.json, built by
            _src/globe/build_globe_data.py. Positions are exact SGP4 at the epoch; the optional time-lapse
            advances the osculating two-body elements on the GPU (Kepler's equation in the vertex shader). */
import * as THREE from 'three';
import { OrbitControls } from './vendor/jsm/OrbitControls.js';

const REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const COARSE = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
const RATE = 60;                              // time-lapse: simulated seconds per real second
const TWO_PI = Math.PI * 2;
// size classes: 0 RCS not published, 1 <0.1, 2 0.1-1, 3 1-10, 4 >=10 m2. Ramp: dim grey -> white -> accent.
const CLASS_COLOR = ['#6a6a72', '#85858d', '#b9b9c0', '#ededee', '#ff5b2e'];
const CLASS_PX = [1.9, 2.1, 2.6, 3.2, 4.0];       // visible dot diameter, CSS px (sprite is padded in the shader)
const CLASS_ALPHA = [0.46, 0.58, 0.78, 0.95, 1.0];
const CLASS_LABEL = ['not published', '< 0.1', '0.1 – 1', '1 – 10', '≥ 10'];
const MODES = [['all', 'All objects'], ['rb', 'Rocket bodies'], ['cand', 'Candidate pool']];

const fmt = n => n.toLocaleString('en-US');
const pad = n => String(n).padStart(2, '0');

function ui(el, h) {
  const c = h.counts;
  const modeCount = { all: h.count, rb: c.rocket_bodies, cand: c.candidates };
  el.innerHTML =
    '<canvas aria-label="Globe of catalogued objects in Earth orbit" role="img"></canvas>' +
    '<div class="g3-head"><span class="g3-k">Catalogued objects</span>' +
    '<span class="g3-epoch"></span><span class="g3-clock"></span></div>' +
    '<div class="g3-modes" role="group" aria-label="Show">' +
    MODES.map(([k, l], i) => `<button type="button" data-m="${i}" aria-pressed="${i === 0}">${l}<span>${fmt(modeCount[k])}</span></button>`).join('') +
    '</div>' +
    '<div class="g3-legend"><span class="g3-k">Radar cross-section <em>m²</em></span><ol>' +
    CLASS_LABEL.map((l, i) => `<li><i style="--c:${CLASS_COLOR[i]};--s:${(CLASS_PX[i] * 2.2).toFixed(1)}px"></i>${l}</li>`).join('') +
    '</ol></div>' +
    '<div class="g3-read" aria-live="polite"></div>' +
    '<button type="button" class="g3-play" aria-pressed="false"></button>' +
    '<div class="g3-load">Loading catalogue</div>';
  return {
    canvas: el.querySelector('canvas'), epoch: el.querySelector('.g3-epoch'), clock: el.querySelector('.g3-clock'),
    modes: [...el.querySelectorAll('.g3-modes button')], read: el.querySelector('.g3-read'),
    play: el.querySelector('.g3-play'), load: el.querySelector('.g3-load'),
  };
}

function view(buf, L, key, Ctor, n) {
  return new Ctor(buf, L[key].offset, n * L[key].comps);
}

/* ---------- Earth: near-black sphere, hairline graticule, Natural Earth coastlines, atmosphere rim ---------- */
function llToVec(lon, lat, r) {               // Earth-fixed lon/lat -> three.js (y = north pole)
  const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
  return [r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo)];
}

function makeEarth(coast) {
  const g = new THREE.Group();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV;
      void main(){ float f = 1.-max(dot(vN,vV),0.); vec3 c = mix(vec3(.040,.040,.047), vec3(.085,.088,.10), pow(f,2.2));
      gl_FragColor = vec4(c,1.); }`,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  }));
  g.add(sphere);

  const grat = [], R = 1.0008;
  for (let lat = -75; lat <= 75; lat += 15) {
    for (let lon = -180; lon < 180; lon += 2) grat.push(...llToVec(lon, lat, R), ...llToVec(lon + 2, lat, R));
  }
  for (let lon = -180; lon < 180; lon += 15) {
    for (let lat = -88; lat < 88; lat += 2) grat.push(...llToVec(lon, lat, R), ...llToVec(lon, lat + 2, R));
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(grat, 3));
  g.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x2a2a2f, transparent: true, opacity: 0.55 })));

  if (coast) {
    const seg = [], s = coast.scale || 100, Rc = 1.0012;
    for (const ln of coast.lines) {
      for (let i = 0; i + 3 < ln.length; i += 2) seg.push(...llToVec(ln[i] / s, ln[i + 1] / s, Rc), ...llToVec(ln[i + 2] / s, ln[i + 3] / s, Rc));
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    g.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x8e8e96, transparent: true, opacity: 0.62 })));
  }
  return g;
}

function makeAtmosphere() {
  return new THREE.Mesh(new THREE.SphereGeometry(1.045, 96, 64), new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV;
      void main(){ float d = dot(vN, vV); float a = pow(clamp(1.0 + d, 0., 1.), 7.0) * smoothstep(-1.0, -0.15, d);
      gl_FragColor = vec4(vec3(.55,.66,.95)*a*.4, 1.); }`,
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
}

/* ---------- objects: GPU points, Kepler's equation in the vertex shader ---------- */
const KEPLER_GLSL = `
  vec3 orbitPos(float a, float e, float M0, vec3 P, vec3 Q, float t){
    float n = sqrt(uMu/(a*a*a));
    float M = mod(M0 + n*t, ${TWO_PI.toFixed(7)});
    float E = e < 0.8 ? M : 3.1415927;
    for (int i = 0; i < 10; i++) { E = E - (E - e*sin(E) - M)/(1.0 - e*cos(E)); }
    vec3 r = a*(cos(E) - e)*P + a*sqrt(max(1.0 - e*e, 0.0))*sin(E)*Q;   // TEME, km
    return vec3(r.x, r.z, -r.y) / uRe;                                    // three.js, Earth radii
  }`;

function makePoints(h, buf, px) {
  const n = h.count, L = h.layout;
  const g = new THREE.BufferGeometry();
  const a = view(buf, L, 'a_km', Float32Array, n), e = view(buf, L, 'e', Float32Array, n), m0 = view(buf, L, 'M0_rad', Float32Array, n);
  const pq = view(buf, L, 'PQ', Float32Array, n);
  const elem = new Float32Array(n * 3), P = new Float32Array(n * 3), Q = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    elem[i * 3] = a[i]; elem[i * 3 + 1] = e[i]; elem[i * 3 + 2] = m0[i];
    for (let k = 0; k < 3; k++) { P[i * 3 + k] = pq[i * 6 + k]; Q[i * 3 + k] = pq[i * 6 + 3 + k]; }
  }
  const size = view(buf, L, 'size', Uint8Array, n), type = view(buf, L, 'type', Uint8Array, n), flags = view(buf, L, 'flags', Uint8Array, n);
  const cls = new Float32Array(n * 3);              // size class, is rocket body, is candidate
  for (let i = 0; i < n; i++) { cls[i * 3] = size[i]; cls[i * 3 + 1] = type[i] === 1 ? 1 : 0; cls[i * 3 + 2] = flags[i] & 1; }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));   // unused, keeps three happy
  g.setAttribute('aElem', new THREE.BufferAttribute(elem, 3));
  g.setAttribute('aP', new THREE.BufferAttribute(P, 3));
  g.setAttribute('aQ', new THREE.BufferAttribute(Q, 3));
  g.setAttribute('aCls', new THREE.BufferAttribute(cls, 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

  const col = CLASS_COLOR.map(c => new THREE.Color(c));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: 0 }, uMu: { value: h.mu_km3_s2 }, uRe: { value: h.re_km }, uPx: { value: px },
      uFrom: { value: 0 }, uTo: { value: 0 }, uMix: { value: 1 }, uDist: { value: 7 },
      uCol: { value: col }, uSz: { value: CLASS_PX }, uAl: { value: CLASS_ALPHA },
    },
    vertexShader: `
      uniform float uT, uMu, uRe, uPx, uFrom, uTo, uMix, uDist;
      uniform vec3 uCol[5]; uniform float uSz[5]; uniform float uAl[5];
      attribute vec3 aElem, aP, aQ, aCls;
      varying vec3 vC; varying float vA; varying float vR;
      ${KEPLER_GLSL}
      float keep(float m){ return m < 0.5 ? 1.0 : (m < 1.5 ? aCls.y : aCls.z); }
      void main(){
        vec3 p = orbitPos(aElem.x, aElem.y, aElem.z, aP, aQ, uT);
        vec4 mv = modelViewMatrix*vec4(p, 1.0);
        gl_Position = projectionMatrix*mv;
        int c = int(aCls.x + 0.5);
        float k = mix(keep(uFrom), keep(uTo), uMix);
        float filtered = mix(0.09, 1.0, k);
        float zoom = clamp(uDist / -mv.z, 0.75, 1.9);
        float s = uSz[c] * mix(1.0, 1.25, k * step(0.5, uTo + uFrom) );
        float dia = uPx * s * zoom;
        gl_PointSize = dia + 2.0;                 // pad by 1 px each side so the soft edge is not clipped
        vR = dia / (dia + 2.0);
        vC = uCol[c]; vA = uAl[c] * filtered;
      }`,
    fragmentShader: `
      varying vec3 vC; varying float vA; varying float vR;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0 / vR;
        float a = 1.0 - smoothstep(0.35, 1.15, d);
        if (a <= 0.0) discard;
        gl_FragColor = vec4(vC * a * vA, 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return { pts, mat, elem, P, Q, size, type, flags, n };
}

function makeMarker() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 18 } },
    vertexShader: `uniform float uPx; void main(){ gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize = uPx; }`,
    fragmentShader: `void main(){ float d = length(gl_PointCoord-0.5)*2.0; float w = 0.09;
      float a = smoothstep(1.0, 1.0-w, d) * smoothstep(1.0-3.0*w, 1.0-2.0*w, d); if (a<=0.) discard;
      gl_FragColor = vec4(1.0, .357, .18, a); }`,
    transparent: true, depthTest: false, depthWrite: false,
  });
  const p = new THREE.Points(g, m);
  p.visible = false; p.frustumCulled = false; p.renderOrder = 10;
  return p;
}

/* CPU twin of the shader, for picking and the readout. */
function positionsAt(o, h, t, out) {
  const mu = h.mu_km3_s2, re = h.re_km;
  for (let i = 0; i < o.n; i++) {
    const a = o.elem[i * 3], e = o.elem[i * 3 + 1], m0 = o.elem[i * 3 + 2];
    let M = (m0 + Math.sqrt(mu / (a * a * a)) * t) % TWO_PI;
    let E = e < 0.8 ? M : Math.PI;
    for (let k = 0; k < 10; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const x = a * (Math.cos(E) - e), y = a * Math.sqrt(Math.max(1 - e * e, 0)) * Math.sin(E), j = i * 3;
    const rx = o.P[j] * x + o.Q[j] * y, ry = o.P[j + 1] * x + o.Q[j + 1] * y, rz = o.P[j + 2] * x + o.Q[j + 2] * y;
    out[j] = rx / re; out[j + 1] = rz / re; out[j + 2] = -ry / re;
  }
  return out;
}

async function init(el) {
  const src = el.dataset.src;
  const base = new URL(src, location.href);
  const h = await (await fetch(base)).json();
  const [buf, coast] = await Promise.all([
    fetch(new URL(h.bin, base)).then(r => r.arrayBuffer()),
    fetch(new URL(h.coast, base)).then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const U = ui(el, h);
  const names = new TextDecoder().decode(new Uint8Array(buf, h.layout.names_utf8.offset, h.layout.names_utf8.bytes)).split('\n');
  const norad = view(buf, h.layout, 'norad', Uint32Array, h.count);
  const rcs = view(buf, h.layout, 'rcs_m2', Float32Array, h.count);
  const cluster = view(buf, h.layout, 'cluster', Uint8Array, h.count);

  const still = el.hasAttribute('data-still');
  const dpr = Math.min(window.devicePixelRatio || 1, still ? 3 : 2);
  const renderer = new THREE.WebGLRenderer({ canvas: U.canvas, antialias: true, alpha: false, preserveDrawingBuffer: still });
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x0b0b0c, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 400);
  const controls = new OrbitControls(camera, U.canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.07; controls.enablePan = false;
  controls.minDistance = 1.7; controls.maxDistance = 34; controls.rotateSpeed = 0.55; controls.zoomSpeed = 0.7;
  controls.autoRotate = !REDUCE && !still; controls.autoRotateSpeed = 0.28;

  const earth = makeEarth(coast);
  scene.add(earth, makeAtmosphere());
  const phone = () => el.clientWidth < 560;
  const O = makePoints(h, buf, dpr * (COARSE || phone() ? 0.82 : 1));
  scene.add(O.pts);
  const marker = makeMarker();
  scene.add(marker);

  // initial view: tilted a little above the equator, 7.4 Earth radii out (LEO shell fills the frame, GEO at the edges)
  const startDist = Number(el.dataset.dist) || (phone() ? 24 : 22);
  const az = (Number(el.dataset.az) || 35) * Math.PI / 180, elv = (Number(el.dataset.el) || 14) * Math.PI / 180;
  camera.position.set(startDist * Math.cos(elv) * Math.sin(az), startDist * Math.sin(elv), startDist * Math.cos(elv) * Math.cos(az));
  controls.update();

  const ep = new Date(h.epoch_unix * 1000);
  const stamp = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  U.epoch.textContent = `SGP4 epoch ${stamp(ep)}`;

  let simT = 0, playing = !REDUCE && !still && el.dataset.play !== 'off', mode = 0, mixStart = 0, last = performance.now();
  const setPlay = p => {
    playing = p; U.play.setAttribute('aria-pressed', String(p));
    U.play.textContent = p ? `Pause  ×${RATE}` : (simT > 0 ? `Resume  ×${RATE}` : `Play  ×${RATE}`);
  };
  setPlay(playing);
  U.play.addEventListener('click', () => setPlay(!playing));
  const updClock = () => {
    if (simT < 1) { U.clock.textContent = ''; return; }
    const m = Math.floor(simT / 60);
    U.clock.textContent = `+${pad(Math.floor(m / 60))}:${pad(m % 60)} time-lapse, two-body`;
  };

  U.modes.forEach(b => b.addEventListener('click', () => {
    const m = Number(b.dataset.m);
    if (m === mode) return;
    O.mat.uniforms.uFrom.value = mode; O.mat.uniforms.uTo.value = m; O.mat.uniforms.uMix.value = REDUCE ? 1 : 0;
    mixStart = performance.now(); mode = m;
    U.modes.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    hideRead();
  }));

  if (el.dataset.mode) U.modes[Number(el.dataset.mode)]?.click();   // optional initial filter (0 all, 1 R/B, 2 pool)
  const stopAuto = () => { controls.autoRotate = false; };
  controls.addEventListener('start', stopAuto);

  /* ---- picking ---- */
  const cpu = new Float32Array(h.count * 3);
  let cpuT = -1, hover = -1, pending = null;
  const v = new THREE.Vector3(), camPos = new THREE.Vector3();
  const visible = i => (mode === 0) || (mode === 1 && O.type[i] === 1) || (mode === 2 && (O.flags[i] & 1));
  function pick(cx, cy) {
    const r = U.canvas.getBoundingClientRect();
    if (cpuT !== simT) { positionsAt(O, h, simT, cpu); cpuT = simT; }
    camera.updateMatrixWorld(); camPos.copy(camera.position);
    const lim = COARSE ? 26 : 14, W = r.width, H = r.height;
    const mx = cx - r.left, my = cy - r.top;
    let best = -1, bd = lim * lim, bz = Infinity;
    for (let i = 0; i < h.count; i++) {
      if (!visible(i)) continue;
      const j = i * 3;
      v.set(cpu[j], cpu[j + 1], cpu[j + 2]).project(camera);
      if (v.z > 1 || v.z < -1) continue;
      const sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H, d = (sx - mx) ** 2 + (sy - my) ** 2;
      if (d > bd + 4) continue;
      // hidden behind the Earth? (segment camera -> object hits the unit sphere first)
      const ox = cpu[j], oy = cpu[j + 1], oz = cpu[j + 2];
      const dx = ox - camPos.x, dy = oy - camPos.y, dz = oz - camPos.z, L = Math.hypot(dx, dy, dz);
      const ux = dx / L, uy = dy / L, uz = dz / L, b = camPos.x * ux + camPos.y * uy + camPos.z * uz;
      const c = camPos.lengthSq() - 1, disc = b * b - c;
      if (disc > 0 && -b - Math.sqrt(disc) > 0 && -b - Math.sqrt(disc) < L) continue;
      // prefer the larger object when two are within a few px
      const score = d - O.size[i] * 6;
      if (score < bz) { bz = score; bd = Math.max(d, 1); best = i; }
    }
    return best;
  }
  function hideRead() { hover = -1; marker.visible = false; U.read.classList.remove('on'); }
  function showRead(i) {
    hover = i;
    const j = i * 3, alt = Math.hypot(cpu[j], cpu[j + 1], cpu[j + 2]) * h.re_km - h.re_km;
    marker.geometry.attributes.position.array.set([cpu[j], cpu[j + 1], cpu[j + 2]]);
    marker.geometry.attributes.position.needsUpdate = true; marker.visible = true;
    const t = h.type_names[O.type[i]], s = O.size[i];
    const rc = s === 0 ? 'RCS not published' : `RCS ${rcs[i] < 0.1 ? rcs[i].toFixed(3) : rcs[i].toFixed(2)} m²`;
    const cand = (O.flags[i] & 1) ? `<span class="g3-c">Candidate pool · sub-cluster ${cluster[i]}</span>` : '';
    U.read.innerHTML = `<b>${names[i] || 'Unnamed'}</b><span>NORAD ${norad[i]} · ${t}</span>` +
      `<span>${rc}${s ? ` · class ${CLASS_LABEL[s]}` : ''}</span><span>Altitude ${fmt(Math.round(alt))} km</span>${cand}`;
    U.read.classList.add('on');
  }
  const onMove = ev => {
    if (ev.pointerType === 'touch') return;
    pending = [ev.clientX, ev.clientY];
  };
  U.canvas.addEventListener('pointermove', onMove);
  U.canvas.addEventListener('pointerleave', () => { pending = null; hideRead(); });
  let down = null;
  U.canvas.addEventListener('pointerdown', ev => { down = [ev.clientX, ev.clientY]; });
  U.canvas.addEventListener('pointerup', ev => {          // tap to inspect on touch screens
    if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 6) return;
    const i = pick(ev.clientX, ev.clientY);
    if (i >= 0) showRead(i); else hideRead();
  });

  /* ---- layout + loop ---- */
  function resize() {
    const w = el.clientWidth, hh = el.clientHeight;
    renderer.setSize(w, hh, false);
    camera.aspect = w / Math.max(hh, 1); camera.updateProjectionMatrix();
    marker.material.uniforms.uPx.value = 18 * dpr;
  }
  new ResizeObserver(resize).observe(el);
  resize();

  let onScreen = true, raf = 0;
  new IntersectionObserver(es => { onScreen = es[0].isIntersecting; if (onScreen && !raf) raf = requestAnimationFrame(frame); }).observe(el);

  function frame(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    if (playing) { simT += dt * RATE; if (simT > 86400) simT = 0; }
    const u = O.mat.uniforms;
    u.uT.value = simT;
    u.uMix.value = Math.min(1, (now - mixStart) / 450);
    u.uDist.value = startDist;
    earth.rotation.y = h.gmst0_rad + h.earth_rate_rad_s * simT;   // Earth-fixed -> TEME about the pole
    controls.update();
    if (pending) { const i = pick(pending[0], pending[1]); pending = null; if (i >= 0) showRead(i); else hideRead(); }
    else if (hover >= 0 && playing) { positionsAt(O, h, simT, cpu); cpuT = simT; showRead(hover); }
    updClock();
    renderer.render(scene, camera);
    if (onScreen || still) raf = requestAnimationFrame(frame);
  }
  U.load.remove();
  el.classList.add('ready');
  raf = requestAnimationFrame(frame);
  if (still) { let k = 0; const w = () => (++k > 20 ? (document.documentElement.dataset.globeReady = '1') : requestAnimationFrame(w)); requestAnimationFrame(w); }
}

for (const el of document.querySelectorAll('.globe3d[data-src]')) {
  init(el).catch(err => {
    console.error('globe', err);
    el.classList.add('g3-fail');
    el.textContent = 'The globe needs WebGL and could not load here.';
  });
}
