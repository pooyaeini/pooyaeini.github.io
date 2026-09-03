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
  var revealTargets = document.querySelectorAll(".section, .card, .tl__item");
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

  /* ---- Scroll-scrubbed background (native video rendering) ---- */
  var video = document.getElementById("bgVideo");
  if (video) {
    if (location.protocol === "file:") {
      console.warn("Background video scrubbing needs a real HTTP server (video seeking doesn't work over file://). Run a local server, or check the page on GitHub Pages.");
    }
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var ready = false;
    var targetTime = 0;
    var ticking = false;
    var objectUrl = null;
    var FRAME_RATE = 24;
    var MAX_SEEK_STEP = 0.25;

    function updateTarget() {
      if (!ready) return;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var fraction = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      targetTime = Math.round(fraction * video.duration * FRAME_RATE) / FRAME_RATE;
      seekToTarget();
    }

    function seekToTarget() {
      if (!ready || video.seeking) return;
      var delta = targetTime - video.currentTime;
      if (Math.abs(delta) < 1 / (FRAME_RATE * 2)) return;
      var step = Math.max(-MAX_SEEK_STEP, Math.min(MAX_SEEK_STEP, delta));
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + step));
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { updateTarget(); ticking = false; });
    }

    video.addEventListener("seeked", function () {
      requestAnimationFrame(seekToTarget);
    });
    video.addEventListener("loadedmetadata", function () {
      ready = true;
      updateTarget();
    });

    /* Download once after initial page load, then scrub the in-memory copy without network stalls. */
    window.addEventListener("load", function () {
      var source = video.getAttribute("data-src");
      fetch(source, { cache: "force-cache" })
        .then(function (response) {
          if (!response.ok) throw new Error("Background video request failed");
          return response.blob();
        })
        .then(function (blob) {
          objectUrl = URL.createObjectURL(blob);
          video.src = objectUrl;
          video.load();
        })
        .catch(function () {
          /* Retain a normal streamed-video fallback if Blob loading is unavailable. */
          video.src = source;
          video.preload = "auto";
          video.load();
        });
    }, { once: true });

    window.addEventListener("pagehide", function () {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }, { once: true });

    if (!reduceMotion) window.addEventListener("scroll", onScroll, { passive: true });
  }
})();
