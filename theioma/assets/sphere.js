/*!
 * sphere.js — the Theioma voice sphere, as the app draws it, in plain JavaScript (lane showcase-reel, 2026-09-30).
 *
 * A line-for-line port, with no library, of three app files (read at the working tree of 2026-09-30):
 *   apps/web/src/components/voice/neural-sphere-field.ts      the 18 000 Fibonacci dots, warble, projection, depth sort,
 *                                                              lightness ramp, calibrated coverage masks and splat
 *   apps/web/src/components/voice/neural-sphere.tsx           the frame: state and tier modifiers, floor glow, pinpoint,
 *                                                              three-pass bloom, the mode ring, the 30/60 fps pacing,
 *                                                              reduced motion (one still frame), off-screen pause
 *   apps/web/src/components/voice/neural-sphere-constants.ts,
 *   apps/web/src/components/voice/avatar-channels.ts          STATE_GAIN, the ring's breath, TIER_LIGHTNESS, MODE_STROKE
 * The two axes stay separated exactly as the app separates them: the cascade TIER is the fill's brightness, the MODE is
 * the ring's stroke pattern (solid listening, dashed speaking, dotted camera, double fast voice), and an absent tier
 * renders between the rungs rather than claiming one.
 *
 * COLOUR (operator, 2026-10-01: "the coloured sphere, from the Theioma logo target design"). `palette: "icon"`, the
 * default, colours each dot by its place on the app's own gradient (the same t the app shades by) with the ramp of the
 * logo's target design, packages/tauri-shell/src-tauri/icons/source-sphere.png: cyan at the cool pole, blue and indigo
 * across the face, violet to pink at the warm pole, a blue pinpoint, and the design's two lights the app does not draw:
 * the glowing rim (cyan lower left to pink upper right) and the pink hotspot on the warm side of the face, both drawn
 * into the dot layer so the app's bloom blooms them. The stops are the ones lane site-redesign sampled
 * from that file (docs/site/_src/mark.mjs SPHERE_COLOURS), so the mark and this sphere share one ramp. The geometry,
 * warble, shading, bloom, ring and pacing stay the app's. `palette: "grey"` is the app's in-product sphere (DNA-LOCKED
 * R2 keeps hue out of it): r = g = b, exactly as neural-sphere-field.ts writes it.
 *
 * EMBER (site v4, 2026-10-01: black and white with the app's orange). `palette: "ember"`: the dots are monochrome, the
 * app's own lightness mapped onto zinc, #3F3F46 on the shadow side to #F4F4F5 on the lit side (no hue on a dot); a white
 * rim light; the hotspot, the pinpoint, the floor glow and the bloom in theioma.orange #F59E0B (globals.css dark
 * --tone-warning 245 158 11), the bloom kept low so it reads as a warm halo behind a white sphere; the mode ring's
 * fallback is the chrome #E4E4E7 (idle #A1A1AA), as before.
 *
 * What the port does NOT do: open a microphone. The app's sphere reads the mic only when its caller supplies no
 * amplitude; this port takes amplitude from its caller only (a number 0..1, or nothing = the app's own resting motion).
 *
 *   const s = TheiomaSphere.mount(canvas, { size: 240, state: "listening" });
 *   s.setState("speaking"); s.setTier("medium"); s.setAmplitude(0.4); s.destroy();
 *   TheiomaSphere.still(canvas, { size: 64, state: "idle" });   // one frame, no loop (a logo)
 *
 * Ring colour: the canvas's CSS custom properties `--sphere-ring` (a mode running) and `--sphere-ring-idle`, any CSS
 * colour; unset, the app's own fallbacks. The app uses --foreground / --muted-foreground (a hue step, never opacity).
 *
 * Also the site's existing hook, so one file serves both lanes: every `<canvas data-sphere>` on the page mounts itself
 * at its own box size (idle, icon palette; `data-sphere-palette="grey"` for the app's greys, "ember" for site v4), and
 * `window.__sphere(canvas).level(0..1)` sets its voice level, as docs/site/assets/sphere.js did.
 */
