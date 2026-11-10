// Everything that can be collected: item lists, rarity, prices and the daily shop.
export const RARITY = {
  common: { name: 'Common', color: '#9aa6bd', price: 150 },
  uncommon: { name: 'Uncommon', color: '#5fd38d', price: 300 },
  rare: { name: 'Rare', color: '#4aa8ff', price: 600 },
  epic: { name: 'Epic', color: '#b46bff', price: 1200 },
  legendary: { name: 'Legendary', color: '#ffb02e', price: 2500 },
};

// slot -> list of [name, rarity, free?, extra]
export const SLOTS = {
  body: { label: 'Bodies', key: 'body' },
  livery: { label: 'Liveries', key: 'livery' },
  paint: { label: 'Paint', key: 'paint' },
  finish: { label: 'Finishes', key: 'finish' },
  wheel: { label: 'Wheels', key: 'wheel' },
  boost: { label: 'Boosts', key: 'boost' },
  topper: { label: 'Toppers', key: 'topper' },
  goalfx: { label: 'Goal FX', key: 'goalfx' },
  trail: { label: 'Trails', key: 'trail' },
};

export const ITEMS = {
  body: [
    { name: 'Raptor', rarity: 'common', free: true, desc: 'Balanced sports wedge' },
    { name: 'Brute', rarity: 'common', free: true, desc: 'Tall off-road truck' },
    { name: 'Dart', rarity: 'common', free: true, desc: 'Low, long racer' },
    { name: 'Hornet', rarity: 'rare', desc: 'Compact hot hatch with a roof wing' },
    { name: 'Phantom', rarity: 'epic', desc: 'Long-nosed muscle coupe' },
    { name: 'Comet', rarity: 'epic', desc: 'Rounded future bubble' },
    { name: 'Manta', rarity: 'legendary', desc: 'Razor-flat hyper wedge' },
  ],
  livery: [
    { name: 'Clean', rarity: 'common', free: true },
    { name: 'Racing Stripes', rarity: 'common', free: true },
    { name: 'Bolt', rarity: 'uncommon' },
    { name: 'Number', rarity: 'common', free: true },
    { name: 'Split', rarity: 'uncommon' },
    { name: 'Flames', rarity: 'rare' },
    { name: 'Tiger', rarity: 'epic' },
    { name: 'Pixel Camo', rarity: 'rare' },
    { name: 'Checker', rarity: 'uncommon' },
    { name: 'Fade', rarity: 'rare' },
    { name: 'Circuit', rarity: 'epic' },
    { name: 'Pinstripe', rarity: 'uncommon' },
    { name: 'Galaxy', rarity: 'legendary' },
  ],
  paint: [
    { name: 'Team', color: null }, { name: 'Graphite', color: 0x2c2f36 }, { name: 'Pearl', color: 0xe8ecf2 },
    { name: 'Lime', color: 0x8be03a }, { name: 'Violet', color: 0x8a4dff }, { name: 'Gold', color: 0xf2b630 },
    { name: 'Teal', color: 0x1fd1c1 }, { name: 'Pink', color: 0xff5fb7 }, { name: 'Crimson', color: 0xb3122a },
    { name: 'Cobalt', color: 0x1747c9 }, { name: 'Sunburst', color: 0xff8a1f }, { name: 'Forest', color: 0x2f6b3a },
    { name: 'Sky', color: 0x6cc6ff }, { name: 'Bronze', color: 0x9a5b2c }, { name: 'Midnight', color: 0x141a33 },
    { name: 'Mint', color: 0x9af0c8 },
  ].map(p => ({ ...p, rarity: 'common', free: true })),
  finish: [
    { name: 'Gloss', rarity: 'common', free: true, desc: 'Metallic flake under clear coat' },
    { name: 'Matte', rarity: 'uncommon', desc: 'Flat, non-reflective' },
    { name: 'Satin', rarity: 'uncommon', desc: 'Soft sheen' },
    { name: 'Pearl', rarity: 'rare', desc: 'Colour-shifting pearlescent' },
    { name: 'Chrome', rarity: 'legendary', desc: 'Mirror finish' },
  ],
  wheel: [
    { name: 'Star', style: 'star', rim: 0xc9ced8, rarity: 'common', free: true },
    { name: 'Turbine', style: 'turbine', rim: 0x9aa4b5, rarity: 'uncommon' },
    { name: 'Disc', style: 'disc', rim: 0xe9edf3, rarity: 'common', free: true },
    { name: 'Mesh', style: 'mesh', rim: 0xd9b45a, rarity: 'rare' },
    { name: 'Tri', style: 'tri', rim: 0x2a2d33, rarity: 'uncommon' },
    { name: 'Retro', style: 'retro', rim: 0xf2f2f2, rarity: 'rare' },
    { name: 'Split', style: 'split', rim: 0x1d1f24, rarity: 'epic' },
    { name: 'Rally', style: 'rally', rim: 0xffffff, rarity: 'uncommon' },
  ],
  boost: [
    { name: 'Nitro', core: [0.75, 0.95, 1.0], outer: 0x46c8ff, rarity: 'common', free: true },
    { name: 'Inferno', core: [1.0, 0.75, 0.35], outer: 0xff4a1c, rarity: 'uncommon' },
    { name: 'Toxic', core: [0.75, 1.0, 0.5], outer: 0x3dff6e, rarity: 'uncommon' },
    { name: 'Plasma', core: [0.9, 0.7, 1.0], outer: 0xa040ff, rarity: 'rare' },
    { name: 'Solar', core: [1.0, 0.95, 0.6], outer: 0xffc21a, rarity: 'rare' },
    { name: 'Team', core: null, outer: null, rarity: 'common', free: true },
    { name: 'Rose', core: [1.0, 0.8, 0.9], outer: 0xff4fa8, rarity: 'rare' },
    { name: 'Frost', core: [1.0, 1.0, 1.0], outer: 0xbfe8ff, rarity: 'epic' },
    { name: 'Galaxy', core: [0.85, 0.8, 1.0], outer: 0x5a3cff, rarity: 'legendary' },
  ],
  topper: [
    { name: 'None', rarity: 'common', free: true },
    { name: 'Crown', rarity: 'legendary' },
    { name: 'Traffic Cone', rarity: 'uncommon' },
    { name: 'Halo', rarity: 'epic' },
    { name: 'Horns', rarity: 'rare' },
    { name: 'Propeller Cap', rarity: 'rare' },
    { name: 'Shark Fin', rarity: 'uncommon' },
    { name: 'Party Hat', rarity: 'common' },
  ],
  goalfx: [
    { name: 'Classic', rarity: 'common', free: true },
    { name: 'Fireworks', rarity: 'rare' },
    { name: 'Shockwave', rarity: 'uncommon' },
    { name: 'Confetti', rarity: 'uncommon' },
    { name: 'Lightning', rarity: 'epic' },
    { name: 'Supernova', rarity: 'legendary' },
  ],
  trail: [
    { name: 'Sparks', rarity: 'common', free: true },
    { name: 'Fire', rarity: 'rare' },
    { name: 'Ice', rarity: 'rare' },
    { name: 'Rainbow', rarity: 'legendary' },
    { name: 'Neon', rarity: 'uncommon' },
    { name: 'Stardust', rarity: 'epic' },
  ],
};

