import type { CardDef } from '../engine/types';

export function evolveColor(card: CardDef, faceUp: boolean): number {
  if (!faceUp) return 0x92b3cf;
  if (card.kind === 'spell') return 0x35d9bc;
  if (card.kind === 'trap') return 0xee69bc;
  switch (card.mtype) {
    case 'fusion': return 0xb16aff;
    case 'ritual': return 0x56aaff;
    case 'effect': return 0xff994d;
    default: return 0xf2cb69;
  }
}

export function evolveShader(color: number, imageWidth: number, imageHeight: number): string {
  const red = ((color >> 16) & 255) / 255;
  const green = ((color >> 8) & 255) / 255;
  const blue = (color & 255) / 255;
  return `
    precision mediump float;
    uniform vec2 resolution;
    uniform float time;
    uniform float amount;
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
      return noise2(p) * 0.57 + noise2(p * 2.03 + 7.1) * 0.29
        + noise2(p * 4.11 + 13.7) * 0.14;
    }

    void main() {
      vec2 px = vec2(fragCoord.x, resolution.y - fragCoord.y);
      vec2 size = vec2(${imageWidth.toFixed(2)}, ${imageHeight.toFixed(2)});
      vec2 uv = (px - (resolution - size) * 0.5) / size;
      float m = sqrt(size.x * size.y);
      float radius = max(1.0, min(0.42 * m, 0.44 * min(size.x, size.y)));
      vec2 d = (uv - vec2(0.5)) * size / radius;
      float r = length(d);
      float angle = atan(d.y, d.x);
      float aa = 1.2 / radius;
      float beat = 0.9 + 0.1 * sin(time * 2.0);
      float band = smoothstep(0.65, 0.72, r) * (1.0 - smoothstep(1.02, 1.12, r));
      float outer = 1.0 - smoothstep(0.012, 0.012 + aa, abs(r - 0.99));
      float inner = 1.0 - smoothstep(0.009, 0.009 + aa, abs(r - 0.72));
      float middle = 1.0 - smoothstep(0.008, 0.008 + aa, abs(r - 0.85));
      float rotation = time * 0.22;
      mat2 turn = mat2(cos(rotation), -sin(rotation), sin(rotation), cos(rotation));
      float textureLight = fbm2(turn * d * 18.0 + vec2(time * 0.4, 3.0));
      float sparks = pow(textureLight, 3.0);
      float u = (angle + time * 0.32) / 6.2831853 * 30.0;
      float glyphCell = floor(u + 100.0);
      float glyphX = fract(u) - 0.5;
      float glyphY = (r - 0.785) / 0.055;
      float variation = hash21(vec2(glyphCell, 9.0));
      float stroke = 1.0 - smoothstep(0.08, 0.17, abs(glyphX + (variation - 0.5) * glyphY * 0.5));
      float crossbar = (1.0 - smoothstep(0.09, 0.2, abs(glyphY - (variation - 0.5)))) * step(abs(glyphX), 0.34);
      float glyph = max(stroke, crossbar) * (1.0 - smoothstep(0.7, 1.0, abs(glyphY)));
      float glow = exp(-pow((r - 0.87) * 5.0, 2.0));
      vec3 tint = vec3(${red.toFixed(4)}, ${green.toFixed(4)}, ${blue.toFixed(4)});
      float mark = clamp(outer + inner + middle * 0.5 + glyph * 0.65, 0.0, 1.0);
      float light = (band * (0.18 + sparks * 0.9) + mark * 0.65 + glow * 0.12) * beat;
      vec2 edge = min(px, resolution - px) / resolution;
      float edgeFade = smoothstep(0.0, 0.16, min(edge.x, edge.y));
      float alpha = clamp(light * amount * edgeFade, 0.0, 0.85);
      vec3 color = mix(tint, vec3(1.0), mark * 0.35);
      gl_FragColor = vec4(color * alpha, alpha);
    }
  `;
}
