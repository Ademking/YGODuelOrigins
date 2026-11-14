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
void main() {
  vec2 uv = fragCoord / resolution;
  vec2 p = uv - 0.5;
  p.x *= resolution.x / resolution.y;
  float t = time;
  float edge = smoothstep(0.0, 0.12, uv.x) * smoothstep(0.0, 0.12, 1.0-uv.x);
  float curtain = pow(max(0.0, sin(p.x * 28.0 + sin(p.y * 7.0 - t * 2.4) * 1.6)), 12.0);
  curtain *= exp(-abs(p.x) * 2.6) * (0.22 + 0.14 * sin(p.y * 15.0 - t * 4.0));
  float lightning = 0.0;
  for (int i = 0; i < 4; i++) {
    float f = float(i);
    float side = mod(f, 2.0) * 2.0 - 1.0;
    float path = side * (0.23 + 0.15 * floor(f / 2.0));
    path += (noise(uv.y * 19.0 + floor(t * 8.0) * 7.0 + f * 31.0) - 0.5) * 0.13;
    float d = abs(p.x - path);
    float pulse = 0.4 + 0.6 * noise(t * 6.0 + f * 13.0);
    lightning += (0.003 / (d + 0.003) + 0.016 / (d + 0.026) * 0.25) * pulse;
  }
  float pillar = exp(-abs(p.x) * 12.0) * surge;
  float light = curtain + lightning * 0.6 + pillar;
  float alpha = clamp(light * opacity * edge, 0.0, 0.85);
  vec3 tint = mix(vec3(${rgb}), vec3(1.0, 0.96, 0.88), clamp(light - 0.5, 0.0, 0.8));
  gl_FragColor = vec4(tint * alpha, alpha);
}
`;
}
