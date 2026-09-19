/* Ascension - Pegassi: static rebuild interaction layer.
   Original implementation written for this rebuild; recreates the site's
   client behavior (player, cues, videos, sequencer, menu, transitions). */
(function () {
  'use strict';
  var D = window.__PEGASSI_DATA || { tracks: [], kits: [], waveforms: {} };
  var PAGE = document.body.getAttribute('data-page') || '';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmt(t) {
    if (!isFinite(t)) return '00:00';
    t = Math.max(0, Math.floor(t));
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }
  var PLAY_SVG = '<svg class="h-15 w-auto -scale-x-100" viewBox="0 0 12 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 7.5C3.52941 5.14706 10.8706 0.352941 12 0V15L0 7.5Z" fill="currentColor"></path></svg>';
  var PAUSE_SVG = '<svg class="h-15 w-auto" viewBox="0 0 12 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 0h3v15H2zM7 0h3v15H7z" fill="currentColor"></path></svg>';
  var ARROW_SVG = '<svg class="h-12 w-auto" viewBox="0 0 15 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 6h13M8 1l5 5-5 5" stroke="currentColor" stroke-width="1.5"></path></svg>';

  /* ------------------------------------------------------------------ */
  /* Global audio player                                                 */
  /* ------------------------------------------------------------------ */
  var Player = (function () {
    var tracks = D.tracks;
    var audio = null, index = 0, playing = false, durations = tracks.map(function () { return 0; });
    var duckCount = {}, duckTimer = null, rampTimer = null;
    var listeners = [];
    function ensure() {
      if (audio) return audio;
      audio = new Audio();
      audio.preload = 'metadata';
      audio.src = tracks[index].src;
      audio.addEventListener('loadedmetadata', function () { durations[index] = audio.duration; emit('meta'); });
      audio.addEventListener('ended', function () {
        if (index < tracks.length - 1) select(index + 1, true);
        else { playing = false; emit('state'); }
      });
      audio.addEventListener('timeupdate', function () { emit('tick'); });
      // preload other durations
      tracks.forEach(function (t, i) {
        if (i === index) return;
        var a = new Audio(); a.preload = 'metadata';
        a.addEventListener('loadedmetadata', function () { durations[i] = a.duration; emit('meta'); }, { once: true });
        a.src = t.src;
      });
      return audio;
    }
    function ramp(target, secs, done) {
      var a = ensure();
      if (rampTimer) clearInterval(rampTimer);
      var start = a.volume, t0 = performance.now();
      rampTimer = setInterval(function () {
        var p = Math.min(1, (performance.now() - t0) / (secs * 1000));
        a.volume = start + (target - start) * p;
        if (p >= 1) { clearInterval(rampTimer); rampTimer = null; if (done) done(); }
      }, 30);
    }
    function play() {
      var a = ensure();
      if (a.volume < 1 && !Object.keys(duckCount).length) ramp(1, .3);
      a.play().then(function () { playing = true; emit('state'); }, function () { playing = false; emit('state'); });
    }
    function pause() { if (audio) audio.pause(); playing = false; emit('state'); }
    function toggle() { playing ? pause() : play(); }
    function select(i, autoplay) {
      var a = ensure();
      i = (i + tracks.length) % tracks.length;
      if (i !== index) { index = i; a.src = tracks[i].src; a.load(); }
      emit('track');
      autoplay ? play() : pause();
    }
    function next() { select(index + 1, playing); }
    function prev() {
      var a = ensure();
      if (a.currentTime > 3) { a.currentTime = 0; return; }
      select(index - 1, playing);
    }
    function seek(frac) {
      var a = ensure(), d = durations[index];
      if (d) a.currentTime = Math.min(d, Math.max(0, frac * d));
      emit('tick');
    }
    function duck(src) {
      duckCount[src] = true;
      if (Object.keys(duckCount).length !== 1) return;
      if (!playing) return;
      ramp(0, .5);
      if (duckTimer) clearTimeout(duckTimer);
      var stamp = Date.now();
      duckTimer = setTimeout(function () { if (Object.keys(duckCount).length && playing) pause(); }, 600);
    }
    function restore(src) {
      delete duckCount[src];
      if (Object.keys(duckCount).length) return;
      if (duckTimer) { clearTimeout(duckTimer); duckTimer = null; }
      if (audio && playing) ramp(1, .5);
    }
    function on(fn) { listeners.push(fn); }
    function emit(kind) { listeners.forEach(function (fn) { fn(kind); }); }
    return {
      get tracks() { return tracks; }, get index() { return index; }, get track() { return tracks[index]; },
      get playing() { return playing; }, get audio() { return audio; }, get durations() { return durations; },
      get time() { return audio ? audio.currentTime : 0; },
      get progress() { var d = durations[index]; return d && audio ? audio.currentTime / d : 0; },
      play: play, pause: pause, toggle: toggle, select: select, next: next, prev: prev, seek: seek,
      duck: duck, restore: restore, on: on, ensure: ensure
    };
  })();

  /* ------------------------------------------------------------------ */
  /* Grain + load state                                                  */
  /* ------------------------------------------------------------------ */
  function ready() {
    document.documentElement.classList.add('grain-ready');
    document.body.classList.add('grain-ready');
  }

  /* ------------------------------------------------------------------ */
  /* Intro overlay                                                       */
  /* ------------------------------------------------------------------ */
  function initIntro() {
    var btn = $$('button').find(function (b) {
      return b.className.indexOf('z-100') !== -1 && b.className.indexOf('fixed') !== -1;
    });
    if (!btn) return;
    btn.innerHTML = '';
    btn.classList.add('intro-sheet');
    var grain = el('span', 'grain absolute inset-0 -z-10'); grain.setAttribute('aria-hidden', 'true');
    var label = el('span', 'intro-label t-meta', 'Click to enter');
    var mark = el('img'); mark.src = '/hero-wordmark.webp'; mark.alt = 'Ascension';
    mark.className = 'intro-mark';
    btn.appendChild(grain); btn.appendChild(mark); btn.appendChild(label);
    document.body.classList.add('intro-open');
    btn.addEventListener('click', function () {
      btn.classList.add('intro-leaving');
      setTimeout(function () { btn.remove(); document.body.classList.remove('intro-open'); revealNow(); }, 650);
    }, { once: true });
  }

  /* ------------------------------------------------------------------ */
  /* Reveal animations                                                   */
  /* ------------------------------------------------------------------ */
  function prepReveals() {
    // slide-up items start hidden under their masks
    $$('.js-slide-up').forEach(function (e) {
      e.style.transform = 'translateY(110%)';
      e.style.transition = 'transform .9s var(--ease-reveal)';
    });
    $$('.js-animate-lines').forEach(function (e) {
      e.style.opacity = '0';
      e.style.transform = 'translateY(1.2rem)';
      e.style.transition = 'opacity .8s var(--ease-reveal), transform .8s var(--ease-reveal)';
    });
  }
  function revealNow() {
    $$('.js-slide-up').forEach(function (e, i) {
      setTimeout(function () { e.style.transform = 'translateY(0)'; }, 60 * i);
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var e = en.target;
        e.style.opacity = '1';
        e.style.transform = 'translateY(0)';
        io.unobserve(e);
      });
    }, { threshold: .12 });
    $$('.js-animate-lines').forEach(function (e) { io.observe(e); });
  }

  /* ------------------------------------------------------------------ */
  /* Page transitions                                                    */
  /* ------------------------------------------------------------------ */
  function initTransitions() {
    var mask = $('[data-transition-mask]');
    if (!mask) return;
    mask.style.transition = 'opacity .35s var(--ease-out-quad), visibility .35s';
    // fade in from black on load
    mask.classList.remove('opacity-0', 'invisible');
    mask.style.opacity = '1'; mask.style.visibility = 'visible';
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      mask.style.opacity = '0'; mask.style.visibility = 'hidden';
    }); });
    document.addEventListener('click', function (ev) {
      var a = ev.target.closest && ev.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) !== '/' || a.target === '_blank' || ev.metaKey || ev.ctrlKey) return;
      ev.preventDefault();
      mask.style.opacity = '1'; mask.style.visibility = 'visible';
      setTimeout(function () { location.href = href; }, 340);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Cursor-following tag (Unmute / Drag / Close labels)                 */
  /* ------------------------------------------------------------------ */
  function followTag(span, host) {
    host.addEventListener('mousemove', function (ev) {
      var r = host.getBoundingClientRect();
      span.style.transform = 'translate(' + (ev.clientX - r.left + 10) + 'px,' + (ev.clientY - r.top + 10) + 'px)';
    });
  }

  /* ------------------------------------------------------------------ */
  /* Lazy page videos with unmute                                        */
  /* ------------------------------------------------------------------ */
  function initVideos() {
    $$('video[loop][muted]').forEach(function (v) {
      var wrap = v.closest('div');
      var img = v.parentElement.querySelector('img');
      if (!img) return;
      var src = img.getAttribute('src').replace(/\.webp$/, '.mp4');
      var label = wrap.querySelector('span');
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            if (!v.src) { v.src = src; }
            v.play().catch(function () {});
          } else if (!v.paused && v.muted) { v.pause(); }
        });
      }, { rootMargin: '200px' });
      io.observe(wrap);
      if (label) {
        label.classList.remove('opacity-0', 'invisible');
        label.style.opacity = '0'; label.style.visibility = 'hidden';
        label.style.transition = 'opacity .2s';
        followTag(label, wrap);
        wrap.addEventListener('mouseenter', function () { label.style.opacity = '1'; label.style.visibility = 'visible'; });
        wrap.addEventListener('mouseleave', function () { label.style.opacity = '0'; label.style.visibility = 'hidden'; });
      }
      wrap.style.cursor = 'pointer';
      wrap.addEventListener('click', function () {
        v.muted = !v.muted;
        if (!v.muted) { if (v.paused) v.play().catch(function () {}); Player.duck('video'); if (label) label.textContent = 'Mute'; }
        else { Player.restore('video'); if (label) label.textContent = 'Unmute'; }
      });
      v.addEventListener('ended', function () { Player.restore('video'); });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Player bar (all pages)                                              */
  /* ------------------------------------------------------------------ */
  function initPlayerBar() {
    var fixed = $$('div').find(function (d) {
      return d.className.indexOf('fixed') !== -1 && d.className.indexOf('bottom-10') !== -1 && d.querySelector('button[aria-label="Play"], button[aria-label="Pause"]');
    });
    if (!fixed) return;
    var bar = fixed.querySelector('.panel') || fixed.lastElementChild;
    var playBtn = bar.querySelector('button[aria-label="Play"], button[aria-label="Pause"]');
    var trackBtn = $$('button', bar).find(function (b) { return b !== playBtn; });
    // floor panel (track list), inserted above the bar
    var floor = el('div', 'player-floor');
    floor.innerHTML = '';
    var head = el('p', 'flex items-center h-40 pl-15 border-b border-line t-meta', '● TRACKS');
    floor.appendChild(head);
    var rows = Player.tracks.map(function (t, i) {
      var b = el('button', 'player-floor-row hoverable flex items-center h-45 pl-15 pr-10 text-left border-b border-line w-full');
      b.type = 'button';
      var lamp = el('span', 'lamp w-2 h-12 shrink-0 bg-ink');
      var name = el('span', 'ml-10', t.title);
      var sup = el('sup', 'raised t-meta ml-4', (t.side.toUpperCase()) + t.pos);
      var dur = el('span', 'ml-auto t-meta', '(00:00)');
      b.appendChild(lamp); b.appendChild(name); b.appendChild(sup); b.appendChild(dur);
      b.addEventListener('click', function () { Player.select(i, true); });
      floor.appendChild(b);
      return { btn: b, lamp: lamp, dur: dur };
    });
    fixed.insertBefore(floor, bar);
    function sync() {
      playBtn.setAttribute('aria-label', Player.playing ? 'Pause' : 'Play');
      playBtn.innerHTML = Player.playing ? PAUSE_SVG : PLAY_SVG;
      var t = Player.track;
      trackBtn.childNodes[0].nodeValue = t.title + ' - Pegassi®';
      rows.forEach(function (r, i) {
        var active = i === Player.index;
        r.lamp.className = 'lamp w-2 h-12 shrink-0 ' + (active ? 'bg-green' : 'bg-ink');
        r.btn.classList.toggle('bg-surface-2', active);
        var d = Player.durations[i];
        r.dur.textContent = '(' + fmt(d) + ')';
      });
    }
    playBtn.addEventListener('click', function () { Player.toggle(); });
    trackBtn.addEventListener('click', function () {
      var open = floor.classList.toggle('open');
      trackBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    Player.on(sync); sync();
  }

  /* ------------------------------------------------------------------ */
  /* Mobile menu sheet                                                   */
  /* ------------------------------------------------------------------ */
  function initMenu() {
    var btn = $$('button').find(function (b) { return b.textContent.trim() === 'Menu' && b.className.indexOf('pointer-events-auto') !== -1; });
    if (!btn) return;
    var host = btn.closest('.fixed') || btn.parentElement.parentElement;
    var items = [
      { to: '/listen', label: 'Listen' }, { to: '/sequencer', label: 'Sequencer' },
      { to: '/about', label: 'About' }, { to: '/buy', label: 'Buy' }
    ];
    var sheet = el('div', 'menu-sheet absolute inset-x-10 bottom-40 rounded-5 bg-surface overflow-hidden pointer-events-auto');
    sheet.appendChild(el('p', 'flex items-center h-40 pl-15 border-b border-line', 'Menu'));
    var here = '/' + (PAGE === 'home' ? '' : PAGE);
    items.forEach(function (it, i) {
      var a = el('a', 'hoverable flex items-center h-70 pl-15 text-35 leading-45' + (i < items.length - 1 ? ' border-b border-line' : ''));
      a.href = it.to === '/sequencer' ? '/sequencer/' : it.to + '/';
      a.textContent = (here === it.to ? '● ' : '') + it.label;
      sheet.appendChild(a);
    });
    sheet.style.display = 'none';
    host.appendChild(sheet);
    btn.addEventListener('click', function () {
      var open = sheet.style.display === 'none';
      sheet.style.display = open ? 'block' : 'none';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.classList.toggle('bg-surface-2', open); btn.classList.toggle('bg-surface', !open);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Site credits popover                                                */
  /* ------------------------------------------------------------------ */
  function initCredits() {
    var btn = $$('button').find(function (b) { return b.textContent.trim() === 'Site Credits'; });
    if (!btn) return;
    var wrap = btn.parentElement;
    var pop = el('div', 'credits-pop panel rounded-5 bg-surface');
    pop.innerHTML =
      '<p class="flex items-center h-40 pl-15 pr-15 border-b border-line t-meta">● CREDITS</p>' +
      '<div class="credits-body t-note">' +
      '<p>“ASCENSION” Debut EP — Pegassi</p>' +
      '<p>Prod. by Pegassi® — ©2026 Pegassi BV</p>' +
      '<p><a class="link" href="mailto:pegassibe@outlook.com">pegassibe@outlook.com</a></p>' +
      '</div>';
    pop.style.display = 'none';
    wrap.insertBefore(pop, btn);
    btn.addEventListener('click', function () {
      var open = pop.style.display === 'none';
      pop.style.display = open ? 'block' : 'none';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Home: cue hover previews                                            */
  /* ------------------------------------------------------------------ */
  function initCues() {
    var cueBox = $('.fixed.inset-x-0.top-12');
    if (!cueBox) return;
    var video = cueBox.querySelector('video');
    var MAP = { A1: 'home-ascension1', A2: 'home-circles2', B1: 'home-forestwalk2', B2: 'home-twinflame1' };
    var container = $('[data-v-337fa076]') || document.querySelector('main');
    var current = null;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    function light(cue) {
      if (!container) return;
      container.classList.toggle('cued', !!cue);
      $$('[data-cue]', container).forEach(function (s) {
        s.classList.toggle('lit', !!cue && s.getAttribute('data-cue') === cue);
      });
    }
    function start(cue) {
      if (current === cue || !MAP[cue]) return;
      if (!current) Player.duck('cue');
      current = cue; light(cue);
      video.src = '/videos/' + MAP[cue] + '.mp4';
      cueBox.style.display = '';
      video.currentTime = 0;
      video.play().catch(function () {});
    }
    function stop() {
      if (!current) return;
      current = null; light(null);
      video.pause(); cueBox.style.display = 'none';
      Player.restore('cue');
    }
    if (!container) return;
    container.addEventListener('mouseover', function (ev) {
      var s = ev.target.closest && ev.target.closest('[data-cue]');
      if (s) start(s.getAttribute('data-cue')); else stop();
    });
    container.addEventListener('mouseleave', stop);
    // disable cues while fast-scrolling
    var lastY = -1, scrolling = false;
    setInterval(function () {
      var y = window.scrollY;
      var fast = lastY >= 0 && Math.abs(y - lastY) > 90;
      lastY = y;
      if (fast !== scrolling) { scrolling = fast; container.classList.toggle('scrolling', fast); if (fast) stop(); }
    }, 120);
  }

  /* ------------------------------------------------------------------ */
  /* Listen page                                                         */
  /* ------------------------------------------------------------------ */
  function initListen() {
    var panel = $$('.js-panel')[0];
    if (!panel) return;
    var grids = $$('.grid.grid-cols-\\[368fr_367fr\\]', panel);
    var btnsWrap = grids[0];
    var sideWrap = grids[1];
    if (!btnsWrap) return;
    var btns = $$('button', btnsWrap);
    var sideBtns = sideWrap ? $$('button', sideWrap) : [];
    // DOM order: Ascension(A1), Forest Walk(B1), Circles(A2), Twinflame(B2)
    var order = [0, 2, 1, 3];
    var disc = $('.disc', panel);
    var spin = $('.spin', panel);
    var playBtns = $$('button[aria-label="Play"], button[aria-label="Pause"]');
    var prevBtns = $$('button[aria-label="Previous track"]');
    var nextBtns = $$('button[aria-label="Next track"]');
    var waveBox = $('.wave', panel) ? $('.wave', panel).parentElement : null;
    var infoTitle = null, infoTime = null, infoBpm = null;
    if (waveBox) {
      var wrap = waveBox.parentElement;
      var ps = $$('p', wrap);
      infoTitle = ps[0]; infoTime = ps[1]; infoBpm = ps[2];
      wrap.addEventListener('click', function (ev) {
        var r = waveBox.getBoundingClientRect();
        Player.seek((ev.clientX - r.left) / r.width);
      });
    }
    var line = $('.bg-blue', panel);
    var played = $('.wave.played', panel);
    var waveA = $$('.wave', panel).filter(function (w) { return w !== played; })[0];
    // blurb panel: the js-panel whose first text starts with ●
    var blurbPanel = $$('.js-panel').filter(function (p) {
      var t = p.querySelector('p');
      return t && t.textContent.trim().charAt(0) === '●' && p !== panel;
    })[0];
    var blurbTitle = blurbPanel ? blurbPanel.querySelector('p') : null;
    var blurbBody = blurbPanel ? blurbPanel.querySelector('.t-copy') : null;
    // media chip
    var chip = $$('.js-panel').filter(function (p) { return p.querySelector('video') && p.querySelector('img'); })[0];
    var chipImg = chip ? chip.querySelector('img') : null;
    var chipVideo = chip ? chip.querySelector('video') : null;
    var CLIPS = {
      'ascension': ['ascension1', 'ascension2', 'ascension3', 'ascension4', 'ascension5'],
      'circles': ['circles1', 'circles2', 'circles3', 'circles4', 'circles5'],
      'forest-walk': ['forrest1', 'forrest2', 'forrest3', 'forrest4', 'forrest5'],
      'twinflame': ['twinflame1', 'twinflame2', 'twinflame3', 'twinflame4']
    };
    function slug() { return Player.track.src.split('/').pop().replace('pegassi-', '').replace('.mp3', ''); }
    function chipSrc(i) {
      var s = slug(), clip = CLIPS[s][i || 0];
      return { still: '/videos/' + s + '/' + clip + '.webp', video: '/videos/' + s + '/' + clip + '.mp4' };
    }
    var chipIndex = 0;
    function syncChip() {
      if (!chip) return;
      var c = chipSrc(chipIndex);
      chipImg.src = c.still;
      chipVideo.poster = c.still;
      chipVideo.src = c.video;
      chipVideo.muted = true;
      chipVideo.play().catch(function () {});
      chipVideo.onerror = function () { chipVideo.removeAttribute('src'); chipVideo.load(); };
    }
    if (chip) {
      chip.style.cursor = 'pointer';
      var chipTag = el('span', 'absolute left-0 top-0 z-70 text-white mix-blend-difference pointer-events-none t-meta', 'See Media');
      chipTag.style.opacity = '0'; chipTag.style.transition = 'opacity .2s';
      chip.appendChild(chipTag);
      followTag(chipTag, chip);
      chip.addEventListener('mouseenter', function () { chipTag.style.opacity = '1'; });
      chip.addEventListener('mouseleave', function () { chipTag.style.opacity = '0'; });
      chip.addEventListener('click', openViewer);
    }
    var viewer = null, viewerIndex = 0;
    function openViewer() {
      if (viewer) return;
      viewerIndex = chipIndex;
      Player.duck('viewer');
      viewer = el('div', 'fixed inset-0 z-100 bg-black flex justify-center items-center viewer');
      var img = el('img', 'viewer-media');
      var vid = el('video', 'viewer-media');
      vid.loop = true; vid.playsInline = true; vid.muted = false;
      var prev = el('button', 'viewer-nav viewer-prev hoverable', '←');
      var next = el('button', 'viewer-nav viewer-next hoverable', '→');
      var close = el('button', 'viewer-close hoverable t-meta', 'Close');
      prev.type = next.type = close.type = 'button';
      viewer.appendChild(img); viewer.appendChild(vid);
      viewer.appendChild(prev); viewer.appendChild(next); viewer.appendChild(close);
      document.body.appendChild(viewer);
      document.body.style.overflow = 'hidden';
      function show() {
        var c = chipSrc(viewerIndex);
        img.src = c.still;
        vid.src = c.video;
        vid.muted = false;
        vid.play().catch(function () {});
        vid.onerror = function () { vid.style.display = 'none'; };
        vid.style.display = '';
      }
      prev.addEventListener('click', function (ev) { ev.stopPropagation(); viewerIndex = (viewerIndex + CLIPS[slug()].length - 1) % CLIPS[slug()].length; show(); });
      next.addEventListener('click', function (ev) { ev.stopPropagation(); viewerIndex = (viewerIndex + 1) % CLIPS[slug()].length; show(); });
      close.addEventListener('click', closeViewer);
      viewer.addEventListener('click', function (ev) { if (ev.target === viewer) closeViewer(); });
      show();
    }
    function closeViewer() {
      if (!viewer) return;
      viewer.remove(); viewer = null;
      document.body.style.overflow = '';
      Player.restore('viewer');
    }
    // top track progress bar
    var topBar = $$('span').find(function (s) { return s.className.indexOf('origin-left bg-white') !== -1 && s.style.transform.indexOf('scaleX') !== -1; });
    if (topBar) topBar.style.display = '';
    function renderWave(key) {
      var data = D.waveforms[key] || [];
      [waveA, played].forEach(function (w) {
        if (!w) return;
        w.innerHTML = '';
        data.forEach(function (h) {
          var s = el('span'); s.style.height = h + '%'; w.appendChild(s);
        });
      });
    }
    function sync(kind) {
      var t = Player.track, i = Player.index;
      btns.forEach(function (b, bi) {
        var ti = order[bi];
        var active = ti === i;
        b.classList.toggle('bg-surface-2', active);
        var lamp = b.querySelector('span');
        if (lamp) lamp.className = (active ? 'lamp bg-green' : 'bg-ink') + ' w-2 h-12 shrink-0';
        var dur = b.querySelector('.ml-auto');
        if (dur) dur.textContent = '(' + fmt(Player.durations[ti]) + ')';
      });
      var sideA = t.side === 'a';
      sideBtns.forEach(function (b, bi) { b.classList.toggle('bg-surface-2', (bi === 0) === sideA); });
      if (disc) disc.style.transform = 'rotateY(' + (sideA ? 0 : 180) + 'deg)';
      playBtns.forEach(function (b) {
        b.setAttribute('aria-label', Player.playing ? 'Pause' : 'Play');
        b.innerHTML = Player.playing ? PAUSE_SVG : PLAY_SVG;
      });
      if (spin) spin.classList.toggle('still', !Player.playing);
      if (infoTitle) infoTitle.textContent = 'Pegassi - ' + t.title;
      if (infoBpm) infoBpm.textContent = 'BPM ' + t.bpm;
      if (infoTime) infoTime.textContent = fmt(Player.time) + '/' + fmt(Player.durations[i]);
      var pct = Player.progress * 100;
      if (played) played.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
      if (line) line.style.left = pct + '%';
      if (topBar) topBar.style.transform = 'scaleX(' + Player.progress + ')';
      if (blurbTitle && kind === 'track') {
        blurbTitle.textContent = '● ' + t.title;
        blurbBody.innerHTML = '';
        t.blurb.forEach(function (p, pi) {
          blurbBody.appendChild(el('p', pi ? 'mt-20' : '', p));
        });
      }
      if (kind === 'track') {
        renderWave(t.src.split('/').pop().replace('.mp3', ''));
        chipIndex = 0;
        syncChip();
      }
    }
    btns.forEach(function (b, bi) {
      b.addEventListener('click', function () {
        var ti = order[bi];
        if (ti === Player.index) { Player.toggle(); } else { Player.select(ti, true); }
      });
    });
    sideBtns.forEach(function (b, bi) {
      b.addEventListener('click', function () {
        var side = bi === 0 ? 'a' : 'b';
        if (Player.track.side !== side) {
          var idx = Player.tracks.findIndex(function (x) { return x.side === side && x.pos === 1; });
          Player.select(idx, Player.playing);
        }
      });
    });
    playBtns.forEach(function (b) { b.addEventListener('click', function () { Player.toggle(); }); });
    prevBtns.forEach(function (b) { b.addEventListener('click', function () { Player.prev(); }); });
    nextBtns.forEach(function (b) { b.addEventListener('click', function () { Player.next(); }); });
    Player.on(sync);
    sync('track');
    setInterval(function () { if (Player.playing) sync('tick'); }, 250);
  }

  /* ------------------------------------------------------------------ */
  /* Sequencer page                                                      */
  /* ------------------------------------------------------------------ */
  function initSequencer() {
    var section = $('section.site-max');
    if (!section) return;
    var kits = D.kits;
    var LS = 'pegassi-sequencer-v1';
    // state
    var kitIndex = 0;
    var grids = kits.map(function (k) { // grids[kit][pattern][row][step]
      return k.rows.map(function (r) { return r.original; }).length ? [0, 1, 2, 3].map(function (p) {
        return k.rows.map(function (r) {
          var steps = new Array(16).fill(false);
          r.original[p].forEach(function (s) { steps[s - 1] = true; });
          return steps;
        });
      }) : null;
    });
    var patterns = kits.map(function () { return 0; });
    try {
      var saved = JSON.parse(localStorage.getItem(LS));
      if (saved && saved.grids) { grids = saved.grids; patterns = saved.patterns || patterns; kitIndex = saved.kitIndex || 0; }
    } catch (e) {}
    function persist() {
      clearTimeout(persist.t);
      persist.t = setTimeout(function () {
        try { localStorage.setItem(LS, JSON.stringify({ grids: grids, patterns: patterns, kitIndex: kitIndex })); } catch (e) {}
      }, 400);
    }
    // audio
    var actx = null, master = null, kitGain = null, buffers = {}, chokes = [];
    function ac() {
      if (!actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain(); master.connect(actx.destination);
        kitGain = actx.createGain(); kitGain.connect(master);
        kitGain.gain.value = Math.pow(10, kits[kitIndex].gainDb / 20);
      }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    }
    function sampleName(kit, row, pattern, step) {
      var s = row.sample;
      if (s.t === 'f') return s.n;
      if (s.t === 'p') return s.names[pattern] || s.names[0];
      if (s.t === 'pad') return pattern === 3 ? 'pad-03' : (pattern === 2 && step >= 8 ? 'pad-02' : 'pad-01');
      if (s.t === 'saw') {
        if (pattern === 0) return 'saw-01';
        if (pattern === 1) return step < 4 ? 'saw-02' : 'saw-01';
        if (pattern === 2) return step < 4 ? 'saw-02' : (step < 14 ? 'saw-01' : 'saw-03');
        return step < 8 ? 'saw-02' : 'saw-01';
      }
      return null;
    }
    function load(name) {
      var kit = kits[kitIndex];
      var url = '/sequencer/' + kit.slug + '/' + name + '.mp3';
      if (buffers[url]) return Promise.resolve(buffers[url]);
      return fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (ab) {
        return ac().decodeAudioData(ab);
      }).then(function (buf) { buffers[url] = buf; return buf; }).catch(function () { return null; });
    }
    function preloadKit() {
      var kit = kits[kitIndex];
      var names = {};
      kit.rows.forEach(function (r) {
        for (var p = 0; p < 4; p++) for (var s = 0; s < 16; s++) names[sampleName(kit, r, p, s)] = true;
      });
      Object.keys(names).forEach(load);
    }
    function trigger(rowIdx, pattern, step, when) {
      var kit = kits[kitIndex], row = kit.rows[rowIdx];
      var url = '/sequencer/' + kit.slug + '/' + sampleName(kit, row, pattern, step) + '.mp3';
      var buf = buffers[url];
      if (!buf) { load(sampleName(kit, row, pattern, step)); return; }
      var c = ac();
      var src = c.createBufferSource();
      src.buffer = buf; src.connect(kitGain);
      if (row.choke) { try { if (chokes[rowIdx]) chokes[rowIdx].stop(when); } catch (e) {} chokes[rowIdx] = src; }
      src.start(when || c.currentTime);
    }
    // transport
    var playing = false, timer = null, nextStep = 0, nextTime = 0, queued = null, follow = true;
    var playheadEl = null;
    function stepDur() { return 60 / kits[kitIndex].bpm / 4; }
    function scheduler() {
      var c = ac();
      while (nextTime < c.currentTime + .12) {
        var p = patterns[kitIndex], g = grids[kitIndex][p];
        kits[kitIndex].rows.forEach(function (row, ri) {
          if (g[ri][nextStep]) trigger(ri, p, nextStep, nextTime);
        });
        schedulePlayhead(nextStep, nextTime);
        nextTime += stepDur();
        nextStep++;
        if (nextStep >= 16) {
          nextStep = 0;
          if (queued !== null && follow) { patterns[kitIndex] = queued; queued = null; syncControls(); persist(); }
        }
      }
    }
    function schedulePlayhead(step, when) {
      var delay = Math.max(0, (when - ac().currentTime) * 1000);
      setTimeout(function () {
        if (!playing) return;
        if (playheadEl) playheadEl.style.setProperty('--step', step);
      }, delay);
    }
    function start() {
      ac(); preloadKit();
      playing = true; nextStep = 0;
      nextTime = actx.currentTime + .06;
      timer = setInterval(scheduler, 25);
      syncControls();
    }
    function stop() {
      playing = false;
      if (timer) { clearInterval(timer); timer = null; }
      if (playheadEl) playheadEl.style.setProperty('--step', -10);
      syncControls();
    }
    // DOM
    var kitPanel = $('.machine-grid .panel', section);
    var kitBtns = kitPanel ? $$('button', kitPanel) : [];
    var control = $('.machine-grid .panel.grid, .machine-grid .panel:last-child', section);
    var cells = $$('button, p.cell', control || section);
    var playCell = cells.find(function (b) { return b.textContent.trim() === 'Play'; });
    var stopCell = cells.find(function (b) { return b.textContent.trim() === 'Stop'; });
    var bpmCell = $('.bpm', section);
    var clearCell = cells.find(function (b) { return b.textContent.trim() === 'Clear all'; });
    var copyCell = cells.find(function (b) { return b.textContent.trim() === 'Copy'; });
    var pasteCell = cells.find(function (b) { return /Paste/.test(b.textContent); });
    var resetCell = cells.find(function (b) { return b.textContent.trim() === 'Reset loop'; });
    var followCell = cells.find(function (b) { return /Follow/.test(b.textContent); });
    var patternCells = cells.filter(function (b) { return /Pattern 0\d/.test(b.textContent); });
    var headTitle = $('.step-grid .head', section) || $('.step-grid p', section);
    var rowsWrap = $('.step-grid.rows', section);
    function buildGrid() {
      var kit = kits[kitIndex];
      rowsWrap.style.setProperty('--rows', kit.rows.length);
      rowsWrap.innerHTML = '';
      kit.rows.forEach(function (row, ri) {
        var name = el('button', 'name panel hoverable flex items-center min-h-0 min-w-0 rounded-3 bg-surface pl-12 pr-8 text-13 text-left s:pl-17 s:pr-10 s:text-17');
        name.type = 'button';
        name.appendChild(el('span', 'truncate min-w-0', row.label));
        name.addEventListener('click', function () { preloadKit(); setTimeout(function(){ trigger(ri, patterns[kitIndex], 0); }, 60); });
        rowsWrap.appendChild(name);
        for (var s = 0; s < 16; s++) {
          (function (ri, s) {
            var st = el('button', 'step hoverable min-h-0 rounded-3');
            st.type = 'button';
            st.setAttribute('aria-label', row.label + ' step ' + (s + 1));
            st.addEventListener('click', function () {
              var g = grids[kitIndex][patterns[kitIndex]];
              g[ri][s] = !g[ri][s];
              paintStep(st, g[ri][s]);
              if (g[ri][s]) { preloadKit(); setTimeout(function(){ trigger(ri, patterns[kitIndex], s); }, 60); }
              persist();
            });
            st._ri = ri; st._s = s;
            rowsWrap.appendChild(st);
          })(ri, s);
        }
      });
      playheadEl = el('span', 'playhead');
      playheadEl.style.setProperty('--step', -10);
      rowsWrap.appendChild(playheadEl);
      paintAll();
    }
    function paintStep(st, on) {
      st.setAttribute('aria-pressed', on ? 'true' : 'false');
      st.classList.toggle('bg-ink', on);
      st.classList.toggle('bg-surface', !on);
    }
    function paintAll() {
      var g = grids[kitIndex][patterns[kitIndex]];
      $$('.step', rowsWrap).forEach(function (st) { paintStep(st, g[st._ri][st._s]); });
    }
    function syncControls() {
      var kit = kits[kitIndex];
      if (bpmCell) bpmCell.textContent = kit.bpm;
      if (headTitle) headTitle.textContent = kit.title;
      kitBtns.forEach(function (b, i) {
        var active = i === kitIndex;
        b.classList.toggle('bg-surface-2', active);
        var lamp = b.querySelector('span');
        if (lamp) lamp.className = (active ? 'lamp bg-green' : 'bg-ink') + ' w-2 h-12 shrink-0';
      });
      if (playCell) playCell.classList.toggle('bg-surface-2', playing);
      if (stopCell) stopCell.classList.toggle('bg-surface-2', !playing);
      patternCells.forEach(function (b, i) { b.classList.toggle('bg-surface-2', i === patterns[kitIndex]); });
      if (followCell) {
        followCell.setAttribute('aria-pressed', follow ? 'true' : 'false');
        followCell.classList.toggle('bg-surface-2', follow);
        followCell.childNodes[followCell.childNodes.length - 1].nodeValue = ' Follow ' + (follow ? 'on' : 'off');
      }
      if (kitGain) kitGain.gain.setValueAtTime(Math.pow(10, kit.gainDb / 20), ac().currentTime);
    }
    kitBtns.forEach(function (b, i) {
      b.addEventListener('click', function () {
        if (i === kitIndex) return;
        kitIndex = i; buffers = {}; chokes = [];
        buildGrid(); syncControls(); persist(); preloadKit();
      });
    });
    if (playCell) playCell.addEventListener('click', function () { if (!playing) start(); });
    if (stopCell) stopCell.addEventListener('click', stop);
    if (clearCell) clearCell.addEventListener('click', function () {
      grids[kitIndex] = [0, 1, 2, 3].map(function () {
        return kits[kitIndex].rows.map(function () { return new Array(16).fill(false); });
      });
      paintAll(); persist();
    });
    if (resetCell) resetCell.addEventListener('click', function () {
      stop();
      grids[kitIndex] = [0, 1, 2, 3].map(function (p) {
        return kits[kitIndex].rows.map(function (r) {
          var steps = new Array(16).fill(false);
          r.original[p].forEach(function (s) { steps[s - 1] = true; });
          return steps;
        });
      });
      patterns[kitIndex] = 0; paintAll(); syncControls(); persist();
    });
    if (copyCell) copyCell.addEventListener('click', function () {
      var payload = { app: 'pegassi-sequencer', grid: grids[kitIndex], pattern: patterns[kitIndex], kit: kits[kitIndex].slug };
      try { navigator.clipboard.writeText(JSON.stringify(payload)); } catch (e) {}
      if (pasteCell) { pasteCell.disabled = false; pasteCell.classList.remove('text-ink/40'); }
    });
    if (pasteCell) pasteCell.addEventListener('click', function () {
      function apply(text) {
        try {
          var d = JSON.parse(text);
          if (d && d.app === 'pegassi-sequencer' && d.grid && d.grid.length === 4) {
            grids[kitIndex] = d.grid; paintAll(); persist();
          }
        } catch (e) {}
      }
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(apply).catch(function () {});
    });
    if (followCell) followCell.addEventListener('click', function () { follow = !follow; syncControls(); });
    patternCells.forEach(function (b, i) {
      b.addEventListener('click', function () {
        if (playing) { queued = i; if (!follow) { patterns[kitIndex] = i; queued = null; paintAll(); persist(); } }
        else { patterns[kitIndex] = i; paintAll(); persist(); }
        syncControls();
      });
    });
    // share sequence: encode grid into URL hash and copy
    var shareBtn = $('.share', section);
    function encodeGrid() {
      var kit = kits[kitIndex], out = [];
      for (var p = 0; p < 4; p++) {
        grids[kitIndex][p].forEach(function (row) {
          var bits = 0;
          row.forEach(function (on, s) { if (on) bits |= (1 << s); });
          out.push(('000' + bits.toString(16)).slice(-4));
        });
      }
      return kit.slug + '.' + patterns[kitIndex] + '.' + out.join('');
    }
    function decodeHash() {
      try {
        var h = location.hash.replace('#', '');
        var parts = h.split('.');
        if (parts.length !== 3) return;
        var ki = kits.findIndex(function (k) { return k.slug === parts[0]; });
        if (ki < 0) return;
        var hex = parts[2], rows = kits[ki].rows.length;
        if (hex.length !== 4 * 4 * rows) return;
        kitIndex = ki;
        patterns[ki] = Math.min(3, Math.max(0, parseInt(parts[1], 10) || 0));
        for (var p = 0; p < 4; p++) {
          for (var r = 0; r < rows; r++) {
            var bits = parseInt(hex.substr((p * rows + r) * 4, 4), 16);
            for (var s = 0; s < 16; s++) grids[ki][p][r][s] = !!(bits & (1 << s));
          }
        }
      } catch (e) {}
    }
    decodeHash();
    if (shareBtn) shareBtn.addEventListener('click', function () {
      var url = location.origin + location.pathname + '#' + encodeGrid();
      try { navigator.clipboard.writeText(url); } catch (e) {}
      var label = shareBtn.querySelector('span');
      if (label) { var old = label.textContent; label.textContent = 'Link copied'; setTimeout(function () { label.textContent = old; }, 1600); }
    });
    buildGrid(); syncControls();
  }

  /* ------------------------------------------------------------------ */
  /* Buy page                                                            */
  /* ------------------------------------------------------------------ */
  function initBuy() {
    var specsBtn = $$('button').find(function (b) { return b.textContent.trim() === 'Technical specs'; });
    var SPECS = [
      ['Format', '12” Vinyl', null], ['Sleeve', '12” single sleeve', '12” single'],
      ['Edition', 'Limited to 500 copies', '500 copies'], ['Size', '315mm x 315mm', null],
      ['Speed', '33⅓ rpm', null], ['Weight', '180gr', null], ['Tracks', '4', null],
      ['Vinyl color', 'Off white', null], ['Sides', 'A/B', null], ['Label', 'Sweet Nothing', null]
    ];
    if (specsBtn) {
      var host = specsBtn.parentElement;
      host.style.position = 'relative';
      var grid = el('div', 'absolute left-0 bottom-full z-80 grid grid-cols-2 w-full border-t border-x border-line bg-surface');
      SPECS.forEach(function (s, i) {
        var row = el('div', 'flex justify-between items-center gap-x-10 h-45 pl-15 pr-15 text-13 s:text-17' + (i % 2 === 0 ? ' rule-r' : '') + (i < SPECS.length - 2 ? ' border-b border-line' : ''));
        row.appendChild(el('span', '', s[0]));
        if (s[2]) row.appendChild(el('span', 's:hidden', s[2]));
        row.appendChild(el('span', s[2] ? 'hidden s:inline' : '', s[1]));
        grid.appendChild(row);
      });
      grid.style.display = 'none';
      host.appendChild(grid);
      specsBtn.addEventListener('click', function () {
        var open = grid.style.display === 'none';
        grid.style.display = open ? 'grid' : 'none';
        specsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        var sign = specsBtn.querySelector('.sign');
        if (sign) sign.classList.toggle('open', open);
      });
    }
    // drag the record out of its sleeve
    var stage = $('.stage');
    var art = $('.art', stage || document);
    var discImg = art ? art.querySelector('img.disc') : null;
    if (stage && discImg) {
      var startX = 0, dx = 0, dragging = false, moved = false;
      var hint = stage.querySelector('span');
      stage.addEventListener('pointerdown', function (ev) {
        dragging = true; moved = false; startX = ev.clientX;
        stage.setPointerCapture(ev.pointerId);
      });
      stage.addEventListener('pointermove', function (ev) {
        if (!dragging) return;
        dx = ev.clientX - startX;
        if (Math.abs(dx) > 6) moved = true;
        var clamped = Math.max(-stage.offsetWidth * .55, Math.min(stage.offsetWidth * .55, dx));
        discImg.style.transition = 'none';
        discImg.style.transform = 'translateX(' + clamped + 'px) rotate(' + clamped * .25 + 'deg)';
      });
      function release() {
        if (!dragging) return;
        dragging = false;
        discImg.style.transition = 'transform .7s var(--ease-out-quart)';
        discImg.style.transform = 'translateX(0) rotate(0deg)';
        dx = 0;
      }
      stage.addEventListener('pointerup', release);
      stage.addEventListener('pointercancel', release);
      // click (no drag) opens the fullscreen cover view
      stage.addEventListener('click', function () {
        if (moved) return;
        openCover();
      });
    }
    function openCover() {
      var sheet = el('button', 'grain fixed inset-0 z-100 flex flex-col justify-center items-center bg-black cover-sheet');
      sheet.type = 'button';
      var img = el('img'); img.src = '/cover.webp'; img.width = 717; img.height = 717; img.alt = 'ASCENSION sleeve';
      img.className = 'w-240';
      var tag = el('span', 'cover-tag t-meta', 'Close');
      sheet.appendChild(img); sheet.appendChild(tag);
      document.body.appendChild(sheet);
      followTag(tag, sheet);
      sheet.addEventListener('click', function () { sheet.remove(); });
    }
  }

  /* ------------------------------------------------------------------ */
  /* About page footnotes                                                */
  /* ------------------------------------------------------------------ */
  function initAbout() {
    // hovering a sup highlights the matching footnote
    var notes = $$('main div[style] p.t-meta, main div[style] > p').filter(function (p) {
      return /^[1-4]$/.test(p.textContent.trim());
    });
    if (!notes.length) return;
    var noteBoxes = notes.map(function (p) { return p.parentElement; });
    $$('main sup').forEach(function (sup) {
      var n = parseInt(sup.textContent.trim(), 10);
      if (!n || !noteBoxes[n - 1]) return;
      sup.style.cursor = 'pointer';
      sup.addEventListener('mouseenter', function () { noteBoxes[n - 1].classList.add('note-lit'); });
      sup.addEventListener('mouseleave', function () { noteBoxes[n - 1].classList.remove('note-lit'); });
      sup.addEventListener('click', function () {
        noteBoxes[n - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */
  function boot() {
    ready();
    prepReveals();
    initIntro();
    initTransitions();
    initPlayerBar();
    initMenu();
    initCredits();
    if (PAGE === 'home') { initCues(); initVideos(); }
    if (PAGE === 'about') { initVideos(); initAbout(); }
    if (PAGE === 'listen') initListen();
    if (PAGE === 'sequencer') initSequencer();
    if (PAGE === 'buy') initBuy();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
