type Vector = [number, number, number];
type Point = { x: number; y: number };
export interface DieFace { value: number; points: Point[]; pips: Point[]; depth: number; light: number }

const patterns: Record<number, [number, number][]> = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

export function projectDie(result: number, pitch: number, yaw: number, roll: number): DieFace[] {
  const remaining = [1, 2, 3, 4, 5, 6].filter(value => value !== result && value !== 7 - result);
  const first = remaining[0], second = remaining.find(value => value !== first && value !== 7 - first)!;
  const faces: { normal: Vector; right: Vector; down: Vector; value: number }[] = [
    { normal: [0, 0, 1], right: [1, 0, 0], down: [0, 1, 0], value: result },
    { normal: [0, 0, -1], right: [-1, 0, 0], down: [0, 1, 0], value: 7 - result },
    { normal: [1, 0, 0], right: [0, 0, -1], down: [0, 1, 0], value: first },
    { normal: [-1, 0, 0], right: [0, 0, 1], down: [0, 1, 0], value: 7 - first },
    { normal: [0, 1, 0], right: [1, 0, 0], down: [0, 0, -1], value: second },
    { normal: [0, -1, 0], right: [1, 0, 0], down: [0, 0, 1], value: 7 - second },
  ];
  const rotate = ([x, y, z]: Vector): Vector => {
    const cy = Math.cos(pitch), sy = Math.sin(pitch);
    const rotatedY = y * cy - z * sy, rotatedZ = y * sy + z * cy;
    const cx = Math.cos(yaw), sx = Math.sin(yaw);
    const rotatedX = x * cx + rotatedZ * sx, depth = -x * sx + rotatedZ * cx;
    const cr = Math.cos(roll), sr = Math.sin(roll);
    return [rotatedX * cr - rotatedY * sr, rotatedX * sr + rotatedY * cr, depth];
  };
  const project = ([x, y, z]: Vector): Point => {
    const scale = 180 / (180 - z);
    return { x: x * scale, y: y * scale };
  };
  const pointOnFace = (normal: Vector, right: Vector, down: Vector, x: number, y: number): Vector => [
    normal[0] * 38 + right[0] * x + down[0] * y,
    normal[1] * 38 + right[1] * x + down[1] * y,
    normal[2] * 38 + right[2] * x + down[2] * y,
  ];
  return faces.flatMap(({ normal, right, down, value }) => {
    const facing = rotate(normal);
    if (facing[2] <= 0.001) return [];
    const corners = [[-38, -38], [38, -38], [38, 38], [-38, 38]].map(([x, y]) => rotate(pointOnFace(normal, right, down, x, y)));
    const light = Math.max(0, facing[0] * -0.3 + facing[1] * -0.4 + facing[2] * 0.85);
    return [{ value, points: corners.map(project), pips: patterns[value].map(([x, y]) => project(rotate(pointOnFace(normal, right, down, x * 17, y * 17)))), depth: corners.reduce((sum, corner) => sum + corner[2], 0) / 4, light }];
  }).sort((left, right) => left.depth - right.depth);
}
