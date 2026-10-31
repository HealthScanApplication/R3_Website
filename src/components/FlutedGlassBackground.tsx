"use client";

import { useEffect, useRef } from "react";

/*
 * Fluted-glass hero background — a faithful port of the WebGL "fluting" shader
 * Function Health uses on its hero (Webflow/Lucid "flutieHero"). The image is
 * rendered through drifting diagonal glass ribs that refract/displace it, with
 * chromatic aberration, per-rib highlight/shadow/bevel and simplex-noise stain.
 *
 * The GLSL below is their exact fragment/vertex shader; we drive it with a
 * single still image (no crossfade/slideshow) and tuned uniforms. Falls back to
 * nothing (the plain <img> behind it shows) if WebGL is unavailable.
 */

const VERT = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
  #else
      precision mediump float;
  #endif
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const FRAG = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
  #else
      precision mediump float;
  #endif
  uniform sampler2D u_image;
  uniform vec2 u_resolution;
  uniform vec2 u_imageResolution;
  uniform float u_time;
  uniform float u_amp;
  uniform float u_freq;
  uniform float u_driftSpeed;
  uniform float u_chromaticAberration;
  uniform float u_highlight;
  uniform float u_shadow;
  uniform float u_highlightFocus;
  uniform float u_bevelIntensity;
  uniform float u_bevelWidth;
  uniform float u_stainScale;
  uniform float u_stainIntensity;
  uniform float u_noiseInfluence;
  uniform float u_diagonalDirection;
  uniform float u_fluteAngle;
  uniform vec2 u_zoomCenter;
  uniform float u_zoomFactor;
  uniform vec2 u_maskCenter;
  uniform float u_maskRadius;
  uniform float u_maskFeather;
  uniform float u_maskStrength;
  uniform float u_edgeBlur;

  varying vec2 v_texCoord;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  vec2 correctUV(vec2 uv, vec2 canvasRes, vec2 imageRes) {
    float canvasRatio = canvasRes.x / canvasRes.y;
    float imageRatio = imageRes.x / imageRes.y;
    vec2 corrected = uv;
    if (imageRatio > canvasRatio) { float s = canvasRatio / imageRatio; corrected.x = (uv.x - 0.5) * s + 0.5; }
    else { float s = imageRatio / canvasRatio; corrected.y = (uv.y - 0.5) * s + 0.5; }
    return corrected;
  }
  vec2 applyKenBurns(vec2 uv, vec2 center, float zoom) { zoom = max(zoom, 0.0001); return (uv - center) / zoom + center; }
  float calculateDiagonalCoord(vec2 uv, float angle) {
    float c = cos(angle); float s = sin(angle);
    vec2 baseDir = (u_diagonalDirection > 0.0) ? normalize(vec2(-1.0, 1.0)) : normalize(vec2(1.0, 1.0));
    vec2 rotatedDir = vec2(baseDir.x * c - baseDir.y * s, baseDir.x * s + baseDir.y * c);
    vec2 centeredUV = (uv - 0.5) * 2.0;
    float diagonal = dot(centeredUV, rotatedDir);
    float sqrt2 = 1.41421356237;
    return clamp((diagonal + sqrt2) / (2.0 * sqrt2) * 2.0, 0.0, 2.0);
  }
  vec3 sampleFluted(sampler2D tex, vec2 uv, vec2 canvasRes, vec2 imageRes, vec2 center, float zoom) {
    vec2 corrected = correctUV(uv, canvasRes, imageRes);
    vec2 kbUv = applyKenBurns(corrected, center, zoom);
    kbUv = clamp(kbUv, 0.0, 1.0);
    float drift = u_time * u_driftSpeed;
    float diagonalCoord = calculateDiagonalCoord(kbUv, u_fluteAngle);
    float wavePattern = fract(diagonalCoord * u_freq * 0.1 + drift);
    float wave = (wavePattern - 0.5) * 2.0;
    float baseDistortion = wave * u_amp;
    float staticNoise = snoise(kbUv * u_stainScale) * u_amp * u_stainIntensity * u_noiseInfluence;
    float bevelPos = 0.75;
    float bevelMask = exp(-pow(wave - bevelPos, 2.0) / (2.0 * pow(max(u_bevelWidth, 0.0001), 2.0)));
    float bevelDistortion = bevelMask * u_bevelIntensity;
    float distortionAmount = baseDistortion + staticNoise + bevelDistortion;
    float highlight = pow(max(0.0, wave), u_highlightFocus) * u_highlight;
    float shadow = pow(max(0.0, -wave), 4.0) * u_shadow * 0.5;
    float caOffset = u_amp * u_chromaticAberration;
    vec2 distortionDir = normalize(vec2(u_diagonalDirection > 0.0 ? -1.0 : 1.0, 1.0));
    vec2 distortionVec = distortionDir * distortionAmount;
    vec3 color;
    color.r = texture2D(tex, clamp(kbUv + distortionVec - distortionDir * caOffset, 0.0, 1.0)).r;
    color.g = texture2D(tex, clamp(kbUv + distortionVec, 0.0, 1.0)).g;
    color.b = texture2D(tex, clamp(kbUv + distortionVec + distortionDir * caOffset, 0.0, 1.0)).b;
    color += highlight;
    color -= shadow;
    return clamp(color, 0.0, 1.0);
  }
  vec3 sampleClearBlurred(sampler2D tex, vec2 uv, vec2 canvasRes, vec2 imageRes, vec2 center, float zoom, float blur) {
    vec2 corrected = correctUV(uv, canvasRes, imageRes);
    vec2 kbUv = clamp(applyKenBurns(corrected, center, zoom), 0.0, 1.0);
    if (blur < 0.0006) return texture2D(tex, kbUv).rgb;
    vec3 sum = vec3(0.0);
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        sum += texture2D(tex, clamp(kbUv + vec2(float(i), float(j)) * blur, 0.0, 1.0)).rgb;
      }
    }
    return sum / 9.0;
  }
  void main() {
    vec2 uv = v_texCoord;
    // edge factor — 0 in the centre, ramps to 1 toward every edge/corner
    vec2 cc = (uv - vec2(0.5));
    cc.x *= u_resolution.x / max(u_resolution.y, 1.0);
    float edge = smoothstep(0.40, 0.72, length(cc));
    float blurR = edge * u_edgeBlur;

    vec3 fluted = sampleFluted(u_image, uv, u_resolution, u_imageResolution, u_zoomCenter, u_zoomFactor);
    vec3 clear  = sampleClearBlurred(u_image, uv, u_resolution, u_imageResolution, u_zoomCenter, u_zoomFactor, blurR);

    // moving radial reveal — the glass shows only inside a soft circle that sweeps
    vec2 d = uv - u_maskCenter;
    d.x *= u_resolution.x / max(u_resolution.y, 1.0);
    float dist = length(d);
    float mask = (1.0 - smoothstep(u_maskRadius - u_maskFeather, u_maskRadius + u_maskFeather, dist)) * u_maskStrength;
    // fade the fluting out toward the blurred edges, so the glass is soft there too
    mask *= (1.0 - edge);
    vec3 col = mix(clear, fluted, mask);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

// Tuned for a subtle, premium fluted-glass refraction (Function-Health-like).
const U = {
  amp: 0.045, // scaled-up refraction — deeper displacement per rib
  freq: 74, // wider ribs than before, still clearly fluted
  driftSpeed: 0.2, // continuous flute movement
  chromaticAberration: 0.28,
  highlight: 0.18,
  shadow: 0.15,
  highlightFocus: 3.0,
  bevelIntensity: 0.014,
  bevelWidth: 0.08,
  stainScale: 3.0,
  stainIntensity: 0.28,
  noiseInfluence: 0.5,
  diagonalDirection: 1.0,
  fluteAngle: 0.0, // 45° diagonal ribs
  zoomFactor: 1.04,
  maskRadius: 0.46, // a single sweeping band (not the whole screen)
  maskFeather: 0.32,
  edgeBlur: 0.02, // soft blur toward the video edges (in UV units)
};

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("[fluted] shader compile failed:", gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

export function FlutedGlassBackground({
  videos = [],
  poster,
  style,
  onClipStart,
}: {
  /** Video URLs (CORS-enabled) to sample through the fluted glass, cycled in turn. */
  videos?: string[];
  /** Still image shown through the glass until a video is ready (and as a fallback). */
  poster?: string;
  style?: React.CSSProperties;
  /** Called with a clip's index in `videos` each time that clip starts playing. */
  onClipStart?: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videosRef = useRef<string[]>(videos);
  videosRef.current = videos;
  const onClipStartRef = useRef(onClipStart);
  onClipStartRef.current = onClipStart;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: true, premultipliedAlpha: false });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[fluted] link failed:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    // full-screen quad
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      // x, y,  u, v
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
      -1,  1, 0, 1,
       1, -1, 1, 0,
       1,  1, 1, 1,
    ]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_position");
    const aTex = gl.getAttribLocation(prog, "a_texCoord");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aTex);
    gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8);

    const loc = (n: string) => gl.getUniformLocation(prog, n);
    // static uniforms
    gl.uniform1f(loc("u_amp"), U.amp);
    gl.uniform1f(loc("u_freq"), U.freq);
    gl.uniform1f(loc("u_driftSpeed"), U.driftSpeed);
    gl.uniform1f(loc("u_chromaticAberration"), U.chromaticAberration);
    gl.uniform1f(loc("u_highlight"), U.highlight);
    gl.uniform1f(loc("u_shadow"), U.shadow);
    gl.uniform1f(loc("u_highlightFocus"), U.highlightFocus);
    gl.uniform1f(loc("u_bevelIntensity"), U.bevelIntensity);
    gl.uniform1f(loc("u_bevelWidth"), U.bevelWidth);
    gl.uniform1f(loc("u_stainScale"), U.stainScale);
    gl.uniform1f(loc("u_stainIntensity"), U.stainIntensity);
    gl.uniform1f(loc("u_noiseInfluence"), U.noiseInfluence);
    gl.uniform1f(loc("u_diagonalDirection"), U.diagonalDirection);
    gl.uniform1f(loc("u_fluteAngle"), U.fluteAngle);
    gl.uniform2f(loc("u_zoomCenter"), 0.5, 0.5);
    gl.uniform1f(loc("u_zoomFactor"), U.zoomFactor);
    gl.uniform1f(loc("u_maskRadius"), U.maskRadius);
    gl.uniform1f(loc("u_maskFeather"), U.maskFeather);
    gl.uniform1f(loc("u_edgeBlur"), U.edgeBlur);
    gl.uniform1i(loc("u_image"), 0);

    // texture
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // 1px placeholder until the image loads
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([230, 225, 215, 255]));

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    let hasTexture = false; // true once anything (poster or video) is on the texture
    const setRes = (w: number, h: number) => gl.uniform2f(loc("u_imageResolution"), w || 1, h || 1);

    // Poster — the instant fallback shown through the glass until a video is ready.
    if (poster) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          if (!videoActive) { setRes(img.naturalWidth, img.naturalHeight); hasTexture = true; }
        } catch { /* tainted — keep placeholder */ }
      };
      img.src = poster;
    }

    // Video — sampled through the fluted glass, one clip after another.
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    (video as any).playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    let vIdx = 0;
    let videoActive = false; // a frame has been uploaded from the video
    let started = false;
    const playIndex = (i: number) => {
      const list = videosRef.current;
      if (!list.length) return;
      vIdx = ((i % list.length) + list.length) % list.length;
      video.src = list[vIdx];
      video.play().catch(() => {});
    };
    video.addEventListener("ended", () => playIndex(vIdx + 1));
    video.addEventListener("playing", () => onClipStartRef.current?.(vIdx));
    video.addEventListener("error", () => playIndex(vIdx + 1));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(loc("u_resolution"), canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    // The glass reveal sweeps across in a different diagonal each pass.
    // Each entry is [startCenter, endCenter] in uv space, travelling past the
    // edges (-0.4 / 1.4) so the soft circle fully enters and exits.
    // One 45° wave at a time, alternating: bottom-right → top-left, then back.
    const DIRS: [number, number, number, number][] = [
      [1.4, -0.4, -0.4, 1.4], // bottom-right → top-left (↖, 45°)
      [-0.4, 1.4, 1.4, -0.4], // top-left → bottom-right (↘, 45°)
    ];
    const SWEEP = 8.5; // seconds per pass — slow and gentle
    const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
    const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const PEAK = 0.92; // the glass never fully covers — it's a soft veil

    let raf = 0;
    let start = 0;
    const uTime = loc("u_time");
    const uMaskCenter = loc("u_maskCenter");
    const uMaskStrength = loc("u_maskStrength");
    const render = (t: number) => {
      if (!start) start = t;
      resize();
      const elapsed = (t - start) / 1000;
      gl.uniform1f(uTime, elapsed);
      // one slow 45° wave at a time; the center eases across, and its opacity
      // gently fades in then out so the glass never pops on/off
      const cyc = elapsed / SWEEP;
      const dir = DIRS[Math.floor(cyc) % DIRS.length];
      const raw = cyc - Math.floor(cyc);
      const p = easeInOut(raw);
      gl.uniform2f(uMaskCenter, dir[0] + (dir[2] - dir[0]) * p, dir[1] + (dir[3] - dir[1]) * p);
      const fade = sstep(0.0, 0.3, raw) * (1.0 - sstep(0.7, 1.0, raw));
      gl.uniform1f(uMaskStrength, fade * PEAK);

      // start the playlist once the video URLs have arrived
      if (!started && videosRef.current.length) { started = true; playIndex(0); }

      // upload the current video frame while it has data
      if (video.readyState >= 2 && video.videoWidth > 0) {
        try {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
          setRes(video.videoWidth, video.videoHeight);
          videoActive = true;
          hasTexture = true;
        } catch {
          // a clip without CORS taints the texture — skip to the next one
          videoActive = false;
          playIndex(vIdx + 1);
        }
      }

      if (hasTexture) gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(render);
    };

    // Run (and keep the video playing) only while near the viewport and the tab is visible.
    let near = typeof IntersectionObserver === "undefined";
    let running = false;
    let pausedAt = 0;
    const update = () => {
      const shouldRun = near && document.visibilityState === "visible";
      if (shouldRun === running) return;
      running = shouldRun;
      if (shouldRun) {
        // shift the clock so the sweep continues where it left off
        if (start && pausedAt) start += performance.now() - pausedAt;
        pausedAt = 0;
        if (started) video.play().catch(() => {});
        raf = requestAnimationFrame(render);
      } else {
        cancelAnimationFrame(raf);
        raf = 0;
        pausedAt = performance.now();
        try { video.pause(); } catch { /* noop */ }
      }
    };
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      near = entries.some((e) => e.isIntersecting);
      update();
    }, { rootMargin: "200px" });
    io?.observe(canvas);
    document.addEventListener("visibilitychange", update);
    update();

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("resize", resize);
      try { video.pause(); video.removeAttribute("src"); video.load(); } catch { /* noop */ }
      gl.deleteTexture(tex);
      gl.deleteBuffer(quad);
      gl.deleteProgram(prog);
    };
  }, [poster]);

  return <canvas ref={canvasRef} aria-hidden="true" style={style} />;
}
