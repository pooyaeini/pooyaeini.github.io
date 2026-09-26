/* Orchestrates the scroll-driven journey: body -> heart -> great vessels -> microcirculation -> lumen. */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { beat, clamp, smooth } from "./common.js";
import { createBody } from "./body.js";
import { createHeart } from "./heart.js";
import { createArteries } from "./arteries.js";
import { createMicro } from "./micro.js";
import { createLumen } from "./lumen.js";

/* Which scene renders each stage, and the dissolve color used when leaving it. */
const STAGE_SCENE = ["body", "heart", "arteries", "micro", "lumen", "lumen", "lumen", "body"];
const VEIL = ["#5a0612", "#6d0a18", "#3a0612", "#4a040c", null, null, "#05070c", null];
const BLOOM = { body: [0.75, 0.55], heart: [0.4, 0.85], arteries: [0.8, 0.5], micro: [0.75, 0.5], lumen: [0.35, 0.82] };
const BG = { body: 0x05070c, heart: 0x06060b, arteries: 0x050509, micro: 0x04040a, lumen: 0x0c0103 };

export function createWorld(canvas, { mobile, reduced, instant, onFrame }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", alpha: false });
  let pr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
  renderer.setPixelRatio(pr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.02, 200);
  scene.add(camera);

  const opts = { mobile, reduced };
  const mods = {
    body: createBody(opts),
    heart: createHeart(opts),
    arteries: createArteries(opts),
    micro: createMicro(opts),
    lumen: createLumen(opts),
  };
  for (const k in mods) {
    mods[k].group.visible = false;
    scene.add(mods[k].group);
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), mobile ? 0.7 : 0.85, 0.6, 0.55);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const pos = new THREE.Vector3(), target = new THREE.Vector3();
  const smoothPos = new THREE.Vector3(), smoothTgt = new THREE.Vector3();
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let goal = 0, s = 0, time = 0, last = performance.now(), first = true;
  let width = 1, height = 1, offsetX = 0;
  let running = true, rafId = 0, slowFrames = 0, frameCount = 0, degraded = false;
  const bgColor = new THREE.Color();
  const lumenFog = new THREE.FogExp2(0x0c0103, 0.085);

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    bloom.resolution.set(width / 2, height / 2);
    camera.aspect = width / height;
    // On wide screens the subject sits right of center, leaving the left column for text.
    offsetX = width > 900 ? width * 0.17 : 0;
    if (offsetX) camera.setViewOffset(width, height, -offsetX, 0, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    for (const k in mods) mods[k].setPixelRatio?.(pr);
  }

  function veilFor(stage, u) {
    const next = stage + 1 < STAGE_SCENE.length ? STAGE_SCENE[stage + 1] : null;
    const prev = stage > 0 ? STAGE_SCENE[stage - 1] : null;
    let v = 0, color = VEIL[stage] || "#000";
    if (next && next !== STAGE_SCENE[stage]) v = Math.max(v, smooth(0.8, 1.0, u));
    if (prev && prev !== STAGE_SCENE[stage]) {
      const e = 1 - smooth(0.0, 0.16, u);
      if (e > v) { v = e; color = VEIL[stage - 1] || "#000"; }
    }
    return { v, color };
  }

  const project = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  function labelsFor(mod, stage, u) {
    const out = [];
    camera.getWorldDirection(camDir);
    for (const l of mod.labels || []) {
      if (!l.stages.includes(stage)) continue;
      const vis = smooth(l.range[0], l.range[0] + 0.06, u) * (1 - smooth(l.range[1] - 0.06, l.range[1], u));
      if (vis <= 0.01) continue;
      project.copy(l.pos).sub(camera.position);
      const dist = project.length();
      if (project.dot(camDir) <= 0.1) continue;
      let fade = vis;
      if (l.maxDist) fade *= 1 - smooth(l.maxDist * 0.7, l.maxDist, dist);
      if (fade <= 0.01) continue;
      project.copy(l.pos).project(camera);
      if (Math.abs(project.x) > 1.05 || Math.abs(project.y) > 1.05) continue;
      out.push({ l, x: (project.x * 0.5 + 0.5) * width, y: (-project.y * 0.5 + 0.5) * height, a: fade });
    }
    return out;
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += reduced ? dt * 0.35 : dt;

    // Critically damped approach toward the scroll position gives the cinematic glide.
    s = reduced || instant || first ? goal : s + (goal - s) * (1 - Math.exp(-dt * 3.2));
    const stage = clamp(Math.floor(s), 0, STAGE_SCENE.length - 1);
    const u = clamp(s - stage, 0, 1);
    const key = STAGE_SCENE[stage];
    const mod = mods[key];
    for (const k in mods) mods[k].group.visible = k === key;

    const b = beat(time), b2 = beat(time + 0.14);
    const state = { stage, u, beat: b, beat2: b2 };

    mod.rig(stage, u, time, pos, target);
    // Portrait screens need a wider shot so the subject stays behind, not on top of, the copy.
    if (camera.aspect < 0.85 && key !== "lumen") {
      const k = 1 + (0.85 - camera.aspect) * 1.4 * (1 - smooth(0.8, 1.0, u)) * (stage > 0 && STAGE_SCENE[stage - 1] !== key ? smooth(0.0, 0.16, u) : 1);
      pos.sub(target).multiplyScalar(k).add(target);
      target.y += key === "body" && stage === 0 ? 0.35 * (1 - smooth(0.5, 0.82, u)) : 0;
    }
    pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt * 2.5));
    pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt * 2.5));
    const par = key === "lumen" ? 0.05 : key === "micro" ? 0.12 : 0.18;
    pos.x += pointer.sx * par;
    pos.y += pointer.sy * par * 0.6;
    if (first) { smoothPos.copy(pos); smoothTgt.copy(target); first = false; }
    smoothPos.lerp(pos, reduced || instant ? 1 : 1 - Math.exp(-dt * 10));
    smoothTgt.lerp(target, reduced || instant ? 1 : 1 - Math.exp(-dt * 10));
    camera.position.copy(smoothPos);
    camera.lookAt(smoothTgt);

    const { v: veil, color } = veilFor(stage, u);
    camera.fov = 38 + veil * 22;
    camera.updateProjectionMatrix();

    bgColor.setHex(BG[key]);
    scene.background = bgColor;
    scene.fog = key === "lumen" ? lumenFog : null;
    const bl = BLOOM[key];
    bloom.strength = bl[0] * (mobile ? 0.85 : 1) + veil * 0.8;
    bloom.threshold = bl[1];

    mod.update(time, state, dt, camera);
    composer.render(dt);

    // Adaptive quality: if the device struggles, trade resolution and bloom for frame rate.
    frameCount++;
    if (!degraded && frameCount > 30) {
      slowFrames = dt > 0.034 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames > 45) {
        degraded = true;
        pr = Math.max(0.75, pr * 0.7);
        renderer.setPixelRatio(pr);
        resize();
      }
    }

    onFrame?.({ stage, u, s, veil, veilColor: color, beat: b, time, labels: labelsFor(mod, stage, u) });
  }

  resize();
  return {
    start() { last = performance.now(); rafId = requestAnimationFrame(frame); },
    setProgress(v) { goal = v; },
    setPointer(x, y) { pointer.x = x; pointer.y = y; },
    setRunning(v) { running = v; if (v) last = performance.now(); },
    resize,
    stageCount: STAGE_SCENE.length,
    dispose() { cancelAnimationFrame(rafId); renderer.dispose(); },
  };
}
