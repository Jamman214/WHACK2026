// Three.js renderer for the split Galton board. Rendering only: geometry comes from
// lib/galton.ts (SPLIT / BOARD_*) and ball positions from ballPosition(), so the scripted
// paths stay authoritative. Board space (x right, y down, px) maps to world (x, -y) with
// z pointing out of the backboard toward the camera.
import {
  AmbientLight, BufferGeometry, CanvasTexture, CapsuleGeometry, Color, DirectionalLight, Group, HemisphereLight,
  InstancedMesh, Material, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PCFShadowMap, PerspectiveCamera,
  PlaneGeometry, PMREMGenerator, PointLight, Scene, ShadowMaterial, SphereGeometry, Vector3, WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BOARD_H, BOARD_W, PEGS, SPLIT, ballPosition, bucketRect, pathDuration, pathEvents, type PathEvent } from "../lib/galton";
import { type Ball, type BoardTokens, sideGlow } from "./splitBoardCanvas";

export interface BoardState {
  /** gate tilt in [-1, 1] */
  flip: number;
  counts: { seen: number; unseen: number };
  balls: Ball[];
  now: number;
}

export interface SplitBoardScene {
  render(state: BoardState): void;
  resize(): void;
  setTokens(tk: BoardTokens): void;
  /** board-space point (y down) -> viewport px, on the ball plane */
  boardToClient(x: number, y: number): { x: number; y: number };
  dispose(): void;
}

const BALL_R = 5;
const BALL_Z = 5.5;     // ball centre height above the backboard
const PEG_D = 10;       // pegs and walls stand this far off the backboard
const WALL_D = 13;
const FOV = 24;
const TILT_Y = 46;      // camera height above the board centre: a few degrees of tilt
const CAM_MARGIN = 1.03; // breathing room so tilt, shadows and parallax never clip
const ease = 0.12;
const PEG_PING_MS = 520; // how long a struck peg keeps wobbling
const SQUASH_MS = 110;   // impact squash on the ball

