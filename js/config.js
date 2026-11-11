// Global tuning constants. Units are roughly meters / seconds.

// Standard field (half sizes). Map-size options scale W/L/H from these values.
export const STD_ARENA = {
  W: 41,     // half width (x)
  L: 51.2,   // half length (z) — goal line position
  H: 20.4,   // ceiling height
  RC: 13,    // radius of the vertical corners (top view)
  RW: 4,     // radius of the floor/ceiling-to-wall curves
  GW: 8.9,   // goal half width
  GH: 6.43,  // goal height
  GD: 8.8,   // goal depth
};
// live arena dimensions (mutable: changed by the arena size setting before a match)
export const ARENA = { ...STD_ARENA, size: 'standard' };
export const ARENA_SIZES = [
  { id: 'small', name: 'Small', s: 0.8 },
  { id: 'standard', name: 'Standard', s: 1 },
  { id: 'large', name: 'Large', s: 1.22 },
  { id: 'huge', name: 'Huge', s: 1.5 },
];
const arenaListeners = [];
export function onArenaChange(fn) { arenaListeners.push(fn); fn(ARENA); }

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
  // air control: angular acceleration per full stick input and damping (rad/s^2, 1/s).
  // Pitch and yaw only damp when their stick is released; roll always damps.
  T_PITCH: 12.15,
  T_YAW: 8.92,
  T_ROLL: 36.08,
  D_PITCH: 2.8,
  D_YAW: 1.89,
  D_ROLL: 4.47,
  MAX_ANG: 5.5,
};

export const TEAM_COLORS = [
  { main: 0x1e8cff, dark: 0x0b3d8a, glow: 0x4fb4ff, css: '#2b95ff', name: 'BLAUW' },
  { main: 0xff3347, dark: 0x8a0f1c, glow: 0xff6a77, css: '#ff3d50', name: 'ROOD' },
];

// pad layout designed for a 34 x 46 half field; scaled to whatever the arena is
const PAD_LAYOUT = (() => {
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
    ...big.map(([x, z]) => ({ x: x / 34, z: z / 46, big: true })),
    ...small.map(([x, z]) => ({ x: x / 34, z: z / 46, big: false })),
  ];
})();
export const BOOST_PADS = PAD_LAYOUT.map(p => ({ ...p }));

// Kickoff spawn positions for the team that defends the -z goal (blue).
// The other team gets the mirrored positions. (fractions of the half field)
const KICKOFF_LAYOUT = [
  { x: -0.5, z: -0.457 },  // diagonal left
  { x: 0.5, z: -0.457 },   // diagonal right
  { x: -0.0625, z: -0.7 }, // off-center left
  { x: 0.0625, z: -0.7 },  // off-center right
  { x: 0, z: -0.87 },      // back
];
export const KICKOFF_SPOTS = KICKOFF_LAYOUT.map(p => ({ ...p }));

export function setArenaSize(id) {
  const def = ARENA_SIZES.find(a => a.id === id) || ARENA_SIZES[1];
  const s = def.s;
  ARENA.size = def.id;
  ARENA.W = STD_ARENA.W * s;
  ARENA.L = STD_ARENA.L * s;
  ARENA.H = STD_ARENA.H * (0.6 + 0.4 * s);
  ARENA.RC = STD_ARENA.RC * s;
  PAD_LAYOUT.forEach((p, i) => { BOOST_PADS[i].x = p.x * ARENA.W; BOOST_PADS[i].z = p.z * ARENA.L; });
  KICKOFF_LAYOUT.forEach((p, i) => {
    // the off-centre / back spots stay close to the goal, diagonals scale with the field
    KICKOFF_SPOTS[i].x = p.x * Math.min(ARENA.W, STD_ARENA.W * Math.max(1, s * 0.9));
    KICKOFF_SPOTS[i].z = p.z * ARENA.L;
  });
  arenaListeners.forEach(fn => fn(ARENA));
}
setArenaSize('standard');

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
