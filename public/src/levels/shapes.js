// Field shapes and colour patterns for farm levels. Pure (no three.js) so the generator is unit tested.
// Shapes test a point in normalised field space: u right, v toward the camera (+z), both roughly in [-1, 1].

function polygon(points) {
  return (u, v) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}

function regular(sides, radius, rot = -Math.PI / 2) {
  return Array.from({ length: sides }, (_, i) => {
    const a = rot + (i / sides) * Math.PI * 2;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  });
}

function starPoints(points, outer, inner) {
  return Array.from({ length: points * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 ? inner : outer;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
}

// Ordered roughly from simple to tricky; early levels draw from the front of the list.
export const SHAPES = {
  heart: (u, v) => {
    // Classic heart curve, lobes away from the camera (−z) and the tip toward it.
    const x = u * 1.22;
    const y = -v * 1.22 + 0.18;
    const a = x * x + y * y - 1;
    return a * a * a - x * x * y * y * y <= 0;
  },
  circle: (u, v) => u * u + v * v <= 1,
  square: (u, v) => Math.abs(u) <= 0.88 && Math.abs(v) <= 0.88,
  star: polygon(starPoints(5, 1.05, 0.48)),
  diamond: (u, v) => Math.abs(u) + Math.abs(v) <= 1.05,
  flower: (u, v) => {
    const r = Math.hypot(u, v);
    const a = Math.atan2(v, u);
    return r <= 0.62 + 0.38 * Math.abs(Math.cos(2.5 * a));
  },
  ring: (u, v) => {
    const r = Math.hypot(u, v);
    return r <= 1 && r >= 0.5;
  },
  cross: (u, v) => (Math.abs(u) <= 0.34 && Math.abs(v) <= 1) || (Math.abs(v) <= 0.34 && Math.abs(u) <= 1),
  hexagon: polygon(regular(6, 1, 0)),
  triangle: polygon(regular(3, 1.15, -Math.PI / 2).map(([x, y]) => [x, y + 0.2])),
  crescent: (u, v) => u * u + v * v <= 1 && (u - 0.45) ** 2 + (v + 0.25) ** 2 > 0.55,
  double: (u, v) => (u + 0.5) ** 2 + v * v <= 0.27 || (u - 0.5) ** 2 + v * v <= 0.27,
};
export const SHAPE_NAMES = Object.keys(SHAPES);

/** Colour patterns pick a flower type for each point, turning the field into a picture. */
export const PATTERNS = {
  solid: () => 0,
  stripes: (u) => Math.floor((u + 1.2) * 2.2),
  rings: (u, v) => Math.floor(Math.hypot(u, v) * 3.2),
  halves: (u) => (u < 0 ? 0 : 1),
  checker: (u, v) => Math.floor((u + 1.2) * 2.4) + Math.floor((v + 1.2) * 2.4),
  center: (u, v, shape) => (shape(u / 0.55, v / 0.55) ? 1 : 0), // a smaller copy of the shape inside
  random: (_u, _v, _s, rand) => Math.floor(rand() * 3),
};
export const PATTERN_NAMES = Object.keys(PATTERNS);

/**
 * Lay out a farm level.
 * @param {{ shape: string, radius: number, spacing?: number, pattern?: string, types: string[], obstacles?: number }} spec
 * @param {() => number} rand seeded RNG
 */
export function fieldSlots({ shape, radius, spacing = 0.5, pattern = 'solid', types, obstacles = 0 }, rand) {
  const inside = SHAPES[shape];
  if (!inside) throw new Error(`Unknown shape ${shape}`);
  const pick = PATTERNS[pattern];
  const R = radius;
  const start = { x: 0, z: R + 3.4 };
  const cart = { x: 0, z: R + 1.9, r: 1.3 };

  // Obstacles: rocks and bushes inside the field, apart from each other and from the entrance.
  const obs = [];
  for (let tries = 0; obs.length < obstacles && tries < obstacles * 40; tries++) {
    const u = rand() * 1.6 - 0.8;
    const v = rand() * 1.6 - 0.8;
    if (!inside(u, v) || v > 0.55) continue;
    const x = u * R;
    const z = v * R;
    if (obs.some((o) => Math.hypot(o.x - x, o.z - z) < 2)) continue;
    obs.push({ x, z, r: 0.5, kind: rand() < 0.5 ? 'rock' : 'bush' });
  }

  const slots = [];
  const rowStep = spacing * 0.87;
  let row = 0;
  for (let z = -R * 1.25; z <= R * 1.25; z += rowStep, row++) {
    for (let x = -R * 1.25 + (row % 2) * spacing * 0.5; x <= R * 1.25; x += spacing) {
      const jx = x + (rand() - 0.5) * spacing * 0.4;
      const jz = z + (rand() - 0.5) * spacing * 0.4;
      const u = jx / R;
      const v = jz / R;
      if (!inside(u, v)) continue;
      if (obs.some((o) => Math.hypot(o.x - jx, o.z - jz) < o.r + 0.3)) continue;
      const k = Math.abs(pick(u, v, inside, rand)) % types.length;
      slots.push({ x: jx, z: jz, type: types[k] });
    }
  }

  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const s of slots) {
    minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
    minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
  }
  const bounds = { minX: Math.min(minX, -3) - 2.5, maxX: Math.max(maxX, 3) + 2.5, minZ: minZ - 2.5, maxZ: start.z + 1.2 };
  const area = slots.length * spacing * rowStep;
  return { slots, obstacles: obs, cart, start, bounds, area };
}
