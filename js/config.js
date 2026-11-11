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
export const WORLD = { gravity: GRAVITY, unlimitedBoost: false, boostCap: 100, overdriveDecay: 6, noBoost: false, recharge: 0, demolish: 'normal', respawn: 3, maxScore: 0, trike: false, rules: null };
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
  SCALE: 1,
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

// ---------- competitive ranks ----------
// 8 tiers x 3 divisions. Rating (MMR) thresholds: each tier spans 200, Bronze starts at 0.
export const RANK_TIERS = [
  { id: 'bronze', name: 'Bronze', color: '#c27a45', glow: '#ffb27a' },
  { id: 'silver', name: 'Silver', color: '#a9b4c4', glow: '#e9f0fb' },
  { id: 'gold', name: 'Gold', color: '#e3b23c', glow: '#ffe28a' },
  { id: 'platinum', name: 'Platinum', color: '#3fc6c2', glow: '#9ffff6' },
  { id: 'diamond', name: 'Diamond', color: '#4f86ff', glow: '#a9c6ff' },
  { id: 'champion', name: 'Champion', color: '#a45cff', glow: '#d9b8ff' },
  { id: 'grand', name: 'Grand Champion', color: '#ff4f6a', glow: '#ffb0bd' },
  { id: 'mythic', name: 'Mythic', color: '#f5f2ff', glow: '#8ff7ff' },
];
export const MMR_PER_TIER = 200;
export const START_MMR = 230;
export function rankOf(mmr) {
  const m = Math.max(0, mmr);
  const tier = Math.min(RANK_TIERS.length - 1, Math.floor(m / MMR_PER_TIER));
  const top = tier === RANK_TIERS.length - 1;
  const into = m - tier * MMR_PER_TIER;
  const div = top ? 0 : Math.min(2, Math.floor(into / (MMR_PER_TIER / 3)));
  const divStart = tier * MMR_PER_TIER + div * (MMR_PER_TIER / 3);
  const divSize = top ? 1 : MMR_PER_TIER / 3;
  return {
    tier, div, ...RANK_TIERS[tier],
    label: top ? RANK_TIERS[tier].name : `${RANK_TIERS[tier].name} ${['I', 'II', 'III'][div]}`,
    progress: top ? 1 : Math.max(0, Math.min(1, (m - divStart) / divSize)),
  };
}
// skill 0..1 from a rating (continuous, so bots get a little better with every division)
export function skillOfMmr(mmr) { return Math.max(0, Math.min(1, mmr / (MMR_PER_TIER * (RANK_TIERS.length - 1) + 60))); }

// Bot ability for a skill level 0 (new driver) .. 1 (top tier).
export function botSkill(sk) {
  const s = Math.max(0, Math.min(1, sk));
  const L = (a, b, p = 1) => a + (b - a) * Math.pow(s, p);
  return {
    skill: s,
    reaction: L(0.45, 0.035),          // seconds between decisions
    speed: L(0.74, 1.0, 0.7),          // throttle speed without boost
    boost: L(0.2, 1.0, 0.8),           // how eagerly they boost
    dodge: L(0.05, 1.0),               // flips into the ball / on kickoff
    aerial: s >= 0.4,                  // platinum and up go for aerials
    aerialHeight: s < 0.4 ? 0 : L(-6, 17, 1),    // highest ball they will aerial for
    aimError: L(0.55, 0.025),          // radians of shot error
    jumpSkill: L(0.25, 1.0),
    chase: L(0.85, 0.0, 0.6),          // chance a bot ignores rotation and ball-chases
    padSmarts: L(0.1, 1.0),            // picks up boost when low
    recovery: L(0.35, 1.0, 0.6),       // air control to land on wheels
    kickoffFlip: L(0.0, 1.0, 1.2),
    whiff: L(0.3, 0.0, 0.8),           // random mistimed touches
  };
}
// legacy difficulty keys (old settings / attract mode) mapped onto skills
export const DIFFICULTY = {
  easy: botSkill(0.08), normal: botSkill(0.38), hard: botSkill(0.8),
};
export const BOT_TIERS = RANK_TIERS.map((t, i) => ({ id: t.id, name: t.name, skill: (i * MMR_PER_TIER + 100) / (MMR_PER_TIER * (RANK_TIERS.length - 1) + 60) }));
export function botTierSkill(id) {
  if (DIFFICULTY[id]) return DIFFICULTY[id].skill;
  const t = BOT_TIERS.find(b => b.id === id);
  return t ? Math.min(1, t.skill) : 0.38;
}

