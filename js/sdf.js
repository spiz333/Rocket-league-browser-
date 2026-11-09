// Signed distance field describing the free space of the arena.
// sdf(x,y,z) > 0 inside the playable volume (distance to the nearest wall),
// < 0 inside walls. Used by ball, car and camera collision.
import { ARENA } from './config.js';

const { W, L, H, RC, RW, GW, GH, GD } = ARENA;
const GM = RW + 1.0;            // goal box reaches this far into the arena
const GBZ = (GD + GM) / 2;      // goal box half-extent along z
const GCZ = L - GM + GBZ;       // goal box center |z|
const GHY = GH / 2;
const HH = H / 2;

function arenaSolid(x, y, z) {
  // 2D rounded rectangle (top view)
  const qx = Math.abs(x) - W + RC;
  const qz = Math.abs(z) - L + RC;
  const ox = qx > 0 ? qx : 0;
  const oz = qz > 0 ? qz : 0;
  const d2 = Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(qx, qz), 0) - RC;
  // extrusion with rounded top/bottom edges
  const ex = d2 + RW;
  const ey = Math.abs(y - HH) - HH + RW;
  const px = ex > 0 ? ex : 0;
  const py = ey > 0 ? ey : 0;
  return Math.min(Math.max(ex, ey), 0) + Math.sqrt(px * px + py * py) - RW;
}

function goalSolid(x, y, z) {
  const qx = Math.abs(x) - GW;
  const qy = Math.abs(y - GHY) - GHY;
  const qz = Math.abs(Math.abs(z) - GCZ) - GBZ;
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  const oz = qz > 0 ? qz : 0;
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0);
}

export function sdf(x, y, z) {
  const a = arenaSolid(x, y, z);
  // cheap early out: goal boxes only matter near the end walls
  if (Math.abs(z) < L - GM - 2) return -a;
  const g = goalSolid(x, y, z);
  return -(a < g ? a : g);
}

const E = 0.004;
// Writes the (normalized) gradient — pointing away from the closest wall — into out.
export function sdfNormal(x, y, z, out) {
  const nx = sdf(x + E, y, z) - sdf(x - E, y, z);
  const ny = sdf(x, y + E, z) - sdf(x, y - E, z);
  const nz = sdf(x, y, z + E) - sdf(x, y, z - E);
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  out.x = nx / len;
  out.y = ny / len;
  out.z = nz / len;
  return out;
}

// Is the point inside one of the goals? returns 0 (blue goal, z<0), 1 (red goal, z>0) or -1
export function goalAt(x, y, z, margin) {
  if (Math.abs(x) < GW && y < GH && Math.abs(z) > L + margin) return z < 0 ? 0 : 1;
  return -1;
}
