/* Stage 1: a sculpted, beating heart with coronary circulation and the great vessels. */
import * as THREE from "three";
import { rng, vnoise3, NOISE_GLSL, smooth, lerp } from "./common.js";
import { glowTexture } from "./body.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
const nIV = V(1, 0, -0.55).normalize();            // interventricular plane normal (toward LV)
const vAnt = new THREE.Vector3().crossVectors(nIV, Y).normalize(); // anterior groove direction
const ROT = new THREE.Euler(-0.3, 0, 0.55);
const ROTM = new THREE.Matrix4().makeRotationFromEuler(ROT);

const g2 = (d, c, r) => Math.exp(-d.distanceToSquared(c) / (r * r));
const BUMPS = [
  [V(-0.75, 0.65, 0.15).normalize(), 0.42, 0.15],  // right atrium
  [V(0.35, 0.62, -0.7).normalize(), 0.42, 0.13],   // left atrium
  [V(0.78, 0.48, 0.38).normalize(), 0.2, 0.1],     // left auricle
  [V(-0.45, 0.6, 0.66).normalize(), 0.2, 0.085],   // right auricle
  [V(-0.4, -0.15, 0.82).normalize(), 0.6, 0.06],   // right ventricle
  [V(0.55, -0.3, -0.45).normalize(), 0.7, 0.05],   // left ventricle mass
];

function shape(d) {
  let r = 1;
  const dv = d.dot(nIV);
  const iv = Math.exp(-(dv * dv) / 0.006) * smooth(0.5, 0.25, d.y);
  const av = Math.exp(-Math.pow(d.y - 0.4, 2) / 0.005);
  r -= 0.05 * iv + 0.055 * av;
  for (const [c, w, a] of BUMPS) r += a * g2(d, c, w);
  r *= 1 - 0.16 * smooth(0.72, 1.0, d.y);
  r += 0.018 * vnoise3(d.x * 3.2 + 7, d.y * 3.2, d.z * 3.2) + 0.006 * vnoise3(d.x * 11, d.y * 11 + 3, d.z * 11);
  return { r, fat: Math.max(iv, av) };
}

function place(d, extra, out) {
  const { r } = shape(d);
  out.copy(d).multiplyScalar(r + extra);
  out.y *= 1.2;
  if (out.y < 0) {
    const t = 1 + 0.36 * (out.y / 1.2);
    out.x *= t; out.z *= t;
    out.x += 0.08 * (-out.y / 1.2);
  }
  out.z *= 0.88;
  return out.applyMatrix4(ROTM);
}

function buildHeartGeometry(wSeg, hSeg) {
  const g = new THREE.SphereGeometry(1, wSeg, hSeg);
  const p = g.attributes.position;
  const fat = new Float32Array(p.count);
  const d = new THREE.Vector3(), o = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    fat[i] = shape(d).fat;
    place(d, 0, o);
    p.setXYZ(i, o.x, o.y, o.z);
  }
  g.setAttribute("aFat", new THREE.BufferAttribute(fat, 1));
  g.computeVertexNormals();
  return g;
}

