import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lerp, spineWidth, spineHeight, circlePosition, arcPosition, springStep,
} from "../../js/lib/geometry.js";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~= ${b}`);

test("lerp hits both ends and the midpoint", () => {
  assert.equal(lerp(0, 10, 0), 0);
  assert.equal(lerp(0, 10, 1), 10);
  assert.equal(lerp(0, 10, 0.5), 5);
});

test("spine dimensions follow the documented formula", () => {
  assert.equal(spineWidth({ thickness: 1 }), 40);
  assert.equal(spineHeight({ height: 1 }), 286);
  assert.equal(spineWidth({ thickness: 0.913 }), 38);
});

test("spine dimensions are deterministic for the same input", () => {
  assert.equal(spineWidth({ thickness: 1.401 }), spineWidth({ thickness: 1.401 }));
});

test("circle positions are evenly spaced on the given radius", () => {
  const p = circlePosition(0, 4, 100);
  close(p.x, 100);
  close(p.y, 0);
  const q = circlePosition(1, 4, 100);
  close(q.x, 0);
  close(q.y, 100);
});

test("every circle position sits exactly on the radius", () => {
  for (let i = 0; i < 8; i++) {
    const { x, y } = circlePosition(i, 8, 50);
    close(Math.hypot(x, y), 50, 1e-9);
  }
});

test("circle offset rotates the ring without changing its radius", () => {
  const p = circlePosition(0, 8, 80, 90);
  close(p.x, 0, 1e-9);
  close(p.y, 80, 1e-9);
  close(Math.hypot(p.x, p.y), 80, 1e-9);
});

test("arc is symmetric about its apex with no offset", () => {
  const opts = { radius: 500, centerY: 600, spread: 130, offset: 0 };
  const first = arcPosition(0, 5, opts);
  const last = arcPosition(4, 5, opts);
  close(first.x, -last.x, 1e-9);
  close(first.y, last.y, 1e-9);
});

test("arc apex is the highest point", () => {
  const opts = { radius: 500, centerY: 600, spread: 130, offset: 0 };
  const mid = arcPosition(2, 5, opts);
  const edge = arcPosition(0, 5, opts);
  assert.ok(mid.y < edge.y, "apex should have a smaller y than the edges");
});

test("arc offset rotates the whole arc", () => {
  const base = { radius: 500, centerY: 600, spread: 130, offset: 0 };
  const shifted = { ...base, offset: -20 };
  assert.ok(arcPosition(2, 5, shifted).x < arcPosition(2, 5, base).x);
});

test("spring converges to its target and settles", () => {
  let value = 0, velocity = 0;
  for (let i = 0; i < 600; i++) {
    ({ value, velocity } = springStep(value, 100, velocity, 1 / 60, 40, 15));
  }
  close(value, 100, 0.01);
  close(velocity, 0, 0.01);
});

test("spring does not explode at a large timestep", () => {
  let value = 0, velocity = 0;
  for (let i = 0; i < 100; i++) {
    ({ value, velocity } = springStep(value, 100, velocity, 0.5, 40, 15));
  }
  assert.ok(Number.isFinite(value), "value diverged");
  assert.ok(Math.abs(value) < 1000, `value blew up: ${value}`);
});
