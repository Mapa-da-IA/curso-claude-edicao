/* =====================================================================
   Guia do Professor — Claude: Edição de Vídeos · site.js
   Vanilla, no dependencies, works from file:// and any static server.
   Modules: nav · hero canvas · timecode · hero tabs · stats · wave tile ·
   flow diagram · progress (localStorage) · switcher · copy · TOC ·
   read progress · reveal
   ===================================================================== */
(function () {
  "use strict";

  var doc = document.documentElement;
  doc.classList.add("js");
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduced = reduceMQ.matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var css = function (name) { return getComputedStyle(doc).getPropertyValue(name).trim(); };
  var TOTAL = 12;

  /* ---------------------------------------------------- live region */
  var live = document.createElement("div");
  live.className = "sr-only"; live.setAttribute("aria-live", "polite"); live.setAttribute("role", "status");
  document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(live); });
  function announce(msg) { live.textContent = ""; setTimeout(function () { live.textContent = msg; }, 30); }

  /* ------------------------------------------------- storage (safe) */
  // Versão do aluno (body[data-versao="aluno"]) guarda o progresso numa chave própria,
  // para não misturar com o progresso do professor.
  var IS_ALUNO = !!(document.body && document.body.getAttribute("data-versao") === "aluno");
  var KEY = IS_ALUNO ? "edicao-claude:aluno:progresso" : "edicao-claude:progresso";
  function readDone() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function writeDone(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* private mode */ } }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------------------------------- motion pause (WCAG 2.2.2) */
  var MKEY = "edicao-claude:movimento";
  var motionPaused = false;
  try { motionPaused = localStorage.getItem(MKEY) === "pausado"; } catch (e) {}
  var motionFns = [];
  function onMotion(fn) { motionFns.push(fn); }
  function setMotion(p) {
    motionPaused = p;
    try { if (p) localStorage.setItem(MKEY, "pausado"); else localStorage.removeItem(MKEY); } catch (e) {}
    doc.classList.toggle("motion-paused", p);
    $$("[data-motion-text]").forEach(function (t) { t.textContent = p ? "Retomar animação" : "Pausar animação"; });
    motionFns.forEach(function (fn) { fn(p); });
  }
  function initMotionToggle() {
    var btns = $$("[data-motion-toggle]");
    if (reduced) return; // nada se move: o botão continua oculto
    btns.forEach(function (b) {
      b.hidden = false;
      b.addEventListener("click", function () { setMotion(!motionPaused); announce(motionPaused ? "Animação pausada." : "Animação retomada."); });
    });
    if (motionPaused) setMotion(true);
  }

  function init() {
    initMotionToggle();
    initNav();
    $$("[data-hero-canvas]").forEach(initHeroCanvas);
    initTimecode();
    initHeroTabs();
    initStats();
    $$("[data-wave]").forEach(initWave);
    $$("[data-flow]").forEach(initFlow);
    initProgress();
    initSwitcher();
    initCopy();
    initToc();
    initReadProgress();
    initReveal();
  }

  /* ============================================================ nav */
  function initNav() {
    var nav = $("[data-nav]"); if (!nav) return;
    var onScroll = function () { nav.classList.toggle("is-scrolled", window.scrollY > 24); };
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });

    var toggle = $("[data-nav-toggle]", nav), menu = $("#menu-mobile");
    if (!toggle || !menu) return;
    function set(open) {
      toggle.setAttribute("aria-expanded", String(open));
      menu.hidden = !open;
      $(".sr-only", toggle).textContent = open ? "Fechar menu" : "Abrir menu";
    }
    toggle.addEventListener("click", function () { set(toggle.getAttribute("aria-expanded") !== "true"); });
    $$("a", menu).forEach(function (a) { a.addEventListener("click", function () { set(false); }); });
    document.addEventListener("nav:close", function () { if (!menu.hidden) set(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !menu.hidden) { set(false); toggle.focus(); }
    });
  }

  /* ==================================================== hero canvas
     A perspective field of dots rolling like a waveform, with a glowing
     clay ring ("the record / playhead dial") and a few cyan sparks.   */
  function initHeroCanvas(canvas) {
    var ctx = canvas.getContext("2d"); if (!ctx) return;
    var quiet = canvas.classList.contains("hero__canvas--quiet");
    var anchor = canvas.parentElement && canvas.parentElement.querySelector("[data-wordmark]");
    var W = 0, H = 0, dpr = 1, t0 = performance.now(), raf = 0, visible = true;
    var mx = 0, my = 0, tx = 0, ty = 0;
    var clay = [217, 119, 87], neon = [95, 212, 199];
    var sparks = [];
    for (var i = 0; i < 46; i++) sparks.push({ a: Math.random() * Math.PI * 2, r: 0.92 + Math.random() * 0.3, s: 0.00012 + Math.random() * 0.00025, z: Math.random() });

    function resize() {
      var rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, rect.width); H = Math.max(1, rect.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) frame(performance.now());
    }

    function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }

    function frame(now) {
      var t = (now - t0) / 1000;
      mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;
      ctx.clearRect(0, 0, W, H);

      /* --- wave field --- */
      var cols = W < 700 ? 46 : 84, rows = quiet ? 18 : 24;
      var horizon = H * (quiet ? 0.42 : 0.5) + my * 12;
      var fov = H * 0.9;
      for (var r = 0; r < rows; r++) {
        var z = 1 + r * 0.42;                       // depth
        var depthA = 1 - r / rows;
        for (var c = 0; c < cols; c++) {
          var u = c / (cols - 1) - 0.5;
          var x3 = u * 26;
          var y3 = Math.sin(x3 * 0.42 + t * 0.9 + r * 0.35) * 0.9
                 + Math.sin(x3 * 0.17 - t * 0.6 + r * 0.6) * 1.3
                 + Math.cos(r * 0.5 + t * 0.4) * 0.5;
          var px = W / 2 + (x3 / z) * (W / 12) + mx * 20 / z;
          var py = horizon + ((y3 + 4.2) / z) * (fov / 10);
          if (px < -10 || px > W + 10 || py > H + 10) continue;
          var size = Math.max(0.6, 2.1 / z * (W < 700 ? 0.9 : 1.1));
          var edge = 1 - Math.min(1, Math.abs(u) * 1.6);
          var a = (0.12 + 0.6 * depthA) * (0.35 + 0.65 * edge) * (quiet ? 0.7 : 1);
          var mixN = (Math.sin(c * 0.3 + r * 0.7 + t * 0.5) + 1) / 2 > 0.93; // occasional cyan
          ctx.fillStyle = rgba(mixN ? neon : clay, a.toFixed(3));
          ctx.fillRect(px, py, size, size);
        }
      }

      if (!quiet) {
        /* --- glowing ring (dial) --- */
        /* A tilted orbit ellipse that hugs the wordmark (never crosses the lead). */
        var cx = W / 2 + mx * 14, cy = H * 0.4 + my * 10, RX = W * 0.36, RY = 90;
        if (anchor) {
          var cr = canvas.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
          var trail = parseFloat(getComputedStyle(anchor).letterSpacing) || 0; // trailing tracking
          cx = ar.left - cr.left + (ar.width - trail) / 2 + mx * 14;
          cy = ar.top - cr.top + ar.height * 0.5 + my * 10;
          RX = Math.min(W * 0.48, ar.width * 0.62);
          RY = ar.height * 0.6;
        }
        var tilt = -0.045;
        var pt = function (ang, k) { // point on ellipse scaled by k, rotated by tilt
          var x = Math.cos(ang) * RX * k, y = Math.sin(ang) * RY * k;
          return [x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt)];
        };
        ctx.save();
        ctx.translate(cx, cy);
        ctx.shadowColor = "rgba(217,119,87,0.9)"; ctx.shadowBlur = 30;
        ctx.strokeStyle = "rgba(232,145,111,0.5)"; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(0, 0, RX, RY, tilt, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
        /* tick marks like a jog dial */
        var ticks = 140, rot = t * 0.04;
        for (var k = 0; k < ticks; k++) {
          var ang = rot + (k / ticks) * Math.PI * 2, long = k % 10 === 0;
          var p1 = pt(ang, 1.04), p2 = pt(ang, long ? 1.12 : 1.075);
          ctx.strokeStyle = long ? "rgba(242,237,228,0.32)" : "rgba(242,237,228,0.1)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
        }
        /* bright arcs sweeping like playheads */
        var sweep = t * 0.5;
        ctx.shadowColor = "rgba(95,212,199,0.9)"; ctx.shadowBlur = 22;
        ctx.strokeStyle = "rgba(95,212,199,0.8)"; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.ellipse(0, 0, RX, RY, tilt, sweep, sweep + 0.6); ctx.stroke();
        ctx.shadowColor = "rgba(217,119,87,1)";
        ctx.strokeStyle = "rgba(240,160,125,0.95)"; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.ellipse(0, 0, RX, RY, tilt, -sweep * 0.7 + 2, -sweep * 0.7 + 3.1); ctx.stroke();
        ctx.shadowBlur = 0;
        /* orbiting sparks */
        for (var s = 0; s < sparks.length; s++) {
          var sp = sparks[s], q = pt(sp.a + now * sp.s, sp.r);
          ctx.fillStyle = sp.z > 0.8 ? rgba(neon, 0.8) : rgba([242, 237, 228], 0.2 + sp.z * 0.4);
          ctx.beginPath(); ctx.arc(q[0], q[1], sp.z > 0.8 ? 1.6 : 1, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      if (!reduced && visible && !motionPaused) raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize);
    if (!reduced) {
      window.addEventListener("pointermove", function (e) { tx = e.clientX / window.innerWidth - 0.5; ty = e.clientY / window.innerHeight - 0.5; }, { passive: true });
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (en) {
          visible = en[0].isIntersecting;
          cancelAnimationFrame(raf);
          if (visible && !document.hidden && !motionPaused) raf = requestAnimationFrame(frame);
        }).observe(canvas);
      }
      document.addEventListener("visibilitychange", function () {
        cancelAnimationFrame(raf);
        if (!document.hidden && visible && !motionPaused) raf = requestAnimationFrame(frame);
      });
      onMotion(function (p) {
        cancelAnimationFrame(raf);
        if (!p && visible && !document.hidden) raf = requestAnimationFrame(frame);
      });
      raf = requestAnimationFrame(frame); // desenha ao menos um quadro, mesmo pausado
    } else {
      frame(performance.now() + 4000);
    }
  }

  /* ======================================================= timecode */
  function initTimecode() {
    var el = $("[data-timecode]"); if (!el) return;
    var start = performance.now();
    function tick() {
      var f = Math.floor((performance.now() - start) / (1000 / 24));
      var fr = f % 24, s = Math.floor(f / 24) % 60, m = Math.floor(f / 1440) % 60, h = Math.floor(f / 86400);
      el.textContent = pad(h) + ":" + pad(m) + ":" + pad(s) + ":" + pad(fr);
      if (!reduced && !motionPaused) requestAnimationFrame(tick);
    }
    tick();
    onMotion(function (p) { if (!p) requestAnimationFrame(tick); });
  }

  /* ====================================================== hero tabs */
  function initHeroTabs() {
    var root = $("[data-hero-tabs]"); if (!root) return;
    var tabs = $$(".hero-tab", root), panel = $("#mod-panel", root);
    var texts = []; try { texts = JSON.parse(panel.getAttribute("data-panel-texts")); } catch (e) {}
    var idx = 0, DUR = 6500, t0 = performance.now(), paused = false, raf = 0;

    function select(i, focus) {
      idx = (i + tabs.length) % tabs.length;
      tabs.forEach(function (t, k) {
        var on = k === idx;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        t.style.setProperty("--p", on ? (reduced ? "100%" : "0%") : "0%");
      });
      panel.setAttribute("aria-labelledby", tabs[idx].id);
      if (texts[idx]) panel.textContent = texts[idx];
      if (focus) tabs[idx].focus();
      t0 = performance.now();
    }
    tabs.forEach(function (t, k) {
      t.addEventListener("click", function () { select(k); paused = true; tabs[idx].style.setProperty("--p", "100%"); });
      t.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") { e.preventDefault(); select(idx + 1, true); paused = true; tabs[idx].style.setProperty("--p", "100%"); }
        if (e.key === "ArrowLeft") { e.preventDefault(); select(idx - 1, true); paused = true; tabs[idx].style.setProperty("--p", "100%"); }
      });
    });
    root.addEventListener("pointerenter", function () { paused = true; tabs[idx].style.setProperty("--p", "100%"); });
    root.addEventListener("focusin", function () { paused = true; tabs[idx].style.setProperty("--p", "100%"); });
    select(0);
    if (reduced) return;
    var held = 0; // progresso guardado enquanto a animação está pausada
    onMotion(function (p) {
      if (p) held = performance.now() - t0; else t0 = performance.now() - held;
    });
    (function loop(now) {
      if (!paused && !motionPaused) {
        var p = Math.min(1, (now - t0) / DUR);
        tabs[idx].style.setProperty("--p", (p * 100).toFixed(2) + "%");
        if (p >= 1) select(idx + 1);
      }
      raf = requestAnimationFrame(loop);
    })(performance.now());
  }

  /* ========================================================== stats */
  function initStats() {
    var els = $$("[data-count]"); if (!els.length || reduced || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        var el = en.target, end = +el.getAttribute("data-count"), suf = el.getAttribute("data-suffix") || "", t0 = performance.now();
        (function step(now) {
          var p = Math.min(1, (now - t0) / 1400), e = 1 - Math.pow(1 - p, 4);
          el.textContent = Math.round(end * e) + suf;
          if (p < 1) requestAnimationFrame(step);
        })(t0);
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ===================================================== wave tile */
  function initWave(canvas) {
    var ctx = canvas.getContext("2d"); if (!ctx) return;
    var W, H, dpr, bars = [], seed = 7, raf = 0;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var i = 0; i < 160; i++) {
      var env = Math.pow(Math.sin((i / 160) * Math.PI), 0.6);
      bars.push((0.25 + rnd() * 0.75) * env * (0.6 + 0.4 * Math.sin(i * 0.21)));
    }
    function resize() {
      var r = canvas.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    }
    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      var n = bars.length, gap = W / n, mid = H * 0.48;
      var head = reduced ? 0.42 : ((now / 9000) % 1);
      for (var i = 0; i < n; i++) {
        var x = i * gap, h = bars[i] * H * 0.62;
        var played = i / n < head;
        ctx.fillStyle = played ? "rgba(217,119,87,0.95)" : "rgba(242,237,228,0.22)";
        ctx.fillRect(x, mid - h / 2, Math.max(1, gap - 1.4), h);
      }
      var hx = head * W;
      ctx.fillStyle = "#5fd4c7"; ctx.shadowColor = "#5fd4c7"; ctx.shadowBlur = 14;
      ctx.fillRect(hx, 14, 2, H - 28); ctx.shadowBlur = 0;
      cancelAnimationFrame(raf); // um único laço, mesmo após vários resize
      if (!reduced && !motionPaused) raf = requestAnimationFrame(draw);
    }
    resize(); window.addEventListener("resize", resize);
    onMotion(function (p) { cancelAnimationFrame(raf); if (!p) raf = requestAnimationFrame(draw); });
  }

  /* ================================================== flow diagram
     Many into one: scattered "clips" → Claude ribbon → ordered timeline */
  function initFlow(svg) {
    var NS = "http://www.w3.org/2000/svg";
    var mq = window.matchMedia("(max-width: 760px)");
    function build() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var vertical = mq.matches, seed = 11;
      function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
      var Wd = vertical ? 300 : 900, Hd = vertical ? 400 : 200;
      svg.setAttribute("viewBox", "0 0 " + Wd + " " + Hd);
      var sq = 10, items = [];
      // zone helpers: map (along, across) to x,y depending on orientation
      function P(a, c) { return vertical ? [c, a] : [a, c]; }
      var L = vertical ? Hd : Wd, C = vertical ? Wd : Hd;
      // 1) scatter
      for (var i = 0; i < 52; i++) items.push({ p: P(20 + rnd() * (L * 0.28), 18 + rnd() * (C - 46)), f: rnd() > 0.5 ? "#3a332e" : "#5a514a", r: rnd() * 30 - 15 });
      // 2) ribbon (3 high)
      var rib0 = L * 0.38, ribCols = Math.floor((L * 0.24) / 12);
      for (var k = 0; k < ribCols * 3; k++) {
        var col = k % ribCols, row = Math.floor(k / ribCols);
        items.push({ p: P(rib0 + col * 12, C / 2 - 18 + row * 12), f: row === 1 ? "#d97757" : "#8f877b", r: 0 });
      }
      // 3) ordered rows in accent: like clips on a timeline (wider rects)
      var o0 = L * 0.7, lanes = 4;
      for (var ln = 0; ln < lanes; ln++) {
        var x = o0, y = 28 + ln * ((C - 70) / (lanes - 1));
        while (x < L - 20) {
          var w = 14 + Math.floor(rnd() * 3) * 10;
          if (x + w > L - 16) break;
          items.push({ p: P(x, y), w: vertical ? 10 : w, h: vertical ? w : 10, f: ln === 0 ? "#e8916f" : "#d97757", o: 1 - ln * 0.16, r: 0 });
          x += w + 4;
        }
      }
      items.forEach(function (it, n) {
        var r = document.createElementNS(NS, "rect");
        r.setAttribute("x", it.p[0].toFixed(1)); r.setAttribute("y", it.p[1].toFixed(1));
        r.setAttribute("width", it.w || sq); r.setAttribute("height", it.h || sq);
        r.setAttribute("rx", 2); r.setAttribute("fill", it.f);
        if (it.o) r.setAttribute("opacity", it.o);
        if (it.r) r.setAttribute("transform", "rotate(" + it.r.toFixed(1) + " " + (it.p[0] + 5).toFixed(1) + " " + (it.p[1] + 5).toFixed(1) + ")");
        r.style.setProperty("--i", n);
        svg.appendChild(r);
      });
      var labels = [["Material bruto", 0.02], ["Claude organiza", 0.38], ["Linha do tempo", 0.7]];
      labels.forEach(function (l) {
        var t = document.createElementNS(NS, "text");
        var pos = vertical ? [Wd - 8, L * l[1] + 24] : [L * l[1] + (l[1] < 0.1 ? 18 : 0), Hd - 4];
        t.setAttribute("x", pos[0]); t.setAttribute("y", pos[1]);
        if (vertical) t.setAttribute("text-anchor", "end");
        t.setAttribute("fill", "#bdb5a8"); t.setAttribute("font-size", vertical ? "13" : "14");
        t.setAttribute("font-family", "Hanken Grotesk, system-ui, sans-serif"); t.setAttribute("font-weight", "600");
        t.textContent = l[0];
        svg.appendChild(t);
      });
    }
    build();
    if (mq.addEventListener) mq.addEventListener("change", build);
  }

  /* ================================================ lesson progress */
  function initProgress() {
    var done = readDone();
    // home: clips + summary
    var clips = $$(".clip[data-aula]");
    if (clips.length) {
      var paint = function () {
        done = readDone();
        var firstOpen = null;
        clips.forEach(function (c) {
          var n = c.getAttribute("data-aula"), isDone = done.indexOf(n) > -1;
          c.classList.toggle("is-done", isDone);
          var lbl = $("[data-done-label]", c); if (lbl) lbl.textContent = isDone ? " (concluída)" : "";
          c.classList.remove("is-current");
          if (!isDone && !firstOpen) firstOpen = c;
        });
        if (firstOpen) firstOpen.classList.add("is-current");
        var count = $("[data-progress-count]"); if (count) count.textContent = done.length;
        var fill = $("[data-progress-fill]"); if (fill) fill.style.width = (done.length / TOTAL * 100) + "%";
        var tl = $("[data-timeline]"); if (tl) tl.style.setProperty("--progress", (done.length / TOTAL).toFixed(4));
      };
      paint();
      var reset = $("[data-progress-reset]");
      if (reset) reset.addEventListener("click", function () {
        var n = readDone().length;
        if (!n) { announce("Nenhuma aula marcada."); return; }
        if (!window.confirm("Zerar o progresso? " + n + " aula(s) concluída(s) voltarão a ficar em aberto.")) return;
        writeDone([]); paint(); announce("Progresso zerado.");
      });
      window.addEventListener("storage", paint);
    }
    // lesson page: toggle
    var btn = $("[data-done-toggle]"), current = document.body.getAttribute("data-aula");
    if (btn && current) {
      var text = $("[data-done-text]", btn);
      var sync = function () {
        var on = readDone().indexOf(current) > -1;
        btn.setAttribute("aria-pressed", String(on));
        text.textContent = on ? "Aula concluída" : "Marcar como concluída";
      };
      sync();
      btn.addEventListener("click", function () {
        var list = readDone(), i = list.indexOf(current);
        if (i > -1) list.splice(i, 1); else list.push(current);
        writeDone(list); sync(); markSwitcher();
        announce(i > -1 ? "Aula desmarcada." : "Aula marcada como concluída.");
      });
    }
  }

  /* ======================================================= switcher */
  function markSwitcher() {
    var current = document.body.getAttribute("data-aula"), done = readDone();
    $$(".switcher__grid a[data-aula]").forEach(function (a) {
      var n = a.getAttribute("data-aula");
      if (n === current) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      a.classList.toggle("is-done", done.indexOf(n) > -1);
    });
  }
  function initSwitcher() {
    var root = $("[data-switcher]"); if (!root) return;
    var btn = $("[data-switcher-toggle]", root), panel = $("#switcher-panel");
    markSwitcher();
    function set(open) {
      btn.setAttribute("aria-expanded", String(open)); panel.hidden = !open;
      if (open) document.dispatchEvent(new Event("nav:close")); // fecha o menu móvel
      if (open) { var cur = $("a[aria-current]", panel) || $("a", panel); if (cur) cur.focus(); }
    }
    btn.addEventListener("click", function () { set(btn.getAttribute("aria-expanded") !== "true"); });
    document.addEventListener("click", function (e) { if (!root.contains(e.target) && !panel.hidden) set(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) { set(false); btn.focus(); } });
  }

  /* =========================================================== copy */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy") ? res() : rej(); } catch (e) { rej(e); }
      document.body.removeChild(ta);
    });
  }
  function initCopy() {
    $$("[data-copy]").forEach(function (btn) {
      var label = $(".copy-btn__text", btn) || btn;
      btn.addEventListener("click", function () {
        var host = btn.closest("figure, .b-prompt, .b-codigo");
        var src = host && $("[data-copy-source]", host);
        if (!src) return;
        copyText(src.innerText.replace(/ /g, " ")).then(function () {
          btn.classList.add("is-copied"); label.textContent = "Copiado";
          announce("Copiado para a área de transferência.");
          clearTimeout(btn._t); btn._t = setTimeout(function () { btn.classList.remove("is-copied"); label.textContent = "Copiar"; }, 2000);
        }, function () { label.textContent = "Selecione e copie"; });
      });
    });
  }

  /* ============================================================ TOC */
  function initToc() {
    var toc = $("[data-toc]"), body = $("[data-lesson-body]"); if (!toc || !body) return;
    var list = $(".toc__list", toc);
    var heads = $$("h2[id]", body);
    if (list && !list.children.length) {
      heads.forEach(function (h) {
        var li = document.createElement("li"), a = document.createElement("a");
        a.href = "#" + h.id; a.textContent = h.textContent; li.appendChild(a); list.appendChild(li);
      });
    }
    var links = $$("a[href^='#']", toc);
    if (!("IntersectionObserver" in window) || !heads.length) return;
    var activeId = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) activeId = en.target.id; });
      links.forEach(function (a) {
        if (a.getAttribute("href") === "#" + activeId) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      });
    }, { rootMargin: "-100px 0px -65% 0px" });
    heads.forEach(function (h) { io.observe(h); });
  }

  /* ================================================== read progress */
  function initReadProgress() {
    var bar = $("[data-read-progress]"); if (!bar) return;
    var on = function () {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty("--read", h > 0 ? Math.min(1, window.scrollY / h).toFixed(4) : 0);
    };
    on(); window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
  }

  /* ========================================================= reveal */
  function initReveal() {
    var els = $$(".reveal");
    if (reduced || !("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("is-in"); }); return; }
    els.forEach(function (el) {
      var sibs = $$(":scope > .reveal, :scope > li > .reveal", el.parentElement.closest("ol, ul, div, section") || el.parentElement);
      var i = Math.max(0, sibs.indexOf(el));
      el.style.setProperty("--rd", (i % 6) * 80 + "ms");
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
