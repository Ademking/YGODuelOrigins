// Most Field Spell playmats are the card's own artwork (cropped art, fetched on demand) run through one cheap shader:
// fit, slow pan/zoom, a soft light sweep, plus one per-card motion effect. A few use a hand-written procedural scene
// instead (a GLSL body reading uv, p, t and writing col). accent is the fallback colour while art loads, if it fails,
// or on the Canvas renderer.
type Fx = 'heat' | 'wind' | 'water' | 'swirl' | 'pulse' | 'drift';

export const FIELD_MATS = {
  // Heavenly glow, a temple on lit cloud banks, drifting golden notes, sparkles, a bed of roses.
  'Chorus of Sanctuary': { accent: '#7fa6d6', scene: `
    vec2 glowP = vec2(-0.4, -0.45);
    float gd = length(p - glowP);
    col = mix(vec3(0.25, 0.48, 0.82), vec3(0.8, 0.86, 0.97), smoothstep(0.0, 0.55, uv.y));
    col = mix(col, vec3(1.0, 0.94, 0.78), exp(-gd * 2.4) * 0.8);
    col += vec3(1.0, 0.92, 0.7) * pow(noise2(normalize(p - glowP) * 7.0 + vec2(t * 0.05, 0.0)), 2.5) * exp(-gd * 1.4) * 0.5;
    vec2 g = vec2(p.x - 0.42, uv.y - 0.5);
    float gw = 0.17;
    float pillars = step(abs(g.x), gw) * step(-0.1, g.y) * step(g.y, 0.0) * step(0.5, fract((g.x + gw) * 20.0));
    float beam = step(abs(g.x), gw + 0.012) * step(-0.125, g.y) * step(g.y, -0.1);
    float ped = step(abs(g.x), gw + 0.012) * step(g.y, -0.125) * step(-0.125 - 0.055 * (1.0 - abs(g.x) / (gw + 0.012)), g.y);
    col += vec3(1.0, 0.95, 0.8) * exp(-length(g * vec2(1.0, 1.6) + vec2(0.0, 0.08)) * 5.0) * 0.35;
    col = mix(col, mix(vec3(0.86, 0.84, 0.95), col, 0.35), clamp(pillars + beam + ped, 0.0, 1.0));
    float cover = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float x = p.x * (1.6 + fi * 0.7) + t * (0.03 + fi * 0.02) + fi * 5.0;
      float edge = 0.53 + fi * 0.1 - abs(sin(x * 4.0 + sin(x * 1.7) * 1.5)) * 0.05 - (0.5 + 0.5 * sin(x * 1.3 + fi)) * 0.04;
      float m = smoothstep(edge - 0.006, edge + 0.006, uv.y);
      float lit = 1.0 - smoothstep(0.0, 0.12, uv.y - edge) * 0.5;
      col = mix(col, mix(vec3(0.68, 0.66, 0.86), vec3(1.0, 0.98, 0.96), lit) + vec3(1.0, 0.85, 0.6) * exp(-gd * 1.8) * 0.12, m);
      cover = max(cover, m);
    }
    float bed = smoothstep(0.0, 0.02, uv.y - (0.82 - abs(p.x) * 0.12 + 0.02 * sin(p.x * 7.0)));
    vec2 rq = p * 8.0;
    vec2 rid = floor(rq);
    vec2 rp = fract(rq) - 0.5 - (vec2(hash21(rid), hash21(rid + 19.1)) - 0.5) * 0.3;
    float rr = length(rp) / 0.38;
    float rh = hash21(rid + 3.3);
    float rose = (1.0 - smoothstep(0.88, 1.0, rr)) * step(0.2, rh);
    float petal = fract(rr * 3.0 + atan(rp.y, rp.x) / 6.2832);
    vec3 roseC = mix(vec3(0.55, 0.03, 0.1), vec3(0.98, 0.46, 0.55), rh) * (0.4 + 0.6 * petal) * (0.5 + 0.5 * smoothstep(0.0, 0.6, rr));
    vec3 leafC = mix(vec3(0.05, 0.16, 0.07), vec3(0.18, 0.38, 0.15), 0.5 + 0.5 * sin(p.x * 40.0 + sin(p.y * 30.0) * 2.0));
    col = mix(col, mix(leafC, roseC, rose), bed);
    vec2 nq = p * 4.5 + vec2(0.0, t * 0.35);
    vec2 nid = floor(nq);
    vec2 nf = fract(nq) - 0.5 + (vec2(hash21(nid + 3.1), hash21(nid + 5.7)) - 0.5) * 0.3;
    nf.x += sin(t * 0.8 + nid.y * 2.0) * 0.05;
    float headN = 1.0 - smoothstep(0.06, 0.08, length((nf - vec2(-0.03, 0.1)) * vec2(1.0, 1.5)));
    float stemN = segment(nf, vec2(0.03, 0.09), vec2(0.03, -0.16), 0.006);
    float flagN = segment(nf, vec2(0.03, -0.16), vec2(0.1, -0.06), 0.008) * step(0.5, hash21(nid + 2.0));
    float show = step(0.66, hash21(nid)) * (1.0 - bed);
    col += vec3(1.0, 0.85, 0.45) * exp(-length(nf) * 8.0) * show * 0.2;
    col = mix(col, vec3(0.98, 0.8, 0.38), clamp(headN + stemN + flagN, 0.0, 1.0) * show);
    vec2 kq = p * 18.0;
    vec2 kid = floor(kq);
    vec2 kf = fract(kq) - 0.5;
    float star = (exp(-abs(kf.x) * 40.0) * exp(-abs(kf.y) * 8.0) + exp(-abs(kf.y) * 40.0) * exp(-abs(kf.x) * 8.0)) * step(0.93, hash21(kid + 4.0));
    col += vec3(1.0, 0.97, 0.85) * star * pow(0.5 + 0.5 * sin(t * 3.0 + hash21(kid) * 30.0), 6.0) * (1.0 - cover) * (1.0 - bed) * 0.6;` },
  'The Seal of Orichalcos': { accent: '#237b62', passcode: '48179391', fx: 'pulse' },
  'Forest': { accent: '#3b7741', passcode: '87430998', fx: 'wind' },
  // Purple vortex over a scrolling neon-green wireframe floor.
  'Fusion Gate': { accent: '#512774', scene: `
    float horizon = 0.68;
    vec2 v = p - vec2(0.0, -0.08);
    float r = max(length(v), 0.002);
    float tw = atan(v.y, v.x) * 3.0 + log(r + 0.02) * 4.0 - t * 0.7;
    float streak = fbm(vec2(cos(tw), sin(tw)) * 1.6 + r * 5.0);
    float swirl = pow(0.5 + 0.5 * cos(tw + streak * 4.0), 4.0);
    col = vec3(0.04, 0.02, 0.07) + mix(vec3(0.28, 0.12, 0.42), vec3(0.78, 0.38, 0.88), swirl) * (0.25 + swirl * 0.6) * exp(-r * 0.8);
    col += vec3(0.25, 0.4, 0.3) * smoothstep(0.55, 0.8, streak) * 0.15;
    col *= mix(0.12, 1.0, smoothstep(0.04, 0.24, r));
    float below = max(uv.y - horizon, 0.001);
    float z = 0.12 / below;
    vec2 gl = abs(fract(vec2(p.x * z, z + t * 0.5) * 2.0) - 0.5);
    float grid = max(1.0 - smoothstep(0.0, min(0.005 * z + 0.02, 0.5), gl.x),
                     1.0 - smoothstep(0.0, min(0.042 * z * z + 0.02, 0.5), gl.y)) * exp(-z * 0.12);
    vec3 floorCol = col * 0.15 + vec3(0.35, 1.0, 0.6) * grid + vec3(0.2, 0.6, 0.4) * exp(-below * 30.0) * 0.3;
    col = mix(col, floorCol, step(horizon, uv.y));` },
  'Gaia Power': { accent: '#435d34', passcode: '56594520', fx: 'wind' },
  'Luminous Spark': { accent: '#dfd8b2', passcode: '81777047', fx: 'pulse' },
  'Molten Destruction': { accent: '#6e2822', passcode: '19384334', fx: 'heat' },
  'Mountain': { accent: '#64788b', passcode: '50913601', fx: 'drift' },
  'Mystic Plasma Zone': { accent: '#4a3a9a', passcode: '18161786', fx: 'swirl' },
  // Open blue sky with soft clouds and diagonal wind streaks rushing upward.
  'Rising Air Current': { accent: '#98bed0', scene: `
    col = mix(vec3(0.18, 0.42, 0.78), vec3(0.55, 0.75, 0.95), uv.x * 0.6 + uv.y * 0.4);
    col = mix(col, vec3(0.92, 0.95, 1.0), smoothstep(0.55, 0.8, fbm(vec2(p.x * 2.0 - t * 0.08, p.y * 3.0))) * 0.35);
    vec2 w = rot(-0.7) * p;
    float lane = w.y * 18.0;
    float h = hash21(vec2(floor(lane), 3.0));
    float seg = fract(w.x * 0.6 - t * (0.3 + h * 0.5) + h * 7.0);
    float bright = smoothstep(0.0, 0.5, seg) * (1.0 - smoothstep(0.55, 0.85, seg));
    float width = 1.0 - smoothstep(0.05, 0.25 + h * 0.15, abs(fract(lane) - 0.5));
    col += vec3(0.9, 0.95, 1.0) * bright * width * step(0.45, h) * 0.5;` },
  'Sogen': { accent: '#799b58', passcode: '86318356', fx: 'wind' },
  'Umi': { accent: '#146d80', passcode: '22702055', fx: 'water' },
  'Umiiruka': { accent: '#268ea1', passcode: '82999629', fx: 'water' },
  'Wasteland': { accent: '#806c5a', passcode: '23424603', fx: 'heat' },
  'Yami': { accent: '#5a0d2a', passcode: '59197169', fx: 'pulse' },
  // YGO Online Field Spells: card artwork with a motion effect chosen from the card's theme.
  "A Legendary Ocean": { accent: '#1d6e8a', passcode: '295517', fx: 'water' },
  "Acidic Downpour": { accent: '#a8431c', passcode: '35956022', fx: 'heat' },
  "Ancient City - Rainbow Ruins": { accent: '#5b7fa8', passcode: '34487429', fx: 'wind' },
  "Array of Revealing Light": { accent: '#b08a2e', passcode: '69296555', fx: 'swirl' },
  "Canyon": { accent: '#5f6b3a', passcode: '28120197', fx: 'drift' },
  "Centrifugal Field": { accent: '#5f6b3a', passcode: '1801154', fx: 'drift' },
  "Clock Tower Prison": { accent: '#5b7fa8', passcode: '75041269', fx: 'wind' },
  "Colosseum - Cage of the Gladiator Beasts": { accent: '#b08a2e', passcode: '52518793', fx: 'swirl' },
  "Dark City": { accent: '#5b7fa8', passcode: '53527835', fx: 'wind' },
  "Harpies' Hunting Ground": { accent: '#5b7fa8', passcode: '75782277', fx: 'wind' },
  "Jurassic World": { accent: '#a8431c', passcode: '10080320', fx: 'heat' },
  "Light Barrier": { accent: '#b08a2e', passcode: '73206827', fx: 'swirl' },
  "Mausoleum of the Emperor": { accent: '#5f6b3a', passcode: '80921533', fx: 'drift' },
  "Necrovalley": { accent: '#4a2a6e', passcode: '47355498', fx: 'pulse' },
  "Neo Space": { accent: '#4a2a6e', passcode: '42015635', fx: 'pulse' },
  "Otherworld - The \"A\" Zone": { accent: '#4a2a6e', passcode: '60946968', fx: 'pulse' },
  "Pandemonium": { accent: '#4a2a6e', passcode: '94585852', fx: 'pulse' },
  "Realm of Light": { accent: '#b08a2e', passcode: '36099620', fx: 'swirl' },
  "Shien's Castle of Mist": { accent: '#5b7fa8', passcode: '11102908', fx: 'wind' },
  "Skyscraper": { accent: '#5b7fa8', passcode: '63035430', fx: 'wind' },
  "Skyscraper 2 - Hero City": { accent: '#5b7fa8', passcode: '47596607', fx: 'wind' },
  "The Sanctuary in the Sky": { accent: '#5b7fa8', passcode: '56433456', fx: 'wind' },
  "Venom Swamp": { accent: '#1d6e8a', passcode: '54306223', fx: 'water' },
  "Wetlands": { accent: '#1d6e8a', passcode: '2084239', fx: 'water' },
} as const satisfies Record<string, { accent: string } & ({ passcode: string; fx: Fx } | { scene: string })>;

