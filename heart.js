/* A small WebGL particle relief derived from the supplied heart artwork.
   Artistic depth, not a diagnostic anatomical model. No video, framework, or CDN. */
(() => {
  'use strict';
  const hero = document.querySelector('.hero');
  const stage = document.querySelector('.hero__stage');
  const art = document.querySelector('.heart-art');
  const canvas = document.querySelector('#heart-canvas');
  const poster = document.querySelector('#heart-poster');
  const first = document.querySelector('.hero__content');
  const second = document.querySelector('.hero__second');
  const bar = document.querySelector('.stage-progress span');
  const toggle = document.querySelector('.motion-toggle');
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer = null, paused = preference.matches, visible = true;
  let frame = 0, previous = 0, progress = 0, target = 0, rotation = 0, pointer = 0;
  let heroTop = 0, travel = 1, clock = 0, journey = 0, journeyTarget = 0;
  let stops = [], origin = { x: .75, y: .5, height: 700 };
  // One fixed scene keeps the artery attached while the camera travels beyond the hero.
  document.body.prepend(canvas);
  function readScroll() {
    target = clamp((scrollY - heroTop + document.querySelector('.nav').offsetHeight) / travel);
    const position = scrollY + innerHeight * .25;
    journeyTarget = 0;
    for (let i = 1; i < stops.length; i++) {
      if (position >= stops[i - 1].at) {
        const t = clamp((position - stops[i - 1].at) / Math.max(1, stops[i].at - stops[i - 1].at));
        journeyTarget = stops[i - 1].camera + (stops[i].camera - stops[i - 1].camera) * t;
      }
    }
  }
  const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
  const ramp = (x, a, b) => { const p = clamp((x - a) / (b - a)); return p * p * (3 - 2 * p); };

  function measure() {
    heroTop = hero.getBoundingClientRect().top + scrollY;
    travel = Math.max(1, hero.offsetHeight - stage.offsetHeight);
    const rect = art.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const navHeight = document.querySelector('.nav').offsetHeight;
    origin = { x: (rect.left + rect.width / 2) / innerWidth,
      y: (rect.top - stageRect.top + navHeight + rect.height / 2) / innerHeight, height: rect.height };
    const anchor = selector => document.querySelector(selector).getBoundingClientRect().top + scrollY;
    stops = [
      { at: heroTop + innerHeight * .25, camera: 0 },
      { at: heroTop + travel + innerHeight * .25, camera: 1.2 },
      { at: anchor('#about'), camera: 2.7 },
      { at: anchor('#research'), camera: 5.1 },
      { at: anchor('#publications'), camera: 8.1 },
      { at: anchor('#experience'), camera: 12.4 },
      { at: anchor('#contact'), camera: 15.4 }
    ].sort((a, b) => a.at - b.at);
    if (renderer) renderer.resize();
    readScroll();
  }
  function setText(p) {
    const fade = ramp(p, .12, .4), enter = ramp(p, .38, .65);
    first.style.opacity = 1 - fade;
    first.style.transform = `translateY(${-fade * 45}px)`;
    first.inert = fade > .95;
    second.style.opacity = enter;
    second.style.transform = `translateY(calc(-45% + ${(1 - enter) * 40}px))`;
    second.setAttribute('aria-hidden', String(enter < .5));
    bar.style.transform = `scaleX(${p})`;
  }
  function requestFrame() {
    if (!frame && visible && !document.hidden && renderer && !paused) frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = 0;
    if (paused || !visible || document.hidden || !renderer) return;
    const elapsed = Math.min((now - (previous || now)) / 1000, .05);
    previous = now; clock += elapsed;
    const blend = 1 - Math.exp(-elapsed * 9);
    progress += (target - progress) * blend;
    journey += (journeyTarget - journey) * blend;
    rotation += (pointer - rotation) * blend;
    setText(progress);
    renderer.draw(progress, clock, rotation, journey);
    // At rest below the heart, leave the already rendered frame on screen.
    if (journey < 1 || Math.abs(journeyTarget - journey) > .002 || Math.abs(target - progress) > .002 || Math.abs(pointer - rotation) > .002) requestFrame();
  }
  function fallback() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; renderer = null;
    art.classList.remove('is-ready');
    document.documentElement.classList.remove('motion-ready', 'vessel-ready');
    first.style.opacity = ''; first.style.transform = ''; first.inert = false;
    second.style.opacity = 0; second.setAttribute('aria-hidden', 'true');
    toggle.hidden = true;
  }
  function makeRenderer() {
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: true, powerPreference: 'low-power' });
    if (!gl) throw new Error('WebGL unavailable');
    const vertex = `
      attribute vec3 aPosition;
      attribute vec3 aColor;
      attribute float aSeed, aKind;
      uniform float uProgress, uTime, uPointer, uAspect, uSize, uJourney, uScale;
      uniform vec2 uOrigin;
      varying vec3 vColor;
      void main() {
        float phase = smoothstep(0.0, 3.0, uJourney);
        vec3 p = aPosition;
        float beat = 1.0 + 0.003 * sin(uTime * 4.8);
        p *= beat;
        float angle = (uPointer * 0.10 - 0.04) * (1.0 - phase);
        p.xz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p.xz;
        p.y += uJourney;
        float zoom = 1.0 + smoothstep(7.0, 15.0, uJourney) * 0.45;
        p.xy *= zoom;
        float perspective = 3.6 / (3.6 - p.z);
        gl_Position = vec4(uOrigin + vec2(p.x / uAspect, p.y) * perspective * uScale, p.z * 0.15, 1.0);
        gl_PointSize = uSize * perspective * mix(1.0 + 0.15 * aSeed, 1.35, aKind);
        float flow = 0.9 + 0.1 * sin(aPosition.y * 5.0 + uTime * 2.0);
        vColor = aColor * mix(1.0, 0.52, phase) * mix(1.0, flow, aKind);
      }`;
    const fragment = `
      precision mediump float;
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float light = 1.0 - smoothstep(0.12, 0.5, d) * 0.55;
        gl_FragColor = vec4(vColor * light, 1.0);
      }`;
    function shader(type, source) {
      const item = gl.createShader(type); gl.shaderSource(item, source); gl.compileShader(item);
      if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) { gl.deleteShader(item); throw new Error('Shader compilation failed'); }
      return item;
    }
    const vs = shader(gl.VERTEX_SHADER, vertex), fs = shader(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader linking failed');
    gl.useProgram(program);
    const sampler = document.createElement('canvas'); sampler.width = 224; sampler.height = 320;
    const context = sampler.getContext('2d', { willReadFrequently: true });
    context.drawImage(poster, 195, 60, 650, 930, 0, 0, 224, 320);
    const pixels = context.getImageData(0, 0, 224, 320).data;
    const vertices = [], stride = matchMedia('(max-width: 640px)').matches ? 2 : 1;
    for (let y = 0; y < 320; y += stride) for (let x = 0; x < 224; x += stride) {
      const i = (y * 224 + x) * 4;
      const r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
      const brightness = Math.max(r, g, b);
      if (brightness < .14 || r + g + b < .32) continue;
      const px = (x / 224 - .5) * 1.14, py = (.5 - y / 320) * 1.63;
      const seed = ((x * 127 + y * 311) % 997) / 997;
      const depth = Math.sqrt(Math.max(0, 1 - Math.pow(px / .59, 2))) * .26 + brightness * .12 + (seed - .5) * .06;
      // Warm arterial red and a soft blue retain the visual separation in the source.
      const red = r > b;
      vertices.push(px, py, depth, red ? Math.min(1, r * 1.25) : r * .85,
        red ? g * .85 : g * .95, red ? b * .85 : Math.min(1, b * 1.13), seed, 0);
    }
    // Connected cubic tubes. Radius decreases at each junction, from aorta to microvessels.
    const rings = stride === 2 ? 6 : 9;
    const mixPoint = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    function tube(a, b, c, d, radius, endRadius, blue = false) {
      const length = Math.hypot(...d.map((v, i) => v - a[i]));
      const samples = Math.max(12, Math.ceil(length / (stride === 2 ? .045 : .03)));
      for (let j = 0; j <= samples; j++) {
        const t = j / samples, s = 1 - t;
        const center = a.map((v, i) => s*s*s*v + 3*s*s*t*b[i] + 3*s*t*t*c[i] + t*t*t*d[i]);
        const dx = 3*s*s*(b[0]-a[0])+6*s*t*(c[0]-b[0])+3*t*t*(d[0]-c[0]);
        const dy = 3*s*s*(b[1]-a[1])+6*s*t*(c[1]-b[1])+3*t*t*(d[1]-c[1]);
        const norm = Math.hypot(dx, dy) || 1;
        const r = radius + (endRadius - radius) * t;
        for (let k = 0; k < rings; k++) {
          const theta = k / rings * Math.PI * 2, side = Math.cos(theta), front = Math.sin(theta);
          const light = .5 + .5 * Math.max(0, front);
          const color = blue ? [.23, .41, .72] : [.96, .31, .23];
          vertices.push(center[0] - dy / norm * side * r, center[1] + dx / norm * side * r,
            center[2] + front * r, ...color.map(v => v * light), t, 1);
        }
      }
    }
    function branch(start, direction, length, radius, depth, blue) {
      const end = [start[0] + direction * length * .55, start[1] - length, start[2] - .035];
      const b = [start[0] + direction * length * .4, start[1] - length * .18, start[2]];
      const c = [end[0] - direction * length * .12, end[1] + length * .35, end[2]];
      tube(start, b, c, end, radius, radius * .58, blue);
      if (depth > 0) {
        branch(end, direction * .65 + .48, length * .7, radius * .58, depth - 1, blue);
        branch(end, direction * .65 - .48, length * .72, radius * .58, depth - 1, blue);
      }
    }
    // Aortic arch continuation bends around the heart into the descending trunk.
    tube([.03,.56,.26], [.62,.62,.12], [.67,-.95,.04], [.32,-2,.04], .075,.065);
    tube([-.28,.62,.20], [-.68,.45,.06], [-.58,-1.1,0], [-.28,-2,0], .065,.055,true);
    for (const blue of [false, true]) {
      const sign = blue ? -1 : 1;
      for (let level = 0; level < 5; level++) {
        const y = -2 - level * 2.05;
        const a = [sign * .3, y, .02], end = [sign * .3, y - 2.05, .02];
        const radius = .065 * Math.pow(.64, level);
        tube(a, [sign * .44, y-.65,.08], [sign*.17,y-1.4,-.02], end, radius, radius*.64, blue);
        // Children originate at the exact trunk junction, with smaller daughter radii.
        const length = 1.15 - level * .07;
        branch(a, sign, length, radius * .60, 3, blue);
        if (level > 1) branch(a, -sign*.55, length*.88, radius*.45, 3, blue);
        if (level === 4) {
          branch(end, sign*.65, 1.6, radius*.64, 4, blue);
          branch(end, -sign*.55, 1.65, radius*.64, 4, blue);
        }
      }
    }
    const data = new Float32Array(vertices);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    [['aPosition', 3, 0], ['aColor', 3, 12], ['aSeed', 1, 24], ['aKind', 1, 28]].forEach(([name, size, offset]) => {
      const attribute = gl.getAttribLocation(program, name); gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, 32, offset);
    });
    const uniforms = {};
    ['uProgress', 'uTime', 'uPointer', 'uAspect', 'uSize', 'uJourney', 'uScale', 'uOrigin'].forEach(name => { uniforms[name] = gl.getUniformLocation(program, name); });
    gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
    let width = 1, height = 1, pixelRatio = 1;
    return {
      resize() {
        const rect = { width: innerWidth, height: innerHeight };
        pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
        width = Math.max(1, rect.width); height = Math.max(1, rect.height);
        canvas.width = Math.round(width * pixelRatio); canvas.height = Math.round(height * pixelRatio);
        gl.viewport(0, 0, canvas.width, canvas.height);
      },
      draw(p, time, tilt, camera = 0) {
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniform1f(uniforms.uProgress, p); gl.uniform1f(uniforms.uTime, time); gl.uniform1f(uniforms.uPointer, tilt);
        gl.uniform1f(uniforms.uAspect, width / height);
        const phase = ramp(camera, 0, 3);
        gl.uniform1f(uniforms.uJourney, camera);
        gl.uniform1f(uniforms.uScale, origin.height / height);
        gl.uniform2f(uniforms.uOrigin, (origin.x + (.55 - origin.x) * phase) * 2 - 1,
          1 - (origin.y + (.5 - origin.y) * phase) * 2);
        gl.uniform1f(uniforms.uSize, Math.max(1.2, origin.height / 320 * stride * .78) * pixelRatio);
        gl.drawArrays(gl.POINTS, 0, data.length / 8);
      }
    };
  }
  function init() {
    if (preference.matches) { toggle.hidden = true; return; }
    try {
      renderer = makeRenderer();
      document.documentElement.classList.add('motion-ready', 'vessel-ready'); measure();
      renderer.draw(0, 0, 0); art.classList.add('is-ready'); toggle.hidden = false; requestFrame();
    } catch (error) { fallback(); }
  }
  addEventListener('scroll', () => { readScroll(); requestFrame(); }, { passive: true });
  addEventListener('resize', () => { measure(); if (renderer && paused) renderer.draw(progress, clock, rotation, journey); requestFrame(); }, { passive: true });
  stage.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') pointer = clamp(e.clientX / innerWidth, 0, 1) * 2 - 1; }, { passive: true });
  stage.addEventListener('pointerleave', () => { pointer = 0; });
  toggle.addEventListener('click', () => {
    paused = !paused; toggle.setAttribute('aria-pressed', String(paused));
    toggle.innerHTML = paused ? 'Resume motion <span aria-hidden="true">▷</span>' : 'Pause motion <span aria-hidden="true">Ⅱ</span>';
    previous = 0; requestFrame();
  });
  document.addEventListener('visibilitychange', () => { previous = 0; requestFrame(); });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fallback(); });
  preference.addEventListener('change', () => { if (preference.matches) { paused = true; fallback(); } else { paused = false; toggle.hidden = false; init(); } });
  // Recompute section anchors when filters, images or mobile orientation change the layout.
  if ('ResizeObserver' in window) new ResizeObserver(() => { measure(); requestFrame(); }).observe(document.querySelector('main'));
  if (poster.complete && poster.naturalWidth) init();
  else { poster.addEventListener('load', init, { once: true }); poster.addEventListener('error', fallback, { once: true }); }
})();
