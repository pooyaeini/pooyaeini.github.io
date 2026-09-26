/* Stage 2: the aorta and its branches, with carotid plaque, a dissection flap and an abdominal aneurysm. */
import * as THREE from "three";
import { rng, PathTable, variableTube, POINT_FRAG, smooth, lerp } from "./common.js";
import { glowTexture } from "./body.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const curve = (pts) => new THREE.CatmullRomCurve3(pts, false, "centripetal");

const VESSEL_VERT = /* glsl */ `
  attribute float aShade;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vShade; varying float vDepth;
  void main(){
    vUv = uv; vShade = aShade;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const VESSEL_FRAG = /* glsl */ `
  uniform float uTime, uOpacity, uWave;
  uniform vec3 uColor, uRim, uPath;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vShade; varying float vDepth;
  void main(){
    float ndv = abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(1.0 - ndv, 2.4);
    float w = fract(vUv.x * uWave - uTime * 0.85);
    float pulse = pow(w, 12.0);
    float ring = smoothstep(0.08, 0.0, abs(fract(vUv.x * uWave * 14.0) - 0.5) - 0.44) * 0.12;
    vec3 base = mix(uColor, uPath, vShade);
    vec3 rimC = mix(uRim, uPath * 1.4, vShade);
    vec3 col = base * (0.05 + 0.3 * rim) + rimC * (rim * 0.85 + pulse * 0.7 + ring * 0.6);
    col *= smoothstep(26.0, 6.0, vDepth) * 0.85 + 0.15;
    gl_FragColor = vec4(col * uOpacity, 1.0);
  }
