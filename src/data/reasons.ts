import REASONS from "./edgeReasons.json";

const R = REASONS as Record<string, string>;

/** Why `b` matters to someone who follows `a`. Each edge is written once and read in either direction. */
export const edgeReason = (a: string, b: string): string | undefined => R[`${a}|${b}`] ?? R[`${b}|${a}`];
