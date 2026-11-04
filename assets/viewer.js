/* 3D model viewer: rotate, zoom, explode, toggle parts. Models are glTF binaries exported from CadQuery.
   Markup (written by build.py):  <div class="model3d" data-src="assets/models/<slug>/<name>.glb" data-meta="…<name>.json">
   meta JSON: { "title": "...", "units": "mm", "parts": { "<node name>": { "label": "...", "explode": [dx,dy,dz], "group": "..." } },
                "views": { "iso": {"pos":[x,y,z]} }, "explode_scale": 1 }                                                  */
import * as THREE from 'three';
import { OrbitControls } from './vendor/jsm/OrbitControls.js';
import { GLTFLoader } from './vendor/jsm/GLTFLoader.js';

const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const loader = new GLTFLoader();

function ui(el) {
  el.innerHTML = '<canvas></canvas><div class="m3-bar"><label class="m3-ex">Explode <input type="range" min="0" max="1" step="0.005" value="0" aria-label="Explode"></label>' +
    '<button type="button" class="m3-b" data-a="spin" aria-pressed="false">Spin</button><button type="button" class="m3-b" data-a="edges" aria-pressed="true">Edges</button>' +
    '<button type="button" class="m3-b" data-a="reset">Reset</button></div><div class="m3-tip" hidden></div><div class="m3-load">Loading model</div><div class="m3-chip">Drag to rotate</div>';
  return { canvas: el.querySelector('canvas'), slider: el.querySelector('input'), tip: el.querySelector('.m3-tip'), load: el.querySelector('.m3-load') };
}

