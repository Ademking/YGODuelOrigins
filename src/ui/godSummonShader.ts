/** Single bounded shader pass: flowing energy curtains and branching lightning, no particles. */
export function godSummonShader(color: number) {
  const rgb = [color >> 16 & 255, color >> 8 & 255, color & 255].map(v => (v / 255).toFixed(4)).join(',');
  return `
precision mediump float;
uniform vec2 resolution;
uniform float time;
uniform float opacity;
uniform float surge;
varying vec2 fragCoord;
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float noise(float x) {
  float i = floor(x), f = fract(x);
  return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
}
// Linear segments produce angular discharge paths rather than smooth sine ribbons.
float jagged(float x) {
  float i = floor(x);
  return mix(hash(i), hash(i + 1.0), fract(x));
}
void main() {
  vec2 uv = fragCoord / resolution;
  vec2 p = uv - 0.5;
  p.x *= resolution.x / resolution.y;
  float t = time;
  float edge = smoothstep(0.0, 0.12, uv.x) * smoothstep(0.0, 0.12, 1.0-uv.x);
  float haze = noise(p.x * 13.0 + noise(p.y * 9.0 - t * 0.8) * 4.0);
  float curtain = pow(haze, 3.0) * exp(-abs(p.x) * 3.0) * 0.48;
  float rays = pow(max(0.0, sin(p.x * 45.0 + p.y * 3.0 + t * 0.4)), 18.0);
  curtain += rays * exp(-abs(p.x) * 4.0) * 0.16;
  float lightning = 0.0;
  for (int i = 0; i < 4; i++) {
    float f = float(i);
    float side = mod(f, 2.0) * 2.0 - 1.0;
    float path = side * (0.23 + 0.15 * floor(f / 2.0));
    path += (jagged(uv.y * 15.0 + floor(t * 5.0) * 7.0 + f * 31.0) - 0.5) * 0.18;
    float d = abs(p.x - path);
    float pulse = smoothstep(0.35, 0.85, noise(t * 5.0 + f * 13.0));
    lightning += (0.0016 / (d + 0.0016) + exp(-d * 65.0) * 0.22) * pulse;
    float branch = abs(p.x - path - side * max(0.0, uv.y - 0.45) * 0.48);
    lightning += exp(-branch * 380.0) * pulse * smoothstep(0.45, 0.55, uv.y) * (1.0 - smoothstep(0.65, 0.8, uv.y)) * 0.4;
  }
  float pillar = exp(-abs(p.x) * 12.0) * surge;
  float light = curtain + lightning * 0.6 + pillar;
  float alpha = clamp(light * opacity * edge, 0.0, 0.85);
  vec3 tint = mix(vec3(${rgb}), vec3(1.0, 0.96, 0.88), clamp(light - 0.5, 0.0, 0.8));
  gl_FragColor = vec4(tint * alpha, alpha);
}
`;
}
