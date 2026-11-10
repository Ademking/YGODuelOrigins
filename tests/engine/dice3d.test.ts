import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectDie } from '../../src/ui/dice3d';

test('the resting die shows the rolled result and matching pips', () => {
  for (let result = 1; result <= 6; result++) {
    const faces = projectDie(result, -0.25, 0.38, 0);
    const front = faces[faces.length - 1];
    assert.equal(front.value, result);
    assert.equal(front.pips.length, result);
    assert.equal(faces.length, 3);
    for (const face of faces) {
      assert.equal(face.points.length, 4);
      assert.equal(face.pips.length, face.value);
      for (const point of [...face.points, ...face.pips]) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    }
  }
});

test('the die remains visible throughout its tumble', () => {
  for (let step = 0; step <= 40; step++) {
    const remaining = 1 - step / 40;
    const faces = projectDie(6, -0.25 + Math.PI * 4 * remaining, 0.38 + Math.PI * 4 * remaining, Math.PI * 2 * remaining);
    assert.ok(faces.length >= 1 && faces.length <= 3);
  }
});
