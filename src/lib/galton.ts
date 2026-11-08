// Pure Galton-board logic ported from the "Split board" in
// whack-demo/reference/onboarding-feed-board.html. Scripted paths, not physics, so every
// bounce is deterministic for a given rng and testable. Coordinates are in board space
// (BOARD_W x BOARD_H); the renderers scale them.

export const BOARD_W = 480;
export const BOARD_H = 242;

/**
 * Split-board geometry, taken from the Figma layout (Figma px / 2 = board units). The board frame stays
 * BOARD_W x BOARD_H; the funnel/gate/peg field sit lower than before and the hoppers are narrower and steeper.
 */
export const SPLIT = {
  cx: BOARD_W / 2,
  dx: 40,
  /** 8 peg rows (rows 0..7); the last row is at y0 + 7 * dy = 153 */
  rows: 8,
  y0: 62,
  dy: 13,
  /** y of the funnel's top edge; the funnel is 16 tall */
  top: 35,
  /** y of the gate pivot, and where the centre wall starts */
  gateY: 60.5,
  wallTop: 65.5,
  /** top of the buckets (the hopper mouth) */
  yB: 174.5,
  /** bucket height: tall enough to stack four rows of balls */
  bH: 43.5,
  /** outer edge of each half; the hoppers start here */
  half: 156,
  /** inner clear width of one bucket */
  bW: 87,
  /** distance from the centre wall to a bucket's inner clear edge */
  bIn: 39,
  /** y of the hopper slopes where they meet the board edge / the apex on the centre line */
  slopeOuterY: 155.5,
  slopeInnerY: 162.5,
} as const;

export const BALL_RADIUS = 5;
/** centre spacing and row height of balls resting in a bucket (hex packing) */
const SP = 10.4;
const ROW_H = 9;
/** floor bar thickness is 2, so its top surface sits 1px above the bucket's bottom line */
const FLOOR = 1;

export interface PathPoint {
  x: number;
  y: number;
  /** ms to travel from the previous point */
  d: number;
  /** accelerate vertically (gravity-ish easing) */
  fall?: boolean;
  /** accelerate along the whole segment (rolling down a slope) */
  roll?: boolean;
  /** hop apex height above the straight line to this point (parabola) */
  arc?: number;
  /** index into PEGS of the peg this point rests on, so renderers can ping it */
  hit?: number;
  /** impact strength 0..1 on arrival, for squash and stretch (pegs default to 0.6) */
  thud?: number;
  /** first touch of the bucket floor: this is when the ball "lands" (count + glow) */
  land?: boolean;
}

export type Rng = () => number;

export interface Peg { x: number; y: number; row: number; col: number }

/** Every peg, centre column removed (that's where the wall is). */
export const PEGS: Peg[] = [];
const pegIdx = new Map<number, number>();
for (let r = 0; r < SPLIT.rows; r++)
  for (let j = 0; j <= r; j++) {
    if (2 * j === r) continue;
    pegIdx.set(r * 100 + j, PEGS.length);
    PEGS.push({ x: SPLIT.cx + (j - r / 2) * SPLIT.dx, y: SPLIT.y0 + r * SPLIT.dy, row: r, col: j });
  }

/** Inner clear rectangle of one bucket, board space. */
export function bucketRect(isSeen: boolean) {
  const { cx, bIn, bW, yB, bH } = SPLIT;
  const x0 = isSeen ? cx - bIn - bW : cx + bIn;
  return { x0, x1: x0 + bW, y0: yB, y1: yB + bH };
}

/** Hex-packed rows from the floor up; a bucket holds 7 per row and stacks four rows (28 balls) below its rim. */
export function createHeap(x0: number, w: number, yBot: number) {
  const cols = Math.floor((w - SP / 2) / SP);
  const slack = w - (cols * SP + SP / 2);
  const rows: boolean[][] = [];
  return {
    capacity: cols * 2,
    reset() { rows.length = 0; },
    place(ex: number) {
      let row = 0;
      while (rows[row] && rows[row].every(Boolean)) row++;
      const filled = (rows[row] ??= Array(cols).fill(false));
      const off = x0 + slack / 2 + SP / 2 + (row % 2 ? SP / 2 : 0);
      let best = -1;
      for (let c = 0; c < cols; c++)
        if (!filled[c] && (best < 0 || Math.abs(off + c * SP - ex) < Math.abs(off + best * SP - ex))) best = c;
      filled[best] = true;
      return { x: off + best * SP, y: yBot - FLOOR - BALL_RADIUS - row * ROW_H, row };
    },
  };
}
export type Heap = ReturnType<typeof createHeap>;

