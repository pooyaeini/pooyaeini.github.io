/* ============================================================
   Dr. Pooya Eini — site interactions
   ============================================================ */
(function () {
  "use strict";

  /* ---- Publication filter ---- */
  var filterBtns = document.querySelectorAll(".pubfilter__btn");
  var pubs = document.querySelectorAll(".pub");
  filterBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var f = btn.getAttribute("data-filter");
      filterBtns.forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      pubs.forEach(function (p) {
        var cats = p.getAttribute("data-cat") || "";
        var show = f === "all" || cats.indexOf(f) !== -1;
        p.classList.toggle("is-hidden", !show);
      });
    });
  });

  /* ---- Scroll reveal ---- */
  var revealTargets = document.querySelectorAll(".section, .card, .pub, .tl__item");
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    revealTargets.forEach(function (el) { el.setAttribute("data-reveal", ""); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealTargets.forEach(function (el) { io.observe(el); });
  }

  /* ---- Animated stat counters ---- */
  var stats = document.querySelectorAll(".stat__num[data-count]");
  function animateStat(el) {
    var target = parseInt(el.getAttribute("data-count"), 10);
    var suffix = /\+/.test(el.textContent) ? "+" : "";
    var start = null;
    var dur = 1300;
    function step(ts) {
      if (!start) start = ts;
      var prog = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - prog, 3);
      el.textContent = Math.round(eased * target) + suffix;
      if (prog < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window) {
    var statObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { animateStat(entry.target); statObs.unobserve(entry.target); }
      });
    }, { threshold: 0.6 });
    stats.forEach(function (el) { statObs.observe(el); });
  }

  /* ---- Footer year ---- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---- Scroll-scrubbed background (assets/bg frame sequence) ---- */
  var FRAME_COUNT = 241;
  var canvas = document.getElementById("bgCanvas");
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext("2d");
    var cache = new Array(FRAME_COUNT + 1);
    var currentFrame = -1;
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function frameSrc(n) {
      var padded = ("000" + n).slice(-3);
      return "assets/bg/ezgif-frame-" + padded + ".jpg";
    }

    var FOCAL_X = 0.22; /* subject sits ~1/3 in from the left of each frame; keep it in view when cropping narrow/tall viewports */

    function drawFrame(img) {
      var w = canvas.width, h = canvas.height;
      var scale = Math.max(w / img.width, h / img.height);
      var dw = img.width * scale, dh = img.height * scale;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, (w - dw) * FOCAL_X, (h - dh) / 2, dw, dh);
    }

    function loadFrame(n, draw) {
      if (cache[n]) { if (draw) drawFrame(cache[n]); return; }
      var img = new Image();
      img.onload = function () { cache[n] = img; if (draw && n === currentFrame) drawFrame(img); };
      img.src = frameSrc(n);
    }

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (cache[currentFrame]) drawFrame(cache[currentFrame]);
    }

    function update() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var fraction = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      var frame = Math.min(FRAME_COUNT, Math.max(1, Math.round(fraction * (FRAME_COUNT - 1)) + 1));
      if (frame === currentFrame) return;
      currentFrame = frame;
      loadFrame(frame, true);
      for (var i = 1; i <= 2; i++) {
        if (frame + i <= FRAME_COUNT) loadFrame(frame + i, false);
        if (frame - i >= 1) loadFrame(frame - i, false);
      }
    }

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { update(); ticking = false; });
    }

    resize();
    window.addEventListener("resize", resize);
    if (!reduceMotion) {
      window.addEventListener("scroll", onScroll, { passive: true });
      update();
    } else {
      currentFrame = 1;
      loadFrame(1, true);
    }
  }
})();
