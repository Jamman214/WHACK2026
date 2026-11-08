// Canvas 2D renderer for the split Galton board. Rendering only: all geometry and
// paths come from lib/galton.ts, so this file is the piece to swap for Three.js.
import { BOARD_H, BOARD_W, SPLIT, ballPosition, type PathPoint } from "../lib/galton";

export interface Ball { pts: PathPoint[]; seen: boolean; t0: number }

export interface BoardTokens { peg: string; line: string; muted: string; ink: string; accent: string; hollow: string }

export function readTokens(el: Element): BoardTokens {
  const cs = getComputedStyle(el);
  const t = (n: string) => cs.getPropertyValue(n).trim();
  return { peg: t("--peg"), line: t("--line"), muted: t("--muted"), ink: t("--ink"), accent: t("--accent"), hollow: t("--hollow") };
}

export function sizeCanvas(cv: HTMLCanvasElement) {
  const dpr = devicePixelRatio || 1;
  const w = cv.clientWidth || 900;
  cv.width = w * dpr;
  cv.height = w * (BOARD_H / BOARD_W) * dpr;
  cv.getContext("2d")!.setTransform(cv.width / BOARD_W, 0, 0, cv.height / BOARD_H, 0, 0);
}

/** Draw one frame. `flip` is the gate tilt in [-1, 1]. */
export function drawSplitBoard(
  ctx: CanvasRenderingContext2D,
  tk: BoardTokens,
  state: { flip: number; counts: { seen: number; unseen: number }; balls: Ball[]; now: number },
) {
  const { cx, dx, rows, y0, dy, yB, bH, half } = SPLIT;
  ctx.clearRect(0, 0, BOARD_W, BOARD_H);

  // funnel + centre wall
  ctx.strokeStyle = tk.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 40, 0); ctx.lineTo(cx - 8, 16);
  ctx.moveTo(cx + 40, 0); ctx.lineTo(cx + 8, 16);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, 30); ctx.lineTo(cx, yB + bH); ctx.stroke();

  // pegs (centre column removed: that's where the wall is)
  ctx.fillStyle = tk.peg;
  for (let r = 0; r < rows; r++)
    for (let j = 0; j <= r; j++) {
      if (2 * j === r) continue;
      ctx.beginPath(); ctx.arc(cx + (j - r / 2) * dx, y0 + r * dy, 2.5, 0, 7); ctx.fill();
    }

  // gate
  ctx.save();
  ctx.translate(cx, 23); ctx.rotate(state.flip * 0.4);
  ctx.strokeStyle = tk.accent; ctx.lineWidth = 3.5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = tk.ink; ctx.beginPath(); ctx.arc(cx, 23, 2.5, 0, 7); ctx.fill();

  // buckets
  ctx.strokeStyle = tk.line; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(cx - half, yB); ctx.lineTo(cx - half, yB + bH); ctx.lineTo(cx + half, yB + bH); ctx.lineTo(cx + half, yB);
  ctx.stroke();
  ctx.textAlign = "center"; ctx.fillStyle = tk.muted; ctx.font = "500 10px 'IBM Plex Mono', monospace";
  ctx.fillText("IN MY FEED  ·  " + state.counts.seen, cx - 110, yB + bH + 15);
  ctx.fillText("NOT IN MY FEED  ·  " + state.counts.unseen, cx + 110, yB + bH + 15);

  // balls
  for (const b of state.balls) {
    const p = ballPosition(b.pts, state.now - b.t0);
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 7);
    if (b.seen) { ctx.fillStyle = tk.accent; ctx.fill(); }
    else { ctx.fillStyle = tk.hollow; ctx.fill(); ctx.strokeStyle = tk.accent; ctx.lineWidth = 2; ctx.stroke(); }
  }
}