/**
 * Funnel → gate → peg rows. The gate picks the half; each bounce is random
 * but never crosses the centre wall. Returns points up to the last peg row.
 */
export function scriptedPath(isSeen: boolean, rng: Rng = Math.random): PathPoint[] {
  const { cx, dx, rows, y0, dy } = SPLIT;
  const pts: PathPoint[] = [{ x: cx, y: SPLIT.top + 6, d: 0 }, { x: cx, y: SPLIT.top + 16, d: 160, fall: true }];
  let r = isSeen ? 0 : 1;
  pts.push({ x: cx + (r - 0.5) * dx, y: y0 + dy - 7, d: 190, arc: 8, hit: pegIdx.get(100 + r) });
  const ok = (v: number, i: number) => (isSeen ? v < (i + 1) / 2 : v > (i + 1) / 2);
  for (let i = 1; i < rows; i++) {
    let n = r + (rng() < 0.5 ? 1 : 0);
    if (!ok(n, i)) n = n === r ? r + 1 : r;
    r = n;
    // livelier hops: ~10-13px apex, and the apex varies a little from peg to peg
    pts.push({
      x: cx + (r - (i + 1) / 2) * dx, y: y0 + (i + 1) * dy - 7, d: 135, arc: 10 + rng() * 3,
      hit: pegIdx.get((i + 1) * 100 + r),
    });
  }
  return pts;
}

/**
 * Last peg row → hopper → bucket. Builds the points in the "seen" frame (left bucket) and mirrors
 * them for the other side. Balls either drop straight into the mouth, or land on a slope and roll in,
 * then hit the bucket floor and rebound 2-3 times with decaying height.
 */
function hopperPath(isSeen: boolean, last: PathPoint, heap: Heap): PathPoint[] {
  const { cx, yB, half, slopeOuterY, slopeInnerY } = SPLIT;
  const m = (x: number) => (isSeen ? x : 2 * cx - x);
  const L = bucketRect(true); // seen-frame bucket
  const slope = (x: number) => {
    // seen-frame surface of the hopper slope at x (outer slope left of the bucket, inner slope right of it)
    const outer = x < (L.x0 + L.x1) / 2;
    return outer
      ? slopeOuterY + ((x - (cx - half)) * (yB - slopeOuterY)) / (L.x0 - 1 - (cx - half))
      : slopeInnerY + ((x - cx) * (yB - slopeInnerY)) / (L.x1 + 1 - cx);
  };
  const cb = (L.x0 + L.x1) / 2;
  const hw = (L.x1 - L.x0) / 2;
  let lx = m(last.x);
  // A ball whose centre is within the mouth, a ball's width clear of both walls, drops straight in.
  const straight = Math.abs(lx - cb) <= hw - BALL_RADIUS - 1 + 1e-6;
  if (!straight) {
    // Otherwise it must land on a slope. The last peg row can drop a ball just past either end of the
    // slope (beyond the outer rim, or on top of the inner wall), so pull it onto the slope.
    lx = lx < cb ? Math.max(lx, cx - half + BALL_RADIUS + 1) : Math.max(lx, L.x1 + 4);
    last.x = m(lx);
    // the raised hoppers can sit above the last peg row's drop height: never start below the slope
    last.y = Math.min(last.y, slope(lx) - 1 - BALL_RADIUS);
  }
  const slot = heap.place(last.x);
  const sx = m(slot.x), sy = slot.y;
  const rimY = yB - 1 - BALL_RADIUS; // ball centre when resting on the rim
  const out: PathPoint[] = [];
  let fellFrom = rimY;
  const P = (x: number, p: Omit<PathPoint, "x">) => out.push({ x: m(x), ...p });
  const fallMs = (dist: number) => Math.round(70 + 12 * Math.sqrt(Math.max(dist, 1)));

  if (straight) {
    fellFrom = last.y;
    P(sx, { y: sy, d: fallMs(sy - last.y), fall: true, land: true, thud: 1 });
  } else {
    const outer = lx < cb;
    const surf = (x: number) => slope(x) - 1 - BALL_RADIUS;
    const ex = outer ? L.x0 + 5 : L.x1 - 5; // roll to just inside the rim
    P(lx, { y: surf(lx), d: fallMs(surf(lx) - last.y), fall: true, thud: 0.7 });
    const run = Math.abs(ex - lx);
    let from = lx;
    if (run > 25) {
      // one small skip off the slope before it starts rolling
      const hx = lx + (ex - lx) * 0.35;
      P(hx, { y: surf(hx), d: 120, arc: 4, thud: 0.4 });
      from = hx;
    }
    const len = Math.hypot(ex - from, surf(ex) - surf(from));
    P(ex, { y: rimY, d: Math.round(80 + 2.6 * len), roll: true });
    P(sx, { y: sy, d: fallMs(sy - rimY), fall: true, land: true, thud: 1 });
  }

  // rebounds: restitution ~0.6 in speed => ~0.36 in height; shorter hops for balls that fell less
  let h = Math.min(9, Math.max(sy - fellFrom, 8) * 0.36) * (slot.row ? 0.75 : 1);
  for (const thud of [0.55, 0.25, 0.1]) {
    if (h < 0.7) break;
    P(sx, { y: sy, d: Math.round(53 * Math.sqrt(h)), arc: h, thud });
    h *= 0.36;
  }
  return out;
}

