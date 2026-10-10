/* Pointer-driven effects ported (as CSS 3D / DOM, no WebGL) from the look of
   the original: sleeve + disc intro scene, image lean/parallax, text lamp.
   Desktop pointers only. Local study build. */
(function () {
  'use strict';
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var D2R = Math.PI / 180;
  var mouse = { x: .5, y: .5, px: 0, py: 0 };
  addEventListener('pointermove', function (e) {
    mouse.x = e.clientX / innerWidth; mouse.y = e.clientY / innerHeight;
    mouse.px = e.clientX; mouse.py = e.clientY;
  }, { passive: true });
  var smooth = function (a, b, t) { return a + (b - a) * t; };
  var easeOutExpo = function (n) { return n >= 1 ? 1 : 1 - Math.pow(2, -10 * n); };

  /* ---- 1. Intro: sleeve + disc that lean toward the cursor ------------- */
  function sleeveScene(btn) {
    var mark = btn.querySelector('.intro-mark');
    if (!mark) return;
    var scene = document.createElement('div');
    scene.className = 'fx-scene';
    scene.innerHTML =
      '<div class="fx-root"><img class="fx-disc" src="/record.webp" alt="">' +
      '<div class="fx-sleeve"><img class="fx-face fx-front" src="/cover.webp" alt="Ascension">' +
      '<img class="fx-face fx-back" src="/cover-back.webp" alt=""><i class="fx-edge"></i></div></div>';
    mark.replaceWith(scene);
    var root = scene.querySelector('.fx-root'), sl = scene.querySelector('.fx-sleeve'),
        disc = scene.querySelector('.fx-disc');
    var t0 = performance.now(), lx = 0, ly = 0, slide = 0, leaving = false, tL = 0, raf;
    btn.addEventListener('click', function () { leaving = true; tL = performance.now(); }, { once: true });
    (function frame(now) {
      var n = Math.min(1, (now - t0) / 1100), s = 1 - (1 - n) * (1 - n);
      var k = easeOutExpo(n);
      root.style.transform = 'scale(' + k + ') rotateX(' + (-45 * (1 - s)) + 'deg) rotateY(' + (-18 * (1 - s)) + 'deg)';
      var tx = (mouse.y - .5) * 2, ty = (mouse.x - .5) * 2;
      lx = smooth(lx, tx, .08); ly = smooth(ly, ty, .08);
      slide = smooth(slide, leaving ? 1 : Math.max(0, ty) * .55 + .12, .07);
      var v = Math.abs(Math.sin((ly * 14 - 7) * D2R));
      sl.style.transform = 'translateX(' + (-slide * 18) + '%) rotateY(' + (ly * 14 - 7) + 'deg) rotateX(' + (-13 * v - lx * 8) + 'deg) scale(' + (1 - .07 * v) + ')';
      disc.style.transform = 'translateX(' + (slide * 62) + '%) rotate(' + (-120 * slide) + 'deg)';
      if (btn.isConnected) raf = requestAnimationFrame(frame);
    })(t0);
  }

  /* ---- 2. Images lean toward the cursor, with shadow/sheen + parallax -- */
  function leanImages() {
    var boxes = [].slice.call(document.querySelectorAll('.stairs, .js-cue, [class*="aspect-"] > img[src*="/videos/"]'))
      .map(function (e) { return e.tagName === 'IMG' ? e.parentElement : e; });
    boxes = boxes.filter(function (e, i) { return boxes.indexOf(e) === i; });
    var st = boxes.map(function (box) {
      box.classList.add('fx-lean');
      var sheen = document.createElement('i'); sheen.className = 'fx-sheen'; box.appendChild(sheen);
      return { box: box, sheen: sheen, x: 0, y: 0, ty: 0 };
    });
    (function frame() {
      st.forEach(function (o) {
        var r = o.box.getBoundingClientRect();
        if (r.bottom < -50 || r.top > innerHeight + 50) return;
        var inside = mouse.px >= r.left && mouse.px <= r.right && mouse.py >= r.top && mouse.py <= r.bottom;
        var tx = inside ? ((mouse.py - r.top) / r.height - .5) * 2 : 0;
        var ty = inside ? ((mouse.px - r.left) / r.width - .5) * 2 : 0;
        o.x = smooth(o.x, tx, .1); o.y = smooth(o.y, ty, .1);
        var lean = o.y * 1 - o.x * 0; // signed light, as in the original shader
        o.box.style.transform = 'perspective(1400px) rotateX(' + (-o.x * 5) + 'deg) rotateY(' + (o.y * 5) + 'deg)';
        o.sheen.style.background = 'linear-gradient(' + (o.y >= 0 ? 90 : 270) + 'deg, rgba(0,0,0,' + Math.max(-lean, 0) * .5 + ') 0%, transparent 60%, rgba(255,255,255,' + Math.pow(Math.max(lean, 0), 2) * .18 + ') 100%)';
        var img = o.box.querySelector('img');
        if (img) { var p = ((r.top + r.height / 2) / innerHeight - .5); img.style.transform = 'translateY(' + (p * -4) + '%) scale(1.08)'; }
      });
      requestAnimationFrame(frame);
    })();
  }

  /* ---- 3. Text lamp: hovered links light up toward the cursor ---------- */
  function lamp() {
    document.addEventListener('pointermove', function (e) {
      var t = e.target.closest && e.target.closest('a, button');
      if (!t) return;
      var r = t.getBoundingClientRect();
      t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      t.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }


  /* ---- 4. Buy page: the sleeve + disc group leans with the cursor ------- */
  function leanArt() {
    var art = document.querySelector('.stage .art');
    if (!art) return;
    var x = 0, y = 0;
    (function frame() {
      var tx = (mouse.y - .5) * 2, ty = (mouse.x - .5) * 2;
      x = smooth(x, tx, .07); y = smooth(y, ty, .07);
      var v = Math.abs(Math.sin((y * 14 - 7) * D2R));
      art.style.transform = 'perspective(1800px) rotateY(' + (y * 14 - 7 * 0) + 'deg) rotateX(' + (-x * 8 - 13 * v * .5) + 'deg)';
      requestAnimationFrame(frame);
    })();
  }

  /* ---- 5. Wipe reveal: images are uncovered bottom-up as they arrive ---- */
  function wipeReveal() {
    var imgs = [].slice.call(document.querySelectorAll('img[src*="/videos/"], img[src*="/ascension/"], img[src*="/circles/"], img[src*="/forest-walk/"], img[src*="/twinflame/"]'));
    if (!imgs.length) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var i = e.target._fxImg; io.unobserve(e.target);
        i.style.transition = 'clip-path 1.1s cubic-bezier(.22,1,.36,1), transform 1.1s cubic-bezier(.22,1,.36,1)';
        i.style.clipPath = 'inset(0 0 0 0)';
      });
    }, { threshold: .08 });
    imgs.forEach(function (i) { var h = i.parentElement || i; h._fxImg = i; i.style.clipPath = 'inset(100% 0 0 0)'; io.observe(h); });
  }

  function boot() {
    /* The page markup swaps <picture> images for a 1px gif on desktop pointers
       (the original paints them with WebGL). The clone has no WebGL, so put the
       real images back. */
    [].forEach.call(document.querySelectorAll('picture > source[media*="hover"]'), function (s) { s.remove(); });
    lamp(); if (!reduce) { leanImages(); leanArt(); wipeReveal(); }
    var tryIntro = function () {
      var btn = document.querySelector('.intro-sheet');
      if (btn) sleeveScene(btn); else if (tries++ < 20) setTimeout(tryIntro, 50);
    }, tries = 0;
    tryIntro();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
