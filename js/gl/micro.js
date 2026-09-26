/* Stage 3: pulmonary microcirculation. Arterial and venous trees meet in a capillary bed around alveoli;
   one branch is occluded by an embolus, and a few alveoli are flooded (edema). */
import * as THREE from "three";
import { rng, PathTable, variableTube, POINT_FRAG, smooth, lerp, NOISE_GLSL } from "./common.js";
import { glowTexture } from "./body.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function mergeGeometries(list) {
  let vCount = 0, iCount = 0;
  for (const g of list) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2), sh = new Float32Array(vCount);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    if (g.attributes.aShade) sh.set(g.attributes.aShade.array, vo);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += n; io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setAttribute("aShade", new THREE.BufferAttribute(sh, 1));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function growTree(rand, root, dir, len, r, maxDepth, bias) {
  const branches = [];
  const axis = V(0, 0, 0), perp = V(0, 0, 0);
  (function grow(parent, start, d, L, R, depth) {
    perp.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).cross(d).normalize();
    const mid = start.clone().addScaledVector(d, L * 0.5).addScaledVector(perp, L * 0.12 * (rand() - 0.5));
    const end = start.clone().addScaledVector(d, L);
    const b = { pts: [start, mid, end], r0: R, r1: R * 0.8, parent, depth, children: [], end };
    const id = branches.push(b) - 1;
    if (parent >= 0) branches[parent].children.push(id);
    if (depth >= maxDepth) return;
    const roll = rand() * Math.PI;
    for (let k = 0; k < 2; k++) {
      axis.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).cross(d).normalize();
      axis.applyAxisAngle(d, roll + k * Math.PI);
      const nd = d.clone().applyAxisAngle(axis, 0.42 + rand() * 0.3).lerp(bias, 0.12).normalize();
      grow(id, end, nd, L * (0.74 + rand() * 0.12), R * 0.74, depth + 1);
    }
  })(-1, root, dir.clone().normalize(), len, r, 0);
  return branches;
}

export const CAPILLARY_TARGET = V(0.25, 0.1, 0.35);

