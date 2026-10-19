// Farm map layout in world units (x right, z toward the camera). The fields lie north (−z) of the hub.

export const BOUNDS = { minX: -21, maxX: 21, minZ: -29, maxZ: 9.5 };

export const FIELDS = [
  { id: 'field1', type: 'tulip', rect: [-9, -15, 9, -4.2], spacing: 0.5, requires: null },
  { id: 'field2', type: 'tulip', rect: [-9, -27, 9, -17], spacing: 0.5, requires: 'field2' },
  { id: 'roseBeds', type: 'rose', rect: [12, -14, 18, -6], spacing: 0.52, requires: 'rose' },
  { id: 'peonyBeds', type: 'peony', rect: [-18, -14, -12, -6], spacing: 0.6, requires: 'peony' },
];

export const STATION = {
  table: { x: -4.6, z: 2.4 }, // florist table (bouquets)
  dropZone: { x: -4.6, z: 0.4, r: 1.3 }, // player stands here to unload the stack
  florist: { x: -4.6, z: 3.7 },
};

export const BELT = { x0: -3.4, x1: 3.1, z: 2.4 };

export const COUNTER = {
  x: 4.6, z: 2.4, // sell counter
  pile: { x: 4.6, z: 0.3, r: 1.3 }, // cash waits here
  queue: [[4.6, 3.75], [5.9, 4.4], [7.1, 5.1], [8.3, 5.8]], // customer queue slots (front first)
  spawn: [16, 9],
  exit: [-1, 11],
};

export const PADS = {
  upgrades: { x: -11, z: 1.2, size: 2.6 },
  field2: { x: 0, z: -22, size: 3 },
  rose: { x: 15, z: -2.6, size: 2.8 },
  peony: { x: -15, z: -2.6, size: 2.8 },
};

export const GREENHOUSES = {
  rose: { x: 15, z: -10, w: 8, d: 10, frame: 0xf4f1e6, trim: 0xd8b04a },
  peony: { x: -15, z: -10, w: 8, d: 10, frame: 0xf6eaf2, trim: 0xe58ee8 },
};

export const UPGRADE_STAND = { x: -11, z: 3.4, zone: { x: -11, z: 1.2, r: 1.4 } };
export const TOWER_STAND = { x: 11, z: 3.2, zone: { x: 11, z: 1.2, r: 1.4 } };

/** Solid footprints the player can't walk through: [minX, minZ, maxX, maxZ]. */
export const COLLIDERS = [
  [-5.75, 1.65, -3.45, 3.15], // florist table
  [-3.45, 2.05, 3.1, 2.75], // belt
  [3.1, 1.65, 6.1, 3.15], // counter
  [-12.1, 3.0, -9.9, 3.9], // upgrade stand
  [10.0, 2.8, 12.0, 3.7], // tower stand
];

export const PLAYER_START = { x: 0, z: -1.5 };
