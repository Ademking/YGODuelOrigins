// The shadow-realm backdrop: slow indigo smoke with drifting brass embers. Shared by the Phaser duel (ui/theme) and the
// HTML menus (app/backdrop). Uniforms follow Phaser's BaseShader: resolution, viewport, time (seconds), fragCoord (y down).
export const arenaFragment = (motion: '0.0' | '1.0') => `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform vec2 resolution;
      uniform vec2 viewport;
      uniform float time;
      varying vec2 fragCoord;

      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
        float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
        float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
        float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm2(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int octave = 0; octave < 4; octave++) {
          value += amplitude * noise(p);
          p = p * 2.0 + vec2(17.1, 9.2);
          amplitude *= 0.5;
        }
        return value;
      }

      float hash21(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec2 uv = vec2(fragCoord.x, resolution.y - fragCoord.y) / resolution;
        vec2 px = uv * resolution;
        vec2 q = (uv - 0.5) * viewport / min(viewport.x, viewport.y);
        float t = time * ${motion};
        float swirl = 1.8;
        float rim = 0.8;
        float sparks = 0.6;
        vec2 so = vec2(fract(496.0 * 0.0137) * 60.0, fract(496.0 * 0.0291) * 40.0);
        vec3 deep = vec3(4.0, 3.0, 10.0) / 255.0;
        vec3 smoke = vec3(15.0, 14.0, 34.0) / 255.0;
        vec3 glow = vec3(50.0, 44.0, 138.0) / 255.0;
        vec3 spark = vec3(255.0, 200.0, 120.0) / 255.0;
        float hgt = 1.0 - uv.y;
        vec2 pb = q * 0.8 + so.yx + vec2(t * 0.01, t * 0.03);
        float fb = fbm2(pb + vec2(fbm2(pb * 1.3 + 2.0), fbm2(pb * 1.3 + 7.0)) * swirl * 0.7);
        float lowg = pow(1.0 - smoothstep(0.0, 1.05, hgt), 1.3) * 0.6;
        vec3 col = deep + glow * (lowg * 0.38 + smoothstep(0.3, 0.85, fb) * 0.32 * (0.4 + lowg));
        col += spark * pow(smoothstep(0.45, 0.85, fb), 3.0) * lowg * 0.3;
        vec2 p = q * 1.5 + so + vec2(0.0, t * 0.05);
        vec2 w = vec2(fbm2(p * 0.9 + vec2(t * 0.015, 0.0)), fbm2(p * 0.9 + vec2(4.7, 1.3) - vec2(0.0, t * 0.012)));
        float f = fbm2(p + w * swirl);
        float f2 = fbm2(p * 2.2 + w * swirl * 1.3 + vec2(3.1, t * 0.05));
        float dens = smoothstep(0.32, 0.62, f * 0.72 + f2 * 0.38);
        float edge = smoothstep(0.0, 0.45, dens) * (1.0 - smoothstep(0.45, 1.0, dens));
        col = mix(col, smoke * (0.45 + 0.5 * lowg), dens * 0.94);
        col += glow * edge * rim * (0.15 + 0.55 * lowg);
        vec2 rp = q * 2.4 + w * swirl * 1.1 + vec2(so.x, t * 0.07);
        float rn = fbm2(rp);
        float ridge = pow(1.0 - abs(rn * 2.0 - 1.0), 7.0);
        col += mix(glow, spark, 0.25) * ridge * rim * (0.25 + 0.6 * lowg) * (1.0 - dens * 0.6);
        for (int i = 0; i < 2; i++) {
          float fi = float(i);
          float cs = mix(34.0, 20.0, fi);
          vec2 g = q * cs + vec2(sin(q.y * 3.0 + t * 0.4 + fi) * 0.6, t * (0.7 + 0.5 * fi) + fi * 9.0) + so;
          vec2 id = floor(g);
          float h = hash21(id + vec2(fi * 4.3, 0.7));
          vec2 lv = fract(g) - vec2(0.3 + 0.4 * hash21(id + 2.9), 0.5);
          float sd = length(vec2(lv.x, max(lv.y, 0.0) * 0.5 + min(lv.y, 0.0)));
          float fl = 0.55 + 0.45 * sin(t * (2.0 + 2.0 * h) + h * 50.0);
          float spk = step(0.93, h) * (1.0 - smoothstep(0.0, 0.1, sd)) * fl * smoothstep(0.0, 0.2, hgt) * (1.0 - smoothstep(0.35, 0.95, hgt)) * mix(0.6, 1.0, fi);
          col += spark * spk * sparks * 1.2 + glow * step(0.93, h) * exp(-sd * 10.0) * fl * sparks * 0.12;
        }
        col *= 1.0 - 0.4 * smoothstep(0.6, 1.4, length(q * vec2(0.8, 1.0)));
        col += (fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715)))) - 0.5) * 0.008;
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }
    `;
