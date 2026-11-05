/* Reveal on scroll, plate drawing, project filters and a lightbox. No dependencies. */
(function () {
  /* reveal on scroll with a small stagger inside each group; draw plates as they appear */
  var rv = [].slice.call(document.querySelectorAll('.rv'));
  rv.forEach(function (el) {
    var sibs = el.parentElement ? [].slice.call(el.parentElement.children).filter(function (c) { return c.classList.contains('rv'); }) : [];
    el.style.setProperty('--d', Math.min(sibs.indexOf(el), 6) * 70 + 'ms');
  });
  [].slice.call(document.querySelectorAll('.plate')).forEach(function (svg) {
    [].slice.call(svg.querySelectorAll('.d, .t, .dot, .bar')).forEach(function (n, i) { n.style.setProperty('--i', Math.min(i, 80)); });
  });
  function show(el) {
    el.classList.add('in');
    var svg = el.querySelector && el.querySelector('.plate');
    if (svg) svg.classList.add('go');
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    rv.forEach(function (el) { io.observe(el); });
  } else {
    rv.forEach(show);
  }

  /* project filters on the Work page */
  var chips = [].slice.call(document.querySelectorAll('.chip'));
  if (chips.length) {
    var cards = [].slice.call(document.querySelectorAll('#index .card'));
    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        var f = c.dataset.filter;
        chips.forEach(function (o) { o.setAttribute('aria-pressed', o === c ? 'true' : 'false'); });
        cards.forEach(function (card) {
          card.hidden = !(f === 'all' || card.dataset.kind === f);
          if (!card.hidden) show(card);
        });
        try { history.replaceState(null, '', f === 'all' ? location.pathname : '#' + f); } catch (e) {}
      });
    });
    var hash = location.hash.replace('#', '');
    var start = chips.filter(function (c) { return c.dataset.filter === hash; })[0];
    if (start) start.click();
  }

  /* lightbox for photos and sketches */
  var lb = document.querySelector('.lightbox');
  if (lb) {
    var lbImg = lb.querySelector('img'), lbCap = lb.querySelector('.lb-cap');
    var close = function () { lb.hidden = true; lbImg.removeAttribute('src'); document.body.style.overflow = ''; };
    [].slice.call(document.querySelectorAll('a.zoom')).forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        lbImg.src = a.href;
        lbCap.textContent = a.dataset.cap || '';
        lb.classList.toggle('inv', !!a.closest('.inv'));
        lb.hidden = false;
        document.body.style.overflow = 'hidden';
      });
    });
    lb.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !lb.hidden) close(); });
  }
})();

/* about: the flight path fills with scroll */
(function () {
  var el = document.getElementById('fpath'); if (!el) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { el.querySelectorAll('.pt').forEach(function (p) { p.classList.add('on'); }); return; }
  var line = el.querySelector('.fpath-line'), pts = el.querySelectorAll('.pt'), tick = false;
  el.classList.add('live');
  function draw() {
    tick = false;
    var r = line.getBoundingClientRect(), p = Math.min(1, Math.max(0, (innerHeight * 0.62 - r.top) / r.height)), y = r.top + p * r.height;
    line.style.setProperty('--p', p.toFixed(4));
    pts.forEach(function (n) { n.classList.toggle('on', n.getBoundingClientRect().top + 8 <= y); });
  }
  function ask() { if (!tick) { tick = true; requestAnimationFrame(draw); } }
  addEventListener('scroll', ask, { passive: true }); addEventListener('resize', ask); draw();
})();