export type FieldMatName = keyof typeof FIELD_MATS;

export function activeFieldMat(fields: readonly ({ faceUp: boolean; def: { name: string } } | null)[]): FieldMatName | null {
  const field = fields.find((card) => card?.faceUp && Object.prototype.hasOwnProperty.call(FIELD_MATS, card.def.name));
  return (field?.def.name as FieldMatName | undefined) ?? null;
}

// ponytail: derived from the card image base; a custom VITE_CARD_IMAGE_BASE must also serve /cards_cropped/.
const CROPPED_BASE = (import.meta.env?.VITE_CARD_IMAGE_BASE ?? 'https://wsrv.nl/?url=images.ygoprodeck.com/images/cards/')
  .replace('/cards/', '/cards_cropped/');

const passcodeOf = (name: FieldMatName) => (FIELD_MATS[name] as { passcode?: string }).passcode;

/** Texture key of a field's artwork, or null for procedural mats. */
export const fieldArtKey = (name: FieldMatName) => (passcodeOf(name) ? `field-art-${passcodeOf(name)}` : null);

/** Load a field's cropped artwork as a softened 512×512 texture (power of two so WebGL1 can sample it). True when the mat can
 * be drawn: art loaded, or a procedural mat that needs none. */
export function loadFieldArt(textures: Phaser.Textures.TextureManager, name: FieldMatName): Promise<boolean> {
  const key = fieldArtKey(name);
  if (!key || textures.exists(key)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!textures.exists(key)) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 512;
        const ctx = canvas.getContext('2d')!;
        // The crop is small and JPEG-compressed, and the mat stretches it across the duel area, so it is blurred
        // once here: it reads as an out-of-focus backdrop instead of blocky pixels. Drawn slightly oversized so the
        // blur does not fade the edges. ponytail: ctx.filter; a browser without it (Safari < 18) shows the art unblurred.
        ctx.filter = 'blur(3px)';
        ctx.drawImage(img, -10, -10, 532, 532);
        textures.addCanvas(key, canvas);
      }
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = `${CROPPED_BASE}${passcodeOf(name)}.jpg`;
  });
}

