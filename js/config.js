// Global tuning constants. Units are roughly meters / seconds.

export const ARENA = {
  W: 34,     // half width (x)
  L: 46,     // half length (z) — goal line position
  H: 18,     // ceiling height
  RC: 11,    // radius of the vertical corners (top view)
  RW: 4,     // radius of the floor/ceiling-to-wall curves
  GW: 8,     // goal half width
  GH: 6.4,   // goal height
  GD: 6.5,   // goal depth
};

export const GRAVITY = 6.5;
// live physics values that arcade mutators may change for a match
export const WORLD = { gravity: GRAVITY, unlimitedBoost: false };
export const PHYS_STEP = 1 / 120;

export const BALL = {
  R: 1.0,
  MASS: 30,
  MAX_SPEED: 60,
  RESTITUTION: 0.6,
  DRAG: 0.03,
  SURFACE_FRICTION: 0.22,
};

export const CAR = {
  HX: 0.42,          // hitbox half extents (x = width, y = height, z = length)
  HY: 0.22,
  HZ: 0.62,
  OFFSET_Z: 0.06,    // hitbox is shifted slightly forward
  MASS: 180,
  RIDE: 0.38,        // center height above the surface when driving
  MAX_THROTTLE_SPEED: 14.1,
  MAX_SPEED: 23,
  SUPERSONIC: 21.5,
  THROTTLE_ACCEL: 16,
  BRAKE: 35,
  COAST: 5.25,
  BOOST_ACCEL: 10,
  BOOST_USE: 33.3,   // per second
  JUMP_IMPULSE: 3.35,
  JUMP_HOLD_ACCEL: 13.0,
  JUMP_HOLD_TIME: 0.2,
  DOUBLE_JUMP_WINDOW: 1.35,
  DOUBLE_JUMP_IMPULSE: 3.2,
  STEER_RATE: 7.5,   // how fast steering input reaches full lock (1/s)
  DODGE_IMPULSE: 5.0,
  DODGE_TIME: 0.62,
  STICKY: 3.25,
  AIR_PITCH: 5.2,
  AIR_YAW: 4.2,
  AIR_ROLL: 5.5,
  MAX_ANG: 5.5,
};

export const TEAM_COLORS = [
  { main: 0x1e8cff, dark: 0x0b3d8a, glow: 0x4fb4ff, css: '#2b95ff', name: 'BLAUW' },
  { main: 0xff3347, dark: 0x8a0f1c, glow: 0xff6a77, css: '#ff3d50', name: 'ROOD' },
];

export const BOOST_PADS = (() => {
  const big = [
    [-29, 0], [29, 0],
    [-28, -38], [28, -38], [-28, 38], [28, 38],
  ];
  const small = [
    [0, -40], [0, 40],
    [-12, -36], [12, -36], [-12, 36], [12, 36],
    [-22, -24], [22, -24], [-22, 24], [22, 24],
    [0, -26], [0, 26],
    [-9, -14], [9, -14], [-9, 14], [9, 14],
    [-20, -9], [20, -9], [-20, 9], [20, 9],
    [-11, 0], [11, 0],
    [-31, -18], [31, -18], [-31, 18], [31, 18],
  ];
  return [
    ...big.map(([x, z]) => ({ x, z, big: true })),
    ...small.map(([x, z]) => ({ x, z, big: false })),
  ];
})();

// Kickoff spawn positions for the team that defends the -z goal (blue).
// The other team gets the mirrored positions.
export const KICKOFF_SPOTS = [
  { x: -17, z: -21 },   // diagonal left
  { x: 17, z: -21 },    // diagonal right
  { x: -2.5, z: -32 },  // off-center left
  { x: 2.5, z: -32 },   // off-center right
  { x: 0, z: -40 },     // back
];

export const KICKOFF_SETS = {
  1: [[0]],
  2: [[0, 1], [2, 3], [0, 4]],
  3: [[0, 1, 4], [0, 3, 4], [1, 2, 4]],
};

export const BOT_NAMES = [
  'Nova', 'Pixel', 'Turbo', 'Rook', 'Zephyr', 'Quill', 'Atlas', 'Ember',
  'Glitch', 'Jinx', 'Kite', 'Orbit', 'Pulse', 'Rivet', 'Sprocket', 'Talon',
  'Vector', 'Widget', 'Comet', 'Bolt', 'Dynamo', 'Flux', 'Gizmo', 'Nimbus',
];

export const DIFFICULTY = {
  easy:   { label: 'Makkelijk', reaction: 0.35, speed: 0.82, boost: 0.35, dodge: 0.25, aerial: false, aimError: 0.35, jumpSkill: 0.4 },
  normal: { label: 'Normaal',   reaction: 0.18, speed: 0.95, boost: 0.8,  dodge: 0.7,  aerial: false, aimError: 0.15, jumpSkill: 0.75 },
  hard:   { label: 'Moeilijk',  reaction: 0.06, speed: 1.0,  boost: 1.0,  dodge: 1.0,  aerial: true,  aimError: 0.04, jumpSkill: 1.0 },
};

// ---------- arcade mutators ----------
export const MUTATORS = [
  { id: 'none', name: 'Standard', desc: 'Classic rules' },
  { id: 'lowgrav', name: 'Low Gravity', desc: 'Floaty cars and a floaty ball' },
  { id: 'bouncy', name: 'Bouncy Ball', desc: 'The ball barely loses speed off walls' },
  { id: 'speed', name: 'Speed Demon', desc: 'Faster cars and stronger boost' },
  { id: 'unlimited', name: 'Unlimited Boost', desc: 'Boost never runs out' },
];
const BASE = { ball: { ...BALL }, car: { ...CAR } };
export function applyMutator(id) {
  Object.assign(BALL, BASE.ball);
  Object.assign(CAR, BASE.car);
  WORLD.gravity = GRAVITY;
  WORLD.unlimitedBoost = false;
  switch (id) {
    case 'lowgrav': WORLD.gravity = GRAVITY * 0.42; break;
    case 'bouncy': BALL.RESTITUTION = 0.92; BALL.DRAG = 0.01; BALL.SURFACE_FRICTION = 0.08; break;
    case 'speed':
      CAR.MAX_SPEED = BASE.car.MAX_SPEED * 1.25; CAR.MAX_THROTTLE_SPEED = BASE.car.MAX_THROTTLE_SPEED * 1.25;
      CAR.THROTTLE_ACCEL = BASE.car.THROTTLE_ACCEL * 1.3; CAR.BOOST_ACCEL = BASE.car.BOOST_ACCEL * 1.35;
      CAR.SUPERSONIC = BASE.car.SUPERSONIC * 1.25; BALL.MAX_SPEED = BASE.ball.MAX_SPEED * 1.2;
      break;
    case 'unlimited': WORLD.unlimitedBoost = true; break;
    default: break;
  }
}
