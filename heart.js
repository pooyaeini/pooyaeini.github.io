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
  let heroTop = 0, travel = 1, clock = 0;
  const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
  const ramp = (x, a, b) => { const p = clamp((x - a) / (b - a)); return p * p * (3 - 2 * p); };

  function measure() {
    heroTop = hero.getBoundingClientRect().top + scrollY;
    travel = Math.max(1, hero.offsetHeight - stage.offsetHeight);
    if (renderer) renderer.resize();
    target = clamp((scrollY - heroTop + document.querySelector('.nav').offsetHeight) / travel);
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
    rotation += (pointer - rotation) * blend;
    setText(progress);
    renderer.draw(progress, clock, rotation);
    requestFrame();
  }
  function fallback() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; renderer = null;
    art.classList.remove('is-ready');
    document.documentElement.classList.remove('motion-ready');
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
      attribute float aSeed;
      uniform float uProgress, uTime, uPointer, uAspect, uSize;
      varying vec3 vColor;
      void main() {
        float spread = smoothstep(0.35, 0.95, uProgress);
        vec3 p = aPosition;
        float beat = 1.0 + 0.008 * sin(uTime * 4.8);
        p *= beat;
        float angle = uPointer * 0.17 + uProgress * 0.30 - 0.08;
        p.xz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p.xz;
        vec3 drift = vec3(sin(aSeed * 83.1), cos(aSeed * 46.7), sin(aSeed * 127.3));
        p += drift * spread * (0.10 + aSeed * 0.35);
        p.y += sin(uTime * 0.6 + aSeed * 30.0) * 0.008 * spread;
        float perspective = 3.6 / (3.6 - p.z);
        gl_Position = vec4(p.x * perspective / uAspect, p.y * perspective, p.z * 0.15, 1.0);
        gl_PointSize = uSize * perspective * (1.0 + 0.15 * aSeed);
        vColor = aColor * (0.8 + 0.2 * cos(aSeed * 5.0 + uTime * 0.2));
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
        red ? g * .85 : g * .95, red ? b * .85 : Math.min(1, b * 1.13), seed);
    }
    const data = new Float32Array(vertices);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    [['aPosition', 3, 0], ['aColor', 3, 12], ['aSeed', 1, 24]].forEach(([name, size, offset]) => {
      const attribute = gl.getAttribLocation(program, name); gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, 28, offset);
    });
    const uniforms = {};
    ['uProgress', 'uTime', 'uPointer', 'uAspect', 'uSize'].forEach(name => { uniforms[name] = gl.getUniformLocation(program, name); });
    gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
    let width = 1, height = 1, pixelRatio = 1;
    return {
      resize() {
        const rect = art.getBoundingClientRect();
        pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
        width = Math.max(1, rect.width); height = Math.max(1, rect.height);
        canvas.width = Math.round(width * pixelRatio); canvas.height = Math.round(height * pixelRatio);
        gl.viewport(0, 0, canvas.width, canvas.height);
      },
      draw(p, time, tilt) {
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniform1f(uniforms.uProgress, p); gl.uniform1f(uniforms.uTime, time); gl.uniform1f(uniforms.uPointer, tilt);
        gl.uniform1f(uniforms.uAspect, width / height);
        gl.uniform1f(uniforms.uSize, Math.max(1.2, height / 320 * stride * .78) * pixelRatio);
        gl.drawArrays(gl.POINTS, 0, data.length / 7);
      }
    };
  }
  function init() {
    if (preference.matches) { toggle.hidden = true; return; }
    try {
      renderer = makeRenderer();
      document.documentElement.classList.add('motion-ready'); measure();
      renderer.draw(0, 0, 0); art.classList.add('is-ready'); toggle.hidden = false; requestFrame();
    } catch (error) { fallback(); }
  }
  addEventListener('scroll', () => { target = clamp((scrollY - heroTop + document.querySelector('.nav').offsetHeight) / travel); requestFrame(); }, { passive: true });
  addEventListener('resize', () => { measure(); if (renderer && paused) renderer.draw(progress, clock, rotation); requestFrame(); }, { passive: true });
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
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting; previous = 0; requestFrame();
  }).observe(hero);
  if (poster.complete && poster.naturalWidth) init();
  else { poster.addEventListener('load', init, { once: true }); poster.addEventListener('error', fallback, { once: true }); }
})();