const FX: Record<Fx, string> = {
  heat: 'a.x += sin(a.y * 45.0 - t * 6.0) * 0.0025 * smoothstep(0.3, 1.0, a.y);',
  wind: 'a.x += sin(a.y * 9.0 + t * 2.2) * 0.004 * smoothstep(0.45, 1.0, a.y);',
  water: 'a += vec2(sin(a.y * 28.0 + t * 2.4), cos(a.x * 22.0 + t * 1.9)) * 0.0025;',
  swirl: 'vec2 d = a - 0.5; float ang = 0.12 * sin(t * 0.6) * (1.0 - smoothstep(0.0, 0.6, length(d))); a = 0.5 + mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * d;',
  pulse: '',
  drift: '',
};

export function fieldMatShader(name: FieldMatName, reducedMotion: boolean): string {
  const mat = FIELD_MATS[name];
  if ('scene' in mat) return proceduralShader(mat.scene, reducedMotion);
  const { fx } = mat;
  return `
    precision mediump float;
    uniform vec2 resolution;
    uniform float time;
    uniform float opacity;
    uniform sampler2D iChannel0;
    varying vec2 fragCoord;
    void main() {
      vec2 uv = vec2(fragCoord.x, resolution.y - fragCoord.y) / resolution;
      float t = time * ${reducedMotion ? '0.0' : '0.22'};
      float aspect = resolution.x / resolution.y;
      // Fit the square art to the wide screen (ponytail: up to ~1.4x horizontal stretch so more of the art shows), then a slow Ken Burns zoom and pan.
      vec2 a = vec2(uv.x, 0.5 + (uv.y - 0.5) * min(1.0, 1.4 / aspect));
      a = 0.5 + (a - 0.5) / (1.06 + 0.04 * sin(t * 0.25)) + vec2(sin(t * 0.17), cos(t * 0.13)) * 0.012;
      ${FX[fx]}
      vec3 col = texture2D(iChannel0, clamp(a, 0.0, 1.0)).rgb;
      ${fx === 'pulse' ? 'col *= 0.9 + 0.12 * sin(t * 1.5);' : ''}
      ${fx === 'heat' ? 'col += vec3(1.0, 0.4, 0.1) * max(col.r - col.b - 0.3, 0.0) * (0.25 + 0.2 * sin(t * 2.0 + a.y * 6.0));' : ''}
      float sweep = smoothstep(0.85, 1.0, sin((uv.x + uv.y * 0.5) * 3.0 - t * 0.7));
      col += col * sweep * 0.12;
      // ponytail: one global dim + vignette keeps cards readable over busy art; tune here if the board reads too dark.
      col *= 0.62 * (1.0 - 0.35 * smoothstep(0.35, 0.95, length((uv - 0.5) * vec2(aspect, 1.0))));
      // fine film grain at screen resolution: gives the soft backdrop some tooth and hides colour banding
      col += (fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715)))) - 0.5) * 0.035;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0) * opacity, opacity);
    }
  `;
}

function proceduralShader(scene: string, reducedMotion: boolean): string {
  return `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform vec2 resolution;
    uniform float time;
    uniform float opacity;
    varying vec2 fragCoord;
    float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise2(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x), f.y);
    }
    float fbm(vec2 p) { return noise2(p) * 0.57 + noise2(p * 2.03 + 8.7) * 0.29 + noise2(p * 4.1 + 3.2) * 0.14; }
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    float segment(vec2 p, vec2 a, vec2 b, float width) {
      vec2 v = b - a;
      float h = clamp(dot(p - a, v) / dot(v, v), 0.0, 1.0);
      return 1.0 - smoothstep(width, width + 0.014, length(p - a - v * h));
    }
    void main() {
      vec2 uv = vec2(fragCoord.x, resolution.y - fragCoord.y) / resolution;
      float t = time * ${reducedMotion ? '0.0' : '0.22'};
      vec2 p = (uv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
      vec3 col = vec3(0.0);
      ${scene}
      // Same dim + vignette idea as the art mats so cards stay readable.
      col *= 0.72 * (1.0 - 0.32 * smoothstep(0.35, 1.0, length(p)));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0) * opacity, opacity);
    }
  `;
}
