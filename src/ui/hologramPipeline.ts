import Phaser from 'phaser';

const fragment = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  uniform sampler2D uMainSampler[%count%];
  uniform float uTime;
  varying vec2 outTexCoord;
  varying float outTexId;
  varying float outTintEffect;
  varying vec4 outTint;

  void main() {
    vec4 texture;
    %forloop%
    vec4 color = texture * vec4(outTint.bgr * outTint.a, outTint.a);
    float shimmer = 0.5 + 0.5 * sin(outTexCoord.y * 10.0 - uTime * 1.3);
    color.rgb *= vec3(0.97, 1.0, 1.0);
    color.rgb += vec3(0.01, 0.025, 0.035) * color.a * shimmer;
    gl_FragColor = vec4(min(color.rgb, vec3(color.a)), color.a);
  }
`;

export class HologramPipeline extends Phaser.Renderer.WebGL.Pipelines.MultiPipeline {
  private reducedMotion: boolean;

  constructor(game: Phaser.Game) {
    super({ game, fragShader: fragment });
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  onPreRender() {
    this.set1f('uTime', this.reducedMotion ? 0 : this.game.loop.getDuration());
  }
}
