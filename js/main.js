/* Pooya Eini, MD: page behavior, publication rendering, and the bridge to the 3D journey. */
import { PUBLICATIONS, UNDER_REVIEW, TERRITORIES } from "./publications.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;

/* ---------- Publications ---------- */
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const linkOf = (p) => p.url || (p.doi ? `https://doi.org/${p.doi}` : null);
function pubItem(p, compact) {
  const href = linkOf(p);
  const title = href ? `<a href="${href}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title);
  const role = p.role === "first" ? `<span class="tag tag--first">First author</span>` : `<span class="tag">Co-author</span>`;
  const cited = p.cited ? `<span class="tag tag--cite">Cited by ${p.cited}</span>` : "";
  const authors = compact ? "" : `<p class="pub__authors">${esc(p.authors)}</p>`;
  return `<li class="pub" data-t="${p.territory}" data-role="${p.role}" data-topic="${esc(p.topic)}">
    <span class="pub__year">${p.year}</span>
    <div class="pub__body">
      <h4 class="pub__title">${title}</h4>
      ${authors}
      <p class="pub__meta"><em>${esc(p.journal)}</em> ${esc(p.cite)}${p.doi ? ` · <span class="pub__doi">doi:${esc(p.doi)}</span>` : ""}</p>
      <div class="pub__tags">${role}<span class="tag tag--topic">${esc(p.topic)}</span>${cited}</div>
    </div>
  </li>`;
}
const byDate = (a, b) => b.year - a.year || (a.role === "first" ? -1 : 1);
$$(".papers").forEach((ol) => {
  const t = ol.dataset.territory;
  ol.innerHTML = PUBLICATIONS.filter((p) => p.territory === t).sort(byDate).map((p) => pubItem(p, true)).join("");
  const ur = UNDER_REVIEW.filter((p) => p.territory === t);
  if (ur.length) ol.insertAdjacentHTML("beforeend", ur.map((p) => `<li class="pub pub--review"><span class="pub__year">Under review</span><div class="pub__body"><h4 class="pub__title">${esc(p.title)}</h4></div></li>`).join(""));
});
const index = $("#pubIndex");
index.innerHTML = PUBLICATIONS.slice().sort(byDate).map((p) => pubItem(p, false)).join("");
$("#underReview").innerHTML = UNDER_REVIEW.map((p) => `<li><span>${TERRITORIES[p.territory]}</span>${esc(p.title)}</li>`).join("");

let terr = "all", topic = null;
function applyFilter() {
  const first = $("#firstOnly").checked;
  $$(".pub", index).forEach((li) => {
    const ok = (terr === "all" || li.dataset.t === terr) && (!first || li.dataset.role === "first") && (!topic || li.dataset.topic === topic);
    li.hidden = !ok;
  });
  $$("#terrFilter .chipbtn").forEach((b) => b.classList.toggle("is-on", b.dataset.f === terr));
}
$$("#terrFilter .chipbtn").forEach((b) => b.addEventListener("click", () => { terr = b.dataset.f; topic = null; applyFilter(); }));
$("#firstOnly").addEventListener("change", applyFilter);

/* Disease atlas: one entry per condition, counting the work behind it */
const topics = {};
for (const p of PUBLICATIONS) (topics[p.topic] ||= { n: 0, t: p.territory }).n++;
$("#atlas").innerHTML = Object.entries(topics)
  .sort((a, b) => b[1].n - a[1].n)
  .map(([k, v]) => `<li><button data-topic="${esc(k)}" data-t="${v.t}"><span class="atlas__n">${String(v.n).padStart(2, "0")}</span><span class="atlas__k">${esc(k)}</span><span class="atlas__t">${TERRITORIES[v.t]}</span></button></li>`)
  .join("");
$$("#atlas button").forEach((b) => b.addEventListener("click", () => {
  terr = b.dataset.t; topic = b.dataset.topic; $("#firstOnly").checked = false;
  applyFilter();
  $("#index").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
}));

$("#year").textContent = new Date().getFullYear();

/* ---------- Reveal + counters ---------- */
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { threshold: 0.08, rootMargin: "0px 0px -8% 0px" });
  $$(".reveal").forEach((el) => io.observe(el));
  const so = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    so.unobserve(e.target);
    const el = e.target, n = +el.dataset.count, suffix = el.dataset.suffix || "";
    if (reduced) return;
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 1400); el.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))) + suffix; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), { threshold: 0.6 });
  $$("[data-count]").forEach((el) => so.observe(el));
} else {
  $$(".reveal").forEach((el) => el.classList.add("is-in"));
}

/* ---------- Scroll to journey progress ---------- */
const stages = $$(".stage").sort((a, b) => a.dataset.stage - b.dataset.stage);
let bounds = [];
function measure() {
  const vh = window.innerHeight;
  bounds = stages.map((el) => el.getBoundingClientRect().top + window.scrollY);
  bounds[0] = vh * 0.5;
  bounds.push(Math.max(bounds[bounds.length - 1] + 1, document.documentElement.scrollHeight - vh * 0.5));
}
function progress() {
  const ref = window.scrollY + window.innerHeight * 0.5;
  for (let k = 0; k < stages.length; k++) {
    if (ref < bounds[k + 1] || k === stages.length - 1) {
      return Math.max(0, Math.min(stages.length - 0.0001, k + (ref - bounds[k]) / (bounds[k + 1] - bounds[k])));
    }
  }
  return 0;
}

const STAGE_NAMES = ["Organism", "Heart", "Great vessels", "Microcirculation", "Lumen", "Atherosclerosis", "Thrombosis", "Evidence"];
const STAGE_SCALE = ["10<sup>0</sup> m", "10<sup>&minus;1</sup> m", "10<sup>&minus;2</sup> m", "10<sup>&minus;4</sup> m", "10<sup>&minus;5</sup> m", "10<sup>&minus;5</sup> m", "10<sup>&minus;6</sup> m", "10<sup>0</sup> m"];
const rail = $$(".rail a");
const hudStage = $("#hudStage"), hudScale = $("#hudScale");
let lastStage = -1;
function setStageUI(stage) {
  if (stage === lastStage) return;
  lastStage = stage;
  hudStage.textContent = STAGE_NAMES[stage];
  hudScale.innerHTML = STAGE_SCALE[stage];
  rail.forEach((a) => a.classList.toggle("is-on", +a.dataset.rail === stage));
  document.body.dataset.stage = stage;
}

/* ---------- ECG readout, locked to the rendered cardiac cycle ---------- */
const ecg = $("#ecg"), ex = ecg.getContext("2d");
const ecgWave = (ph) => {
  const g = (c, w, a) => a * Math.exp(-Math.pow((ph - c) / w, 2));
  return g(0.9, 0.035, 0.12) + g(0.985, 0.006, -0.12) + g(0.0, 0.009, 1) + g(1.0, 0.009, 1) + g(0.018, 0.008, -0.28) + g(0.25, 0.05, 0.25);
};
const trace = new Float32Array(200);
let head = 0;
function drawEcg(time) {
  const ph = (time / 0.94) % 1;
  trace[head] = ecgWave(ph);
  head = (head + 1) % trace.length;
  const w = ecg.width, h = ecg.height;
  ex.clearRect(0, 0, w, h);
  ex.lineWidth = 1.5;
  ex.strokeStyle = "#ff4d63";
  ex.shadowColor = "#ff2b45";
  ex.shadowBlur = 6;
  ex.beginPath();
  for (let i = 0; i < trace.length; i++) {
    const v = trace[(head + i) % trace.length];
    const x = (i / trace.length) * w, y = h * 0.66 - v * h * 0.55;
    i ? ex.lineTo(x, y) : ex.moveTo(x, y);
  }
  ex.stroke();
}

/* ---------- Labels projected from the 3D scene ---------- */
const labelLayer = $("#labels");
const labelEls = new Map();
function drawLabels(list) {
  const seen = new Set();
  for (const { l, x, y, a } of list) {
    let el = labelEls.get(l);
    if (!el) {
      el = document.createElement("div");
      el.className = "label";
      el.innerHTML = `<i></i><span><b>${l.text}</b><em>${l.sub}</em></span>`;
      labelLayer.appendChild(el);
      labelEls.set(l, el);
    }
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    el.style.opacity = a.toFixed(3);
    seen.add(l);
  }
  for (const [l, el] of labelEls) if (!seen.has(l)) el.style.opacity = "0";
}

/* ---------- Boot the WebGL journey ---------- */
const veil = $("#veil");
const loader = $("#loader");
const finishLoading = () => { document.body.classList.remove("is-loading"); loader.classList.add("is-done"); };
setTimeout(finishLoading, 6000);

function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); } catch { return false; }
}

async function boot() {
  measure();
  if (!hasWebGL()) { document.body.classList.add("no-gl"); finishLoading(); return; }
  let world;
  try {
    const { createWorld } = await import("./gl/world.js");
    world = createWorld($("#gl"), {
      mobile, reduced, instant: /[?&]instant\b/.test(location.search),
      onFrame({ stage, veil: v, veilColor, labels, time }) {
        veil.style.opacity = v.toFixed(3);
        if (v > 0.01) veil.style.setProperty("--veil", veilColor);
        drawLabels(labels);
        drawEcg(time);
        setStageUI(stage);
      },
    });
  } catch (err) {
    console.error(err);
    document.body.classList.add("no-gl");
    finishLoading();
    return;
  }
  const onScroll = () => world.setProgress(progress());
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => { measure(); world.resize(); onScroll(); });
  new ResizeObserver(() => { measure(); onScroll(); }).observe(document.body);
  if (!mobile) window.addEventListener("pointermove", (e) => world.setPointer((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1)), { passive: true });
  document.addEventListener("visibilitychange", () => world.setRunning(!document.hidden));
  onScroll();
  world.start();
  requestAnimationFrame(() => requestAnimationFrame(finishLoading));
}
boot();

/* Keep stage UI alive without WebGL */
window.addEventListener("scroll", () => { if (document.body.classList.contains("no-gl")) setStageUI(Math.min(7, Math.floor(progress()))); }, { passive: true });