`;

function vesselMaterial(color, rim, path = 0xd9892e, wave = 1.6) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uOpacity: { value: 1 }, uWave: { value: wave },
      uColor: { value: new THREE.Color(color) }, uRim: { value: new THREE.Color(rim) }, uPath: { value: new THREE.Color(path) },
    },
    vertexShader: VESSEL_VERT, fragmentShader: VESSEL_FRAG,
  });
}

export const RENAL_END = V(1.35, -0.55, -0.35);

export function createArteries({ mobile, reduced }) {
  const group = new THREE.Group();
  const rand = rng(23);

  const aorta = curve([
    V(-0.3, 3.2, 0.45), V(-0.48, 4.05, 0.5), V(-0.22, 4.72, 0.25), V(0.32, 4.88, -0.18), V(0.7, 4.45, -0.5),
    V(0.78, 3.4, -0.6), V(0.62, 1.6, -0.55), V(0.3, 0.1, -0.3), V(0.1, -1.4, -0.1), V(0.02, -2.9, 0.0), V(0.0, -3.6, 0.0),
  ]);
  const aortaT = new PathTable(aorta, mobile ? 260 : 420);
  // locate the infrarenal segment (y ~ -2) for the aneurysm, and the thoracic segment for the flap
  let uAAA = 0, best = 1e9;
  for (let i = 0; i <= aortaT.n; i++) {
    const d = Math.abs(aortaT.P[i * 3 + 1] + 2.05);
    if (d < best) { best = d; uAAA = i / aortaT.n; }
  }
  const aaa = (u) => Math.exp(-Math.pow((u - uAAA) / 0.045, 2));
  const aortaR = (u) => lerp(0.3, 0.2, u) * (1 + 1.25 * aaa(u));

  const branches = [
    { pts: [V(-0.1, 4.8, 0.12), V(-0.35, 5.35, 0.15), V(-0.45, 6.2, 0.2), V(-0.5, 7.2, 0.22)], r: [0.13, 0.1] },       // brachiocephalic + R CCA
    { pts: [V(-0.35, 5.35, 0.15), V(-1.0, 5.6, 0.12), V(-1.8, 5.3, 0.0), V(-2.6, 4.8, 0.0)], r: [0.1, 0.07] },         // R subclavian
    { pts: [V(0.2, 4.92, -0.08), V(0.33, 6.0, 0.0), V(0.4, 7.2, 0.1)], r: [0.1, 0.095], carotid: true },               // L CCA
    { pts: [V(0.4, 7.2, 0.1), V(0.34, 7.8, -0.08), V(0.32, 8.8, -0.12)], r: [0.1, 0.075] },                            // L ICA
    { pts: [V(0.4, 7.2, 0.1), V(0.6, 7.8, 0.32), V(0.7, 8.6, 0.45)], r: [0.08, 0.05] },                                // L ECA
    { pts: [V(-0.5, 7.2, 0.22), V(-0.45, 7.8, 0.05), V(-0.44, 8.8, 0.0)], r: [0.095, 0.075] },                          // R ICA
    { pts: [V(-0.5, 7.2, 0.22), V(-0.72, 7.8, 0.42), V(-0.8, 8.6, 0.5)], r: [0.075, 0.05] },                           // R ECA
    { pts: [V(0.55, 4.75, -0.38), V(1.0, 5.4, -0.32), V(1.9, 5.2, -0.2), V(2.7, 4.7, -0.1)], r: [0.11, 0.07] },        // L subclavian
    { pts: [V(0.34, 0.35, -0.32), V(0.4, 0.5, 0.25), V(0.7, 0.55, 0.6), V(1.3, 0.7, 0.7)], r: [0.09, 0.06] },          // celiac
    { pts: [V(0.28, 0.0, -0.28), V(0.35, -0.3, 0.45), V(0.4, -1.4, 0.75), V(0.35, -2.6, 0.8)], r: [0.09, 0.06] },      // SMA
    { pts: [V(0.24, -0.35, -0.24), V(0.75, -0.42, -0.3), RENAL_END], r: [0.085, 0.07] },                               // L renal
    { pts: [V(0.22, -0.4, -0.24), V(-0.4, -0.5, -0.3), V(-1.25, -0.6, -0.35)], r: [0.085, 0.07] },                    // R renal
    { pts: [V(0.0, -3.55, 0.0), V(0.55, -4.5, 0.1), V(0.85, -5.8, 0.2), V(0.95, -7.0, 0.25)], r: [0.17, 0.13] },     // L iliac
    { pts: [V(0.0, -3.55, 0.0), V(-0.55, -4.5, 0.1), V(-0.85, -5.8, 0.2), V(-0.95, -7.0, 0.25)], r: [0.17, 0.13] },  // R iliac
  ];

  const mat = vesselMaterial(0x9b1022, 0xff3d52);
  const radial = mobile ? 28 : 48;
  group.add(new THREE.Mesh(variableTube(aortaT, radial, (u) => aortaR(u), (u) => Math.min(1, aaa(u) * 1.2)), mat));

  const flows = [{ table: aortaT, r: aortaR, n: mobile ? 700 : 1500 }];
  for (const b of branches) {
    const t = new PathTable(curve(b.pts), 90);
    const rf = (u) => lerp(b.r[0], b.r[1], u);
    const shade = b.carotid ? (u) => smooth(0.72, 1.0, u) : () => 0;
    group.add(new THREE.Mesh(variableTube(t, 20, rf, shade), mat));
    flows.push({ table: t, r: rf, n: Math.round(t.length * b.r[0] * (mobile ? 250 : 520)) });
  }

  /* Carotid bulb plaque: an amber lipid-rich lesion at the bifurcation */
  const plaqueMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.95, 0.35), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const plaque = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), plaqueMat);
  plaque.position.set(0.44, 7.08, 0.03);
  plaque.scale.set(0.7, 1.7, 0.8);
  group.add(plaque);

  /* Dissection flap: a helical intimal tear spiraling down the thoracic aorta */
  const flapPts = [];
  const P = V(0, 0, 0), N = V(0, 0, 0), Bn = V(0, 0, 0);
  for (let i = 0; i <= 120; i++) {
    const u = lerp(0.36, 0.56, i / 120);
    aortaT.point(u, P); aortaT.normal(u, N); aortaT.binormal(u, Bn);
    const a = i * 0.09, r = aortaR(u) * 0.62;
    flapPts.push(P.clone().addScaledVector(N, Math.cos(a) * r).addScaledVector(Bn, Math.sin(a) * r));
  }
  const flapMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.4, 1.5), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve(flapPts), 240, 0.012, 5, false), flapMat));
  const flapMid = V(0, 0, 0); aortaT.point(0.46, flapMid);
  const aaaPos = V(0, 0, 0); aortaT.point(uAAA, aaaPos);

  /* Intraluminal flow: particles advected along each vessel with a pulsatile velocity */
  const total = flows.reduce((s, f) => s + f.n, 0);
  const fpos = new Float32Array(total * 3);
  const fcol = new Float32Array(total * 3);
  const seeds = [];
  let k = 0;
  for (const f of flows) {
    f.start = k; f.phase = 0;
    for (let i = 0; i < f.n; i++, k++) {
      seeds.push({ u: rand(), a: rand() * Math.PI * 2, r: Math.sqrt(rand()) * 0.82, v: 0.7 + rand() * 0.6 });
      const c = 0.6 + rand() * 0.5;
      fcol.set([1.6 * c, 0.22 * c, 0.2 * c], k * 3);
    }
  }
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute("position", new THREE.BufferAttribute(fpos, 3).setUsage(THREE.DynamicDrawUsage));
  fgeo.setAttribute("color", new THREE.BufferAttribute(fcol, 3));
  const fmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uSize: { value: 26 }, uPR: { value: 1 }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 color; uniform float uSize, uPR, uOpacity;
      varying vec3 vColor; varying float vAlpha;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vColor = color; vAlpha = uOpacity;
        gl_PointSize = uSize * uPR / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: POINT_FRAG,
  });
  const flowPoints = new THREE.Points(fgeo, fmat);
  flowPoints.frustumCulled = false;
  group.add(flowPoints);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff8a2a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.copy(aaaPos);
  halo.scale.setScalar(2.2);
  group.add(halo);

  /* Camera path through the arterial tree */
  const camPos = curve([V(1.6, 5.9, 4.6), V(3.4, 7.6, 7.2), V(4.8, 3.6, 7.4), V(4.4, -0.6, 7.0), V(3.2, -2.1, 5.0), V(1.9, -0.9, 1.2)]);
  const camTgt = curve([V(0.12, 4.9, -0.1), V(0.25, 6.9, 0.0), V(0.65, 3.4, -0.5), V(0.25, -1.1, -0.2), V(0.1, -2.05, 0.0), V(0.9, -0.5, -0.3)]);
  const tmp = V(0, 0, 0);
  const TP = V(0, 0, 0), TN = V(0, 0, 0), TB = V(0, 0, 0);

  return {
    group,
    labels: [
      { text: "Carotid bifurcation", sub: "Ultrasound plaque AI", pos: V(0.52, 7.15, 0.1), stages: [2], range: [0.12, 0.42] },
      { text: "Aortic arch", sub: "Stroke risk modeling", pos: V(0.05, 5.0, -0.05), stages: [2], range: [0.1, 0.36] },
      { text: "Intimal flap", sub: "Aortic dissection", pos: flapMid.clone().add(V(0.25, 0, 0)), stages: [2], range: [0.36, 0.62] },
      { text: "Abdominal aortic aneurysm", sub: "miRNA biomarkers", pos: aaaPos.clone().add(V(0.5, 0.1, 0)), stages: [2], range: [0.58, 0.9] },
    ],
    setPixelRatio(pr) { fmat.uniforms.uPR.value = pr; },
    rig(stage, u, time, pos, target) {
      const w = smooth(0, 1, Math.min(1, u / 0.84));
      camPos.getPoint(w * 0.8, pos);
      camTgt.getPoint(w * 0.8, target);
      const emerge = 1 - smooth(0.0, 0.16, u);
      if (emerge > 0) pos.lerp(tmp.set(0.3, 5.05, 0.5), emerge * 0.85);
      const dive = smooth(0.82, 1.0, u);
      if (dive > 0) {
        target.lerp(RENAL_END, dive);
        pos.lerp(tmp.copy(RENAL_END).add(V(0.12, 0.04, 0.2)), dive * 0.96);
      }
      if (!reduced) pos.y += Math.sin(time * 0.3) * 0.03;
    },
    update(time, state, dt) {
      mat.uniforms.uTime.value = time;
      const drive = reduced ? 0.3 : 0.45 + state.beat * 1.3;
      const a = fgeo.attributes.position.array;
      for (const f of flows) {
        f.phase += (dt * drive * 1.2) / f.table.length;
        for (let i = 0; i < f.n; i++) {
          const s = seeds[f.start + i];
          const u = (s.u + f.phase * s.v) % 1;
          f.table.point(u, TP); f.table.normal(u, TN); f.table.binormal(u, TB);
          const r = f.r(u) * s.r;
          const o = (f.start + i) * 3;
          a[o] = TP.x + (TN.x * Math.cos(s.a) + TB.x * Math.sin(s.a)) * r;
          a[o + 1] = TP.y + (TN.y * Math.cos(s.a) + TB.y * Math.sin(s.a)) * r;
          a[o + 2] = TP.z + (TN.z * Math.cos(s.a) + TB.z * Math.sin(s.a)) * r;
        }
      }
      fgeo.attributes.position.needsUpdate = true;
      plaqueMat.opacity = 0.65 + Math.sin(time * 2.2) * 0.2;
      flapMat.opacity = 0.6 + state.beat * 0.35;
    },
  };
}
