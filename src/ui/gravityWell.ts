export function gravityWellShader(reducedMotion: boolean): string {
  return `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform vec2 resolution;
    uniform float time;
    uniform float reveal;
    uniform sampler2D iChannel0;
    varying vec2 fragCoord;

    float hash21(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float noise2(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
                 mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x), f.y);
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

    float alphaAt(vec2 px) {
      vec2 uv = (px - (resolution - vec2(690.0, 230.0)) * 0.5) / vec2(690.0, 230.0);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
      return texture2D(iChannel0, uv).a;
    }

    float blurAt(vec2 px, float radius) {
      float sum = alphaAt(px) * 0.2;
      sum += (alphaAt(px + vec2(radius, 0.0)) + alphaAt(px - vec2(radius, 0.0))
           + alphaAt(px + vec2(0.0, radius)) + alphaAt(px - vec2(0.0, radius))) * 0.1;
      vec2 diag = vec2(radius * 0.7071);
      sum += (alphaAt(px + diag) + alphaAt(px - diag)
           + alphaAt(px + vec2(diag.x, -diag.y)) + alphaAt(px + vec2(-diag.x, diag.y))) * 0.1;
      return sum;
    }

    void main() {
      vec2 px = vec2(fragCoord.x, resolution.y - fragCoord.y);
      vec2 uv = px / resolution;
      float t = time * ${reducedMotion ? '0.0' : '1.0'};
      vec2 sd = vec2(fract(406.0 * 0.6180339) * 53.0 + 20.0, fract(406.0 * 0.3819660) * 47.0 + 20.0);
      float ms = min(resolution.x, resolution.y);
      float edgeFade = smoothstep(0.0, 0.12, uv.x) * smoothstep(0.0, 0.12, 1.0 - uv.x)
                     * smoothstep(0.0, 0.12, uv.y) * smoothstep(0.0, 0.12, 1.0 - uv.y);
      float outside = 1.0 - alphaAt(px);
      float nearT = blurAt(px, ms * 0.02);
      float nearM = blurAt(px, ms * 0.2 * 0.45);
      float nearW = blurAt(px, ms * 0.2) * 0.65 + nearM * 0.35;
      vec2 p = (px - resolution * 0.5) / ms;
      float r = max(length(p), 0.001);
      float ang = t * 0.22 + 2.5 * log(r + 0.05);
      float cs = cos(ang), sn = sin(ang);
      vec2 q = vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
      float arms = fbm2(q * 5.0 + sd);
      float arms2 = noise2(q * 11.0 - sd * 0.5);
      float gas = smoothstep(0.4, 0.68, arms * 0.75 + arms2 * 0.35);
      float shadowA = smoothstep(0.05, 0.55, nearM) * outside * 0.6 * edgeFade;
      float diskBand = clamp(nearW * 2.2 - nearT * 0.5, 0.0, 1.0) * outside * edgeFade;
      float diskI = diskBand * (0.08 + 0.92 * gas);
      float ringI = smoothstep(0.08, 0.5, nearT) * (1.0 - smoothstep(0.5, 0.95, nearT)) * outside * edgeFade;
      float ringPulse = 0.85 + 0.15 * sin(t * 0.6 + sd.x);
      vec3 ring = vec3(255.0, 241.0, 214.0) / 255.0;
      vec3 hot = vec3(255.0, 173.0, 66.0) / 255.0;
      vec3 cool = vec3(214.0, 48.0, 79.0) / 255.0;
      vec3 gasCol = mix(cool, hot, clamp(gas * 0.6 + nearM * 0.6, 0.0, 1.0));
      vec3 light = gasCol * diskI * 0.9 + ring * ringI * ringPulse * 0.9 + hot * ringI * 0.3;
      float alpha = clamp(max(shadowA * 0.7, diskI * 0.45 + ringI * 0.6), 0.0, 1.0) * reveal;
      gl_FragColor = vec4(min(light * reveal, vec3(alpha)), alpha);
    }
  `;
}
