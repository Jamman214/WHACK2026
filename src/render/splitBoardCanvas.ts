// Canvas 2D renderer for the split Galton board. Rendering only: all geometry and
// paths come from lib/galton.ts, so this file is the piece to swap for Three.js.
import { BOARD_H, BOARD_W, SPLIT, ballPosition, bucketRect, landTime, type PathPoint } from "../lib/galton";

export interface Ball {
  pts: PathPoint[];
  seen: boolean;
  t0: number;
  /** set by the UI once the ball has touched its bucket floor (that is when the count goes up) */
  landed?: boolean;
}

export interface BoardTokens { peg: string; line: string; muted: string; ink: string; accent: string; surface: string; bg: string; good: string; bad: string }

export function readTokens(el: Element): BoardTokens {
  const cs = getComputedStyle(el);
  const t = (n: string) => cs.getPropertyValue(n).trim();
  return { peg: t("--peg"), line: t("--line"), muted: t("--muted"), ink: t("--ink"), accent: t("--accent"), surface: t("--surface"), bg: t("--bg"), good: t("--good"), bad: t("--bad") };
}

export function sizeCanvas(cv: HTMLCanvasElement) {
  const dpr = devicePixelRatio || 1;
  const w = cv.clientWidth || 900;
  cv.width = w * dpr;
  cv.height = w * (BOARD_H / BOARD_W) * dpr;
  cv.getContext("2d")!.setTransform(cv.width / BOARD_W, 0, 0, cv.height / BOARD_H, 0, 0);
}

/** How long a bucket glows after a ball lands in it. */
export const GLOW_MS = 700;

/**
 * Glow strength 0..1 `age` ms after a landing: quick rise, smooth fall. With reduced motion it is a
 * flat tint for the same duration instead of a pulse.
 */
export function glowEnvelope(age: number, reduced: boolean): number {
  if (age < 0 || age >= GLOW_MS) return 0;
  if (reduced) return 0.6;
  const rise = 70;
  if (age < rise) return age / rise;
  const f = 1 - (age - rise) / (GLOW_MS - rise);
  return f * f;
}

/** Current glow of one bucket: the strongest of its recent landings. Stateless, so any renderer can call it. */
export function sideGlow(balls: readonly Ball[], seen: boolean, now: number, reduced: boolean): number {
  let g = 0;
  for (const b of balls) {
    if (b.seen !== seen) continue;
    const age = now - b.t0 - landTime(b.pts);
    if (age >= 0 && age < GLOW_MS) g = Math.max(g, glowEnvelope(age, reduced));
  }
  return g;
}

/** Counter cards in the bottom corners (board units; taken from the Figma layout). */
export const COUNTER_CARD = { w: 73, h: 35, y: 183, inset: 7, pad: 6 } as const;

function drawCounter(ctx: CanvasRenderingContext2D, tk: BoardTokens, seen: boolean, n: number, g: number, col: string, reduced: boolean) {
  const { w, h, y, inset, pad } = COUNTER_CARD;
  const x = seen ? inset : BOARD_W - inset - w;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  const k = 1 + (reduced ? 0 : 0.08 * g);
  ctx.scale(k, k);
  ctx.translate(-w / 2, -h / 2);
  // tinted card: the side colour at ~8% over the surface, with a soft drop shadow
  ctx.shadowColor = "rgba(0,0,0,0.08)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
  ctx.fillStyle = tk.surface;
  ctx.beginPath(); ctx.roundRect(0, 0, w, h, 6); ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.save(); ctx.globalAlpha = 0.08 + 0.1 * g; ctx.fillStyle = seen ? tk.good : tk.bad; ctx.fill(); ctx.restore();
  ctx.lineWidth = 0.5; ctx.strokeStyle = tk.surface; ctx.stroke();
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = tk.ink; ctx.font = "500 6px 'IBM Plex Mono', monospace";
  ctx.fillText(seen ? "IN MY FEED" : "NOT IN MY FEED", pad, pad);
  ctx.fillStyle = g > 0.3 ? col : tk.ink; ctx.font = "500 10px 'IBM Plex Mono', monospace";
  ctx.fillText(String(n), pad, pad + 6 + 3);
  ctx.restore();
}

/** Draw one frame. `flip` is the gate tilt in [-1, 1]. */
export function drawSplitBoard(
  ctx: CanvasRenderingContext2D,
  tk: BoardTokens,
  state: { flip: number; counts: { seen: number; unseen: number }; balls: Ball[]; now: number },
) {
  const { cx, dx, rows, y0, dy, yB, bH, half, slopeOuterY, slopeInnerY, top, gateY, wallTop } = SPLIT;
  const yBot = yB + bH;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  ctx.clearRect(0, 0, BOARD_W, BOARD_H);

  // funnel + centre wall
  ctx.strokeStyle = tk.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 40, top); ctx.lineTo(cx - 8, top + 16);
  ctx.moveTo(cx + 40, top); ctx.lineTo(cx + 8, top + 16);
  ctx.stroke();
  // the wall stops at the roof ridge where the two inner hopper slopes meet
  ctx.beginPath(); ctx.moveTo(cx, wallTop); ctx.lineTo(cx, slopeInnerY); ctx.stroke();

  // pegs (centre column removed: that's where the wall is)
  ctx.fillStyle = tk.peg;
  for (let r = 0; r < rows; r++)
    for (let j = 0; j <= r; j++) {
      if (2 * j === r) continue;
      ctx.beginPath(); ctx.arc(cx + (j - r / 2) * dx, y0 + r * dy, 2.5, 0, 7); ctx.fill();
    }

  // gate
  ctx.save();
  ctx.translate(cx, gateY); ctx.rotate(state.flip * 0.4);
  ctx.strokeStyle = tk.accent; ctx.lineWidth = 3.5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.stroke();
  ctx.restore();

  // hoppers + buckets, glowing green / red for a moment after a ball lands
  for (const seen of [true, false]) {
    const m = (x: number) => (seen ? x : 2 * cx - x);
    const R = bucketRect(true);
    const g = sideGlow(state.balls, seen, state.now, reduced);
    const col = seen ? tk.good : tk.bad;
    if (g > 0) {
      ctx.save();
      ctx.globalAlpha = 0.22 * g; ctx.fillStyle = col;
      ctx.fillRect(Math.min(m(R.x0), m(R.x1)), yB, R.x1 - R.x0, bH);
      ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle = g > 0 ? col : tk.line; ctx.lineWidth = 1.5 + 1.5 * g; ctx.lineJoin = "round";
    if (g > 0) { ctx.shadowColor = col; ctx.shadowBlur = 14 * g; }
    ctx.beginPath();
    ctx.moveTo(m(cx - half), slopeOuterY); ctx.lineTo(m(R.x0 - 1), yB); ctx.lineTo(m(R.x0 - 1), yBot);
    ctx.lineTo(m(R.x1 + 1), yBot); ctx.lineTo(m(R.x1 + 1), yB); ctx.lineTo(m(cx), slopeInnerY);
    ctx.stroke();
    ctx.restore();

    drawCounter(ctx, tk, seen, seen ? state.counts.seen : state.counts.unseen, g, col, reduced);
  }

  // balls
  for (const b of state.balls) {
    const p = ballPosition(b.pts, state.now - b.t0);
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 7);
    ctx.fillStyle = state.now - b.t0 >= landTime(b.pts) ? (b.seen ? tk.good : tk.bad) : tk.accent; ctx.fill();
  }
}
