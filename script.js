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

  /* ---- Scroll-scrubbed background (video, seeked onto canvas) ---- */
  var canvas = document.getElementById("bgCanvas");
  var video = document.getElementById("bgVideo");
  if (canvas && canvas.getContext && video) {
    if (location.protocol === "file:") {
      console.warn("Background video scrubbing needs a real HTTP server (video seeking doesn't work over file://). Run a local server, or check the page on GitHub Pages.");
    }
    var ctx = canvas.getContext("2d");
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var FOCAL_X = 0.22; /* subject sits ~1/3 in from the left of each frame; keep it in view when cropping narrow/tall viewports */
    var ready = false;

    function drawFrame() {
      var w = canvas.width, h = canvas.height;
      var scale = Math.max(w / video.videoWidth, h / video.videoHeight);
      var dw = video.videoWidth * scale, dh = video.videoHeight * scale;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(video, (w - dw) * FOCAL_X, (h - dh) / 2, dw, dh);
    }

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (ready) drawFrame();
    }

    function update() {
      if (!ready) return;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var fraction = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      video.currentTime = fraction * video.duration;
    }

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { update(); ticking = false; });
    }

    video.addEventListener("seeked", drawFrame);
    video.addEventListener("loadeddata", drawFrame);
    video.addEventListener("loadedmetadata", function () {
      ready = true;
      resize();
      update();
    });

    window.addEventListener("resize", resize);
    resize();
    if (!reduceMotion) window.addEventListener("scroll", onScroll, { passive: true });
  }
})();
