export const exodiaShader = `
  precision mediump float;
  uniform vec2 resolution;
  uniform float time;
  uniform float opacity;
  varying vec2 fragCoord;

  void main() {
    vec2 uv = fragCoord / resolution;
    vec2 p = uv - 0.5;
    p.x *= resolution.x / resolution.y;
    float angle = atan(p.y, p.x);
    float distanceFromCenter = length(p);
    float rays = pow(max(0.0, cos(angle * 12.0 + sin(time * 0.42) * 0.65)), 10.0);
    float rays2 = pow(max(0.0, cos(angle * 7.0 - time * 0.22)), 18.0);
    float beam = exp(-abs(p.x + 0.06 * sin(time * 0.7)) * 12.0);
    float core = exp(-distanceFromCenter * 5.0);
    float edge = smoothstep(0.0, 0.18, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    float light = (rays * 0.22 + rays2 * 0.14) * exp(-distanceFromCenter * 1.2) + beam * 0.15 + core * 0.3;
    float alpha = clamp(light * opacity * edge, 0.0, 0.7);
    vec3 color = mix(vec3(1.0, 0.61, 0.12), vec3(1.0, 0.98, 0.81), clamp(core + beam * 0.35, 0.0, 1.0));
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

export const exodiaBlastShader = `
  precision mediump float;
  uniform vec2 resolution;
  uniform float time;
  uniform float opacity;
  uniform float centerY;
  uniform float expansion;
  varying vec2 fragCoord;

  void main() {
    vec2 p = (fragCoord - vec2(resolution.x * 0.5, centerY)) / resolution.y;
    float distanceFromCore = length(p);
    float pulse = 0.88 + 0.12 * sin(time * 15.0);
    float core = 1.0 - smoothstep(0.075, 0.16, distanceFromCore / pulse);
    float glow = exp(-distanceFromCore * 5.0) * (0.8 + 0.15 * sin(time * 11.0));
    float downward = 1.0 - smoothstep(-0.03, 0.04, p.y);
    float width = 0.1 + max(-p.y, 0.0) * 0.85;
    float shimmer = 0.8 + 0.2 * sin(time * 19.0 + p.y * 45.0);
    float ray = exp(-pow(abs(p.x) / width, 2.0) * 2.0) * downward * shimmer;
    float outer = exp(-pow(abs(p.x) / (width * 2.4), 2.0) * 2.0) * downward * 0.45;
    float maxRadius = length(vec2(resolution.x / resolution.y, 1.0));
    float radius = expansion * (maxRadius + 0.2);
    float wave = 1.0 - smoothstep(radius, radius + 0.12, distanceFromCore);
    float energy = max(clamp(core + ray + glow + outer, 0.0, 1.0), wave);
    vec3 color = mix(vec3(1.0, 0.48, 0.03), vec3(1.0, 0.99, 0.86), clamp(core + ray * 0.85, 0.0, 1.0));
    color = mix(color, vec3(1.0), wave);
    float alpha = energy * opacity;
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

export const exodiaFireShader = `
  precision mediump float;
  uniform vec2 resolution;
  uniform float time;
  uniform float opacity;
  varying vec2 fragCoord;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), f.x),
      mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0)), f.x), f.y);
  }

  float fbm2(vec2 p) {
    return noise2(p) * 0.57 + noise2(p * 2.03 + 7.1) * 0.29 + noise2(p * 4.11 + 13.7) * 0.14;
  }

  void main() {
    vec2 px = vec2(fragCoord.x, resolution.y - fragCoord.y);
    float unit = min(resolution.x, resolution.y);
    float hh = (resolution.y - px.y) / unit;
    float gx = px.x / unit;
    float sd = 359.0 * 0.0173;
    float t = time * 2.265;
    float sc = 1.0 / 1.063;
    float n1 = fbm2(vec2(gx * 5.0 * sc + sd, hh * 1.9 * sc - t * 0.9));
    float n2 = noise2(vec2(gx * 16.0 * sc - sd, hh * 5.0 * sc - t * 2.0));
    float cols = fbm2(vec2(gx * 3.0 * sc + sd * 2.0, t * 0.25));
    float reach = max(0.859 * (0.55 + 0.8 * cols), 0.02);
    float heat = 1.08 - hh / reach + (n1 - 0.5) + (n2 - 0.5) * 0.55;
    vec3 color = mix(vec3(0.478, 0.047, 0.024), vec3(0.91, 0.251, 0.047), smoothstep(0.05, 0.48, heat));
    color = mix(color, vec3(1.0, 0.69, 0.122), smoothstep(0.38, 0.78, heat));
    color = mix(color, vec3(1.0, 0.965, 0.784), smoothstep(0.78, 1.1, heat));
    float alpha = smoothstep(0.0, 0.35, heat) * opacity;
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;
