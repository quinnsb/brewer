/* Pure geometry and motion math for the library page.

   No DOM references anywhere in this file. That is what lets `node --test`
   import it unmodified, and it is worth preserving: this is the half of the
   animation where a wrong answer is invisible in a screenshot. */

export const lerp = (a, b, t) => a * (1 - t) + b * t;

/* Deterministic per-item, driven by values baked into the catalogue, so a
   title occupies the same slot on every reload. */
export const spineWidth = (item) => Math.round(21 + item.thickness * 19);
export const spineHeight = (item) => Math.round(212 + item.height * 74);

const RAD = Math.PI / 180;

export function circlePosition(i, total, radius) {
  const deg = (i / total) * 360;
  const rad = deg * RAD;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius, rotation: deg + 90 };
}

/* A "rainbow" arc: convex up, apex centred. Cards sit on a circle whose
   centre is far below the viewport, so the visible top slice reads as a
   gentle curve rather than a ring. */
export function arcPosition(i, total, { radius, centerY, spread, offset }) {
  const step = total > 1 ? spread / (total - 1) : 0;
  const deg = -90 - spread / 2 + i * step + offset;
  const rad = deg * RAD;
  return {
    x: Math.cos(rad) * radius,
    y: Math.sin(rad) * radius + centerY,
    rotation: deg + 90,
  };
}

/* Semi-implicit Euler. Velocity is integrated before position, which is what
   keeps it stable when a background tab hands back a huge dt. dt is clamped
   for the same reason. */
export function springStep(current, target, velocity, dt, stiffness, damping) {
  const h = Math.min(dt, 1 / 30);
  const v = velocity + (-stiffness * (current - target) - damping * velocity) * h;
  return { value: current + v * h, velocity: v };
}
