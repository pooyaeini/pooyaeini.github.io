/* Shared helpers for the cardiovascular journey scenes. */
import * as THREE from "three";

/* Deterministic PRNG so every visitor sees the same anatomy. */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* Cardiac cycle at ~64 bpm: a sharp systolic "lub" followed by a softer "dub". */
export const BEAT_PERIOD = 0.94;
export function beat(time) {
  const ph = (time / BEAT_PERIOD) % 1;
  const g = (c, w) => Math.exp(-Math.pow((ph - c) / w, 2));
  return g(0.07, 0.045) + 0.55 * g(0.3, 0.05);
}
export function beatPhase(time) {
  return (time / BEAT_PERIOD) % 1;
}

/* Arc-length lookup table for a curve: position + rotation-minimizing frame. */
export class PathTable {
  constructor(curve, n) {
    this.n = n;
    this.length = curve.getLength();
    const frames = curve.computeFrenetFrames(n, false);
    this.P = new Float32Array((n + 1) * 3);
    this.T = new Float32Array((n + 1) * 3);
    this.N = new Float32Array((n + 1) * 3);
    this.B = new Float32Array((n + 1) * 3);
    const p = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      curve.getPointAt(i / n, p);
      p.toArray(this.P, i * 3);
      frames.tangents[i].toArray(this.T, i * 3);
      frames.normals[i].toArray(this.N, i * 3);
      frames.binormals[i].toArray(this.B, i * 3);
    }
  }
  _lerp(arr, u, out) {
    const f = clamp(u, 0, 1) * this.n;
    const i = Math.min(this.n - 1, Math.floor(f));
    const k = f - i;
    const a = i * 3, b = a + 3;
    return out.set(
      arr[a] + (arr[b] - arr[a]) * k,
      arr[a + 1] + (arr[b + 1] - arr[a + 1]) * k,
      arr[a + 2] + (arr[b + 2] - arr[a + 2]) * k
    );
  }
  point(u, out) { return this._lerp(this.P, u, out); }
  tangent(u, out) { return this._lerp(this.T, u, out).normalize(); }
  normal(u, out) { return this._lerp(this.N, u, out).normalize(); }
  binormal(u, out) { return this._lerp(this.B, u, out).normalize(); }
}

/*
 * Tube with a radius that may vary along the path (t) and around it (theta).
 * Emits uv = (t, theta/2PI) and an optional per-vertex scalar "aShade".
 */
export function variableTube(table, radial, radiusFn, shadeFn) {
  const segs = table.n;
  const count = (segs + 1) * (radial + 1);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const shade = shadeFn ? new Float32Array(count) : null;
  const P = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    table.point(t, P); table.normal(t, N); table.binormal(t, B);
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      const nx = c * N.x + s * B.x, ny = c * N.y + s * B.y, nz = c * N.z + s * B.z;
      const r = radiusFn(t, th);
      pos[v * 3] = P.x + nx * r; pos[v * 3 + 1] = P.y + ny * r; pos[v * 3 + 2] = P.z + nz * r;
      nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz;
      uv[v * 2] = t; uv[v * 2 + 1] = j / radial;
      if (shade) shade[v] = shadeFn(t, th);
      v++;
    }
  }
  const idx = [];
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  if (shade) g.setAttribute("aShade", new THREE.BufferAttribute(shade, 1));
  g.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  if (radiusFn.recomputeNormals) g.computeVertexNormals();
  return g;
}

/* Soft round sprite used by every particle system. */
export const POINT_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    gl_FragColor = vec4(vColor * a, a * vAlpha);
  }
`;

/* Ashima Arts 3D simplex noise (MIT). */
export const NOISE_GLSL = /* glsl */ `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0);
    const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy));
    vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);
    vec3 l=1.0-g;
    vec3 i1=min(g.xyz,l.zxy);
    vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;
    vec3 x2=x0-i2+C.yyy;
    vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857;
    vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z);
    vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy;
    vec4 y=y_*ns.x+ns.yyyy;
    vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);
    vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0;
    vec4 s1=floor(b1)*2.0+1.0;
    vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
    vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);
    vec3 p1=vec3(a0.zw,h.y);
    vec3 p2=vec3(a1.xy,h.z);
    vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
    m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
`;

/* Cheap deterministic value noise for CPU-side shape sculpting. */
export function vnoise3(x, y, z) {
  const h = (i, j, k) => {
    let n = i * 374761393 + j * 668265263 + k * 1274126177;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w
  ) * 2 - 1;
}

/* Glowing "flow" shader for vessel tubes: fresnel rim + a pulse wave running along uv.x. */
export function flowMaterial({ color, rim, pulse = 1, opacity = 1, speed = 0.9, wave = 2.0 }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uColor: { value: new THREE.Color(color) },
      uRim: { value: new THREE.Color(rim || color) },
      uPulse: { value: pulse },
      uSpeed: { value: speed },
      uWave: { value: wave },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpacity, uPulse, uSpeed, uWave;
      uniform vec3 uColor, uRim;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float rim = pow(f, 2.2);
        float w = fract(vUv.x * uWave - uTime * uSpeed);
        float p = pow(w, 10.0) * uPulse;
        vec3 col = uColor * (0.18 + 0.5 * rim) + uRim * (rim * 0.9 + p * 1.4);
        gl_FragColor = vec4(col * uOpacity, 1.0);
      }`,
  });
}