function mount(el) {
  const { canvas, slider, tip, load } = ui(el);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 5000);
  scene.add(new THREE.HemisphereLight(0xe8eeff, 0x4a4a58, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffa07a, 1.6); rim.position.set(-4, -2, -3); scene.add(rim);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.autoRotateSpeed = 1.1;
  const group = new THREE.Group(); scene.add(group);
  const state = { parts: [], t: 0, edges: [], on: false, home: null, radius: 1, meta: {} };

  function size() {
    const w = canvas.clientWidth || el.clientWidth, h = canvas.clientHeight || el.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(size).observe(canvas); size();
  canvas.addEventListener('pointerdown', () => { const c = el.querySelector('.m3-chip'); if (c) c.classList.add('gone'); }, { once: true });

  const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObjects(state.parts.map((p) => p.obj), true)[0];
    if (!hit) { tip.hidden = true; return; }
    const part = state.parts.find((p) => { let o = hit.object; while (o) { if (o === p.obj) return true; o = o.parent; } return false; });
    tip.textContent = part ? part.label : ''; tip.hidden = !part;
    tip.style.left = e.clientX - r.left + 14 + 'px'; tip.style.top = e.clientY - r.top + 14 + 'px';
  });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; });

  el.addEventListener('click', (e) => {
    const b = e.target.closest('.m3-b'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'spin') { controls.autoRotate = !controls.autoRotate; b.setAttribute('aria-pressed', controls.autoRotate); }
    if (a === 'edges') { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); state.edges.forEach((l) => (l.visible = on)); }
    if (a === 'reset') { home(); slider.value = 0; setExplode(0); }
  });
  slider.addEventListener('input', () => setExplode(+slider.value));

  function setExplode(t) {
    state.t = t;
    const s = state.meta.explode_scale || 1;
    state.parts.forEach((p) => p.obj.position.copy(p.base).addScaledVector(p.dir, t * s));
    if (state.r0) {  // pull the camera back only as far as the explode needs
      const want = (state.r0 + (state.r1 - state.r0) * t) / Math.sin((camera.fov / 2) * Math.PI / 180) * 1.02;
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, want);
    }
  }
  function home() {
    const r = state.r0 || state.radius, d = r / Math.sin((camera.fov / 2) * Math.PI / 180) * 0.98, c = state.center || new THREE.Vector3();
    const dir = new THREE.Vector3(0.62, 0.42, 0.66).normalize();
    camera.position.copy(c).addScaledVector(dir, d); controls.target.copy(c); controls.update();
  }

  const src = el.dataset.src, metaSrc = el.dataset.meta;
  Promise.all([loader.loadAsync(src), metaSrc ? fetch(metaSrc).then((r) => r.json()).catch(() => ({})) : {}]).then(([gltf, meta]) => {
    state.meta = meta || {};
    const root = gltf.scene;
    const palette = [0xc9ccd6, 0x9aa3b5, 0x6f7a90, 0xff5b2e, 0x4fd1a5, 0xf5b942, 0x6aa7ff];
    let ci = 0;
    root.traverse((o) => {
      if (o.isMesh) {
        if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
        let base = o.material && o.material.color ? o.material.color.clone() : new THREE.Color(palette[ci++ % palette.length]);
        const lum = 0.2126 * base.r + 0.7152 * base.g + 0.0722 * base.b;
        if (lum < 0.22) base.lerp(new THREE.Color(0x9aa0b0), 0.42 - lum);
        { const hsl = {}; base.getHSL(hsl); const accent = hsl.h > 0.0 && hsl.h < 0.08 && hsl.s > 0.6;
          if (!accent) base.setHSL(hsl.h, hsl.s * 0.18, Math.min(hsl.l, 0.74)); }  // studio palette: keep only the orange accent saturated
        const tr = o.material && (o.material.transparent || o.material.opacity < 1), op = tr ? Math.min(o.material.opacity, 0.35) : 1;
        o.material = new THREE.MeshStandardMaterial({ color: base, metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide, transparent: !!tr, opacity: op, depthWrite: !tr,
          polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 28), new THREE.LineBasicMaterial({ color: 0xc8ccd8, transparent: true, opacity: 0.28 }));
        o.add(e); state.edges.push(e);
      }
    });
    const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    root.position.sub(c); group.add(root);
    state.radius = Math.max(sz.x, sz.y, sz.z) * 0.9 || 1;
    const parts = (state.meta.parts) || {};
    root.children.forEach((o) => {
      const m = parts[o.name] || {}, d = m.explode || [0, 0, 0];
      state.parts.push({ obj: o, base: o.position.clone(), dir: new THREE.Vector3(d[0], d[1], d[2]), label: m.label || o.name });
    });
    const s0 = state.meta.explode_scale || 1, union = new THREE.Box3().setFromObject(group);
    state.parts.forEach((p) => p.obj.position.copy(p.base).addScaledVector(p.dir, s0));
    union.union(new THREE.Box3().setFromObject(group));
    state.parts.forEach((p) => p.obj.position.copy(p.base));
    const asm = new THREE.Box3().setFromObject(group);
    state.center = asm.getCenter(new THREE.Vector3());
    state.r0 = asm.getBoundingSphere(new THREE.Sphere()).radius || state.radius;
    state.r1 = Math.max(state.r0, union.getBoundingSphere(new THREE.Sphere()).radius || state.r0);
    state.radius = state.r0;
    camera.near = state.radius / 100; camera.far = state.radius * 60; camera.updateProjectionMatrix();
    home(); load.remove();
    if (!state.parts.some((p) => p.dir.lengthSq() > 0)) el.querySelector('.m3-ex').style.display = 'none';
    if (!reduce && el.dataset.spin === '1') controls.autoRotate = true;
    el.dispatchEvent(new CustomEvent('model-ready'));
  }).catch((err) => { load.textContent = 'Model could not load'; console.error(err); });

  let visible = false;
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0.05 }).observe(el);
  (function loop() { requestAnimationFrame(loop); if (!visible) return; controls.update(); renderer.render(scene, camera); })();
}

document.querySelectorAll('.model3d').forEach((el) => {
  const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); mount(el); } }, { rootMargin: '200px' });
  io.observe(el);
});
