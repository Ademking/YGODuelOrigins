export const fusionVortexShader = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  uniform vec2 resolution;
  uniform float time;
  uniform float opacity;
  varying vec2 fragCoord;

  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise2(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), f.x),
      mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0)), f.x), f.y);
  }

  float fbm2(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise2(p);
      p = p * 2.0 + vec2(17.1, 9.2);
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 px = vec2(fragCoord.x, resolution.y - fragCoord.y);
    vec2 uv = px / resolution;
    float t = time * 0.87;
    float mn = min(resolution.x, resolution.y);
    vec2 sd = vec2(fract(80.0 * 0.1373) * 97.0, fract(80.0 * 0.0719) * 61.0);
    vec2 q = (px - resolution * 0.5) / mn;
    float rq = max(length(q), 0.0001);
    float te = 0.15 * 1.6 * 1.328;
    vec2 bq = q - q * (te * te) / (rq * rq + 0.0004);
    vec3 space = vec3(0.0157, 0.0039, 0.0235);
    vec3 outerGas = vec3(0.2902, 0.0588, 0.4196);
    vec3 innerGas = vec3(0.7686, 0.2353, 1.0);
    vec3 ringColor = vec3(1.0, 0.8392, 1.0);
    vec3 col = space * (1.05 - 0.2 * uv.y);
    float nebula = fbm2(bq * 2.3 + sd + vec2(t * 0.01, 0.0));
    col += mix(outerGas, space, 0.6) * smoothstep(0.45, 0.85, nebula) * 0.25;
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float cellSize = 16.0 + fi * 14.0;
      vec2 sp = bq * mn / cellSize + sd + vec2(fi * 31.7 + t * 0.03, fi * 17.3);
      vec2 id = floor(sp);
      float h = hash21(id);
      float keep = step(1.0 - (0.1 - fi * 0.03) * 1.26, h);
      vec2 center = 0.2 + 0.6 * vec2(hash21(id + 3.1), hash21(id + 7.7));
      float distanceToStar = length((fract(sp) - center) * cellSize);
      float starSize = (0.7 + 0.7 * hash21(id + 5.3)) * (1.0 + fi * 0.5);
      float twinkle = 0.8 + 0.2 * sin(t * (0.6 + hash21(id + 9.9)) + h * 40.0);
      col += mix(vec3(1.0), ringColor, 0.4) * keep
        * (exp(-distanceToStar * distanceToStar / (starSize * starSize)) + exp(-distanceToStar / (starSize * 2.5)) * 0.15)
        * twinkle * pow(fract(h * 5.71), 1.5);
    }
    vec2 g = vec2(q.x, q.y / 0.703);
    float r = max(length(g), 0.0001);
    float angle = atan(g.y, g.x);
    float lr = log(r / 0.15);
    float phi = angle - t * 0.12 + lr * 3.0;
    vec2 dv = vec2(cos(phi), sin(phi));
    float n1 = fbm2(dv * 2.2 + vec2(lr * 2.5 + t * 0.35, 0.0) + sd);
    float n2 = fbm2(dv * 4.5 + vec2(lr * 5.0 + t * 0.6, 3.0) + sd * 1.3);
    float streams = smoothstep(0.3, 0.8, n1 * 0.65 + n2 * 0.5);
    float rin = 0.15 * 1.25;
    float profile = smoothstep(rin * 0.7, rin * 1.3, r) * exp(-max(r - rin, 0.0) / (0.15 * 1.9));
    float heat = exp(-(r - rin) / (0.15 * 0.9));
    float beam = 1.0 + 0.45 * cos(angle - 0.4);
    vec3 gasColor = mix(outerGas, innerGas, clamp(heat * 1.2, 0.0, 1.0));
    gasColor = mix(gasColor, ringColor, clamp(heat - 0.55, 0.0, 1.0) * 0.8);
    col += gasColor * profile * (0.25 + 1.1 * streams) * 1.308 * beam;
    col += outerGas * exp(-r / (0.15 * 5.0)) * 0.12 * 1.308;
    float shadow = 1.0 - smoothstep(0.15 * 0.45, 0.15 * 1.2, rq);
    col *= 1.0 - shadow * 0.96;
    col = col / (1.0 + max(col.r, max(col.g, col.b)) * 0.2) * 1.1;
    col += (hash21(px * 0.731 + 0.5) - 0.5) / 255.0;
    gl_FragColor = vec4(max(col, vec3(0.0)) * opacity, opacity);
  }
`;
