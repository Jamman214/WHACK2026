import { ringKey, stepsText } from "./util";

/** The distance pill: amber-to-rust by steps out, a calm neutral for "In your bubble". */
export default function Dist({ ring, className }: { ring: number; className?: string }) {
  return <span className={"badge" + (className ? " " + className : "")} data-ring={ringKey(ring)}>{stepsText(ring)}</span>;
}