// ---------- match rules (custom matches, arcade presets, online lobbies) ----------
// Every option: [value, label, factor]
export const RULE_DEFS = [
  { id: 'arena', name: 'Arena size', def: 'standard', opts: [['small', 'Small'], ['standard', 'Standard'], ['large', 'Large'], ['huge', 'Huge']] },
  { id: 'ballSize', name: 'Ball size', def: 'normal', opts: [['small', 'Small', 0.72], ['normal', 'Default', 1], ['large', 'Large', 1.5], ['huge', 'Huge', 2.2]] },
  { id: 'ballType', name: 'Ball physics', def: 'normal', opts: [['normal', 'Default'], ['light', 'Light'], ['heavy', 'Heavy'], ['bouncy', 'Super bouncy'], ['sticky', 'Dead ball']] },
  { id: 'ballSpeed', name: 'Max ball speed', def: 'normal', opts: [['slow', 'Slow', 0.7], ['normal', 'Default', 1], ['fast', 'Fast', 1.35], ['super', 'Super fast', 1.8]] },
  { id: 'gravity', name: 'Gravity', def: 'normal', opts: [['low', 'Low', 0.42], ['normal', 'Default', 1], ['high', 'High', 1.6], ['super', 'Super high', 2.4]] },
  { id: 'carSize', name: 'Car size', def: 'normal', opts: [['small', 'Small', 0.75], ['normal', 'Default', 1], ['large', 'Large', 1.35], ['huge', 'Huge', 1.75]] },
  { id: 'carSpeed', name: 'Car speed', def: 'normal', opts: [['slow', 'Slow', 0.8], ['normal', 'Default', 1], ['fast', 'Fast', 1.25], ['super', 'Super fast', 1.5]] },
  { id: 'boost', name: 'Boost', def: 'normal', opts: [['normal', 'Default'], ['unlimited', 'Unlimited'], ['overdrive', 'Overdrive (200)'], ['recharge', 'Recharging'], ['none', 'No boost']] },
  { id: 'boostPower', name: 'Boost strength', def: 'normal', opts: [['normal', '1x', 1], ['x15', '1.5x', 1.5], ['x2', '2x', 2], ['x3', '3x', 3]] },
  { id: 'demolish', name: 'Demolitions', def: 'normal', opts: [['normal', 'Default'], ['off', 'Off'], ['contact', 'On any contact']] },
  { id: 'respawn', name: 'Respawn time', def: '3', opts: [['3', '3 s', 3], ['2', '2 s', 2], ['1', '1 s', 1], ['0', 'Instant', 0.05]] },
  { id: 'vehicle', name: 'Vehicle', def: 'normal', opts: [['normal', 'Four wheels'], ['trike', 'Wobbly trike']] },
  { id: 'maxScore', name: 'Max score', def: '0', opts: [['0', 'Unlimited'], ['1', '1 goal'], ['3', '3 goals'], ['5', '5 goals'], ['7', '7 goals']] },
];
export const DEFAULT_RULES = Object.fromEntries(RULE_DEFS.map(r => [r.id, r.def]));
export function cleanRules(r) {
  const out = { ...DEFAULT_RULES };
  if (r && typeof r === 'object') for (const d of RULE_DEFS) if (d.opts.some(o => o[0] === r[d.id])) out[d.id] = r[d.id];
  return out;
}
function factor(id, v) { const d = RULE_DEFS.find(r => r.id === id); const o = d && d.opts.find(x => x[0] === v); return o && o[2] != null ? o[2] : 1; }

