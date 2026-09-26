/* Stage 0 / outro: holographic human figure with a pulsing heart and a live arterial tree. */
import * as THREE from "three";
import { rng, flowMaterial, POINT_FRAG, smooth, lerp } from "./common.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------- Signed distance field of a stylized adult figure (meters, feet at y = 0) ---------- */
function sdEllipsoid(px, py, pz, c, r) {
  const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2];
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const x2 = x / r[0], y2 = y / r[1], z2 = z / r[2];
  const k1 = Math.sqrt(x2 * x2 + y2 * y2 + z2 * z2);
  return (k0 * (k0 - 1)) / (k1 || 1e-6);
}
function sdCone(px, py, pz, a, b, r1, r2) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const qx = px - a[0], qy = py - a[1], qz = pz - a[2];
  const h = Math.min(1, Math.max(0, (qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz)));
  const dx = qx - bx * h, dy = qy - by * h, dz = qz - bz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (r1 + (r2 - r1) * h);
}
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

const PARTS = [];
const E = (c, r) => PARTS.push((x, y, z) => sdEllipsoid(x, y, z, c, r));
const C = (a, b, r1, r2) => PARTS.push((x, y, z) => sdCone(x, y, z, a, b, r1, r2 ?? r1));
// head, jaw, neck
E([0, 1.64, 0.005], [0.083, 0.108, 0.098]);
E([0, 1.57, 0.03], [0.062, 0.05, 0.06]);
C([0, 1.47, -0.005], [0, 1.56, 0.0], 0.052, 0.048);
// thorax, abdomen, pelvis
E([0, 1.3, 0.0], [0.165, 0.19, 0.105]);
E([0, 1.07, 0.005], [0.14, 0.17, 0.092]);
E([0, 0.93, -0.005], [0.165, 0.11, 0.1]);
E([0, 1.2, 0.07], [0.14, 0.1, 0.05]);
// shoulders + arms
C([-0.16, 1.425, -0.01], [0.16, 1.425, -0.01], 0.058);
for (const s of [-1, 1]) {
  C([s * 0.195, 1.405, -0.01], [s * 0.255, 1.13, -0.01], 0.05, 0.04);
  C([s * 0.255, 1.13, -0.01], [s * 0.3, 0.87, 0.03], 0.038, 0.029);
  E([s * 0.312, 0.8, 0.04], [0.024, 0.07, 0.042]);
  // legs
  C([s * 0.09, 0.9, 0.0], [s * 0.1, 0.5, 0.005], 0.078, 0.05);
  C([s * 0.1, 0.5, 0.005], [s * 0.105, 0.1, -0.015], 0.05, 0.032);
  C([s * 0.105, 0.045, -0.03], [s * 0.115, 0.03, 0.11], 0.034, 0.028);
}

function bodySDF(x, y, z) {
  let d = 1e9;
  for (let i = 0; i < PARTS.length; i++) d = smin(d, PARTS[i](x, y, z), 0.045);
  return d;
}

