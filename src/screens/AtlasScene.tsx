import { useEffect, useRef } from "react";
import { AtlasThree, type PlanetKey } from "../render/atlasThree";
import type { CategoryId } from "../data/taxonomy";
import type { Layout } from "../lib/layout";
import "../render/atlasScene.css";

/** True when this browser can create a WebGL context (so the 3D map can run). */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

export interface AtlasSceneProps {
  /** layout(MODEL, bubble, thr): ring / parent / pw drive the orbits and routes. */
  lay: Layout;
  /** Links below this weight are ignored. */
  thr: number;
  /** The open planet view (null = system overview; "home" = your bubble at the centre). */
  planet: CategoryId | "home" | null;
  /** Selected topic (the overlay guarantees it belongs to `planet` when both are set). */
  sel: string | null;
  /** Increments = fly back to the default overview framing (Home button). */
  recenter: number;
  /** Pixels of the canvas covered by overlay panels on each side; the scene centres in the rest. */
  insets: { top: number; right: number; bottom: number; left: number };
  /** A planet (or the home planet) was clicked or activated. */
  onPlanet: (id: CategoryId | "home") => void;
  /** A topic dot or label was clicked (planet view and home view). */
  onSelect: (id: string) => void;
  /** The user orbited or zoomed. */
  onUserMove: () => void;
  /** WebGL failed to start; fall back to the SVG map. */
  onUnsupported: () => void;
}

/** React shell around the imperative Three.js scene: pushes props in, owns nothing else. */
export default function AtlasScene({ lay, thr, planet, sel, recenter, insets, onPlanet, onSelect, onUserMove, onUnsupported }: AtlasSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<AtlasThree | null>(null);
  const cbs = useRef({ onPlanet, onSelect, onUserMove, onUnsupported });
  cbs.current = { onPlanet, onSelect, onUserMove, onUnsupported };
  const latest = useRef({ lay, thr, planet, sel, insets, recenter });
  latest.current = { lay, thr, planet, sel, insets, recenter };

  useEffect(() => {
    let s: AtlasThree;
    try {
      s = new AtlasThree(host.current!, {
        onPlanet: (id: PlanetKey) => cbs.current.onPlanet(id),
        onSelect: (id) => cbs.current.onSelect(id),
        onUserMove: () => cbs.current.onUserMove(),
      });
    } catch {
      cbs.current.onUnsupported();
      return;
    }
    scene.current = s;
    const f = latest.current;
    s.setInsets(f.insets);
    s.setLayout({ lay: f.lay, thr: f.thr });
    s.setView({ planet: f.planet, sel: f.sel });
    return () => { s.dispose(); scene.current = null; };
  }, []);

  useEffect(() => { scene.current?.setLayout({ lay, thr }); }, [lay, thr]);
  useEffect(() => { scene.current?.setView({ planet, sel }); }, [planet, sel]);
  useEffect(() => { scene.current?.setInsets(insets); }, [insets.top, insets.right, insets.bottom, insets.left]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastRecenter = useRef(recenter);
  useEffect(() => {
    if (lastRecenter.current === recenter) return;
    lastRecenter.current = recenter;
    scene.current?.recenter();
  }, [recenter]);

  return (
    <div
      ref={host}
      className="as-host"
      role="group"
      aria-label="Topic Atlas solar system. You are the sun at the centre; each planet is a category, and the further out it orbits the further it is from what you know. Drag to orbit, scroll to zoom. Tab moves from your bubble outward through every planet."
    />
  );
}