export function createSplitBoardScene(container: HTMLElement, tk: BoardTokens): SplitBoardScene | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    if (!renderer.getContext()) throw new Error("no webgl");
  } catch {
    return null;
  }
  const { cx, yB, bH, half, slopeOuterY, slopeInnerY, top, gateY, wallTop } = SPLIT;
  const yBot = yB + bH;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // board (x, y-down) -> world
  const wx = (x: number) => x - BOARD_W / 2;
  const wy = (y: number) => BOARD_H / 2 - y;

  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  container.classList.add("is-3d");
  container.prepend(canvas);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.35;

  const camera = new PerspectiveCamera(FOV, BOARD_W / BOARD_H, 10, 3000);

  // ---- lights
  const hemi = new HemisphereLight(0xffffff, 0x8a93a6, 1.1);
  const ambient = new AmbientLight(0xffffff, 0.5);
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(-90, 140, 220);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -280, right: 280, top: 160, bottom: -160, near: 50, far: 700 });
  sun.shadow.radius = 5;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.3;
  scene.add(hemi, ambient, sun);

  // ---- materials (shared; recoloured by setTokens)
  const std = (roughness: number, metalness = 0) => new MeshStandardMaterial({ roughness, metalness });
  const mats = {
    shadow: new ShadowMaterial({ opacity: 0.2 }),
    wall: std(0.55),
    peg: std(0.4, 0.15),
    bucketS: std(0.55),   // hopper + bucket per side, so each can glow on its own
    bucketU: std(0.55),
    accent: std(0.3, 0.05),
  };
  const geos: BufferGeometry[] = [];
  const track = <T extends BufferGeometry>(g: T) => (geos.push(g), g);

  // ---- static board
  const board = new Group();
  scene.add(board);

  // backboard: invisible, only catches shadows, so the page shows straight through
  const shadowPlane = new Mesh(track(new PlaneGeometry(BOARD_W + 40, BOARD_H + 40)), mats.shadow);
  shadowPlane.receiveShadow = true;
  board.add(shadowPlane);

  /** thin extruded bar between two board-space points */
  const bar = (x1: number, y1: number, x2: number, y2: number, thick: number, depth: number, mat: Material) => {
    const len = Math.hypot(x2 - x1, y2 - y1) + thick;
    const m = new Mesh(track(new RoundedBoxGeometry(len, thick, depth, 2, Math.min(thick, depth) * 0.4)), mat);
    m.position.set(wx((x1 + x2) / 2), wy((y1 + y2) / 2), depth / 2);
    m.rotation.z = Math.atan2(-(y2 - y1), x2 - x1);
    m.castShadow = m.receiveShadow = true;
    board.add(m);
    return m;
  };
  // funnel + centre wall (the wall stops at the roof ridge where the inner hopper slopes meet)
  bar(cx - 40, top, cx - 8, top + 16, 2.2, WALL_D, mats.wall);
  bar(cx + 40, top, cx + 8, top + 16, 2.2, WALL_D, mats.wall);
  bar(cx, wallTop, cx, slopeInnerY, 2, WALL_D, mats.wall);
  // hoppers: a sloped chute from the edge of the peg field into a bucket, on each side
  for (const seen of [true, false]) {
    const m = (x: number) => (seen ? x : 2 * cx - x);
    const R = bucketRect(true), mat = seen ? mats.bucketS : mats.bucketU;
    const x0 = R.x0 - 1, x1 = R.x1 + 1;
    bar(m(cx - half), slopeOuterY, m(x0), yB, 2, WALL_D, mat);
    bar(m(x0), yB, m(x0), yBot, 2, WALL_D, mat);
    bar(m(x0), yBot, m(x1), yBot, 2, WALL_D, mat);
    bar(m(x1), yBot, m(x1), yB, 2, WALL_D, mat);
    bar(m(x1), yB, m(cx), slopeInnerY, 2, WALL_D, mat);
  }

  // pegs (centre column removed: that's where the wall is)
  const pegGeo = track(new CapsuleGeometry(2.5, PEG_D - 5, 4, 14));
  pegGeo.rotateX(Math.PI / 2);
  const pegs = new InstancedMesh(pegGeo, mats.peg, PEGS.length);
  const pegM = new Matrix4(), pegScale = new Vector3(), pegC = new Color();
  const setPeg = (i: number, age: number) => {
    const p = PEGS[i];
    // ping: damped wobble in thickness plus a tint flash fading out
    const wob = age < PEG_PING_MS && !reduced() ? Math.exp(-age / 120) * Math.cos(age * 0.05) : 0;
    const flash = age < PEG_PING_MS ? Math.exp(-age / 150) : 0;
    const s = 1 + 0.55 * wob;
    pegScale.set(s, s, 1 + 0.12 * wob);
    pegM.makeScale(pegScale.x, pegScale.y, pegScale.z).setPosition(wx(p.x), wy(p.y) - 0.8 * flash, PEG_D / 2);
    pegs.setMatrixAt(i, pegM);
    pegC.setRGB(1, 1, 1).lerp(pegHot, flash);
    pegs.setColorAt(i, pegC);
  };
  const pegHot = new Color(1.4, 1.4, 1.4); // retargeted to the accent by setTokens
  const pegAge = new Float32Array(PEGS.length).fill(Infinity);
  const pegLive = new Uint8Array(PEGS.length);
  PEGS.forEach((_, i) => setPeg(i, Infinity));
  pegs.castShadow = pegs.receiveShadow = true;
  board.add(pegs);

  // gate: a bar tilted by `flip` (no visible pivot)
  const gate = new Group();
  gate.position.set(wx(cx), wy(gateY), 2.4);
  const gateBar = new Mesh(track(new CapsuleGeometry(1.8, 28, 4, 12)), mats.accent);
  gateBar.rotation.z = Math.PI / 2;
  gateBar.castShadow = true;
  gate.add(gateBar);
  board.add(gate);

  // ---- landing glow: a soft halo on the board plus a point light in front of each bucket
  const haloTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,0.95)");
    grd.addColorStop(0.45, "rgba(255,255,255,0.4)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new CanvasTexture(c);
  })();
  const glowRig = (seen: boolean) => {
    const R = bucketRect(seen);
    const mat = new MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, opacity: 0 });
    const halo = new Mesh(track(new PlaneGeometry(190, 110)), mat);
    halo.position.set(wx((R.x0 + R.x1) / 2), wy(yB + bH / 2 + 4), 0.4);
    halo.renderOrder = -1;
    halo.visible = false;
    const light = new PointLight(0xffffff, 0, 150, 2);
    light.position.set(wx((R.x0 + R.x1) / 2), wy(yB + bH / 2), 30);
    board.add(halo, light);
    return { mat, halo, light, emissive: seen ? mats.bucketS : mats.bucketU };
  };
  const rigs = { seen: glowRig(true), unseen: glowRig(false) };

  // ---- balls
  const ballGeo = track(new SphereGeometry(BALL_R, 28, 20));
  interface BallMesh { g: Group; end: number; ev: PathEvent[] }
  const ballMeshes = new Map<Ball, BallMesh>();
  const ballGroup = new Group();
  scene.add(ballGroup);
  const makeBall = (b: Ball) => {
    const g = new Group();
    const m = new Mesh(ballGeo, mats.accent);
    m.castShadow = true;
    g.add(m);
    ballGroup.add(g);
    const bm = { g, end: pathDuration(b.pts), ev: pathEvents(b.pts) };
    ballMeshes.set(b, bm);
    return bm;
  };

  // ---- labels (HTML overlay: crisp mono text)
  const mkLabel = (cls: string) => {
    const el = document.createElement("div");
    el.className = "board-label " + cls;
    const t = document.createElement("span");
    t.className = "bl";
    el.appendChild(t);
    container.appendChild(el);
    return { el, t };
  };
  const labels = { seen: mkLabel("s"), unseen: mkLabel("u") };
  let lastCounts = { seen: -1, unseen: -1 };
  let lastGlow = { seen: -1, unseen: -1 };

  // ---- tokens
  let dark = false;
  const good = new Color(), bad = new Color(), wallColor = new Color();
  const setTokens = (t: BoardTokens) => {
    const bg = new Color(t.bg), line = new Color(t.line), peg = new Color(t.peg);
    dark = bg.getHSL({ h: 0, s: 0, l: 0 }).l < 0.5;
    // walls: a touch brighter than before, mostly in dark mode where they used to vanish
    mats.wall.color.copy(line).lerp(peg, dark ? 0.62 : 0.45);
    wallColor.copy(mats.wall.color);
    mats.bucketS.color.copy(wallColor);
    mats.bucketU.color.copy(wallColor);
    const hot = new Color(t.accent);
    pegHot.setRGB(hot.r / Math.max(0.05, peg.r), hot.g / Math.max(0.05, peg.g), hot.b / Math.max(0.05, peg.b)).multiplyScalar(1.25);
    good.set(t.good); bad.set(t.bad);
    rigs.seen.mat.color.copy(good); rigs.seen.light.color.copy(good); rigs.seen.emissive.emissive.copy(good);
    rigs.unseen.mat.color.copy(bad); rigs.unseen.light.color.copy(bad); rigs.unseen.emissive.emissive.copy(bad);
    lastGlow = { seen: -1, unseen: -1 };
    mats.peg.color.copy(peg);
    mats.accent.color.set(t.accent);
    mats.shadow.opacity = dark ? 0.5 : 0.22;
    hemi.intensity = dark ? 1.0 : 1.15;
    hemi.groundColor.set(dark ? 0x3a4150 : 0x9aa2b2);
    sun.intensity = dark ? 1.5 : 1.55;
    scene.environmentIntensity = dark ? 0.25 : 0.35;
    container.style.setProperty("--board-shadow", dark ? "rgba(0,0,0,.45)" : "rgba(19,22,27,.12)");
    dirty = true;
  };

  // ---- camera, parallax, sizing
  const baseDist = (BOARD_H / 2) / Math.tan((FOV / 2) * Math.PI / 180) * CAM_MARGIN;
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  const placeCamera = () => {
    camera.position.set(par.x, TILT_Y + par.y, baseDist);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  };
  const onPointer = (e: PointerEvent) => {
    if (reduced()) { par.tx = par.ty = 0; return; }
    par.tx = (e.clientX / innerWidth - 0.5) * 2 * 9;
    par.ty = -(e.clientY / innerHeight - 0.5) * 2 * 5;
  };
  addEventListener("pointermove", onPointer, { passive: true });

  const proj = new Vector3();
  const project = (x: number, y: number, z: number) => {
    proj.set(wx(x), wy(y), z).project(camera);
    return { x: ((proj.x + 1) / 2) * w, y: ((1 - proj.y) / 2) * h };
  };
  let w = 0, h = 0;
  let dirty = true;
  const layoutLabels = () => {
    const y = yBot + 17;
    for (const [k, seen] of [["seen", true], ["unseen", false]] as const) {
      const r = bucketRect(seen);
      const p = project((r.x0 + r.x1) / 2, y, 0);
      labels[k].el.style.transform = `translate(${canvas.offsetLeft + p.x}px, ${canvas.offsetTop + p.y}px) translate(-50%, -50%)`;
    }
  };
  const resize = () => {
    w = Math.max(1, Math.round(canvas.clientWidth || container.clientWidth));
    h = Math.round(w * (BOARD_H / BOARD_W));
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    placeCamera();
    layoutLabels();
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  setTokens(tk);
  resize();

  let lastFlip = NaN;
  const up = new Vector3(0, 1, 0);
  const v0 = new Vector3(), v1 = new Vector3();
  const render = (s: BoardState) => {
    const motionOk = !reduced();
    let animating = dirty || Math.abs(s.flip - lastFlip) > 1e-4;
    par.x += (par.tx - par.x) * ease; par.y += (par.ty - par.y) * ease;
    if (Math.abs(par.tx - par.x) > 1e-3 || Math.abs(par.ty - par.y) > 1e-3) { placeCamera(); animating = true; }

    // sync ball set (reset drops them all)
    const live = new Set(s.balls);
    for (const [b, bm] of ballMeshes)
      if (!live.has(b)) { ballGroup.remove(bm.g); ballMeshes.delete(b); animating = true; }

    pegAge.fill(Infinity);
    for (const b of s.balls) {
      const bm = ballMeshes.get(b) ?? (animating = true, makeBall(b));
      const el = s.now - b.t0;
      if (el > bm.end + 40 && bm.g.userData.settled) continue;
      bm.g.userData.settled = el > bm.end;
      const t = Math.max(0, el);
      const p = ballPosition(b.pts, t);
      bm.g.position.set(wx(p.x), wy(p.y), BALL_Z);

      // squash & stretch: stretched along the travel direction in flight, flattened on each impact
      let sx = 1, sy = 1;
      if (motionOk && el < bm.end) {
        const q = ballPosition(b.pts, Math.max(0, t - 16)), n = ballPosition(b.pts, t + 8);
        v0.set(n.x - q.x, -(n.y - q.y), 0);
        const speed = v0.length() / (t - Math.max(0, t - 16) + 8 || 1);
        let a = Math.min(0.32, speed * 0.75), dirv = v0;
        let hit = 0;
        for (const e of bm.ev) {
          const age = el - e.t;
          if (age >= -18 && age < SQUASH_MS) hit = Math.max(hit, e.thud * Math.pow(1 - Math.max(age, 0) / SQUASH_MS, 1.4));
        }
        if (hit > 0.02) { // flatten against what it struck (the surface is roughly horizontal)
          dirv = v1.copy(up);
          a = a * (1 - hit) - 0.34 * hit;
        }
        if (dirv.lengthSq() > 1e-8 && Math.abs(a) > 0.005) {
          bm.g.rotation.z = Math.atan2(dirv.y, dirv.x);
          sx = 1 + a; sy = 1 / Math.sqrt(sx);
        }
      } else bm.g.rotation.z = 0;
      bm.g.scale.set(sx, sy, sy);

      // pegs this ball has struck recently
      for (const e of bm.ev) {
        if (e.hit === undefined) continue;
        const age = el - e.t;
        if (age >= 0 && age < PEG_PING_MS && age < pegAge[e.hit]) pegAge[e.hit] = age;
      }
      animating = true;
    }

    // peg pings: only touch instances that are (or just were) ringing
    let pegDirty = false;
    for (let i = 0; i < PEGS.length; i++) {
      if (pegAge[i] === Infinity && !pegLive[i]) continue;
      pegLive[i] = pegAge[i] !== Infinity ? 1 : 0;
      setPeg(i, pegAge[i]);
      pegDirty = true;
    }
    if (pegDirty) {
      pegs.instanceMatrix.needsUpdate = true;
      if (pegs.instanceColor) pegs.instanceColor.needsUpdate = true;
      animating = true;
    }

    // landing glow (stateless: derived from when each ball touched its bucket floor)
    const gl = { seen: sideGlow(s.balls, true, s.now, !motionOk), unseen: sideGlow(s.balls, false, s.now, !motionOk) };
    for (const k of ["seen", "unseen"] as const) {
      if (gl[k] === lastGlow[k]) continue;
      const rig = rigs[k], g = gl[k];
      // dark: emissive does the work; light: emissive only washes pale, so tint the wall colour itself
      rig.emissive.emissiveIntensity = g * (dark ? 1.5 : 0.45);
      rig.emissive.color.copy(wallColor).lerp(k === "seen" ? good : bad, g * (dark ? 0.35 : 0.92));
      rig.mat.opacity = g * (dark ? 0.55 : 0.5);
      rig.halo.visible = g > 0;
      rig.light.intensity = g * (dark ? 9000 : 6500);
      labels[k].el.style.setProperty("--bump", g.toFixed(3));
      lastGlow[k] = g;
      animating = true;
    }

    if (s.counts.seen !== lastCounts.seen || s.counts.unseen !== lastCounts.unseen) {
      lastCounts = { ...s.counts };
      labels.seen.t.innerHTML = "IN MY FEED  ·  <b>" + s.counts.seen + "</b>";
      labels.unseen.t.innerHTML = "NOT IN MY FEED  ·  <b>" + s.counts.unseen + "</b>";
    }
    if (!animating) return;
    lastFlip = s.flip;
    gate.rotation.z = -s.flip * 0.4;
    dirty = false;
    renderer.render(scene, camera);
  };

  return {
    render,
    resize,
    setTokens,
    boardToClient(x, y) {
      const r = canvas.getBoundingClientRect();
      const p = project(x, y, BALL_Z);
      return { x: r.left + (p.x / w) * r.width, y: r.top + (p.y / h) * r.height };
    },
    dispose() {
      removeEventListener("pointermove", onPointer);
      ro.disconnect();
      geos.forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
      haloTex.dispose();
      pegs.dispose();
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      labels.seen.el.remove();
      labels.unseen.el.remove();
      container.classList.remove("is-3d");
      container.style.removeProperty("--board-shadow");
    },
  };
}
