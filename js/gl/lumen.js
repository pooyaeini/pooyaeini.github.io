/* Stages 4 to 6: inside an artery. Healthy endothelium and flowing blood, then fatty streaks,
   lipid-rich plaque with LDL infiltration and foam cells, a flow-limiting stenosis, and finally
   fibrous cap rupture with platelet aggregation and a fibrin-rich thrombus. */
import * as THREE from "three";
import { rng, PathTable, variableTube, POINT_FRAG, NOISE_GLSL, smooth, lerp, clamp } from "./common.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const angDist = (a, b) => { let d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; };

/* Evans and Fung (1972) biconcave erythrocyte profile, normalized to unit radius. */
function rbcGeometry(radius, segs) {
  const pts = [];
  const N = 28;
  const h = (rho) => 0.5 * Math.sqrt(Math.max(0, 1 - rho * rho)) * (0.207 + 2.003 * rho * rho - 1.123 * rho ** 4);
  for (let i = 0; i <= N; i++) { const rho = Math.sin((i / N) * Math.PI * 0.5) * 0.999; pts.push(new THREE.Vector2(rho, h(rho))); }
  for (let i = N; i >= 0; i--) { const rho = Math.sin((i / N) * Math.PI * 0.5) * 0.999; pts.push(new THREE.Vector2(rho, -h(rho))); }
  const g = new THREE.LatheGeometry(pts.map((p) => p.multiplyScalar(radius)), segs);
  g.computeVertexNormals();
  return g;
}