/* Paths across the epicardium described in direction space, then mapped onto the surface. */
function surfaceCurve(dirs, lift = 0.012) {
  const pts = dirs.map((d) => place(d.clone().normalize(), lift, new THREE.Vector3()));
  return new THREE.CatmullRomCurve3(pts, false, "centripetal");
}
const onGroove = (axis, y) => axis.clone().multiplyScalar(Math.sqrt(1 - y * y)).add(V(0, y, 0));
const onRing = (a, y = 0.4) => V(Math.sqrt(1 - y * y) * Math.cos(a), y, Math.sqrt(1 - y * y) * Math.sin(a));
const range = (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

function coronaryCurves() {
  const main = [], branch = [];
  main.push(surfaceCurve(range(0.45, -0.97, 12).map((y) => onGroove(vAnt, y))));            // LAD
  main.push(surfaceCurve(range(1.05, -1.5, 12).map((a) => onRing(a))));                      // circumflex
  main.push(surfaceCurve(range(2.0, 4.65, 14).map((a) => onRing(a))));                       // RCA
  main.push(surfaceCurve(range(0.32, -0.75, 9).map((y) => onGroove(vAnt.clone().negate(), y)))); // PDA
  for (const y of [0.2, -0.12, -0.45]) {                                                      // diagonals
    const a = onGroove(vAnt, y);
    branch.push(surfaceCurve([a, a.clone().addScaledVector(nIV, 0.28).add(V(0, -0.12, 0)), a.clone().addScaledVector(nIV, 0.55).add(V(0, -0.28, 0))]));
  }
  for (const a0 of [0.2, -0.5]) {                                                             // obtuse marginals
    const a = onRing(a0);
    branch.push(surfaceCurve([a, onRing(a0 - 0.05, 0.05), onRing(a0 - 0.1, -0.35)]));
  }
  { const a = onRing(3.1); branch.push(surfaceCurve([a, onRing(3.05, 0.0), onRing(3.0, -0.4)])); } // acute marginal
  return { main, branch };
}

const HEART_VERT = /* glsl */ `
  uniform float uBeat, uBeat2, uTime;
  attribute float aFat;
  varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vFat; varying vec2 vUv;
  vec3 beatDisp(vec3 p){
    float vent = smoothstep(0.55, -1.0, p.y);
    float atr = smoothstep(0.25, 0.9, p.y);
    float s = 1.0 - uBeat * 0.06 * vent - uBeat2 * 0.035 * atr;
    return vec3(p.x * s, p.y * (1.0 - uBeat * 0.025 * vent), p.z * s);
  }
  void main(){
    vec3 p = beatDisp(position);
    vP = position; vFat = aFat; vUv = uv;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const HEART_FRAG = /* glsl */ `
  uniform float uTime, uBeat, uDim, uEnd;
  uniform vec3 uBase, uBase2, uFatCol, uRimCol, uGlow;
  varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vFat; varying vec2 vUv;
  ${NOISE_GLSL}
  void main(){
    vec3 n = normalize(vN);
    float nz = snoise(vP * 3.0) * 0.5 + 0.5;
    float fib = snoise(vec3(vP.x * 5.0, vP.y * 26.0 + vP.x * 6.0, vP.z * 5.0));
    float fine = snoise(vP * 22.0);
    vec3 alb = mix(uBase, uBase2, nz) * (0.9 + 0.1 * fib);
    float fatAmt = clamp(vFat * (0.75 + 0.5 * snoise(vP * 9.0)), 0.0, 1.0);
    alb = mix(alb, uFatCol * (0.85 + 0.15 * fine), fatAmt * 0.85);
    vec3 L1 = normalize(vec3(0.6, 0.8, 0.7));
    vec3 L2 = normalize(vec3(-0.9, 0.1, 0.35));
    vec3 L3 = normalize(vec3(0.0, -0.4, -1.0));
    float d1 = max((dot(n, L1) + 0.35) / 1.35, 0.0);
    float d2 = max(dot(n, L2), 0.0);
    float ndv = max(dot(n, vV), 0.0);
    vec3 h = normalize(L1 + vV);
    float spec = pow(max(dot(n, h), 0.0), 70.0) * (0.55 + 0.45 * fine) * (1.0 - fatAmt * 0.7);
    float spec2 = pow(max(dot(n, h), 0.0), 12.0) * 0.08;
    float rim = pow(1.0 - ndv, 3.0);
    vec3 col = alb * (d1 * vec3(1.0, 0.9, 0.86) * 0.95 + d2 * vec3(0.3, 0.4, 0.75) * 0.45 + 0.06);
    col += (spec * 0.4 + spec2) * vec3(1.0, 0.88, 0.88);
    col += rim * uRimCol * 0.45 + max(dot(n, L3), 0.0) * uRimCol * 0.18;
    col += uGlow * alb * uBeat * 0.35;
    float scan = smoothstep(0.012, 0.0, abs(fract(vP.y * 0.35 - uTime * 0.12) - 0.5));
    col += vec3(0.25, 0.85, 0.95) * scan * 0.25;
    col *= 1.0 - smoothstep(0.7, 1.0, vUv.x) * uEnd;
    gl_FragColor = vec4(col * uDim, 1.0);
  }
`;

function tissueMaterial(base, base2, { fat = 0xa9793c, rim = 0xff5a6a, glow = 0xff2040, end = 0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uBeat: { value: 0 }, uBeat2: { value: 0 }, uDim: { value: 1 }, uEnd: { value: end },
      uBase: { value: new THREE.Color(base) }, uBase2: { value: new THREE.Color(base2) },
      uFatCol: { value: new THREE.Color(fat) }, uRimCol: { value: new THREE.Color(rim) }, uGlow: { value: new THREE.Color(glow) },
    },
    vertexShader: HEART_VERT,
    fragmentShader: HEART_FRAG,
    side: THREE.DoubleSide,
  });
}

function vessel(points, r, mat, segs = 64) {
  const c = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const g = new THREE.TubeGeometry(c, segs, r, 24, false);
  g.setAttribute("aFat", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  return new THREE.Mesh(g, mat);
}

export const ARCH_POINT = V(0.12, 1.66, -0.12);

export function createHeart({ mobile, reduced }) {
  const group = new THREE.Group();
  const rand = rng(11);
  const myo = tissueMaterial(0x4a050d, 0x7a111b);
  const heart = new THREE.Mesh(buildHeartGeometry(mobile ? 120 : 200, mobile ? 90 : 150), myo);
  group.add(heart);

  const artMat = tissueMaterial(0xb3121f, 0xe0263a, { rim: 0xff8090, fat: 0xb3121f });
  const veinMat = tissueMaterial(0x2a2f7a, 0x3d4bb0, { rim: 0x7f9bff, fat: 0x2a2f7a });
  const { main, branch } = coronaryCurves();
  const tubeWithFat = (curve, r, m) => {
    const g = new THREE.TubeGeometry(curve, 60, r, 8, false);
    g.setAttribute("aFat", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    return new THREE.Mesh(g, m);
  };
  main.forEach((c) => group.add(tubeWithFat(c, 0.02, artMat)));
  branch.forEach((c) => group.add(tubeWithFat(c, 0.012, artMat)));
  // great cardiac vein alongside the LAD
  const gcv = surfaceCurve(range(0.42, -0.8, 10).map((y) => onGroove(vAnt.clone().addScaledVector(nIV, 0.06).normalize(), y)), 0.01);
  group.add(tubeWithFat(gcv, 0.013, veinMat));

  /* Great vessels */
  const aortaMat = tissueMaterial(0x8a1c24, 0xa8363d, { rim: 0xff7a84, fat: 0x8a1c24, end: 1 });
  const pulmMat = tissueMaterial(0x2a2a62, 0x3c3f8a, { rim: 0x7a88d8, fat: 0x2a2a62, end: 1 });
  group.add(vessel([V(-0.18, 0.6, 0.05), V(-0.24, 1.05, 0.12), V(-0.2, 1.42, 0.08), ARCH_POINT, V(0.44, 1.56, -0.36), V(0.52, 1.15, -0.56), V(0.52, 0.2, -0.62), V(0.5, -0.9, -0.6)], 0.2, aortaMat, 120));
  group.add(vessel([V(-0.1, 1.58, 0.02), V(-0.24, 1.85, 0.06), V(-0.32, 2.3, 0.08)], 0.085, aortaMat));
  group.add(vessel([V(0.14, 1.72, -0.12), V(0.14, 2.0, -0.1), V(0.12, 2.42, -0.06)], 0.07, aortaMat));
  group.add(vessel([V(0.36, 1.66, -0.28), V(0.5, 1.9, -0.3), V(0.72, 2.28, -0.3)], 0.075, aortaMat));
  group.add(vessel([V(0.08, 0.55, 0.38), V(0.1, 0.95, 0.42), V(0.12, 1.18, 0.26), V(0.45, 1.3, -0.05), V(0.95, 1.22, -0.2)], 0.17, pulmMat));
  group.add(vessel([V(0.12, 1.18, 0.26), V(-0.2, 1.24, -0.12), V(-0.6, 1.2, -0.22), V(-1.0, 1.1, -0.25)], 0.13, pulmMat));
  group.add(vessel([V(-0.6, 0.78, 0.02), V(-0.62, 1.3, 0.05), V(-0.6, 2.1, 0.06)], 0.15, pulmMat));
  group.add(vessel([V(-0.55, 0.05, -0.32), V(-0.58, -0.4, -0.36), V(-0.6, -1.0, -0.36)], 0.15, pulmMat));
  for (const [a, b] of [[V(0.45, 0.95, -0.62), V(0.95, 1.0, -0.72)], [V(0.5, 0.7, -0.66), V(1.0, 0.6, -0.78)]]) {
    group.add(vessel([a, a.clone().lerp(b, 0.5).add(V(0, 0.03, -0.05)), b], 0.07, aortaMat, 20));
  }

  /* Orbiting data ring and particulate plasma */
  const ringN = mobile ? 900 : 1800;
  const rp = new Float32Array(ringN * 3);
  for (let i = 0; i < ringN; i++) {
    const a = rand() * Math.PI * 2, R = 1.85 + (rand() - 0.5) * 0.12 + (i % 3) * 0.12;
    rp.set([Math.cos(a) * R, (rand() - 0.5) * 0.03, Math.sin(a) * R], i * 3);
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute("position", new THREE.BufferAttribute(rp, 3));
  const ringMat = new THREE.PointsMaterial({ color: 0x57d4e6, size: 0.012, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring = new THREE.Points(ringGeo, ringMat);
  ring.rotation.set(1.2, 0, 0.25);
  ring.position.y = 0.35;
  group.add(ring);

  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff1a38, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(5.5);
  glow.position.set(0, 0.2, -1.2);
  group.add(glow);

  const mats = [myo, artMat, veinMat, aortaMat, pulmMat];
  const tmp = V(0, 0, 0);
  const lbl = (dir, extra) => place(dir.clone().normalize(), extra, new THREE.Vector3());

  return {
    group,
    labels: [
      { text: "Right ventricle", sub: "Automated RV function", pos: lbl(V(-0.4, -0.2, 0.82), 0.05), stages: [1], range: [0.18, 0.8] },
      { text: "Tricuspid valve", sub: "Regurgitation grading", pos: lbl(onRing(2.3), 0.05), stages: [1], range: [0.22, 0.8] },
      { text: "Mitral valve", sub: "MR severity models", pos: lbl(onRing(0.4), 0.05), stages: [1], range: [0.26, 0.56] },
      { text: "Left atrium", sub: "Postoperative AF", pos: lbl(V(0.4, 0.66, -0.6), 0.08), stages: [1], range: [0.56, 0.8] },
      { text: "Left ventricle", sub: "Heart failure risk", pos: lbl(V(0.6, -0.55, -0.3), 0.05), stages: [1], range: [0.34, 0.8] },
    ],
    rig(stage, u, time, pos, target) {
      const ang = lerp(-0.75, 0.95, u) + (reduced ? 0 : Math.sin(time * 0.2) * 0.03);
      const emerge = 1 - smooth(0.0, 0.16, u);
      const dist = lerp(7.4, 6.1, u) - emerge * 4.2;
      target.set(0.05, lerp(0.45, 0.8, smooth(0.5, 0.9, u)), 0);
      pos.set(Math.sin(ang) * dist, lerp(0.7, 1.5, u), Math.cos(ang) * dist);
      const dive = smooth(0.8, 1.0, u);
      if (dive > 0) {
        target.lerp(ARCH_POINT, dive);
        tmp.copy(ARCH_POINT).add(V(0.05, 0.12, 0.35));
        pos.lerp(tmp, dive * 0.95);
      }
    },
    update(time, state) {
      for (const m of mats) {
        m.uniforms.uTime.value = time;
        m.uniforms.uBeat.value = state.beat;
        m.uniforms.uBeat2.value = state.beat2;
      }
      ring.rotation.z = 0.25 + time * 0.05;
      glowMat.opacity = 0.16 + state.beat * 0.12;
    },
  };
}