// quick-match arcade presets
export const MUTATORS = [
  { id: 'none', name: 'Standard', desc: 'Classic rules', rules: {} },
  { id: 'lowgrav', name: 'Low Gravity', desc: 'Floaty cars and a floaty ball', rules: { gravity: 'low' } },
  { id: 'bouncy', name: 'Bouncy Ball', desc: 'The ball barely loses speed off walls', rules: { ballType: 'bouncy' } },
  { id: 'speed', name: 'Speed Demon', desc: 'Faster cars and stronger boost', rules: { carSpeed: 'fast', boostPower: 'x15', ballSpeed: 'fast' } },
  { id: 'unlimited', name: 'Unlimited Boost', desc: 'Boost never runs out', rules: { boost: 'unlimited' } },
  { id: 'overdrive', name: 'Overdrive', desc: '200 boost tank — anything over 100 slowly drains back', rules: { boost: 'overdrive' } },
  { id: 'giant', name: 'Giant Ball', desc: 'A huge, heavy ball', rules: { ballSize: 'huge', ballType: 'heavy' } },
  { id: 'trike', name: 'Wobbly Trikes', desc: 'Three wheels — corner too hard and you tip over', rules: { vehicle: 'trike' } },
];
const BASE = { ball: { ...BALL }, car: { ...CAR } };
const rulesListeners = [];
export function onRulesChange(fn) { rulesListeners.push(fn); }
export function applyRules(r) {
  r = cleanRules(r);
  Object.assign(BALL, BASE.ball);
  Object.assign(CAR, BASE.car);
  WORLD.rules = r;
  WORLD.gravity = GRAVITY * factor('gravity', r.gravity);
  WORLD.unlimitedBoost = r.boost === 'unlimited';
  WORLD.boostCap = r.boost === 'overdrive' ? 200 : 100;
  WORLD.noBoost = r.boost === 'none';
  WORLD.recharge = r.boost === 'recharge' ? 9 : 0;
  WORLD.demolish = r.demolish;
  WORLD.respawn = factor('respawn', r.respawn);
  WORLD.maxScore = +r.maxScore || 0;
  WORLD.trike = r.vehicle === 'trike';
  // ball
  const bs = factor('ballSize', r.ballSize);
  BALL.R = BASE.ball.R * bs;
  BALL.MASS = BASE.ball.MASS * Math.pow(bs, 1.5);
  BALL.MAX_SPEED = BASE.ball.MAX_SPEED * factor('ballSpeed', r.ballSpeed);
  if (r.ballType === 'light') { BALL.MASS *= 0.55; BALL.DRAG = 0.06; }
  if (r.ballType === 'heavy') { BALL.MASS *= 2.2; BALL.RESTITUTION = 0.45; }
  if (r.ballType === 'bouncy') { BALL.RESTITUTION = 0.92; BALL.DRAG = 0.01; BALL.SURFACE_FRICTION = 0.08; }
  if (r.ballType === 'sticky') { BALL.RESTITUTION = 0.15; BALL.SURFACE_FRICTION = 0.6; }
  // cars
  const cs = factor('carSize', r.carSize);
  CAR.SCALE = cs;
  CAR.HX = BASE.car.HX * cs; CAR.HY = BASE.car.HY * cs; CAR.HZ = BASE.car.HZ * cs;
  CAR.OFFSET_Z = BASE.car.OFFSET_Z * cs; CAR.RIDE = BASE.car.RIDE * cs;
  CAR.MASS = BASE.car.MASS * Math.pow(cs, 2);
  const sp = factor('carSpeed', r.carSpeed);
  CAR.MAX_SPEED = BASE.car.MAX_SPEED * sp; CAR.MAX_THROTTLE_SPEED = BASE.car.MAX_THROTTLE_SPEED * sp;
  CAR.THROTTLE_ACCEL = BASE.car.THROTTLE_ACCEL * sp; CAR.SUPERSONIC = BASE.car.SUPERSONIC * sp;
  CAR.BOOST_ACCEL = BASE.car.BOOST_ACCEL * sp * factor('boostPower', r.boostPower);
  // stronger gravity needs a stronger jump to stay playable
  const g = factor('gravity', r.gravity);
  if (g > 1) { const k = Math.sqrt(g); CAR.JUMP_IMPULSE *= k; CAR.JUMP_HOLD_ACCEL *= k; CAR.DOUBLE_JUMP_IMPULSE *= k; CAR.STICKY *= g; }
  setArenaSize(r.arena);
  rulesListeners.forEach(fn => fn(r));
  return r;
}
export function mutatorRules(id) { const m = MUTATORS.find(x => x.id === id); return cleanRules(m ? m.rules : {}); }
export function applyMutator(id) { return applyRules(mutatorRules(id)); }
