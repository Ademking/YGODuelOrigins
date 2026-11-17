export const ritualCircleShader = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  uniform vec2 resolution;
  uniform float time;
  uniform float opacity;
  varying vec2 fragCoord;
  const float TAU = 6.28318530718;

  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float segment(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
  }

  void main() {
    float s = min(resolution.x, resolution.y);
    vec2 q = (vec2(fragCoord.x, resolution.y - fragCoord.y) - resolution * 0.5) / s;
    float r = length(q);
    float a = atan(q.y, q.x);
    float R = 0.42;
    float t = time;
    float lw = 0.0016;
    float aa = 1.4 / s;
    float dl = min(abs(r - R), min(abs(r - 0.955 * R), min(abs(r - 0.815 * R), abs(r - 0.79 * R))));
    float ra = a + t * 0.05;
    float tu = ra / TAU * 72.0;
    vec2 tick = vec2((fract(tu) - 0.5) * TAU * r / 72.0, max(abs(r - 0.98 * R) - 0.015 * R, 0.0));
    dl = min(dl, length(tick));
    float u = ra / TAU * 20.0;
    float cell = mod(floor(u), 20.0);
    vec2 gp = vec2((fract(u) - 0.5) * TAU * r / 20.0, r - 0.885 * R);
    float gh = 0.05 * R;
    float gw = gh * 0.62;
    float h = hash21(vec2(cell, 135.0));
    float glyph = length(vec2(gp.x, max(abs(gp.y) - gh, 0.0)));
    glyph = min(glyph, segment(gp, vec2(-gw, (h - 0.5) * gh), vec2(gw, (h - 0.5) * gh)));
    glyph = min(glyph, segment(gp, vec2(-gw, -gh), vec2(gw * (h > 0.5 ? 1.0 : -1.0), gh)));
    dl = min(dl, glyph + step(gh * 1.6, abs(gp.y)) * 9.0);
    float rotation = -t * 0.035 + fract(135.0 * 0.0137) * 97.0;
    for (int i = 0; i < 5; i++) {
      float a0 = rotation + float(i) * TAU / 5.0;
      float a1 = rotation + (float(i) + 2.0) * TAU / 5.0;
      vec2 p0 = vec2(cos(a0), sin(a0)) * 0.79 * R;
      vec2 p1 = vec2(cos(a1), sin(a1)) * 0.79 * R;
      dl = min(dl, segment(q, p0, p1));
      dl = min(dl, abs(length(q - p0) - 0.035 * R));
    }
    float inner = 0.79 * R * cos(3.14159265 * 2.0 / 5.0);
    dl = min(dl, min(abs(r - inner), abs(r - inner * 0.55)));
    float core = 1.0 - smoothstep(lw, lw + aa, dl);
    float halo = exp(-max(dl, 0.0) / 0.010) * 0.6;
    float wide = exp(-abs(r - 0.885 * R) / (0.05 * R)) * 0.12;
    float breathe = 1.0 + 0.21 * sin(t * 0.7);
    float charge = pow(0.5 + 0.5 * cos(a - t * 0.5), 14.0);
    float fill = 0.4 * (1.0 - smoothstep(R * 0.96, R, r)) * (0.18 + 0.5 * smoothstep(0.1 * R, R, r));
    vec3 rgb = vec3(0.949, 0.992, 1.0) * core * breathe
      + vec3(0.31, 0.78, 1.0) * (halo + wide) * breathe
      + vec3(1.0) * charge * (core * 0.8 + halo * 0.9) * 1.1
      + vec3(0.051, 0.227, 0.416) * fill;
    float alpha = clamp(max(core, max((halo + wide) * 0.75, fill * 0.8)), 0.0, 1.0) * opacity;
    gl_FragColor = vec4(rgb * opacity, alpha);
  }
`;
