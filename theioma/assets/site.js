// Theioma product site (site v5): one script for every page. No framework, no window scroll listeners: every reveal,
// the scrim's colour, the film's lazy load and the demos' play and pause run on IntersectionObserver. Without this file
// every section is visible, every link works (the Product menu is a <details>), and every recording can be opened.
// Reduced motion: everything at rest, nothing plays by itself; every clip keeps a visible play button.
(() => {
  window.__site = true; // the head script un-hides revealed blocks if this file never runs
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hasIO = 'IntersectionObserver' in window;

  // ---- The burger: two lines that morph to an X, and a full-screen menu of every page whose links rise in turn.
  const burger = document.querySelector('[data-burger]');
  const menu = document.getElementById('menu');
  let closeT = 0;
  const setMenu = (on) => {
    if (!burger || !menu) return;
    clearTimeout(closeT);
    burger.setAttribute('aria-expanded', String(on));
    burger.setAttribute('aria-label', on ? 'Close the menu' : 'Open the menu');
    if (on) {
      menu.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('menu-open')));
      setTimeout(() => menu.querySelector('a')?.focus({ preventScroll: true }), 120);
    } else {
      root.classList.remove('menu-open');
      closeT = setTimeout(() => { menu.hidden = true; }, reduce.matches ? 0 : 620);
    }
  };
  if (burger && menu) {
    burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    window.matchMedia('(min-width: 1181px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });
  }

  // ---- The Product menu is a <details>: it opens without this file. Here: Escape, a click outside, or a link closes it.
  const product = document.querySelector('[data-menu]');
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (burger && burger.getAttribute('aria-expanded') === 'true') { setMenu(false); burger.focus(); }
    if (product && product.open) { product.open = false; product.querySelector('summary').focus(); }
  });
  if (product) {
    document.addEventListener('click', (e) => { if (product.open && !product.contains(e.target)) product.open = false; });
    product.addEventListener('click', (e) => { if (e.target.closest('.nav-panel a')) product.open = false; });
  }

  // ---- The scrim behind the island takes the colour of the section under it: white over a white section.
  const papers = [...document.querySelectorAll('.paper')];
  if (hasIO && papers.length) {
    const LINE = 50; // px from the top: the island's middle
    let po = null;
    const watch = () => {
      po?.disconnect();
      const on = new Set();
      // The root is cut to a strip two pixels tall at the island's middle; a white section crossing it turns the band white.
      po = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) on.add(e.target); else on.delete(e.target); });
        if (on.size) root.dataset.top = 'paper'; else delete root.dataset.top;
      }, { rootMargin: `-${LINE}px 0px -${Math.max(0, window.innerHeight - LINE - 2)}px 0px`, threshold: 0 });
      papers.forEach((p) => po.observe(p));
    };
    watch();
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(watch, 200); });
  }

  // ---- A page's strip of sibling pages scrolls sideways on a phone: start it with the current page in view.
  const strip = document.querySelector('.chapters');
  const here = strip?.querySelector('[aria-current]');
  if (strip && here && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = Math.max(0, here.offsetLeft - (strip.clientWidth - here.offsetWidth) / 2);

  // ---- Reveal: a block rises 64 px out of a 12 px blur as the reader reaches it (CSS); a diagram also starts its loop.
  const items = [...document.querySelectorAll('[data-reveal], [data-dg]')];
  const show = (el) => {
    el.classList.add('in');
    if (el.hasAttribute('data-dg') && !reduce.matches) el.classList.add('run');
  };
  if (hasIO && !reduce.matches) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        show(en.target);
        io.unobserve(en.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    items.forEach((el) => io.observe(el));
  } else {
    items.forEach(show);
  }

  // ---- One loop for the film and for every demo: a part of a recording (data-from, data-to, in seconds), or all of it.
  // It plays muted while its frame is on screen, never by itself under reduced motion, and its button always works.
  function looper(video, host, { load } = {}) {
    const from = Number(video.dataset.from);
    const to = Number(video.dataset.to);
    const part = Number.isFinite(from) && Number.isFinite(to) && to > from;
    const isFilm = video.hasAttribute?.('data-film-video') ?? Boolean(load);
    let inView = false;
    let userPaused = false;
    let suspendedPauses = 0;
    let failed = false;
    let playGeneration = 0;
    const failedSources = new Set();
    const allSourcesFailed = () => {
      const sources = Array.from(video.querySelectorAll('source'));
      return sources.length > 0 && sources.every((source) => failedSources.has(source));
    };
    if (isFilm) video.controls = true;
    else if (part) host.style.setProperty('--dur', `${(to - from).toFixed(1)}s`);
    else video.loop = true;
    const errorBox = host.querySelector('[data-film-error]');
    const message = host.querySelector('[data-film-message]');
    const clearError = () => { failed = false; if (errorBox) errorBox.hidden = true; };
    const fail = () => {
      failed = true;
      userPaused = true;
      delete host.dataset.playing;
      delete host.dataset.started;
      video.pause();
      if (message) message.textContent = 'The preview could not play. Try loading it again.';
      if (errorBox) errorBox.hidden = false;
    };
    const seek = () => { if (part && !isFilm && (video.currentTime < from - 0.25 || video.currentTime >= to)) { try { video.currentTime = from; } catch { /* not seekable yet */ } } };
    video.addEventListener('loadedmetadata', seek);
    video.addEventListener('timeupdate', () => { if (part && !isFilm && video.currentTime >= to) video.currentTime = from; });
    video.addEventListener('play', () => { userPaused = false; clearError(); });
    video.addEventListener('playing', () => { host.dataset.playing = ''; host.dataset.started = ''; });
    video.addEventListener('pause', () => {
      delete host.dataset.playing;
      playGeneration += 1;
      if (suspendedPauses) suspendedPauses -= 1; else userPaused = true;
    });
    video.addEventListener('loadstart', () => failedSources.clear());
    // Source errors do not bubble. Capture them and allow the browser to try its next format.
    video.addEventListener('error', (event) => {
      if (event.target === video) { fail(); return; }
      if (event.target?.tagName !== 'SOURCE') return;
      failedSources.add(event.target);
      if (allSourcesFailed()) fail();
    }, true);
    const play = (manual = true, retry = false) => {
      if (!manual && (isFilm || userPaused || failed || reduce.matches)) return;
      if (manual) { userPaused = false; clearError(); }
      const generation = ++playGeneration;
      if (retry) failedSources.clear();
      load?.(retry);
      if (isFilm && !retry && (video.error || allSourcesFailed())) { fail(); return; }
      if (video.preload === 'none') video.preload = 'auto';
      seek();
      video.play().catch(() => { if (generation === playGeneration) fail(); });
    };
    const pause = () => { userPaused = true; playGeneration += 1; video.pause(); };
    const suspend = () => { playGeneration += 1; if (!video.paused) { suspendedPauses += 1; video.pause(); } };
    host.querySelectorAll('[data-demo-toggle], [data-film-play], [data-film-toggle]').forEach((b) => b.addEventListener('click', () => {
      if (video.paused) play(); else pause();
      host.querySelectorAll('[data-demo-toggle], [data-film-toggle]').forEach((x) => x.setAttribute('aria-label', video.paused ? 'Play' : 'Pause'));
    }));
    host.querySelector('[data-film-retry]')?.addEventListener('click', () => play(true, true));
    reduce.addEventListener('change', (event) => {
      if (event.matches) { userPaused = true; suspend(); }
      else if (inView) play(false);
    });
    if (hasIO) new IntersectionObserver((entries) => {
      for (const entry of entries) {
        inView = entry.isIntersecting;
        if (inView) play(false); else suspend();
      }
    }, { threshold: 0.35 }).observe(host);
    return { play, pause };
  }

  // ---- The film: poster first; its sources are set only as it nears the viewport (the vertical cut on a narrow
  // portrait screen); the poster fades out as it plays.
  const stage = document.querySelector('[data-film][data-state="ready"]');
  const film = stage?.querySelector('[data-film-video]');
  if (stage && film) {
    let loaded = false;
    const load = (retry = false) => {
      if (loaded) { if (retry) film.load(); return; }
      loaded = true;
      // The upright cut plays only in the upright frame (data-upright: the page has an upright poster for it).
      const vertical = stage.hasAttribute('data-upright') && film.dataset.srcVertical && window.matchMedia('(max-width: 600px) and (orientation: portrait)').matches;
      const list = vertical ? [['video/mp4', film.dataset.srcVertical]] : [['video/webm', film.dataset.srcWebm], ['video/mp4', film.dataset.srcMp4]];
      for (const [type, src] of list) {
        if (!src) continue;
        const s = document.createElement('source');
        s.type = type;
        s.src = src;
        film.appendChild(s);
      }
      // Captions as a track, over http(s) only: under file:// a page may not load the .vtt beside it.
      const captions = vertical ? (film.dataset.srcCaptionsVertical || film.dataset.srcCaptions) : film.dataset.srcCaptions;
      if (captions && /^https?:$/.test(location.protocol) && !film.querySelector('track')) {
        const tr = document.createElement('track');
        tr.kind = 'captions'; tr.srclang = 'en'; tr.label = 'English'; tr.default = true; tr.src = captions;
        film.appendChild(tr);
      }
      film.load();
      stage.dataset.ready = '';
    };
    if (hasIO) new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) load(); }, { rootMargin: '600px 0px' }).observe(stage);
    looper(film, stage, { load });
  }

  // ---- The demos: each plays its one idea while it is on screen.
  document.querySelectorAll('video[data-demo]').forEach((v) => { const host = v.closest('.demo'); if (host) looper(v, host); });

  // ---- Recordings on the deep pages (the whole take, with its own controls): play while on screen.
  const videos = [...document.querySelectorAll('video[data-reel-play]')];
  if (videos.length && hasIO && !reduce.matches) {
    const vo = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const v = en.target;
        if (en.isIntersecting) { v.preload = 'auto'; v.play().catch(() => {}); } else v.pause();
      }
    }, { threshold: 0.35 });
    videos.forEach((v) => vo.observe(v));
  }

  // ---- HTML recordings sit in sandboxed frames that post their own height ({theioma: "height", value}).
  const frameOf = (source) => [...document.querySelectorAll('iframe[data-reel-frame]')].find((f) => f.contentWindow === source);
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.theioma !== 'height') return;
    const f = frameOf(e.source);
    const v = Number(d.value);
    if (!f || f.hidden || !Number.isFinite(v)) return;
    const max = Number(f.dataset.max) || 2400;
    const screen = f.closest('.reel-screen');
    if (screen) screen.style.height = `${Math.round(Math.min(max, Math.max(160, v)))}px`;
  });

  // ---- "Step through it": the clip's keyframe replay in place of the video, and back.
  document.querySelectorAll('a[data-reel-step]').forEach((a) => {
    const screen = a.closest('.reel')?.querySelector('.reel-screen');
    const vid = screen?.querySelector('video');
    if (!screen || !vid) return;
    let frame = null;
    const words = { off: a.textContent, on: 'Back to the video' };
    a.setAttribute('role', 'button');
    a.setAttribute('aria-pressed', 'false');
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      const on = a.getAttribute('aria-pressed') !== 'true';
      a.setAttribute('aria-pressed', String(on));
      a.textContent = on ? words.on : words.off;
      if (on) {
        vid.pause();
        vid.hidden = true;
        if (!frame) {
          frame = document.createElement('iframe');
          frame.className = 'reel-media';
          frame.src = a.getAttribute('href');
          frame.title = `${vid.getAttribute('aria-label') || 'Recording'}, step by step`;
          frame.setAttribute('sandbox', 'allow-scripts');
          frame.dataset.reelFrame = '';
          frame.dataset.max = '1400';
          screen.appendChild(frame);
        }
        frame.hidden = false;
        screen.style.height = `${Math.round(screen.clientWidth * 0.5625 + 190)}px`;
        screen.dataset.mode = 'step';
      } else {
        if (frame) frame.hidden = true;
        vid.hidden = false;
        screen.style.height = '';
        delete screen.dataset.mode;
      }
    });
  });

  // ---- Copy buttons on commands.
  document.querySelectorAll('.code').forEach((box) => {
    const pre = box.querySelector('pre');
    if (!pre || box.querySelector('.copy')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy';
    btn.textContent = 'Copy';
    btn.addEventListener('click', async () => {
      const text = pre.innerText.split('\n').filter((l) => !/^#\s/.test(l)).join('\n');
      try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; } catch { btn.textContent = 'Select it'; }
      btn.dataset.done = '';
      setTimeout(() => { btn.textContent = 'Copy'; delete btn.dataset.done; }, 1600);
    });
    box.appendChild(btn);
  });

  // ---- Diagrams: Replay restarts the loop from its first frame (deterministic, so every replay is the same story).
  document.querySelectorAll('[data-dg-replay]').forEach((b) => {
    const wrap = b.closest('[data-dg]');
    if (!wrap) return;
    b.addEventListener('click', () => {
      if (reduce.matches) return;
      wrap.classList.remove('run');
      void wrap.getBoundingClientRect();
      wrap.classList.add('in', 'run');
    });
  });

  // ---- The scope: revoke laptop-02, drop it at the measured 458 ms, hand T-121 to vm-01 with token 8.
  const DROP_MS = 458;
  const scopeEl = document.querySelector('[data-scope]');
  const scopeBtn = document.querySelector('[data-scope-replay]');
  const scopeOut = document.querySelector('[data-scope-readout]');
  if (scopeEl && scopeBtn && scopeOut) {
    let raf = 0;
    const label = scopeBtn.firstChild;
    const done = () => { scopeEl.dataset.state = 'revoked'; scopeOut.textContent = `${DROP_MS} ms`; scopeBtn.setAttribute('aria-pressed', 'true'); if (label) label.textContent = 'Reset the scope'; };
    const reset = () => { cancelAnimationFrame(raf); scopeEl.dataset.state = 'idle'; scopeOut.textContent = `${DROP_MS} ms`; scopeBtn.setAttribute('aria-pressed', 'false'); if (label) label.textContent = 'Replay a revocation'; };
    scopeBtn.addEventListener('click', () => {
      if (scopeEl.dataset.state !== 'idle') { reset(); return; }
      if (reduce.matches) { done(); return; }
      scopeEl.dataset.state = 'revoking';
      const t0 = performance.now();
      const tick = (now) => {
        const ms = Math.min(DROP_MS, Math.round(now - t0));
        scopeOut.textContent = `${ms} ms`;
        if (ms < DROP_MS) raf = requestAnimationFrame(tick);
        else done();
      };
      raf = requestAnimationFrame(tick);
    });
  }

  // ---- The computers page's figure (the diagram kit's Figure 1): the same revocation.
  const fig = document.querySelector('.fig-hero');
  const replay = fig && fig.querySelector('[data-replay]');
  const readout = fig && fig.querySelector('[data-readout]');
  const figLive = document.getElementById('fig1-live');
  if (fig && replay && readout && figLive) {
    const idle = figLive.cloneNode(true);
    let raf = 0;
    let t2 = 0;
    const vm = fig.querySelectorAll('[data-node="vm-01"]');
    const done = () => {
      fig.dataset.state = 'revoked';
      readout.textContent = `${DROP_MS} ms`;
      readout.classList.remove('live');
      vm.forEach((n) => { n.dataset.took = '1'; });
      figLive.textContent = 'laptop-02 is revoked. In the proof it was dropped from the channel 458 ms after the click. Its lease on T-121 expired and the fence moved to token 8, so vm-01 writes with 8 and a late write carrying 7 is refused. Continuing its session on vm-01 is being built.';
      replay.textContent = 'Reset';
    };
    const reset = () => {
      cancelAnimationFrame(raf);
      clearTimeout(t2);
      fig.dataset.state = 'idle';
      vm.forEach((n) => { delete n.dataset.took; });
      readout.textContent = '0 ms';
      readout.classList.remove('live');
      figLive.replaceChildren(...idle.cloneNode(true).childNodes);
      replay.textContent = 'Replay a revocation';
    };
    replay.addEventListener('click', () => {
      if (fig.dataset.state !== 'idle') { reset(); return; }
      if (reduce.matches) { done(); return; }
      fig.dataset.state = 'revoking';
      readout.classList.add('live');
      figLive.textContent = 'Revoking laptop-02 with a passkey.';
      const t0 = performance.now();
      const tick = (now) => {
        const ms = Math.min(DROP_MS, Math.round(now - t0));
        readout.textContent = `${ms} ms`;
        if (ms < DROP_MS) raf = requestAnimationFrame(tick);
        else t2 = setTimeout(done, 60);
      };
      raf = requestAnimationFrame(tick);
    });
  }
})();