function sampleBody(count, rand) {
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const rnd = new Float32Array(count);
  const e = 0.002;
  let n = 0, guard = 0;
  while (n < count && guard++ < count * 60) {
    let x = (rand() - 0.5) * 0.8, y = rand() * 1.8, z = (rand() - 0.5) * 0.36;
    let d = bodySDF(x, y, z);
    if (Math.abs(d) > 0.05) continue;
    let gx = 0, gy = 0, gz = 0;
    for (let it = 0; it < 3; it++) {
      gx = bodySDF(x + e, y, z) - bodySDF(x - e, y, z);
      gy = bodySDF(x, y + e, z) - bodySDF(x, y - e, z);
      gz = bodySDF(x, y, z + e) - bodySDF(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1;
      gx /= gl; gy /= gl; gz /= gl;
      x -= gx * d; y -= gy * d; z -= gz * d;
      d = bodySDF(x, y, z);
    }
    if (Math.abs(d) > 0.004) continue;
    const j = (rand() - 0.5) * 0.004;
    pos.set([x + gx * j, y + gy * j, z + gz * j], n * 3);
    nor.set([gx, gy, gz], n * 3);
    rnd[n] = rand();
    n++;
  }
  return { pos: pos.subarray(0, n * 3), nor: nor.subarray(0, n * 3), rnd: rnd.subarray(0, n) };
}

/* Central arteries (patient left = +x, anterior = +z). */
export const HEART_POS = V(0.035, 1.3, 0.05);
function arterialPaths() {
  const arch = [V(0.03, 1.33, 0.05), V(0.02, 1.41, 0.05), V(0.0, 1.455, 0.02), V(0.035, 1.44, -0.03), V(0.04, 1.36, -0.05)];
  const desc = [V(0.04, 1.36, -0.05), V(0.03, 1.2, -0.055), V(0.01, 1.05, -0.04), V(0.0, 0.94, -0.02)];
  const P = [
    arch, desc,
    [V(0.0, 1.455, 0.02), V(-0.03, 1.5, 0.02), V(-0.035, 1.58, 0.03), V(-0.045, 1.66, 0.02), V(-0.03, 1.72, 0.0)],
    [V(0.015, 1.455, 0.0), V(0.035, 1.52, 0.02), V(0.04, 1.6, 0.03), V(0.045, 1.67, 0.02), V(0.03, 1.73, 0.0)],
    [V(0.0, 1.29, 0.04), V(-0.02, 1.33, 0.06), V(-0.04, 1.36, 0.07)],
  ];
  for (const s of [-1, 1]) {
    P.push([V(s * 0.01, 1.45, 0.0), V(s * 0.09, 1.44, 0.0), V(s * 0.19, 1.4, -0.01), V(s * 0.23, 1.26, -0.01), V(s * 0.255, 1.12, 0.0), V(s * 0.28, 0.98, 0.02), V(s * 0.305, 0.84, 0.04)]);
    P.push([V(0.0, 0.94, -0.02), V(s * 0.05, 0.9, 0.0), V(s * 0.085, 0.8, 0.02), V(s * 0.095, 0.62, 0.02), V(s * 0.1, 0.46, 0.0), V(s * 0.1, 0.25, -0.02), V(s * 0.105, 0.08, 0.0), V(s * 0.11, 0.04, 0.09)]);
    P.push([V(0.01, 1.1, -0.045), V(s * 0.05, 1.09, -0.04), V(s * 0.08, 1.08, -0.03)]);
  }
  return P.map((pts) => new THREE.CatmullRomCurve3(pts, false, "centripetal"));
}

export function createBody({ mobile, reduced }) {
  const group = new THREE.Group();
  const rand = rng(7);

  /* Holographic point shell */
  const data = sampleBody(mobile ? 16000 : 32000, rand);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(data.pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(data.nor, 3));
  geo.setAttribute("aRand", new THREE.BufferAttribute(data.rnd, 1));
  const pointsMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uScan: { value: 0 },
      uSize: { value: mobile ? 22 : 20 },
      uPR: { value: 1 },
      uHeart: { value: HEART_POS.clone() },
      uBeat: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aRand;
      uniform float uTime, uOpacity, uScan, uSize, uPR, uBeat;
      uniform vec3 uHeart;
      varying vec3 vColor; varying float vAlpha;
      void main(){
        vec3 p = position;
        float breathe = sin(uTime * 1.3) * 0.004 * smoothstep(0.9, 1.35, p.y) * smoothstep(1.55, 1.35, p.y);
        p += normal * (breathe + sin(uTime * 2.0 + aRand * 40.0) * 0.0012);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        float rim = 1.0 - abs(dot(n, normalize(-mv.xyz)));
        float scan = exp(-pow((p.y - uScan) * 22.0, 2.0));
        float hd = distance(p, uHeart);
        float heartGlow = exp(-hd * hd * 90.0) * (0.4 + uBeat);
        vec3 cool = mix(vec3(0.20, 0.55, 0.95), vec3(0.36, 0.9, 0.95), smoothstep(0.2, 1.7, p.y));
        vColor = cool * (0.07 + 0.75 * pow(rim, 2.6)) + vec3(0.5, 0.9, 1.0) * scan * 0.45 + vec3(1.0, 0.15, 0.22) * heartGlow * 0.8;
        vAlpha = uOpacity * (0.35 + 0.65 * aRand);
        gl_PointSize = uSize * uPR * (0.55 + aRand * 0.7) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: POINT_FRAG,
  });
  const points = new THREE.Points(geo, pointsMat);
  group.add(points);

  /* Pedestal rings */
  const ringGeo = new THREE.BufferGeometry();
  const ringPts = [];
  for (let r = 0; r < 3; r++) {
    const R = 0.34 + r * 0.14, n = 180 + r * 60;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ringPts.push(Math.cos(a) * R, 0.0, Math.sin(a) * R);
    }
  }
  ringGeo.setAttribute("position", new THREE.Float32BufferAttribute(ringPts, 3));
  const ringMat = new THREE.PointsMaterial({ color: 0x3fb6d8, size: 0.008, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const rings = new THREE.Points(ringGeo, ringMat);
  group.add(rings);

  /* Arterial (red) and venous (blue) trees with traveling pulse waves */
  const art = flowMaterial({ color: 0xff2a3d, rim: 0xff5566, speed: 1.1, wave: 1.4 });
  const ven = flowMaterial({ color: 0x3a6dff, rim: 0x5b8cff, pulse: 0.25, speed: 0.35, wave: 1.0, opacity: 0.55 });
  const vessels = new THREE.Group();
  arterialPaths().forEach((curve, i) => {
    const r = i < 2 ? 0.0085 : 0.0048;
    vessels.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, r, 6, false), art));
    const shifted = new THREE.CatmullRomCurve3(curve.points.map((p) => p.clone().add(V(-0.014, 0, 0.006))), false, "centripetal");
    vessels.add(new THREE.Mesh(new THREE.TubeGeometry(shifted, 60, r * 0.8, 5, false), ven));
  });
  group.add(vessels);

  /* The heart itself: a bright beating core */
  const heartMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.25, 0.35), transparent: true });
  const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 3), heartMat);
  heart.position.copy(HEART_POS);
  heart.scale.set(0.9, 1.1, 0.85);
  heart.rotation.z = 0.5;
  group.add(heart);
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff3048, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Sprite(glowMat);
  glow.position.copy(HEART_POS);
  group.add(glow);

  /* Ambient particulate field */
  const dustN = mobile ? 500 : 1200;
  const dust = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    dust[i * 3] = (rand() - 0.5) * 6;
    dust[i * 3 + 1] = rand() * 3.2 - 0.4;
    dust[i * 3 + 2] = (rand() - 0.5) * 5 - 1;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dust, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0x5aa9d6, size: 0.012, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  group.add(new THREE.Points(dustGeo, dustMat));

  const mats = [pointsMat, art, ven];
  const tmp = new THREE.Vector3();

  return {
    group,
    labels: [
      { text: "Heart", sub: "Cardiac imaging AI", pos: HEART_POS.clone().add(V(0.06, 0.02, 0.05)), stages: [0], range: [0.35, 0.9] },
      { text: "Carotid arteries", sub: "Plaque detection", pos: V(0.045, 1.6, 0.03), stages: [0], range: [0.45, 0.9] },
      { text: "Abdominal aorta", sub: "Aneurysm biomarkers", pos: V(0.0, 1.03, -0.04), stages: [0], range: [0.5, 0.9] },
    ],
    setPixelRatio(pr) { pointsMat.uniforms.uPR.value = pr; },
    /* Camera rig: stage 0 zooms from full figure to the chest, stage 7 is a calm, distant orbit. */
    rig(stage, u, time, pos, target) {
      if (stage === 0) {
        const z = smooth(0.0, 0.82, u);
        const ang = lerp(-0.42, 0.38, u) + (reduced ? 0 : Math.sin(time * 0.15) * 0.04);
        const dist = lerp(3.3, 1.25, z);
        const ty = lerp(0.98, 1.3, z);
        target.set(lerp(0, HEART_POS.x, z), ty, lerp(0, HEART_POS.z, z));
        pos.set(target.x + Math.sin(ang) * dist, ty + lerp(0.1, 0.06, z), target.z + Math.cos(ang) * dist);
        const dive = smooth(0.82, 1.0, u);
        if (dive > 0) {
          tmp.copy(HEART_POS);
          target.lerp(tmp, dive);
          pos.lerp(tmp.add(V(0.02, 0.0, 0.12)), dive * 0.92);
        }
      } else {
        const ang = 0.6 + u * 0.8 + (reduced ? 0 : time * 0.03);
        const dist = 3.8;
        target.set(0, 1.0, 0);
        pos.set(Math.sin(ang) * dist, 1.2, Math.cos(ang) * dist);
      }
    },
    update(time, state) {
      const b = state.beat;
      for (const m of mats) m.uniforms.uTime.value = time;
      pointsMat.uniforms.uBeat.value = b;
      pointsMat.uniforms.uScan.value = ((time * 0.22) % 1.3) * 1.9 - 0.1;
      const dim = state.stage === 7 ? 0.45 : 1;
      pointsMat.uniforms.uOpacity.value = dim;
      art.uniforms.uOpacity.value = dim;
      ven.uniforms.uOpacity.value = 0.55 * dim;
      ringMat.opacity = 0.55 * dim;
      const s = 1 + b * 0.18;
      heart.scale.set(0.9 * s, 1.1 * s, 0.85 * s);
      glow.scale.setScalar(0.22 + b * 0.12);
      glowMat.opacity = (0.55 + b * 0.45) * dim;
      if (!reduced) group.rotation.y = Math.sin(time * 0.1) * 0.05;
    },
  };
}

let _glow;
export function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.2, "rgba(255,255,255,0.55)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.12)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}