function lumpy(detail, amp, freq, seed) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const v = V(0, 0, 0);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * freq + seed) * Math.sin(v.y * freq * 1.3 + seed * 2) * Math.sin(v.z * freq * 0.9 + seed * 3);
    v.multiplyScalar(1 + amp * n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

const WALL_VERT = /* glsl */ `
  attribute float aShade;
  varying vec2 vUv; varying vec3 vN; varying vec3 vVP; varying float vShade;
  void main(){
    vUv = uv; vShade = aShade;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vVP = mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;
const WALL_FRAG = /* glsl */ `
  uniform float uTime, uLen, uBeat;
  uniform vec2 uRupture;
  uniform vec3 uFog;
  varying vec2 vUv; varying vec3 vN; varying vec3 vVP; varying float vShade;
  ${NOISE_GLSL}
  vec2 hash2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
  vec3 voronoi(vec2 x){
    vec2 n = floor(x), f = fract(x);
    float f1 = 8.0, f2 = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash2(n + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
    return vec3(sqrt(f1), sqrt(f2), 0.0);
  }
  void main(){
    vec3 V = normalize(-vVP);
    vec3 n = normalize(vN);
    n = faceforward(n, -V, n);
    float s = vUv.x * uLen;
    float a = vUv.y * 6.2831853;
    vec2 cellUv = vec2(s * 2.2, a * 3.2);
    vec3 vo = voronoi(cellUv);
    float border = smoothstep(0.1, 0.0, vo.y - vo.x);
    float nucleus = smoothstep(0.22, 0.05, vo.x);
    float n1 = snoise(vec3(s * 0.35, cos(a) * 1.5, sin(a) * 1.5)) * 0.5 + 0.5;
    float n2 = snoise(vec3(s * 3.0, cos(a) * 6.0, sin(a) * 6.0));

    vec3 endo = mix(vec3(0.42, 0.04, 0.08), vec3(0.72, 0.16, 0.2), n1);
    endo = mix(endo, vec3(0.2, 0.01, 0.03), border * 0.7);
    endo += vec3(0.28, 0.08, 0.12) * nucleus;

    float lip = clamp(vShade, 0.0, 1.0);
    vec3 lipid = mix(vec3(0.78, 0.55, 0.26), vec3(0.98, 0.86, 0.58), n2 * 0.5 + 0.5);
    vec3 alb = mix(endo, lipid, smoothstep(0.02, 0.5, lip));

    vec2 rd = vec2((vUv.x - uRupture.x) * uLen, abs(mod(a - uRupture.y + 3.14159, 6.2831853) - 3.14159));
    float crackShape = abs(rd.y - 0.12 * snoise(vec3(rd.x * 3.0, 0.0, 1.0))) ;
    float inRup = smoothstep(1.4, 0.4, abs(rd.x)) * smoothstep(0.7, 0.2, rd.y);
    float crack = smoothstep(0.1, 0.0, crackShape) * inRup;
    vec3 core = mix(vec3(0.35, 0.18, 0.05), vec3(0.08, 0.01, 0.01), n2 * 0.5 + 0.5);
    alb = mix(alb, core, crack);
    alb = mix(alb, alb * vec3(0.7, 0.45, 0.4), inRup * 0.5);

    float dist = length(vVP);
    float att = 1.0 / (1.0 + dist * dist * 0.03);
    float diff = max(dot(n, V), 0.0);
    vec3 H = V;
    float gloss = mix(40.0, 90.0, lip);
    float spec = pow(max(dot(n, H), 0.0), gloss) * mix(0.25, 0.7, lip) * (1.0 - border * 0.6);
    float rim = pow(1.0 - diff, 2.0);
    float sheen = smoothstep(0.55, 1.0, snoise(vec3(s * 0.25 - uTime * 1.6, cos(a), sin(a)))) * 0.25;

    vec3 col = alb * (0.12 + diff * 1.35 * att) + vec3(1.0, 0.85, 0.8) * spec * att;
    col += vec3(0.6, 0.05, 0.08) * rim * 0.35 + vec3(0.9, 0.3, 0.3) * sheen * att;
    col += vec3(0.5, 0.02, 0.05) * uBeat * 0.08;
    float fog = 1.0 - exp(-dist * 0.085);
    col = mix(col, uFog, clamp(fog, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createLumen({ mobile, reduced }) {
  const group = new THREE.Group();
  const rand = rng(97);

  const pts = [];
  for (let i = 0; i <= 17; i++) pts.push(V(Math.sin(i * 0.55) * 2.2, Math.cos(i * 0.42) * 1.4, -i * 5.2));
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const table = new PathTable(curve, mobile ? 900 : 1500);
  const L = table.length;

  /* Lesions: u along the vessel, theta around it, axial and angular spread, height (fraction of radius) */
  const plaques = [
    { u: 0.455, th: 1.2, su: 2.4, sth: 0.8, h: 0.3 },
    { u: 0.535, th: 3.7, su: 3.4, sth: 1.25, h: 0.6 },
    { u: 0.86, th: 5.3, su: 3.0, sth: 1.05, h: 0.46, rupture: true },
  ];
  const streaks = [];
  for (let i = 0; i < 9; i++) streaks.push({ u: 0.355 + rand() * 0.07, th: rand() * TAU, su: 1.4 + rand() * 1.2, sth: 0.08 + rand() * 0.06, h: 0.03 });
  const lesions = plaques.concat(streaks);
  const lesionAt = (u, th, list = lesions) => {
    let d = 0;
    for (const p of list) {
      const du = ((u - p.u) * L) / p.su;
      if (du * du > 9) continue;
      const dt = angDist(th, p.th) / p.sth;
      d += p.h * Math.exp(-du * du) * Math.exp(-dt * dt);
    }
    return d;
  };
  const lumenR = (u, th) => 1 - lesionAt(u, th);
  const radiusFn = (u, th) => lumenR(u, th) + 0.012 * Math.sin(th * 7 + u * 400) * Math.sin(u * 900);
  radiusFn.recomputeNormals = true;
  const wallGeo = variableTube(table, mobile ? 64 : 96, radiusFn, (u, th) => lesionAt(u, th, plaques) * 2.4 + lesionAt(u, th, streaks) * 16);
  const rupture = plaques[2];
  const wallMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uLen: { value: L }, uBeat: { value: 0 },
      uRupture: { value: new THREE.Vector2(rupture.u, rupture.th) },
      uFog: { value: new THREE.Color(0x0c0103) },
    },
    vertexShader: WALL_VERT, fragmentShader: WALL_FRAG, side: THREE.DoubleSide,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.frustumCulled = false;
  group.add(wall);

  /* Headlamp lighting for the cellular elements */
  const lamp = new THREE.PointLight(0xffe2dc, 21, 26, 1.4);
  const lampDir = V(0, 0, 0);
  const fill = new THREE.HemisphereLight(0xff6a70, 0x200006, 0.5);
  group.add(lamp, fill);

  const frameAt = (u, P, N, B) => { table.point(u, P); table.normal(u, N); table.binormal(u, B); };
  const P = V(0, 0, 0), N = V(0, 0, 0), B = V(0, 0, 0);
  const wallPoint = (u, th, inset, out) => {
    frameAt(u, P, N, B);
    const r = lumenR(u, th) - inset;
    return out.copy(P).addScaledVector(N, Math.cos(th) * r).addScaledVector(B, Math.sin(th) * r);
  };

  /* Erythrocytes */
  const rbcGeo = rbcGeometry(0.075, mobile ? 20 : 28);
  const rbcMat = new THREE.MeshPhysicalMaterial({
    color: 0xa50a1e, roughness: 0.42, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.5,
    sheen: 1, sheenColor: new THREE.Color(0xff5a6a), sheenRoughness: 0.45, emissive: 0x220004,
  });
  const rbcN = mobile ? 320 : 650;
  const rbc = new THREE.InstancedMesh(rbcGeo, rbcMat, rbcN);
  rbc.frustumCulled = false;
  rbc.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(rbc);
  const cells = [];
  for (let i = 0; i < rbcN; i++) {
    cells.push({
      u: rand(), th: rand() * TAU, rf: Math.sqrt(rand()) * 0.88, v: 0.8 + rand() * 0.4,
      axis: V(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), spin: (rand() - 0.5) * 3, ang: rand() * TAU,
    });
  }

  /* Leukocytes rolling along the endothelium, and platelets */
  const wbcN = mobile ? 5 : 9;
  const wbc = new THREE.InstancedMesh(lumpy(4, 0.08, 9, 1.3), new THREE.MeshPhysicalMaterial({ color: 0xece4f2, roughness: 0.55, sheen: 1, sheenColor: new THREE.Color(0xc8b8ff), emissive: 0x1a1420, transmission: 0 }), wbcN);
  wbc.frustumCulled = false;
  group.add(wbc);
  const wbcs = [];
  for (let i = 0; i < wbcN; i++) wbcs.push({ u: rand(), th: rand() * TAU, ang: 0 });

  const pltN = mobile ? 120 : 300;
  const pltGeo = new THREE.SphereGeometry(0.024, 10, 6); pltGeo.scale(1, 0.35, 1);
  const pltMat = new THREE.MeshStandardMaterial({ color: 0xe8cf8c, roughness: 0.5, emissive: 0x2a2008 });
  const plt = new THREE.InstancedMesh(pltGeo, pltMat, pltN);
  plt.frustumCulled = false;
  group.add(plt);
  const plts = [];
  for (let i = 0; i < pltN; i++) plts.push({ u: rand(), th: rand() * TAU, rf: Math.sqrt(rand()) * 0.9, v: 0.8 + rand() * 0.4, axis: V(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), ang: rand() * TAU });

  /* LDL particles infiltrating the intima around the lesions */
  const ldlN = mobile ? 350 : 800;
  const ldl = new Float32Array(ldlN * 3);
  const ldlSeed = [];
  for (let i = 0; i < ldlN; i++) {
    const p = plaques[i % 2];
    ldlSeed.push({ u: p.u + ((rand() - 0.5) * p.su * 2.4) / L, th: p.th + (rand() - 0.5) * p.sth * 2.4, ph: rand() });
  }
  const ldlGeo = new THREE.BufferGeometry();
  ldlGeo.setAttribute("position", new THREE.BufferAttribute(ldl, 3).setUsage(THREE.DynamicDrawUsage));
  const ldlMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uSize: { value: 5 }, uPR: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uSize, uPR; varying vec3 vColor; varying float vAlpha;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vColor = vec3(1.9, 1.35, 0.45); vAlpha = smoothstep(18.0, 2.0, -mv.z);
        gl_PointSize = uSize * uPR / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: POINT_FRAG,
  });
  const ldlPts = new THREE.Points(ldlGeo, ldlMat);
  ldlPts.frustumCulled = false;
  group.add(ldlPts);

  /* Foam cells: lipid-laden macrophages embedded in the plaque shoulders */
  const foamN = mobile ? 24 : 46;
  const foam = new THREE.InstancedMesh(lumpy(3, 0.16, 14, 4.2), new THREE.MeshPhysicalMaterial({ color: 0xf0cf86, roughness: 0.3, clearcoat: 0.6, emissive: 0x3a2604 }), foamN);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(1, 1, 1), tmp = V(0, 0, 0);
  for (let i = 0; i < foamN; i++) {
    const p = plaques[i % 3 === 2 ? 0 : 1];
    const u = p.u + ((rand() - 0.5) * p.su * 1.6) / L, th = p.th + (rand() - 0.5) * p.sth * 1.7;
    wallPoint(u, th, 0.01, tmp);
    q.setFromAxisAngle(V(rand(), rand(), rand()).normalize(), rand() * TAU);
    m4.compose(tmp, q, sc.setScalar(0.05 + rand() * 0.05));
    foam.setMatrixAt(i, m4);
  }
  group.add(foam);

  /* Thrombus on the ruptured cap: fibrin mesh, trapped erythrocytes, platelet aggregate */
  const tc = V(0, 0, 0);
  wallPoint(rupture.u, rupture.th, 0.24, tc);
  const tT = V(0, 0, 0); table.tangent(rupture.u, tT);
  frameAt(rupture.u, P, N, B);
  const tR = N.clone().multiplyScalar(Math.cos(rupture.th)).addScaledVector(B, Math.sin(rupture.th)).normalize();
  const tS = new THREE.Vector3().crossVectors(tT, tR).normalize();
  const inClot = () => {
    for (;;) {
      const x = rand() * 2 - 1, y = rand() * 2 - 1, z = rand() * 2 - 1;
      if (x * x + y * y + z * z > 1) continue;
      return tc.clone().addScaledVector(tT, x * 0.75).addScaledVector(tR, y * 0.3).addScaledVector(tS, z * 0.42);
    }
  };
  const fibN = mobile ? 700 : 1600;
  const fib = new Float32Array(fibN * 6);
  for (let i = 0; i < fibN; i++) {
    const a = inClot();
    const d = V(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(0.08 + rand() * 0.28);
    fib.set([a.x, a.y, a.z, a.x + d.x, a.y + d.y, a.z + d.z], i * 6);
  }
  const fibGeo = new THREE.BufferGeometry();
  fibGeo.setAttribute("position", new THREE.BufferAttribute(fib, 3));
  const fibMat = new THREE.LineBasicMaterial({ color: new THREE.Color(1.1, 0.95, 0.72), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  group.add(new THREE.LineSegments(fibGeo, fibMat));
  const trapN = mobile ? 40 : 80;
  const trapped = new THREE.InstancedMesh(rbcGeo, rbcMat, trapN);
  for (let i = 0; i < trapN; i++) {
    q.setFromAxisAngle(V(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), rand() * TAU);
    m4.compose(inClot(), q, sc.setScalar(0.9 + rand() * 0.2));
    trapped.setMatrixAt(i, m4);
  }
  group.add(trapped);
  const aggN = mobile ? 90 : 180;
  const agg = new THREE.InstancedMesh(pltGeo, new THREE.MeshStandardMaterial({ color: 0xf4dc9c, roughness: 0.45, emissive: 0x4a3810 }), aggN);
  for (let i = 0; i < aggN; i++) {
    const p = wallPoint(rupture.u + ((rand() - 0.5) * 1.6) / L, rupture.th + (rand() - 0.5) * 0.5, rand() * 0.18, V(0, 0, 0));
    q.setFromAxisAngle(V(rand(), rand(), rand()).normalize(), rand() * TAU);
    m4.compose(p, q, sc.setScalar(1 + rand() * 0.8));
    agg.setMatrixAt(i, m4);
  }
  group.add(agg);
  const clotBody = new THREE.Mesh(lumpy(4, 0.14, 7, 2.2), new THREE.MeshPhysicalMaterial({ color: 0x4a0610, roughness: 0.5, clearcoat: 0.3, emissive: 0x160002, transparent: true, opacity: 0.85 }));
  clotBody.position.copy(tc).addScaledVector(tR, 0.1);
  clotBody.scale.set(0.5, 0.5, 0.5);
  clotBody.quaternion.setFromUnitVectors(V(0, 0, 1), tT);
  clotBody.scale.set(0.26, 0.2, 0.6);
  group.add(clotBody);

  /* Camera travels the centerline, steering around eccentric lesions */
  const camOffset = (u, out) => {
    out.set(0, 0, 0);
    frameAt(u, P, N, B);
    for (const p of plaques) {
      const du = ((u - p.u) * L) / (p.su * 1.3);
      const w = p.h * 0.62 * Math.exp(-du * du);
      out.addScaledVector(N, -Math.cos(p.th) * w).addScaledVector(B, -Math.sin(p.th) * w);
    }
    return out;
  };
  const off = V(0, 0, 0);
  const camU = (stage, u) => lerp(0.02, 0.815, ((stage - 4) + u) / 3);
  let currentU = 0.02;

  const labelAt = (u, th, inset) => wallPoint(u, th, inset, V(0, 0, 0));
  const lumenPoint = (u, a, r) => { frameAt(u, P, N, B); return P.clone().addScaledVector(N, Math.cos(a) * r).addScaledVector(B, Math.sin(a) * r); };

  return {
    group,
    fog: 0x0c0103,
    labels: [
      { text: "Endothelium", sub: "Vascular lining", pos: labelAt(0.1, 1.9, 0.02), stages: [4], range: [0.05, 0.6], maxDist: 9 },
      { text: "Erythrocytes", sub: "Biconcave, 7.8 µm", pos: lumenPoint(0.17, 0.6, 0.35), stages: [4], range: [0.25, 0.95], maxDist: 9 },
      { text: "Fatty streak", sub: "Earliest lesion", pos: labelAt(0.385, streaks[0].th, 0.02), stages: [5], range: [0.0, 0.4], maxDist: 10 },
      { text: "LDL infiltration", sub: "Lipoprotein retention", pos: labelAt(plaques[0].u, plaques[0].th, 0.06), stages: [5], range: [0.1, 0.6], maxDist: 10 },
      { text: "Foam cells", sub: "Lipid-laden macrophages", pos: labelAt(plaques[1].u - 1.6 / L, plaques[1].th + 0.5, 0.02), stages: [5], range: [0.25, 0.8], maxDist: 10 },
      { text: "Stenosis", sub: "Fibrous cap over lipid core", pos: labelAt(plaques[1].u, plaques[1].th, 0.04), stages: [5], range: [0.35, 0.95], maxDist: 11 },
      { text: "Cap rupture", sub: "Exposed necrotic core", pos: labelAt(rupture.u - 1.2 / L, rupture.th + 0.4, 0.02), stages: [6], range: [0.45, 0.95], maxDist: 12 },
      { text: "Thrombus", sub: "Fibrin, platelets, trapped RBCs", pos: tc.clone(), stages: [6], range: [0.5, 1.0], maxDist: 12 },
    ],
    setPixelRatio(pr) { ldlMat.uniforms.uPR.value = pr; },
    rig(stage, u, time, pos, target) {
      const cu = camU(stage, u);
      currentU = cu;
      table.point(cu, pos).add(camOffset(cu, off));
      const la = cu + 5.0 / L;
      table.point(la, target).add(camOffset(la, off));
      if (!reduced) {
        frameAt(cu, P, N, B);
        pos.addScaledVector(N, Math.sin(time * 0.35) * 0.06).addScaledVector(B, Math.cos(time * 0.27) * 0.05);
      }
      const emerge = stage === 4 ? 1 - smooth(0, 0.16, u) : 0;
      if (emerge > 0) {
        table.point(cu - 3.5 / L, off);
        pos.lerp(off, emerge * 0.8);
      }
      if (stage === 6) {
        const dive = smooth(0.82, 1.0, u);
        if (dive > 0) { target.lerp(tc, dive); pos.lerp(tc, dive * 0.6); }
      }
    },
    update(time, state, dt, camera) {
      wallMat.uniforms.uTime.value = time;
      wallMat.uniforms.uBeat.value = state.beat;
      // Keep the lamp behind the lens so cells passing the camera are never blown out.
      camera.getWorldDirection(lampDir);
      lamp.position.copy(camera.position).addScaledVector(lampDir, -0.9);
      const drive = reduced ? 0.4 : 0.6 + state.beat * 1.4;
      const back = currentU - 1.5 / L, ahead = currentU + 16 / L, span = ahead - back;
      const T = V(0, 0, 0);
      for (let i = 0; i < rbcN; i++) {
        const c = cells[i];
        if (c.u < back || c.u > ahead) c.u = back + ((c.u - back) % span + span) % span;
        const lr = lumenR(c.u, c.th);
        const v = (2.6 * drive * c.v * (1 - c.rf * c.rf * 0.55)) / (lr * lr);
        c.u += (dt * v) / L;
        c.ang += dt * c.spin;
        frameAt(c.u, P, N, B);
        const r = Math.max(0, lr - 0.1) * c.rf;
        tmp.copy(P).addScaledVector(N, Math.cos(c.th) * r).addScaledVector(B, Math.sin(c.th) * r);
        q.setFromAxisAngle(c.axis, c.ang);
        m4.compose(tmp, q, sc.setScalar(tmp.distanceToSquared(camera.position) < 0.1 ? 0 : 1));
        rbc.setMatrixAt(i, m4);
      }
      rbc.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < pltN; i++) {
        const c = plts[i];
        if (c.u < back || c.u > ahead) c.u = back + ((c.u - back) % span + span) % span;
        const lr = lumenR(c.u, c.th);
        c.u += (dt * 2.4 * drive * c.v) / (lr * lr) / L;
        c.ang += dt * 2;
        frameAt(c.u, P, N, B);
        const r = Math.max(0, lr - 0.06) * c.rf;
        tmp.copy(P).addScaledVector(N, Math.cos(c.th) * r).addScaledVector(B, Math.sin(c.th) * r);
        q.setFromAxisAngle(c.axis, c.ang);
        m4.compose(tmp, q, sc.setScalar(tmp.distanceToSquared(camera.position) < 0.1 ? 0 : 1));
        plt.setMatrixAt(i, m4);
      }
      plt.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < wbcN; i++) {
        const c = wbcs[i];
        if (c.u < back || c.u > ahead) c.u = back + ((c.u - back) % span + span) % span;
        c.u += (dt * 0.35) / L;
        c.ang += dt * 0.6;
        frameAt(c.u, P, N, B);
        const r = lumenR(c.u, c.th) - 0.16;
        tmp.copy(P).addScaledVector(N, Math.cos(c.th) * r).addScaledVector(B, Math.sin(c.th) * r);
        table.tangent(c.u, T);
        q.setFromAxisAngle(tmp.clone().sub(P).normalize().cross(T).normalize(), -c.ang);
        m4.compose(tmp, q, sc.setScalar(0.15));
        wbc.setMatrixAt(i, m4);
      }
      wbc.instanceMatrix.needsUpdate = true;
      const la = ldlGeo.attributes.position.array;
      for (let i = 0; i < ldlN; i++) {
        const s = ldlSeed[i];
        const k = (s.ph + time * 0.08) % 1;
        wallPoint(s.u, s.th, lerp(0.14, -0.02, k), tmp);
        la[i * 3] = tmp.x; la[i * 3 + 1] = tmp.y; la[i * 3 + 2] = tmp.z;
      }
      ldlGeo.attributes.position.needsUpdate = true;
      fibMat.opacity = 0.45 + state.beat * 0.2;
    },
  };
}