/** Stateful board: two heaps + counts. Keeps the bucket stacking between balls. */
export function createSplitBoard() {
  const heaps = { seen: createHeap(bucketRect(true).x0, SPLIT.bW, SPLIT.yB + SPLIT.bH), unseen: createHeap(bucketRect(false).x0, SPLIT.bW, SPLIT.yB + SPLIT.bH) };
  /** balls dispatched so far (not necessarily landed yet; the UI counts a ball when `landTime` passes) */
  const counts = { seen: 0, unseen: 0 };
  return {
    counts,
    reset() {
      heaps.seen.reset();
      heaps.unseen.reset();
      counts.seen = counts.unseen = 0;
    },
    /** Full path for one ball, ending at its resting spot in the chosen bucket. */
    path(isSeen: boolean, rng: Rng = Math.random): PathPoint[] {
      const side = isSeen ? "seen" : "unseen";
      const pts = scriptedPath(isSeen, rng);
      pts.push(...hopperPath(isSeen, pts[pts.length - 1], heaps[side]));
      counts[side]++;
      return pts;
    },
  };
}
export type SplitBoard = ReturnType<typeof createSplitBoard>;

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** Position of a ball `elapsed` ms into its path. */
export function ballPosition(pts: PathPoint[], elapsed: number): { x: number; y: number } {
  let e = elapsed;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], q = pts[i - 1];
    if (e <= p.d) {
      const k = e / p.d, kx = p.roll ? k * k : k, ky = p.fall || p.roll ? k * k : k;
      return { x: lerp(q.x, p.x, kx), y: lerp(q.y, p.y, ky) - (p.arc || 0) * 4 * k * (1 - k) };
    }
    e -= p.d;
  }
  return pts[pts.length - 1];
}

export const pathDuration = (pts: PathPoint[]) => pts.reduce((a, p) => a + p.d, 0);

/** Moments where the ball strikes something: a peg (`hit`), a slope or the bucket floor. */
export interface PathEvent { t: number; x: number; y: number; hit?: number; thud: number; land: boolean }

export function pathEvents(pts: PathPoint[]): PathEvent[] {
  const ev: PathEvent[] = [];
  let t = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    t += p.d;
    const thud = p.thud ?? (p.hit !== undefined ? 0.6 : 0);
    if (thud > 0 || p.land) ev.push({ t, x: p.x, y: p.y, hit: p.hit, thud, land: !!p.land });
  }
  return ev;
}

/** ms into the path when the ball first touches its bucket floor. */
export function landTime(pts: PathPoint[]): number {
  let t = 0;
  for (let i = 1; i < pts.length; i++) {
    t += pts[i].d;
    if (pts[i].land) return t;
  }
  return t;
}