export function createMicro({ mobile, reduced }) {
  const group = new THREE.Group();
  const rand = rng(41);
  const depth = mobile ? 6 : 7;
  const art = growTree(rand, V(-4.6, -0.2, 0), V(1, 0.05, 0), 1.7, 0.17, depth, V(1, 0, 0));
  const ven = growTree(rand, V(4.6, 0.4, -0.3), V(-1, -0.05, 0), 1.7, 0.2, depth, V(-1, 0, 0));

  /* Embolus: lodge in an arterial branch at depth 2; everything downstream is hypoperfused */
  const occludedRoot = art.findIndex((b) => b.depth === 2);
  const occluded = new Set();
  (function mark(i) { occluded.add(i); art[i].children.forEach(mark); })(occludedRoot);

  const tubes = (tree, filter) => tree.filter(filter).map((b) => {
    const t = new PathTable(new THREE.CatmullRomCurve3(b.pts), 10);
    b.table = t;
    return variableTube(t, b.depth > 4 ? 6 : 10, (u) => lerp(b.r0, b.r1, u), () => 0);
  });
  const vesselMat = (color, rim, path) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: new THREE.Color(color) }, uRim: { value: new THREE.Color(rim) }, uPath: { value: new THREE.Color(path) } },
    vertexShader: /* glsl */ `
      attribute float aShade;
      varying vec3 vN; varying vec3 vV; varying float vShade; varying float vDepth; varying vec2 vUv;
      void main(){
        vShade = aShade; vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpacity; uniform vec3 uColor, uRim, uPath;
      varying vec3 vN; varying vec3 vV; varying float vShade; varying float vDepth; varying vec2 vUv;
      void main(){
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        vec3 c = mix(uColor, uPath, vShade);
        vec3 r = mix(uRim, uPath * 1.3, vShade);
        float fog = smoothstep(14.0, 2.0, vDepth);
        vec3 col = c * (0.06 + 0.3 * rim) + r * rim * 0.75;
        gl_FragColor = vec4(col * uOpacity * (0.15 + 0.85 * fog), 1.0);
      }`,
  });
  const artMat = vesselMat(0xa0101f, 0xff3b50, 0xff3b50);
  const venMat = vesselMat(0x1f2f9a, 0x5a7dff, 0x5a7dff);
  const ischMat = vesselMat(0x2a0a12, 0x5a2030, 0x5a2030);
  const capMat = vesselMat(0xa0101f, 0xff4060, 0x7050ff);
  group.add(new THREE.Mesh(mergeGeometries(tubes(art, (b, i) => !occluded.has(art.indexOf(b)) || art.indexOf(b) === occludedRoot)), artMat));
  group.add(new THREE.Mesh(mergeGeometries(tubes(art, (b) => occluded.has(art.indexOf(b)) && art.indexOf(b) !== occludedRoot)), ischMat));
  group.add(new THREE.Mesh(mergeGeometries(tubes(ven, () => true)), venMat));

  /* Capillary bed: each arterial terminal meets its nearest venous terminal */
  const aLeaves = art.filter((b) => !b.children.length);
  const vLeaves = ven.filter((b) => !b.children.length);
  const caps = [];
  const capGeos = [];
  for (const a of aLeaves) {
    let best = null, bd = 1e9;
    for (const v of vLeaves) { const d = a.end.distanceToSquared(v.end); if (d < bd) { bd = d; best = v; } }
    const mid = a.end.clone().lerp(best.end, 0.5).add(V(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.35));
    const t = new PathTable(new THREE.CatmullRomCurve3([a.end, mid, best.end]), 16);
    caps.push({ a, v: best, table: t });
    capGeos.push(variableTube(t, 5, () => 0.022, (u) => u));
  }
  group.add(new THREE.Mesh(mergeGeometries(capGeos), capMat));

  /* Alveoli: translucent air sacs; a subset flooded with fluid */
  const alvMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uFill: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aFill;
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vFill;
      void main(){
        vFill = aFill; vP = position;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vFill;
      ${NOISE_GLSL}
      void main(){
        float ndv = abs(dot(normalize(vN), normalize(vV)));
        float rim = pow(1.0 - ndv, 3.0);
        float n = snoise(vP * 4.0 + uTime * 0.2) * 0.5 + 0.5;
        vec3 air = vec3(0.45, 0.8, 0.95) * (rim * 0.55 + 0.02);
        float level = smoothstep(0.05, -0.05, vP.y - (vFill * 1.6 - 0.9) - n * 0.08);
        vec3 fluid = vec3(0.2, 0.45, 1.0) * (0.12 + rim * 0.5) * level * vFill;
        gl_FragColor = vec4(air + fluid, 1.0);
      }`,
  });
  const alvN = mobile ? 16 : 26;
  const alvGeo = new THREE.SphereGeometry(1, 32, 24);
  const fill = new Float32Array(alvN);
  const alv = new THREE.InstancedMesh(alvGeo, alvMat, alvN);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(1, 1, 1);
  const alvPositions = [];
  for (let i = 0; i < alvN; i++) {
    const c = caps[Math.floor(rand() * caps.length)].table;
    const p = V(0, 0, 0); c.point(0.5, p);
    p.add(V(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.6));
    const s = 0.22 + rand() * 0.22;
    m4.compose(p, q, sc.setScalar(s));
    alv.setMatrixAt(i, m4);
    fill[i] = i % 5 === 0 ? 0.55 + rand() * 0.35 : 0;
    alvPositions.push({ p, fill: fill[i] });
  }
  alvGeo.setAttribute("aFill", new THREE.InstancedBufferAttribute(fill, 1));
  group.add(alv);
  const edema = alvPositions.find((a) => a.fill > 0) || alvPositions[0];

  /* Embolus */
  const emb = art[occludedRoot];
  const clotMat = new THREE.MeshStandardMaterial({ color: 0x3a0508, roughness: 0.55, metalness: 0.0, emissive: 0x2a0206 });
  const clotGeo = new THREE.IcosahedronGeometry(1, 4);
  const cp = clotGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const v = V(cp.getX(i), cp.getY(i), cp.getZ(i));
    v.multiplyScalar(1 + 0.18 * Math.sin(v.x * 7 + v.y * 5) * Math.cos(v.z * 6));
    cp.setXYZ(i, v.x, v.y, v.z);
  }
  clotGeo.computeVertexNormals();
  const clot = new THREE.Mesh(clotGeo, clotMat);
  clot.position.copy(emb.pts[1]).lerp(emb.end, 0.35);
  clot.scale.set(emb.r0 * 1.25, emb.r0 * 1.25, emb.r0 * 2.2);
  clot.lookAt(emb.end);
  group.add(clot);
  const clotLight = new THREE.PointLight(0xff5a4a, 2.5, 2.2, 1.5);
  clotLight.position.copy(clot.position).add(V(0.2, 0.3, 0.4));
  group.add(clotLight, new THREE.AmbientLight(0x402028, 0.6));

  /* Red cells streaming arterial -> capillary -> venous (color shifts with desaturation) */
  const chains = [];
  const pathOf = (tree, leaf) => { const out = []; let i = tree.indexOf(leaf); while (i >= 0) { out.unshift(tree[i]); i = tree[i].parent; } return out; };
  for (const c of caps) {
    if (pathOf(art, c.a).some((b) => occluded.has(art.indexOf(b)) && art.indexOf(b) !== occludedRoot)) continue;
    const pts = [];
    for (const b of pathOf(art, c.a)) pts.push(b.pts[0], b.pts[1]);
    pts.push(c.a.end);
    const cm = V(0, 0, 0); c.table.point(0.5, cm); pts.push(cm);
    const back = pathOf(ven, c.v).reverse();
    for (const b of back) pts.push(b.end, b.pts[1]);
    pts.push(back[back.length - 1].pts[0]);
    const clean = pts.filter((p, i) => i === 0 || p.distanceToSquared(pts[i - 1]) > 1e-5);
    chains.push(new PathTable(new THREE.CatmullRomCurve3(clean, false, "centripetal"), 160));
  }
  const pN = mobile ? 1300 : 3000;
  const ppos = new Float32Array(pN * 3), pcol = new Float32Array(pN * 3);
  const pseed = [];
  for (let i = 0; i < pN; i++) pseed.push({ c: chains[Math.floor(rand() * chains.length)], u: rand(), v: 0.6 + rand() * 0.5, j: V(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.05) });
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute("position", new THREE.BufferAttribute(ppos, 3).setUsage(THREE.DynamicDrawUsage));
  pgeo.setAttribute("color", new THREE.BufferAttribute(pcol, 3).setUsage(THREE.DynamicDrawUsage));
  const pmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uSize: { value: 30 }, uPR: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 color; uniform float uSize, uPR;
      varying vec3 vColor; varying float vAlpha;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vColor = color; vAlpha = smoothstep(16.0, 3.0, -mv.z);
        gl_PointSize = uSize * uPR / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: POINT_FRAG,
  });
  const particles = new THREE.Points(pgeo, pmat);
  particles.frustumCulled = false;
  group.add(particles);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x7040ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(9);
  halo.position.set(0.3, 0, -1.5);
  group.add(halo);

  const camPos = new THREE.CatmullRomCurve3([V(-6.6, 1.8, 6.8), V(-4.2, 1.2, 5.6), V(-1.9, 0.8, 4.4), V(0.0, 0.5, 3.2), V(0.6, 0.3, 2.0)]);
  const camTgt = new THREE.CatmullRomCurve3([V(-4.2, -0.1, 0), V(-2.4, 0.0, 0), V(-0.6, 0.1, 0), V(0.6, 0.1, 0), V(0.4, 0.1, 0.3)]);
  const tmp = V(0, 0, 0), P = V(0, 0, 0);

  return {
    group,
    labels: [
      { text: "Pulmonary arteriole", sub: "PE mortality models", pos: art[1].end.clone(), stages: [3], range: [0.1, 0.5] },
      { text: "Embolus", sub: "Recurrent VTE prediction", pos: clot.position.clone().add(V(0.05, 0.12, 0)), stages: [3], range: [0.2, 0.7] },
      { text: "Flooded alveolus", sub: "AI pulmonary edema", pos: edema.p.clone(), stages: [3], range: [0.45, 0.85] },
      { text: "Capillary bed", sub: "Gas exchange", pos: CAPILLARY_TARGET.clone().add(V(0, 0.35, 0)), stages: [3], range: [0.55, 0.85] },
    ],
    setPixelRatio(pr) { pmat.uniforms.uPR.value = pr; },
    rig(stage, u, time, pos, target) {
      const w = smooth(0, 1, Math.min(1, u / 0.84));
      camPos.getPoint(w, pos);
      camTgt.getPoint(w, target);
      const emerge = 1 - smooth(0.0, 0.16, u);
      if (emerge > 0) pos.lerp(tmp.set(-4.6, 0.0, 0.4), emerge * 0.8);
      const dive = smooth(0.82, 1.0, u);
      if (dive > 0) {
        target.lerp(CAPILLARY_TARGET, dive);
        pos.lerp(tmp.copy(CAPILLARY_TARGET).add(V(0.04, 0.03, 0.12)), dive * 0.97);
      }
      if (!reduced) { pos.x += Math.sin(time * 0.25) * 0.05; pos.y += Math.cos(time * 0.2) * 0.04; }
    },
    update(time, state, dt) {
      alvMat.uniforms.uTime.value = time;
      const drive = reduced ? 0.05 : 0.04 + state.beat * 0.05;
      const a = pgeo.attributes.position.array, c = pgeo.attributes.color.array;
      for (let i = 0; i < pN; i++) {
        const s = pseed[i];
        s.u = (s.u + dt * drive * s.v) % 1;
        s.c.point(s.u, P);
        a[i * 3] = P.x + s.j.x; a[i * 3 + 1] = P.y + s.j.y; a[i * 3 + 2] = P.z + s.j.z;
        const o = smooth(0.42, 0.62, s.u);
        c[i * 3] = lerp(1.7, 0.45, o); c[i * 3 + 1] = lerp(0.2, 0.3, o); c[i * 3 + 2] = lerp(0.25, 1.5, o);
      }
      pgeo.attributes.position.needsUpdate = true;
      pgeo.attributes.color.needsUpdate = true;
      clot.rotation.z += dt * 0.05;
    },
  };
}