export const STARTING_CREDITS = 750;

export function itemId(slot, index) { return `${slot}:${index}`; }
export function itemPrice(slot, index) {
  const it = ITEMS[slot][index];
  return it.free ? 0 : RARITY[it.rarity].price;
}
export function defaultInventory() {
  const inv = [];
  for (const [slot, list] of Object.entries(ITEMS)) list.forEach((it, i) => { if (it.free) inv.push(itemId(slot, i)); });
  return inv;
}

// six featured items that change every day (same for everyone on that date)
export function dailyShop(date = new Date()) {
  const key = date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  let s = key % 2147483647;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pool = [];
  for (const [slot, list] of Object.entries(ITEMS)) list.forEach((it, i) => { if (!it.free) pool.push([slot, i]); });
  const picks = [];
  while (picks.length < 6 && pool.length) picks.push(pool.splice((rnd() * pool.length) | 0, 1)[0]);
  // one daily deal at 30% off
  return picks.map(([slot, index], k) => ({ slot, index, discount: k === 0 ? 0.3 : 0 }));
}

export function msToMidnightUTC(now = Date.now()) {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return next - now;
}

// match rewards
export function creditsForMatch(points, won, mode) {
  if (mode === 'training') return 0;
  return Math.round(60 + points * 0.4 + (won ? 120 : 0));
}
