// Pure Galton-board logic ported from the "Split board" in
// whack-demo/reference/onboarding-feed-board.html. Scripted paths, not physics.
// Coordinates are in board space (BOARD_W x BOARD_H); the renderer scales them.

export const BOARD_W = 480;
export const BOARD_H = 242;

/** Split-board geometry. */
export const SPLIT = {
  cx: BOARD_W / 2,
  dx: 40,
  rows: 10,
  y0: 36,
  dy: 13,
  yB: 166,
  bH: 46,
  half: 220,
} as const;

export interface PathPoint {
  x: number;
  y: number;
  /** ms to travel from the previous point */
  d: number;
  /** accelerate vertically (gravity-ish easing) */
  fall?: boolean;
  /** hop height for a peg bounce */
  arc?: number;
}

export type Rng = () => number;

/** Stacks balls in a wide bucket, near where each ball exits. */
export function createHeap(x0: number, w: number, yBot: number) {
  const sp = 11, rowH = 10, cols = Math.floor(w / sp);
  const h: number[] = Array(cols).fill(0);
  const off = x0 + (w - cols * sp) / 2 + sp / 2;
  return {
    reset() { h.fill(0); },
    place(ex: number) {
      const c0 = Math.max(0, Math.min(cols - 1, Math.round((ex - off) / sp)));
      let best = c0;
      for (let d = -3; d <= 3; d++) {
        const c = c0 + d;
        if (c < 0 || c >= cols) continue;
        if (h[c] < h[best] || (h[c] === h[best] && Math.abs(d) < Math.abs(best - c0))) best = c;
      }
      const y = yBot - 5.5 - h[best] * rowH;
      h[best]++;
      return { x: off + best * sp, y };
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
  const pts: PathPoint[] = [{ x: cx, y: 6, d: 0 }, { x: cx, y: 16, d: 160, fall: true }];
  let r = isSeen ? 0 : 1;
  pts.push({ x: cx + (r - 0.5) * dx, y: y0 + dy - 7, d: 200, arc: 3 });
  const ok = (v: number, i: number) => (isSeen ? v < (i + 1) / 2 : v > (i + 1) / 2);
  for (let i = 1; i < rows; i++) {
    let n = r + (rng() < 0.5 ? 1 : 0);
    if (!ok(n, i)) n = n === r ? r + 1 : r;
    r = n;
    pts.push({ x: cx + (r - (i + 1) / 2) * dx, y: y0 + (i + 1) * dy - 7, d: 120, arc: 5 });
  }
  return pts;
}

/** Stateful board: two heaps + counts. Keeps the bucket stacking between balls. */
export function createSplitBoard() {
  const { cx, yB, bH, half } = SPLIT;
  const heaps = { seen: createHeap(cx - half, half, yB + bH), unseen: createHeap(cx, half, yB + bH) };
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
      const p = heaps[side].place(pts[pts.length - 1].x);
      counts[side]++;
      pts.push({ x: p.x, y: p.y, d: 220, fall: true });
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
      const k = e / p.d, ky = p.fall ? k * k : k;
      return { x: lerp(q.x, p.x, k), y: lerp(q.y, p.y, ky) - (p.arc || 0) * Math.sin(Math.PI * k) };
    }
    e -= p.d;
  }
  return pts[pts.length - 1];
}

export const pathDuration = (pts: PathPoint[]) => pts.reduce((a, p) => a + p.d, 0);