(function (root) {
  "use strict";

  /* ── neural-sphere-field.ts ─────────────────────────────────────────────────────────────────────────────────── */

  var POINT_COUNT = 18000;
  var WARBLE_SCALE = 1.5;
  var NOISE_OFFSETS = [[0, 0, 0], [5.1, 0, 7.3], [0, 3.7, 9.5]];
  var NOISE_TIME = [0.28, 0.30, 0.32];
  var TERM_TIME = [0.45, 0.35, 0.50, 0.40];
  var TERM_WEIGHT = [0.40, 0.32, 0.28, 0.22];
  var PAIRS = 12;

  function buildField(n) {
    var x = new Float64Array(n), y = new Float64Array(n), z = new Float64Array(n);
    var sc = new Float32Array(n * PAIRS * 2);
    var phi = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < n; i += 1) {
      var py = 1 - (i / (n - 1)) * 2;
      var r = Math.sqrt(1 - py * py);
      var theta = phi * i;
      var px = Math.cos(theta) * r;
      var pz = Math.sin(theta) * r;
      x[i] = px; y[i] = py; z[i] = pz;
      for (var k = 0; k < 3; k += 1) {
        var o = NOISE_OFFSETS[k];
        var X = px * WARBLE_SCALE + o[0];
        var Y = py * WARBLE_SCALE + o[1];
        var Z = pz * WARBLE_SCALE + o[2];
        var phases = [X * 5.5, Y * 6.4 + 1.2, Z * 7.2 + 2.4, (X + Y) * 4.8 + (Y - Z) * 5.5];
        for (var j = 0; j < 4; j += 1) {
          var at = (i * PAIRS + k * 4 + j) * 2;
          sc[at] = Math.sin(phases[j]);
          sc[at + 1] = Math.cos(phases[j]);
        }
      }
    }
    return { n: n, x: x, y: y, z: z, sc: sc };
  }

  var shared = null;
  function sharedField() {
    if (!shared) shared = buildField(POINT_COUNT);
    return shared;
  }

  var DEPTH_BUCKETS = 4096;

  function allocFrame(n) {
    return {
      sx: new Float32Array(n), sy: new Float32Array(n), depth: new Float32Array(n), t: new Float32Array(n),
      bump: new Float32Array(n), order: new Uint32Array(n), bucketOf: new Uint16Array(n),
      counts: new Uint32Array(DEPTH_BUCKETS + 1), timeSC: new Float64Array(PAIRS * 2),
    };
  }

  function projectField(f, p, out) {
    var n = f.n, x = f.x, y = f.y, z = f.z, sc = f.sc;
    var ts = out.timeSC;
    for (var k = 0; k < 3; k += 1) {
      var T = p.time * NOISE_TIME[k];
      for (var j = 0; j < 4; j += 1) {
        var b = T * TERM_TIME[j];
        ts[(k * 4 + j) * 2] = Math.sin(b);
        ts[(k * 4 + j) * 2 + 1] = Math.cos(b);
      }
    }
    var w0 = TERM_WEIGHT[0], w1 = TERM_WEIGHT[1], w2 = TERM_WEIGHT[2], w3 = TERM_WEIGHT[3];
    var s00 = ts[0], c00 = ts[1], s01 = ts[2], c01 = ts[3], s02 = ts[4], c02 = ts[5], s03 = ts[6], c03 = ts[7];
    var s10 = ts[8], c10 = ts[9], s11 = ts[10], c11 = ts[11], s12 = ts[12], c12 = ts[13], s13 = ts[14], c13 = ts[15];
    var s20 = ts[16], c20 = ts[17], s21 = ts[18], c21 = ts[19], s22 = ts[20], c22 = ts[21], s23 = ts[22], c23 = ts[23];
    var cosX = Math.cos(p.rotX), sinX = Math.sin(p.rotX);
    var cosY = Math.cos(p.rotY), sinY = Math.sin(p.rotY);
    var waveAmp = p.waveAmp, cx = p.cx, cy = p.cy;
    var scale = p.baseRadius * p.breathScale;
    var gx = p.grad.x, gy = p.grad.y, gz = p.grad.z;
    var sx = out.sx, sy = out.sy, depth = out.depth, t = out.t, bump = out.bump;
    for (var i = 0; i < n; i += 1) {
      var px = x[i], py = y[i], pz = z[i];
      var a = i * PAIRS * 2;
      var wnx = (sc[a] * c00 + sc[a + 1] * s00) * w0 + (sc[a + 3] * c01 - sc[a + 2] * s01) * w1 +
        (sc[a + 4] * c02 + sc[a + 5] * s02) * w2 + (sc[a + 6] * c03 + sc[a + 7] * s03) * w3;
      var wny = (sc[a + 8] * c10 + sc[a + 9] * s10) * w0 + (sc[a + 11] * c11 - sc[a + 10] * s11) * w1 +
        (sc[a + 12] * c12 + sc[a + 13] * s12) * w2 + (sc[a + 14] * c13 + sc[a + 15] * s13) * w3;
      var wnz = (sc[a + 16] * c20 + sc[a + 17] * s20) * w0 + (sc[a + 19] * c21 - sc[a + 18] * s21) * w1 +
        (sc[a + 20] * c22 + sc[a + 21] * s22) * w2 + (sc[a + 22] * c23 + sc[a + 23] * s23) * w3;
      var radialMag = wnx * px + wny * py + wnz * pz;
      var keep = py * py;
      var dpx = px + (wnx - radialMag * px * keep) * waveAmp;
      var dpy = py + (wny - radialMag * py * keep) * waveAmp;
      var dpz = pz + (wnz - radialMag * pz * keep) * waveAmp;
      var nx1 = px * cosY + pz * sinY;
      var nz1 = -px * sinY + pz * cosY;
      var ny2 = py * cosX - nz1 * sinX;
      var nz2 = py * sinX + nz1 * cosX;
      var rx1 = dpx * cosY + dpz * sinY;
      var rz1 = -dpx * sinY + dpz * cosY;
      var ry2 = dpy * cosX - rz1 * sinX;
      var rz2 = dpy * sinX + rz1 * cosX;
      sx[i] = cx + rx1 * scale;
      sy[i] = cy + ry2 * scale;
      depth[i] = (rz2 + 1) / 2;
      t[i] = (nx1 * gx + ny2 * gy + nz2 * gz + 1) * 0.5;
      bump[i] = radialMag;
    }
  }

  function depthOrder(out, n) {
    var depth = out.depth, order = out.order, bucketOf = out.bucketOf, counts = out.counts;
    counts.fill(0);
    var B = DEPTH_BUCKETS;
    var k = B / 1.2;
    for (var i = 0; i < n; i += 1) {
      var b = ((depth[i] + 0.1) * k) | 0;
      if (b < 0) b = 0; else if (b >= B) b = B - 1;
      bucketOf[i] = b;
      counts[b + 1] += 1;
    }
    for (var c = 1; c <= B; c += 1) counts[c] += counts[c - 1];
    for (var m = 0; m < n; m += 1) {
      var bb = bucketOf[m];
      order[counts[bb]] = m;
      counts[bb] += 1;
    }
  }

  var COOL_L = 0.22;
  var WARM_L = 0.65;

  // The logo target design's ramp, cool pole (t = 0) to warm pole (t = 1): source-sphere.png, as sampled for mark.mjs.
  var ICON_STOPS = [[0.0, [101, 227, 247]], [0.28, [46, 128, 214]], [0.5, [52, 58, 178]], [0.7, [120, 78, 214]], [0.86, [205, 110, 200]], [1.0, [250, 150, 196]]];
  var ICON_LEVELS = 256;
  var ICON_LUT = (function () {
    var lut = new Float32Array(ICON_LEVELS * 3);
    for (var i = 0; i < ICON_LEVELS; i += 1) {
      var t = i / (ICON_LEVELS - 1), c = ICON_STOPS[ICON_STOPS.length - 1][1];
      for (var k = 1; k < ICON_STOPS.length; k += 1) {
        if (t <= ICON_STOPS[k][0]) {
          var a = ICON_STOPS[k - 1], b = ICON_STOPS[k], f = (t - a[0]) / (b[0] - a[0]);
          c = [a[1][0] + (b[1][0] - a[1][0]) * f, a[1][1] + (b[1][1] - a[1][1]) * f, a[1][2] + (b[1][2] - a[1][2]) * f];
          break;
        }
      }
      lut[i * 3] = c[0] / 255; lut[i * 3 + 1] = c[1] / 255; lut[i * 3 + 2] = c[2] / 255;
    }
    return lut;
  })();
  // Ember: zinc-700 #3F3F46 (shadow) to zinc-100 #F4F4F5 (lit), over the app's own lightness range; theioma.orange.
  var EMBER_DARK = [63 / 255, 63 / 255, 70 / 255], EMBER_LIGHT = [244 / 255, 244 / 255, 245 / 255];
  var EMBER_L0 = 0.18, EMBER_L1 = 0.95;
  var ORANGE = "245,158,11";
  // The ramp's own brightness is the colour; the tier scales it about the unknown midpoint (the app's lightness rungs).
  var TIER_MID_L = 0.62;
  var LUT_N = 1024;
  var POW14 = new Float64Array(LUT_N + 2);
  var POW11 = new Float64Array(LUT_N + 2);
  var POW11_MAX = 1.25;
  for (var li = 0; li <= LUT_N + 1; li += 1) {
    POW14[li] = Math.pow(Math.min(1, li / LUT_N), 1.4);
    POW11[li] = Math.pow(Math.min(POW11_MAX, (li / LUT_N) * POW11_MAX), 1.1);
  }
  function pow14(t) {
    var f = (t < 0 ? 0 : t > 1 ? 1 : t) * LUT_N;
    var i = f | 0;
    var a = POW14[i];
    return a + (POW14[i + 1] - a) * (f - i);
  }
  function pow11(d) {
    var f = (d < 0 ? 0 : d > POW11_MAX ? POW11_MAX : d) * (LUT_N / POW11_MAX);
    var i = f | 0;
    var a = POW11[i];
    return a + (POW11[i + 1] - a) * (f - i);
  }

  var Q = 4, K = 5, R_MIN = 0.3, R_MAX = 2.0, R_LEVELS = 40;
  var R_STEP = (R_MAX - R_MIN) / (R_LEVELS - 1);
  var MASKS = null;

  function packMasks(coverageAt, source) {
    var count = R_LEVELS * Q * Q;
    var start = new Int32Array(count + 1);
    var dxs = [], dys = [], covs = [];
    var energy = new Float32Array(R_LEVELS);
    for (var rl = 0; rl < R_LEVELS; rl += 1) {
      for (var qy = 0; qy < Q; qy += 1) {
        for (var qx = 0; qx < Q; qx += 1) {
          start[(rl * Q + qy) * Q + qx] = covs.length;
          for (var py = 0; py < K; py += 1) {
            for (var px = 0; px < K; px += 1) {
              var c = coverageAt(rl, qx, qy, px, py);
              if (c > 0) { dxs.push(px - 2); dys.push(py - 2); covs.push(c); energy[rl] += c / (Q * Q); }
            }
          }
        }
      }
    }
    start[count] = covs.length;
    return { start: start, dx: Int8Array.from(dxs), dy: Int8Array.from(dys), cov: Float32Array.from(covs), energy: energy, source: source };
  }

  function supersampledMasks() {
    var SS = 8;
    var dense = new Float64Array(R_LEVELS * Q * Q * K * K);
    for (var rl = 0; rl < R_LEVELS; rl += 1) {
      var r = R_MIN + rl * R_STEP;
      var r2 = r * r;
      for (var qy = 0; qy < Q; qy += 1) {
        var oy = (qy + 0.5) / Q;
        for (var qx = 0; qx < Q; qx += 1) {
          var ox = (qx + 0.5) / Q;
          var base = ((rl * Q + qy) * Q + qx) * K * K;
          var full = 0, partial = 0;
          for (var py = 0; py < K; py += 1) {
            for (var px = 0; px < K; px += 1) {
              var hit = 0;
              for (var syy = 0; syy < SS; syy += 1) {
                var dy = py - 2 + (syy + 0.5) / SS - oy;
                for (var sxi = 0; sxi < SS; sxi += 1) {
                  var dx = px - 2 + (sxi + 0.5) / SS - ox;
                  if (dx * dx + dy * dy <= r2) hit += 1;
                }
              }
              var cv = hit / (SS * SS);
              dense[base + py * K + px] = cv;
              if (cv >= 1) full += 1; else partial += cv;
            }
          }
          var sc = partial > 0 ? Math.max(0, Math.PI * r2 - full) / partial : 1;
          for (var kk = 0; kk < K * K; kk += 1) {
            var cc = dense[base + kk];
            if (cc < 1) dense[base + kk] = Math.min(1, cc * sc);
          }
        }
      }
    }
    return packMasks(function (rl, qx, qy, px, py) { return dense[((rl * Q + qy) * Q + qx) * K * K + py * K + px]; }, "supersampled");
  }

  function coverageMasks() {
    if (!MASKS) MASKS = supersampledMasks();
    return MASKS;
  }

  var MASK_SHEET = { cell: 6, width: R_LEVELS * 6, height: Q * Q * 6 };

  function forEachSheetDot(fn) {
    for (var rl = 0; rl < R_LEVELS; rl += 1) {
      for (var qy = 0; qy < Q; qy += 1) {
        for (var qx = 0; qx < Q; qx += 1) {
          var row = qy * Q + qx;
          fn(rl * 6 + 2 + (qx + 0.5) / Q, row * 6 + 2 + (qy + 0.5) / Q, R_MIN + rl * R_STEP);
        }
      }
    }
  }

  function loadCoverageSheet(rgba, width) {
    var m = packMasks(function (rl, qx, qy, px, py) {
      var x = rl * 6 + px;
      var y = (qy * Q + qx) * 6 + py;
      return (rgba[(y * width + x) * 4 + 3] || 0) / 255;
    }, "calibrated");
    for (var rl = 0; rl < R_LEVELS; rl += 1) if (!(m.energy[rl] > 0)) return false;
    MASKS = m;
    return true;
  }

  function allocRaster(w, h, out32, colour) {
    var r = { w: w, h: h, accC: new Float32Array(w * h), accA: new Float32Array(w * h), out32: out32 || new Uint32Array(w * h) };
    if (colour) { r.accG = new Float32Array(w * h); r.accB = new Float32Array(w * h); }
    return r;
  }

  function shadeAndSplat(out, n, style, dpr, raster) {
    var ms = coverageMasks();
    var start = ms.start, mdx = ms.dx, mdy = ms.dy, mcov = ms.cov, energy = ms.energy;
    var sx = out.sx, sy = out.sy, depth = out.depth, t = out.t, bump = out.bump, order = out.order;
    var w = raster.w, h = raster.h, accC = raster.accC, accA = raster.accA;
    var colour = (style.palette === "icon" || style.palette === "ember") && !!raster.accG;
    var ember = style.palette === "ember";
    var accG = raster.accG, accB = raster.accB;
    var tierK = style.warmL / TIER_MID_L;
    var litMul = style.litMul;
    var warmSpan = style.warmL - COOL_L;
    var baseDot = style.baseDot;
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var o = 0; o < n; o += 1) {
      var i = order[o];
      var dRaw = depth[i];
      var d = dRaw < 0 ? 0 : dRaw;
      var sil = 1 - Math.abs(d - 0.5) * 2;
      if (sil < 0) sil = 0;
      var sil2 = sil * sil;
      var litFactor = 0.85 + pow11(d) * 0.30 + sil2 * Math.sqrt(sil) * 0.30;
      if (litFactor > 1.25) litFactor = 1.25;
      var tt = pow14(t[i]);
      var l = (COOL_L + warmSpan * tt) * litMul * litFactor;
      if (l > 0.95) l = 0.95;
      var g = Math.round(l * 100) / 100;
      var cr = 0, cg = 0, cb = 0;
      if (ember) {
        var se = (l - EMBER_L0) / (EMBER_L1 - EMBER_L0);
        if (se < 0) se = 0; else if (se > 1) se = 1;
        cr = EMBER_DARK[0] + (EMBER_LIGHT[0] - EMBER_DARK[0]) * se;
        cg = EMBER_DARK[1] + (EMBER_LIGHT[1] - EMBER_DARK[1]) * se;
        cb = EMBER_DARK[2] + (EMBER_LIGHT[2] - EMBER_DARK[2]) * se;
      } else if (colour) {
        var li3 = ((tt * (ICON_LEVELS - 1) + 0.5) | 0) * 3;
        var kb = litMul * litFactor * tierK;
        cr = ICON_LUT[li3] * kb; cg = ICON_LUT[li3 + 1] * kb; cb = ICON_LUT[li3 + 2] * kb;
        if (cr > 1) cr = 1;
        if (cg > 1) cg = 1;
        if (cb > 1) cb = 1;
      }
      var bRaw = bump[i];
      var b = bRaw < -1 ? -1 : bRaw > 1 ? 1 : bRaw;
      var alpha = 0.18 + d * Math.sqrt(d) * 0.82 + sil2 * sil2 * 0.30 + b * 0.35;
      if (alpha < 0.08) alpha = 0.08; else if (alpha > 1) alpha = 1;
      var rd = (baseDot + d * 0.20) * dpr;
      var cxd = sx[i] * dpr;
      var cyd = sy[i] * dpr;
      var bx = Math.floor(cxd);
      var by = Math.floor(cyd);
      var qx = ((cxd - bx) * Q) | 0;
      var qy = ((cyd - by) * Q) | 0;
      if (qx >= Q) qx = Q - 1;
      if (qy >= Q) qy = Q - 1;
      var tr = (rd - R_MIN) / R_STEP;
      var rl = Math.round(tr);
      if (rl < 0) rl = 0; else if (rl >= R_LEVELS) rl = R_LEVELS - 1;
      var areaFix;
      if (tr > 0 && tr < R_LEVELS - 1) {
        var lo = tr | 0;
        var eLo = energy[lo];
        areaFix = (eLo + (energy[lo + 1] - eLo) * (tr - lo)) / energy[rl];
      } else {
        var rq = R_MIN + rl * R_STEP;
        areaFix = (rd * rd) / (rq * rq);
      }
      var m = (rl * Q + qy) * Q + qx;
      var e0 = start[m], e1 = start[m + 1];
      var inside = bx >= 2 && by >= 2 && bx + 2 < w && by + 2 < h;
      for (var e = e0; e < e1; e += 1) {
        var xx = bx + mdx[e];
        var yy = by + mdy[e];
        if (!inside && (xx < 0 || yy < 0 || xx >= w || yy >= h)) continue;
        var c = mcov[e] * areaFix;
        if (c > 1) c = 1;
        var aa = alpha * c;
        var idx = yy * w + xx;
        var inv = 1 - aa;
        if (colour) {
          accC[idx] = cr * aa + accC[idx] * inv;
          accG[idx] = cg * aa + accG[idx] * inv;
          accB[idx] = cb * aa + accB[idx] * inv;
        } else {
          accC[idx] = g * aa + accC[idx] * inv;
        }
        accA[idx] = aa + accA[idx] * inv;
      }
      if (bx - 2 < x0) x0 = bx - 2;
      if (bx + 2 > x1) x1 = bx + 2;
      if (by - 2 < y0) y0 = by - 2;
      if (by + 2 > y1) y1 = by + 2;
    }
    if (x1 < 0) return null;
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 >= w) x1 = w - 1;
    if (y1 >= h) y1 = h - 1;
    if (x1 < x0 || y1 < y0) return null;
    var out32 = raster.out32;
    for (var ry = y0; ry <= y1; ry += 1) {
      var rowi = ry * w;
      for (var rx = x0; rx <= x1; rx += 1) {
        var id2 = rowi + rx;
        var A = accA[id2];
        if (A <= 0) { out32[id2] = 0; continue; }
        var a8 = (A * 255 + 0.5) | 0;
        if (colour) {
          var vr = accC[id2] / A, vg = accG[id2] / A, vb = accB[id2] / A;
          if (vr > 1) vr = 1;
          if (vg > 1) vg = 1;
          if (vb > 1) vb = 1;
          var r8 = (vr * 255 + 0.5) | 0, gg8 = (vg * 255 + 0.5) | 0, b8 = (vb * 255 + 0.5) | 0;
          out32[id2] = ((a8 << 24) | (b8 << 16) | (gg8 << 8) | r8) >>> 0;
          accG[id2] = 0;
          accB[id2] = 0;
        } else {
          var v = accC[id2] / A;
          if (v > 1) v = 1;
          var g8 = (v * 255 + 0.5) | 0;
          out32[id2] = ((a8 << 24) | (g8 << 16) | (g8 << 8) | g8) >>> 0;
        }
        accA[id2] = 0;
        accC[id2] = 0;
      }
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  /* ── neural-sphere-constants.ts and avatar-channels.ts ─────────────────────────────────────────────────────── */

  var STATE_GAIN = { idle: 0.4, listening: 1.2, thinking: 0.8, speaking: 1.5, muted: 0 };
  var VIDEO_ACTIVE_RING_ALPHA = 0.42;
  function videoRingAlphaAt(timeSeconds) {
    var pulse = 0.5 + Math.sin(timeSeconds * 3.8) * 0.5;
    return Math.max(0, Math.min(1, VIDEO_ACTIVE_RING_ALPHA + (pulse - 0.5) * 0.30));
  }
  var TIER_LIGHTNESS = { cheap: 0.42, medium: 0.62, premium: 0.82 };
  var TIER_LABEL = { cheap: "Local", medium: "Sonnet", premium: "Opus" };
  var MODE_STROKE = {
    listening: { style: "solid", width: 2, dash: [] },
    speaking: { style: "dashed", width: 3, dash: [10, 6] },
    video: { style: "dotted", width: 3, dash: [2, 5] },
    fast: { style: "double", width: 4, dash: [16, 4, 4, 4] },
    idle: { style: "none", width: 1, dash: [] },
  };
  var MODE_LABEL = { listening: "Listening", speaking: "Speaking", video: "Camera on", fast: "Fast voice", idle: "Idle" };
  function resolveMode(state, videoActive, fastVoice) {
    if (videoActive) return "video";
    if (fastVoice) return "fast";
    if (state === "speaking") return "speaking";
    if (state === "listening") return "listening";
    return "idle";
  }
  function avatarStateWord(state, mode) {
    if (mode === "idle" && state === "thinking") return "Thinking";
    if (mode === "idle" && state === "muted") return "Muted";
    return MODE_LABEL[mode] || MODE_LABEL.idle;
  }

  /* ── neural-sphere.tsx ─────────────────────────────────────────────────────────────────────────────────────── */

  var CASCADE_TIER_GLOW = {
    cheap: { warmL: TIER_LIGHTNESS.cheap, bloomMul: 1.00, litMul: 1.00 },
    medium: { warmL: TIER_LIGHTNESS.medium, bloomMul: 1.20, litMul: 1.08 },
    premium: { warmL: TIER_LIGHTNESS.premium, bloomMul: 1.45, litMul: 1.18 },
  };
  var UNKNOWN_TIER_GLOW = { warmL: (TIER_LIGHTNESS.cheap + TIER_LIGHTNESS.premium) / 2, bloomMul: 1.1, litMul: 1.04 };
  function tierGlowFor(tier) { return tier && CASCADE_TIER_GLOW[tier] ? CASCADE_TIER_GLOW[tier] : UNKNOWN_TIER_GLOW; }
  function lerpTierGlow(a, b, t) {
    var tt = Math.max(0, Math.min(1, t));
    return { warmL: a.warmL + (b.warmL - a.warmL) * tt, bloomMul: a.bloomMul + (b.bloomMul - a.bloomMul) * tt, litMul: a.litMul + (b.litMul - a.litMul) * tt };
  }
  function normalize3(x, y, z) { var m = Math.sqrt(x * x + y * y + z * z) || 1; return { x: x / m, y: y / m, z: z / m }; }
  var GRADIENT_DIR = normalize3(0.95, -0.50, 0.20);
  var IDLE_FPS = 30;
  var LOW_MOTION = { idle: true, muted: true };
  var MAX_DPR = 2;
  var FRAME_MS = 1000 / 60;
  var STATE_MOD = {
    idle: { satMul: 1.00, litMul: 1.00, rotMul: 0.20, bloomMul: 1.00 },
    listening: { satMul: 1.00, litMul: 1.05, rotMul: 0.40, bloomMul: 1.10 },
    thinking: { satMul: 1.00, litMul: 1.00, rotMul: 0.55, bloomMul: 1.05 },
    speaking: { satMul: 1.00, litMul: 1.10, rotMul: 0.70, bloomMul: 1.20 },
    muted: { satMul: 0.10, litMul: 0.85, rotMul: 0.05, bloomMul: 0.70 },
  };
  function hsla(h, s, l, a) {
    return "hsla(" + h.toFixed(0) + "," + (s * 100).toFixed(0) + "%," + (l * 100).toFixed(0) + "%," + a.toFixed(3) + ")";
  }
  function stillAmplitude(s, external) {
    if (typeof external === "number") return 0;
    if (s === "speaking") return 0.45;
    if (s === "thinking") return 0.25;
    if (s === "idle") return 0.08;
    return 0;
  }

  var coverageCalibrated = false;
  function calibrateCoverage(minSide) {
    if (coverageCalibrated) return;
    coverageCalibrated = true;
    try {
      var sheet = document.createElement("canvas");
      sheet.width = Math.max(minSide, MASK_SHEET.width);
      sheet.height = Math.max(minSide, MASK_SHEET.height);
      var sctx = sheet.getContext("2d");
      if (!sctx) return;
      forEachSheetDot(function (x, y, r) { sctx.beginPath(); sctx.arc(x, y, r, 0, Math.PI * 2); sctx.fill(); });
      var px = sctx.getImageData(0, 0, MASK_SHEET.width, MASK_SHEET.height);
      loadCoverageSheet(px.data, MASK_SHEET.width);
    } catch (e) { /* no readback: the exact-area masks stand */ }
  }

  function ringColorFor(canvas, mode) {
    var fallback = mode === "idle" ? "rgb(161, 161, 170)" : "rgb(228, 228, 231)";
    try {
      var v = getComputedStyle(canvas).getPropertyValue(mode === "idle" ? "--sphere-ring-idle" : "--sphere-ring").trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  /**
   * Mount the sphere on a canvas. Options: size (CSS px, default 320), state ("idle" | "listening" | "thinking" |
   * "speaking" | "muted"), tier ("cheap" | "medium" | "premium" | undefined = not claimed), videoActive, amplitude
   * (number 0..1 or undefined), label (the persona name for the accessible name, default "Theia"), still (true = one
   * frame, never a loop).
   */
  function mount(canvas, opts) {
    opts = opts || {};
    var size = opts.size || 320;
    var st = { state: opts.state || "idle", tier: opts.tier, video: !!opts.videoActive, amp: opts.amplitude };
    var label = opts.label || "Theia";
    var palette = opts.palette === "grey" || opts.palette === "ember" ? opts.palette : "icon";
    var forceStill = !!opts.still;
    var ctxRaw = canvas.getContext("2d", { alpha: true });
    if (!ctxRaw) return null;
    var mainCtx = ctxRaw;
    var dpr = Math.max(1, Math.min(MAX_DPR, root.devicePixelRatio || 1));
    var W = Math.round(size * dpr);
    canvas.width = W; canvas.height = W;
    canvas.style.width = size + "px"; canvas.style.height = size + "px";
    canvas.style.webkitMaskImage = "radial-gradient(circle at 50% 50%, rgba(0,0,0,1) 58%, rgba(0,0,0,0) 90%)";
    canvas.style.maskImage = "radial-gradient(circle at 50% 50%, rgba(0,0,0,1) 58%, rgba(0,0,0,0) 90%)";
    canvas.setAttribute("role", "img");
    mainCtx.scale(dpr, dpr);
    var offscreen = document.createElement("canvas");
    offscreen.width = W; offscreen.height = W;
    var ctx = offscreen.getContext("2d", { alpha: true });
    if (!ctx) return null;
    calibrateCoverage(W);
    var field = sharedField();
    var frame = allocFrame(field.n);
    var image = ctx.createImageData(W, W);
    var raster = allocRaster(W, W, new Uint32Array(image.data.buffer), palette !== "grey");
    var tint = null, tintCtx = null;   // ember: the bloom is drawn from an orange copy of the dot layer
    if (palette === "ember") {
      tint = document.createElement("canvas");
      tint.width = W; tint.height = W;
      tintCtx = tint.getContext("2d", { alpha: true });
    }
    var cx = size / 2, cy = size / 2;
    var baseRadius = size * 0.42;
    var baseDot = size >= 480 ? 0.6 : size >= 280 ? 0.5 : 0.45;
    var rotX = Math.PI / 2;
    var rotY = 0;
    var lastT = NaN;
    var lastDrawT = -Infinity;
    var ampNow = 0;
    var tierRendered = tierGlowFor(st.tier);
    var raf = null;
    var motionQuery = typeof root.matchMedia === "function" ? root.matchMedia("(prefers-reduced-motion: reduce)") : null;
    var reduced = forceStill || !!(motionQuery && motionQuery.matches);
    var visible = document.visibilityState !== "hidden";
    var onScreen = true;
    var strokeCache = {};
    function strokeFor(mode) { if (!strokeCache[mode]) strokeCache[mode] = ringColorFor(canvas, mode); return strokeCache[mode]; }

    function label_() {
      var mode = resolveMode(st.state, st.video);
      canvas.setAttribute("aria-label", label + " voice visualiser. " + avatarStateWord(st.state, mode) + "." + (st.tier ? " " + TIER_LABEL[st.tier] + " is answering." : ""));
      canvas.setAttribute("data-cascade-tier", st.tier || "unknown");
      canvas.setAttribute("data-avatar-mode", mode);
    }

    function draw(t, still) {
      var dt = isFinite(lastT) ? Math.min(100, Math.max(0, t - lastT)) : FRAME_MS;
      lastT = t;
      var steps = dt / FRAME_MS;
      var time = still ? 0 : t / 1000;
      var s = st.state;
      var baseMod = STATE_MOD[s] || STATE_MOD.idle;
      var tierTarget = tierGlowFor(st.tier);
      var tierK = still ? 1 : 1 - Math.pow(1 - 0.06, steps);
      var tierLerp = lerpTierGlow(tierRendered, tierTarget, tierK);
      tierRendered = tierLerp;
      var litMul = baseMod.litMul * tierLerp.litMul;
      var bloomMod = baseMod.bloomMul * tierLerp.bloomMul;
      var warmL = tierLerp.warmL;
      var amp;
      if (still) {
        amp = stillAmplitude(s, st.amp);
        ampNow = amp;
      } else {
        var target = 0;
        if (typeof st.amp === "number") target = Math.max(0, Math.min(1, st.amp));
        else if (s === "listening") target = 0; // the app reads its microphone here; this port never opens one
        else if (s === "speaking") target = 0.45 + Math.sin(time * 6.3) * 0.18 + Math.sin(time * 11.1) * 0.08 + Math.random() * 0.06;
        else if (s === "thinking") target = 0.25 + Math.sin(time * 1.5) * 0.14;
        else if (s === "muted") target = 0;
        else target = 0.08 + Math.sin(time * 0.9) * 0.04;
        var lerpRate = target > ampNow ? 0.40 : 0.12;
        ampNow += (target - ampNow) * (1 - Math.pow(1 - lerpRate, steps));
        amp = Math.max(0, Math.min(1, ampNow));
      }
      if (!still) rotY += 0.0014 * baseMod.rotMul * steps;
      var waveMul = 1.0 + amp * (STATE_GAIN[s] || 0);
      var waveAmp = 0.027 * waveMul + amp * 0.060 * waveMul;
      var breathScale = 1 + amp * 0.06 * waveMul;
      projectField(field, { time: time, waveAmp: waveAmp, breathScale: breathScale, rotX: rotX, rotY: rotY, cx: cx, cy: cy, baseRadius: baseRadius, grad: GRADIENT_DIR }, frame);
      depthOrder(frame, field.n);
      var dirty = shadeAndSplat(frame, field.n, { litMul: litMul, warmL: warmL, baseDot: baseDot, palette: palette }, dpr, raster);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, W);
      if (dirty) ctx.putImageData(image, 0, 0, dirty.x, dirty.y, dirty.w, dirty.h);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Ambient floor glow, under the dots.
      var floorY = cy + baseRadius * 0.84;
      var glowAlpha = 0.05 + amp * 0.055;
      var fg = ctx.createRadialGradient(cx, floorY, 0, cx, floorY, baseRadius * 0.9);
      fg.addColorStop(0, palette === "ember" ? "rgba(" + ORANGE + "," + (glowAlpha * 0.9).toFixed(3) + ")" : hsla(0, 0, 0.55, glowAlpha));
      fg.addColorStop(1, "transparent");
      ctx.save();
      ctx.globalCompositeOperation = "destination-over";
      ctx.scale(1, 0.22);
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(cx, floorY / 0.22, baseRadius * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (palette === "icon") {
        // The logo design's rim light and hotspot (source-sphere.png; mark.mjs draws the same two on the mark).
        var rr = baseRadius * breathScale;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        var rim = ctx.createLinearGradient(cx - rr, cy + rr, cx + rr, cy - rr);
        rim.addColorStop(0, "rgba(101,227,247,0.55)");
        rim.addColorStop(0.38, "rgba(46,128,214,0.40)");
        rim.addColorStop(0.62, "rgba(120,78,214,0.40)");
        rim.addColorStop(1, "rgba(250,150,196,0.55)");
        ctx.strokeStyle = rim;
        ctx.lineWidth = Math.max(1, size * 0.012);
        ctx.beginPath(); ctx.arc(cx, cy, rr * 0.995, 0, Math.PI * 2); ctx.stroke();
        var hx = cx + rr * 0.40, hy = cy - rr * 0.40;
        var hot = ctx.createRadialGradient(hx, hy, 0, hx, hy, rr * 0.22);
        hot.addColorStop(0, "rgba(250,146,187," + (0.50 + amp * 0.2).toFixed(3) + ")");
        hot.addColorStop(0.5, "rgba(250,146,187," + (0.18 + amp * 0.08).toFixed(3) + ")");
        hot.addColorStop(1, "rgba(250,146,187,0)");
        ctx.fillStyle = hot;
        ctx.beginPath(); ctx.arc(hx, hy, rr * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (palette === "ember") {
        // A white rim light, brighter toward the lit side, and an orange hotspot where the logo design has its pink one.
        var er = baseRadius * breathScale;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        var erim = ctx.createLinearGradient(cx - er, cy + er, cx + er, cy - er);
        erim.addColorStop(0, "rgba(255,255,255,0.22)");
        erim.addColorStop(1, "rgba(255,255,255,0.55)");
        ctx.strokeStyle = erim;
        ctx.lineWidth = Math.max(1, size * 0.010);
        ctx.beginPath(); ctx.arc(cx, cy, er * 0.995, 0, Math.PI * 2); ctx.stroke();
        var ex = cx + er * 0.40, ey = cy - er * 0.40;
        var ehot = ctx.createRadialGradient(ex, ey, 0, ex, ey, er * 0.20);
        ehot.addColorStop(0, "rgba(" + ORANGE + "," + (0.42 + amp * 0.18).toFixed(3) + ")");
        ehot.addColorStop(0.5, "rgba(" + ORANGE + "," + (0.14 + amp * 0.06).toFixed(3) + ")");
        ehot.addColorStop(1, "rgba(" + ORANGE + ",0)");
        ctx.fillStyle = ehot;
        ctx.beginPath(); ctx.arc(ex, ey, er * 0.20, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      // Static central pinpoint.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      var pinR = 1.6, pinGlowR = pinR * 4;
      var pinGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pinGlowR);
      if (palette === "icon") {
        // The icon's pinpoint: a blue-violet point (source-sphere.png centre: #655CD5 around a near-white core).
        pinGrad.addColorStop(0, "rgba(239,235,255,0.85)");
        pinGrad.addColorStop(0.4, "rgba(101,92,213,0.40)");
      } else if (palette === "ember") {
        pinGrad.addColorStop(0, "rgba(" + ORANGE + ",0.85)");
        pinGrad.addColorStop(0.4, "rgba(" + ORANGE + ",0.30)");
      } else {
        pinGrad.addColorStop(0, hsla(0, 0, 0.92, 0.85));
        pinGrad.addColorStop(0.4, hsla(0, 0, 0.70, 0.30));
      }
      pinGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = pinGrad;
      ctx.beginPath(); ctx.arc(cx, cy, pinGlowR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = palette === "icon" ? "rgba(156,155,245,0.95)" : palette === "ember" ? "rgba(" + ORANGE + ",0.95)" : hsla(0, 0, 0.96, 0.95);
      ctx.beginPath(); ctx.arc(cx, cy, pinR, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Composite with the three-pass bloom.
      mainCtx.save(); mainCtx.setTransform(1, 0, 0, 1, 0, 0); mainCtx.clearRect(0, 0, W, W); mainCtx.restore();
      var bloomMul = bloomMod * (1 + amp * 0.7);
      var bloomSrc = offscreen, bloomK = 1;
      if (tintCtx) {
        // Ember: the bloom is the dot layer's own shape in orange, and lower, so the glow is a halo, not an orange ball.
        tintCtx.setTransform(1, 0, 0, 1, 0, 0);
        tintCtx.globalCompositeOperation = "source-over";
        tintCtx.clearRect(0, 0, W, W);
        tintCtx.drawImage(offscreen, 0, 0);
        tintCtx.globalCompositeOperation = "source-in";
        tintCtx.fillStyle = "rgb(" + ORANGE + ")";
        tintCtx.fillRect(0, 0, W, W);
        bloomSrc = tint; bloomK = 0.55;
      }
      mainCtx.save();
      mainCtx.globalCompositeOperation = "lighter";
      mainCtx.filter = "blur(" + (80 + amp * 20).toFixed(1) + "px)";
      mainCtx.globalAlpha = Math.min(1, 0.55 * bloomMul * bloomK);
      mainCtx.drawImage(bloomSrc, 0, 0, size, size);
      mainCtx.filter = "blur(" + (40 + amp * 10).toFixed(1) + "px)";
      mainCtx.globalAlpha = Math.min(1, 0.50 * bloomMul * bloomK);
      mainCtx.drawImage(bloomSrc, 0, 0, size, size);
      mainCtx.filter = "blur(" + (4 + amp * 1).toFixed(1) + "px)";
      mainCtx.globalAlpha = Math.min(1, 0.50 * bloomMul * (tintCtx ? 0.35 : 1));
      mainCtx.drawImage(tintCtx ? offscreen : bloomSrc, 0, 0, size, size);
      mainCtx.restore();
      mainCtx.save();
      mainCtx.filter = "none"; mainCtx.globalAlpha = 1.0; mainCtx.globalCompositeOperation = "source-over";
      mainCtx.drawImage(offscreen, 0, 0, size, size);
      mainCtx.restore();
      // The mode ring: one chrome colour, four stroke patterns; idle draws none.
      var ringMode = resolveMode(s, st.video);
      var ringStroke = MODE_STROKE[ringMode];
      if (ringStroke.style !== "none") {
        mainCtx.save();
        var ringAlpha = videoRingAlphaAt(time);
        var ringRadiusBase = baseRadius * (1 + amp * 0.04);
        mainCtx.globalAlpha = ringAlpha;
        mainCtx.strokeStyle = strokeFor(ringMode);
        mainCtx.setLineDash(ringStroke.dash);
        mainCtx.lineWidth = ringStroke.width;
        mainCtx.beginPath(); mainCtx.arc(cx, cy, ringRadiusBase * 1.04, 0, Math.PI * 2); mainCtx.stroke();
        if (ringStroke.style === "double") {
          mainCtx.lineWidth = Math.max(1, ringStroke.width - 2);
          mainCtx.beginPath(); mainCtx.arc(cx, cy, ringRadiusBase * 1.11, 0, Math.PI * 2); mainCtx.stroke();
        }
        mainCtx.setLineDash([]);
        mainCtx.restore();
      }
    }

    function canRun() { return visible && onScreen && !reduced; }
    function tick(t) {
      raf = null;
      if (!canRun()) return;
      var gap = LOW_MOTION[st.state] ? 1000 / IDLE_FPS : FRAME_MS;
      if (t - lastDrawT < gap * 0.75) { raf = root.requestAnimationFrame(tick); return; }
      lastDrawT = t;
      draw(t, false);
      raf = root.requestAnimationFrame(tick);
    }
    function start() { if (raf == null && canRun()) { lastT = NaN; raf = root.requestAnimationFrame(tick); } }
    function stop() { if (raf != null) root.cancelAnimationFrame(raf); raf = null; }
    function still() { if (!reduced || !visible) return; draw(0, true); }
    function redraw() { label_(); if (reduced) still(); else start(); }

    function onMotion() { reduced = forceStill || !!(motionQuery && motionQuery.matches); if (reduced) { stop(); still(); } else start(); }
    if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener("change", onMotion);
    function onVisibility() { visible = document.visibilityState !== "hidden"; if (!visible) stop(); else if (reduced) still(); else start(); }
    document.addEventListener("visibilitychange", onVisibility);
    var io = null;
    if (typeof root.IntersectionObserver !== "undefined") {
      io = new root.IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        if (!e) return;
        onScreen = e.isIntersecting;
        if (onScreen) { if (reduced) still(); else start(); } else stop();
      });
      io.observe(canvas);
    }
    var themeObserver = null;
    if (typeof root.MutationObserver !== "undefined") {
      themeObserver = new root.MutationObserver(function () { strokeCache = {}; if (reduced) still(); });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    }
    label_();
    if (reduced) still(); else start();

    return {
      setState: function (s) { if (STATE_MOD[s]) { st.state = s; redraw(); } },
      setTier: function (tier) { st.tier = CASCADE_TIER_GLOW[tier] ? tier : undefined; redraw(); },
      setVideo: function (on) { st.video = !!on; redraw(); },
      setAmplitude: function (a) { st.amp = typeof a === "number" ? a : undefined; },
      refreshColors: function () { strokeCache = {}; if (reduced) still(); },
      get state() { return st.state; },
      destroy: function () {
        stop();
        if (motionQuery && motionQuery.removeEventListener) motionQuery.removeEventListener("change", onMotion);
        document.removeEventListener("visibilitychange", onVisibility);
        if (io) io.disconnect();
        if (themeObserver) themeObserver.disconnect();
      },
    };
  }

  /** One still frame (the app's reduced-motion frame), no loop: for a logo or a poster. */
  function still(canvas, opts) {
    var o = {};
    for (var k in (opts || {})) o[k] = opts[k];
    o.still = true;
    var c = mount(canvas, o);
    if (c) c.destroy();
    return canvas;
  }

  /* ── The site's existing hook (docs/site/assets/sphere.js): <canvas data-sphere>, window.__sphere(c).level(v) ── */
  function siteMount(canvas) {
    if (canvas.__sphere) return canvas.__sphere;
    var box = canvas.getBoundingClientRect();
    var side = Math.min(box.width || 0, box.height || box.width || 0) || Number(canvas.getAttribute("width")) || 240;
    var pal = canvas.getAttribute("data-sphere-palette");
    var ctl = mount(canvas, { size: Math.max(24, Math.round(side)), state: "idle", palette: pal === "grey" || pal === "ember" ? pal : "icon" });
    var api = {
      level: function (v) {
        var x = Math.max(0, Math.min(1, Number(v) || 0));
        if (ctl) ctl.setAmplitude(x > 0 ? x : undefined);
        return api;
      },
      controller: ctl,
    };
    canvas.__sphere = api;
    return api;
  }
  if (typeof document !== "undefined") {
    if (!root.__sphere) root.__sphere = siteMount;
    var boot = function () {
      var list = document.querySelectorAll("canvas[data-sphere]");
      for (var i = 0; i < list.length; i += 1) siteMount(list[i]);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  }

  root.TheiomaSphere = {
    mount: mount,
    still: still,
    ICON_STOPS: ICON_STOPS,
    TIER_LIGHTNESS: TIER_LIGHTNESS,
    TIER_LABEL: TIER_LABEL,
    MODE_STROKE: MODE_STROKE,
    MODE_LABEL: MODE_LABEL,
    resolveMode: resolveMode,
    source: "apps/web/src/components/voice/{neural-sphere.tsx,neural-sphere-field.ts,neural-sphere-constants.ts,avatar-channels.ts} @ 2026-09-30",
  };
})(typeof window !== "undefined" ? window : this);
