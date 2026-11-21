// Full-rectangle GLSL effects (the arena smoke, field mats, fusion vortex, ritual circle, god and Exodia reveals).
// The fragment sources are written in the Shadertoy style: uniforms `resolution`, `time`, a varying `fragCoord` in
// pixels with y up, and premultiplied output. ShaderQuad feeds them through a Pixi Mesh, so they scale, fade (alpha)
// and sit in the display list like any other object.
import { Geometry, GlProgram, Mesh, Shader, Texture, UniformGroup, type Ticker } from 'pixi.js';

const VERTEX = `
attribute vec2 aPosition;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform mat3 uTransformMatrix;
uniform vec4 uColor;
uniform vec2 uQuadSize;
varying vec2 fragCoord;
varying float vAlpha;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition * uQuadSize, 1.0)).xy, 0.0, 1.0);
  fragCoord = vec2(aPosition.x, 1.0 - aPosition.y) * uQuadSize;
  vAlpha = uColor.a * uWorldColorAlpha.a;
}`;

/** Wrap a Shadertoy-style fragment: its main() runs, then the result fades with the object's alpha. */
function wrapFragment(source: string) {
  const renamed = source.replace(/void\s+main\s*\(\s*(void)?\s*\)/, 'void effectMain()');
  return `${renamed}
varying float vAlpha;
void main() { effectMain(); gl_FragColor *= vAlpha; }`;
}

type UniformValue = number | [number, number];
const programs = new Map<string, GlProgram>();

export class ShaderQuad extends Mesh<Geometry, Shader> {
  readonly uniforms: Record<string, UniformValue>;
  private group: UniformGroup;
  private ticker?: Ticker;
  private tick = () => { this.uniforms.time = (performance.now() - this.born) / 1000; };
  private born = performance.now();

  /**
   * `width` x `height`: the drawn size in world pixels (the shader sees the same size as `resolution`).
   * `extra`: the shader's own float uniforms with their starting values. `channel`: a texture bound to iChannel0.
   */
  constructor(fragment: string, width: number, height: number, extra: Record<string, number> = {}, channel?: Texture, ticker?: Ticker, name = 'effect') {
    const geometry = new Geometry({
      attributes: { aPosition: [0, 0, 1, 0, 1, 1, 0, 1] },
      indexBuffer: [0, 1, 2, 0, 2, 3],
    });
    let glProgram = programs.get(fragment);
    if (!glProgram) {
      glProgram = GlProgram.from({ vertex: VERTEX, fragment: wrapFragment(fragment), name });
      programs.set(fragment, glProgram);
    }
    const values: Record<string, { value: unknown; type: string }> = {
      resolution: { value: new Float32Array([width, height]), type: 'vec2<f32>' },
      uQuadSize: { value: new Float32Array([width, height]), type: 'vec2<f32>' },
      time: { value: 0, type: 'f32' },
    };
    if (/uniform\s+vec2\s+viewport/.test(fragment)) values.viewport = { value: new Float32Array([width, height]), type: 'vec2<f32>' };
    for (const [key, value] of Object.entries(extra)) values[key] = { value, type: 'f32' };
    const group = new UniformGroup(values as never);
    const resources: Record<string, unknown> = { effect: group };
    if (channel) resources.iChannel0 = channel.source;
    super({ geometry, shader: new Shader({ glProgram, resources }) });
    this.group = group;
    const uniforms = group.uniforms as Record<string, unknown>;
    this.uniforms = new Proxy({} as Record<string, UniformValue>, {
      get: (_, key: string) => uniforms[key] as UniformValue,
      set: (_, key: string, value: UniformValue) => {
        if (Array.isArray(value)) (uniforms[key] as Float32Array).set(value);
        else uniforms[key] = value;
        group.update();
        return true;
      },
    });
    if (ticker) { this.ticker = ticker; ticker.add(this.tick); }
  }

  /** Resize the quad (and the shader's resolution). */
  setSize(width: number, height: number) {
    const uniforms = this.group.uniforms as Record<string, Float32Array>;
    uniforms.resolution[0] = width; uniforms.resolution[1] = height;
    uniforms.uQuadSize[0] = width; uniforms.uQuadSize[1] = height;
    this.group.update();
    return this;
  }

  setViewport(width: number, height: number) {
    const uniforms = this.group.uniforms as Record<string, Float32Array>;
    if (!uniforms.viewport) return this;
    uniforms.viewport[0] = width; uniforms.viewport[1] = height;
    this.group.update();
    return this;
  }

  freezeTime() { this.ticker?.remove(this.tick); }

  override destroy(options?: Parameters<Mesh['destroy']>[0]) {
    this.ticker?.remove(this.tick);
    super.destroy(options);
  }
}
