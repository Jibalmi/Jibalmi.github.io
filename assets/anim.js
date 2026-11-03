/* Mission animation player. Markup (build.py):  <div class="anim" data-src="assets/anim/<slug>/<name>.json" data-module="assets/anim/<slug>/<name>.js">
   The module exports { duration(data) -> seconds, speeds?: [..], init(ctx, data, canvas), draw(t, ctx, data, canvas) }.
   This file supplies the canvas, play/pause, scrubber, speed and time readout; drawing is the module's job. */
const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

async function mount(el) {
  el.innerHTML = '<canvas></canvas><div class="an-bar"><button type="button" class="an-play" aria-label="Play">▶</button>' +
    '<input type="range" class="an-scrub" min="0" max="1000" value="0" aria-label="Time"><span class="an-time"></span>' +
    '<select class="an-speed" aria-label="Speed"></select></div>';
  const canvas = el.querySelector('canvas'), ctx = canvas.getContext('2d');
  const play = el.querySelector('.an-play'), scrub = el.querySelector('.an-scrub'), timeEl = el.querySelector('.an-time'), sel = el.querySelector('.an-speed');
  const [data, mod] = await Promise.all([fetch(el.dataset.src).then((r) => r.json()), import(new URL(el.dataset.module, location.href).href)]);
  const dur = mod.duration ? mod.duration(data) : 10;
  (mod.speeds || [0.5, 1, 2, 4]).forEach((s) => { const o = document.createElement('option'); o.value = s; o.textContent = s + '×'; if (s === 1) o.selected = true; sel.appendChild(o); });
  const fmt = mod.format || ((t) => t.toFixed(1) + ' s');
  let t = 0, playing = false, last = 0, visible = false;
  function fit() {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = el.clientWidth, asp = mod.aspectFor ? mod.aspectFor(w, data) : (data.aspect || 0.5625), h = Math.round(w * asp);
    canvas.style.height = h + 'px'; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.cssW = w; canvas.cssH = h;
    if (mod.init) mod.init(ctx, data, canvas);
    draw();
  }
  function draw() { ctx.clearRect(0, 0, canvas.cssW, canvas.cssH); mod.draw(t, ctx, data, canvas); timeEl.textContent = fmt(t, data); scrub.value = (t / dur) * 1000; }
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) { last = now; return; }
    if (playing) { t += ((now - last) / 1000) * +sel.value * (data.rate || dur / 20); if (t >= dur) { t = dur; set(false); } draw(); }
    last = now;
  }
  function set(p) { playing = p; play.textContent = p ? '❚❚' : '▶'; play.setAttribute('aria-label', p ? 'Pause' : 'Play'); if (p && t >= dur) t = 0; }
  play.addEventListener('click', () => set(!playing));
  scrub.addEventListener('input', () => { t = (scrub.value / 1000) * dur; draw(); });
  new ResizeObserver(fit).observe(el);
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible && !reduce && !el.dataset.started) { el.dataset.started = 1; set(true); } }, { threshold: 0.4 }).observe(el);
  fit(); requestAnimationFrame(frame);
}
document.querySelectorAll('.anim').forEach((el) => { mount(el).catch((e) => { el.textContent = 'Animation could not load'; console.error(e); }); });
