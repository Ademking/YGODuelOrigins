// The animated shadow-realm smoke behind every menu screen: the duel's own background shader on a small canvas stretched
// to the window (the smoke is soft, so 320x180 is plenty). Paused while the duel covers it or the tab is hidden.
import { arenaFragment } from '../ui/arenaShader';

const VERTEX = `attribute vec2 p; uniform vec2 resolution; varying vec2 fragCoord;
void main() { fragCoord = (p * 0.5 + 0.5) * resolution; gl_Position = vec4(p, 0.0, 1.0); }`;

export function mountBackdrop() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'pointer-events-none fixed inset-0 z-0 size-full';
  document.body.prepend(canvas);
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return canvas.remove(); // the CSS gradient on body stays
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const lowEnd = matchMedia('(pointer: coarse)').matches
    && (((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency || 8) <= 4);
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, arenaFragment(reduced ? '0.0' : '1.0')));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return canvas.remove();
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, 320, 180);
  gl.uniform2f(gl.getUniformLocation(program, 'resolution'), 320, 180);
  const viewport = gl.getUniformLocation(program, 'viewport'), time = gl.getUniformLocation(program, 'time');
  const draw = (ms: number) => {
    gl.uniform2f(viewport, innerWidth, innerHeight);
    gl.uniform1f(time, ms / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  draw(0);
  // ponytail: still frame on reduced motion and low-end phones, like the duel's own background
  if (reduced || lowEnd) { addEventListener('resize', () => draw(0)); return; }
  let last = 0;
  const frame = (ms: number) => {
    requestAnimationFrame(frame);
    if (ms - last < 1000 / 30 || document.querySelector('.duel-root')) return;
    last = ms;
    draw(ms);
  };
  requestAnimationFrame(frame);
}
