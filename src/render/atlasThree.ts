// Imperative Three.js renderer for the Topic Atlas: a flat "solar system" with the user's bubble as the sun.
//
//  * Home ("You") sits at the origin, lit like a sun; its known topics are lit points on its surface.
//  * Planets = categories. A planet's orbit = bridges from home to its nearest unknown topic (src/lib/solar.ts),
//    so distance reads at a glance. Everything lies on the y = 0 plane; the default camera looks down at ~45 deg.
//  * Routes = one gradient arc per planet back to the planet one orbit closer (a tree growing out from home).
//    Hovering / focusing a planet faintly shows its other planet-level connections.
//  * Planet view: the camera flies in, a key + rim light turns on, everything else dims to ~15 % and the routes
//    and orbits fade out; the planet's topics are dots with DOM labels. Home view does the same for the sun.
//  * Adding a topic to the bubble sends a glowing dot to the sun, then the planets re-settle on their new orbits.
//  * Labels are real DOM buttons (crisp text, keyboard accessible), projected every frame and decluttered.
//
// React only pushes state in through setLayout / setView / recenter / setInsets (see screens/AtlasScene.tsx).
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CATEGORIES, LINKS, TOPICS, type Category, type CategoryId, type Topic } from "../data/taxonomy";
import { MODEL } from "../data/model";
import type { Layout } from "../lib/layout";
import { TWEEN_MS, easeInOut, orbitLabel, stepsPhrase } from "../lib/atlasStyle";
import { MOON_R, MOON_RING, MOON_RING_IN, MOON_RING_OUT, moonLayout, solarModel, solarPositions, type SolarModel, type SolarPositions } from "../lib/solar";
import { FatLine } from "./atlas/fatline";
import {
  ATMO_FRAG, ATMO_VERT, DOT_FRAG, DOT_VERT, GLOW_FRAG, GLOW_VERT, MOON_FRAG, MOON_VERT, PLANET_FRAG, PLANET_VERT, RING_FRAG, STAR_FRAG, STAR_VERT, SUN_FRAG,
} from "./atlas/shaders";

export type PlanetKey = CategoryId | "home";
export interface SceneLayout { lay: Layout; thr: number }
export interface SceneView { planet: PlanetKey | null; sel: string | null }
export interface SceneCallbacks { onPlanet: (id: PlanetKey) => void; onSelect: (id: string) => void; onUserMove: () => void }
export interface Insets { top: number; right: number; bottom: number; left: number }

// ---------- tunables ----------

const FOV = 38;
const U = 50; // scene units per solar unit
const CAM_MS = 1000;
const SEGS = 28; // segments per route
const LABEL_PAD = 4;
const FLIGHT_MS = 900;
const OVERVIEW_POLAR = THREE.MathUtils.degToRad(45);
const PLANET_POLAR = THREE.MathUtils.degToRad(62);
const HOME_POLAR = THREE.MathUtils.degToRad(52);
const MIN_POLAR = THREE.MathUtils.degToRad(20);
const MAX_POLAR = THREE.MathUtils.degToRad(70);
const PLANET_FILL = 0.6; // a planet fills about this much of the visible area in the planet view
const DIM = 0.15;
const N_TOPICS = TOPICS.length;
const MAX_FLYERS = 8;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wNorm = (w: number) => clamp((w - 0.2) / 0.75, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const angLerp = (a: number, b: number, t: number) => a + (((((b - a) + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * t;
const TOPIC_INDEX: Record<string, number> = Object.fromEntries(TOPICS.map((t, i) => [t.id, i]));
const CAT_INDEX = Object.fromEntries(CATEGORIES.map((c, i) => [c.id, i])) as Record<CategoryId, number>;

/** i-th of n points on a spherical cap around +z (half-angle `half`), spiralled by the golden angle. */
function capDir(i: number, n: number, half: number): THREE.Vector3 {
  const cos = 1 - (1 - Math.cos(half)) * ((i + 0.5) / n), s = Math.sqrt(1 - cos * cos), a = i * GOLDEN;
  return new THREE.Vector3(s * Math.cos(a), s * Math.sin(a), cos);
}
const sphericalDir = (polar: number, az: number, out = new THREE.Vector3()) =>
  out.set(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az));

// ---------- objects ----------

interface PP { ang: number; R: number; r: number; k: number }

interface TopicObj {
  i: number;
  topic: Topic;
  pl: PlanetObj;
  dir: THREE.Vector3; // local direction on the planet
  homeDir: THREE.Vector3; // local direction on the sun
  pos: THREE.Vector3; // world position of the moon
  moon: THREE.Vector3; // moon offset from the planet centre, in planet radii (ring plane = xy)
  mr: number; // current world radius of the moon
  hpos: THREE.Vector3; // world position of the home dot
  el: HTMLButtonElement;
  w: number; h: number;
  key: string;
  ring: number;
  px: number; py: number; vis: number; hvis: number;
}

interface PlanetObj {
  idx: number;
  id: CategoryId;
  cat: Category;
  topics: TopicObj[];
  body: THREE.Mesh;
  atmo: THREE.Mesh;
  prog: THREE.Mesh;
  center: THREE.Vector3;
  p: PP; p0: PP; p1: PP;
  spin: THREE.Quaternion; spin0: THREE.Quaternion; spin1: THREE.Quaternion; spinT0: number; spinning: boolean;
  color: THREE.Color;
  dim: number;
  el: HTMLButtonElement;
  nameEl: HTMLSpanElement;
  subEl: HTMLElement;
  w: number; h: number;
  key: string;
  px: number; py: number; rpx: number; dist: number; shown: boolean;
  explored: number;
  route: FatLine;
  routeParent: number; // planet index, -1 = home, -2 = none
  routeW: number;
}

interface OrbitObj { mesh: THREE.Mesh; el: HTMLSpanElement; R: number; R0: number; R1: number; orbit: number; on: boolean; w: number; h: number; key: string; pref: number }
interface Flyer { t0: number; topic: number; from: THREE.Vector3; ctrl: THREE.Vector3 }
interface Pose { target: THREE.Vector3; radius: number; polar: number; az: number }
interface Box { x0: number; y0: number; x1: number; y1: number }
type Mode = "overview" | "home" | "planet";
type Side = "r" | "l" | "t" | "b";

export class AtlasThree {
  private readonly host: HTMLElement;
  private readonly cb: SceneCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 2, 30000);
  private readonly controls: OrbitControls;
  private readonly labelsEl = document.createElement("div");
  private readonly ro: ResizeObserver;
  private readonly mo: MutationObserver;
  private readonly mq: MediaQueryList;
  private readonly sphereGeo = new THREE.SphereGeometry(1, 64, 40);
  private readonly atmoGeo = new THREE.SphereGeometry(1, 40, 24);
  private readonly quadGeo = new THREE.PlaneGeometry(2, 2);
  private readonly orbitGeo = new THREE.RingGeometry(0.9945, 1, 220);

  private readonly planets: PlanetObj[] = [];
  private readonly topics: TopicObj[] = [];
  private readonly orbitObjs: OrbitObj[] = [];
  private readonly hoverLines: FatLine[] = [];
  private readonly sunBody: THREE.Mesh;
  private readonly sunMat: THREE.ShaderMaterial;
  private readonly corona: THREE.Mesh;
  private readonly coronaMat: THREE.ShaderMaterial;
  private readonly dots: THREE.Points;
  private readonly dotMat: THREE.ShaderMaterial;
  private readonly stars: THREE.Points;
  private readonly starMat: THREE.ShaderMaterial;
  private readonly homeEl: HTMLButtonElement;
  private homeBox = { w: 0, h: 0 };
  private homeKey = "";

  // state
  private layState: SceneLayout | null = null;
  private sm: SolarModel | null = null; // what is drawn (lags the latest state during the add-to-bubble flight)
  private pos: SolarPositions | null = null;
  private pending: { sm: SolarModel; pos: SolarPositions } | null = null;
  private prevKnown = new Set<string>();
  private known = new Set<string>();
  private shownKnown = 0;
  private flyers: Flyer[] = [];
  private settleTimer = 0;
  private tweenT0 = 0;
  private tweenDur = 0;
  private tweening = false;
  private view: SceneView = { planet: null, sel: null };
  private mode: Mode = "overview";
  private focusIdx = -1; // planet view / home view target
  private pairMax = new Map<string, number>();
  private colors = new Map<string, THREE.Color>();
  private dark = false;
  private sunCol = new THREE.Color();
  private bgCol = new THREE.Color();
  private w = 1;
  private h = 1;
  private raf = 0;
  private last = 0;
  private disposed = false;
  private needMeasure = true;
  private pxScale = 1000;
  private readonly moonQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), sphericalDir(PLANET_POLAR, 0));
  private moonMesh!: THREE.InstancedMesh;
  private moonCol!: THREE.InstancedBufferAttribute;
  private moonAlpha!: THREE.InstancedBufferAttribute;
  private moonLines: THREE.LineLoop[] = [];
  private readonly _mm = new THREE.Matrix4();
  private geomDirty = true;
  private sysRadius = 600;

  // fx (smoothed towards their targets)
  private fx = { routes: 1, orbits: 1, key: 0, home: 1, view: 0 };

  // camera
  private cam: { t0: number; from: Pose; to: Pose } | null = null;
  private interacted = false;
  private insetsTo: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private overviewR = 1500;
  private limitsFor: Mode | "flight" = "overview";

  // pointer / focus
  private down: { x: number; y: number } | null = null;
  private dragged = false;
  private hoverPlanet = -2; // -2 none, -1 home, >= 0 planet
  private hoverTopic: string | null = null;
  private focusPlanetEl = -2;
  private focusTopic: string | null = null;
  private pickedAt = 0;
  private viewInit = false;
  private compact = false;

  private readonly _v = new THREE.Vector3();
  private readonly _a = new THREE.Vector3();
  private readonly _b = new THREE.Vector3();
  private readonly _c = new THREE.Vector3();
  private readonly _lit = new THREE.Color();
  private readonly _dimC = new THREE.Color();
  private readonly _pale = new THREE.Color(0xfff6d6);
  private readonly _sph = new THREE.Spherical();
  private readonly _ray = new THREE.Raycaster();
  private readonly _p = { x: 0, y: 0 };
  private readonly pts = new Float32Array((SEGS + 1) * 3);

  constructor(host: HTMLElement, cb: SceneCallbacks) {
    this.host = host;
    this.cb = cb;
    host.classList.add("as-host");

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.className = "as-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    host.appendChild(canvas);
    this.labelsEl.className = "as-labels";
    host.appendChild(this.labelsEl);

    this.scene.fog = new THREE.Fog(0xffffff, 100, 6000);

    // stars: a sparse deterministic shell far behind everything
    {
      const n = 700, pos = new Float32Array(n * 3), size = new Float32Array(n);
      let seed = 11;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < n; i++) {
        const r = 3500 + rnd() * 5000, u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        pos.set([Math.cos(a) * s * r, u * r, Math.sin(a) * s * r], i * 3);
        size[i] = 0.5 + rnd() * rnd() * 1.6;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
      this.starMat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0.4 }, uScale: { value: 1 } },
        vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false,
      });
      this.stars = new THREE.Points(g, this.starMat);
      this.stars.frustumCulled = false;
      this.stars.renderOrder = -10;
      this.scene.add(this.stars);
    }

    // the sun (home): self-lit body + corona
    this.sunMat = new THREE.ShaderMaterial({
      uniforms: {
        uCore: { value: new THREE.Color() }, uEdge: { value: new THREE.Color() }, uBg: { value: new THREE.Color() },
        uDim: { value: 1 }, uGrid: { value: 0.18 }, uGridCol: { value: new THREE.Color() },
      },
      vertexShader: PLANET_VERT, fragmentShader: SUN_FRAG,
    });
    this.sunBody = new THREE.Mesh(this.sphereGeo, this.sunMat);
    this.scene.add(this.sunBody);
    this.coronaMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0.5 }, uInner: { value: 0.34 } },
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false,
    });
    this.corona = new THREE.Mesh(this.quadGeo, this.coronaMat);
    this.corona.renderOrder = -2;
    this.scene.add(this.corona);

    // orbit rings (pool) + their labels
    for (let k = 0; k < 8; k++) {
      const mesh = new THREE.Mesh(this.orbitGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = -4;
      mesh.visible = false;
      this.scene.add(mesh);
      const el = document.createElement("span");
      el.className = "as-orbit is-off";
      el.setAttribute("aria-hidden", "true");
      this.labelsEl.appendChild(el);
      this.orbitObjs.push({ mesh, el, R: 0, R0: 0, R1: 0, orbit: k + 1, on: false, w: 0, h: 0, key: "", pref: -1 });
    }

    // home label first in DOM order (tab order = home, then planets home-outward)
    this.homeEl = document.createElement("button");
    this.homeEl.type = "button";
    this.homeEl.className = "as-home";
    this.homeEl.addEventListener("click", () => { if (performance.now() - this.pickedAt > 450) this.pickPlanet("home"); });
    this.homeEl.addEventListener("pointerenter", () => this.setHover(-1, null));
    this.homeEl.addEventListener("pointerleave", () => this.setHover(-2, null));
    this.labelsEl.appendChild(this.homeEl);

    CATEGORIES.forEach((cat, idx) => this.planets.push(this.makePlanet(cat, idx)));

    // dots: planet dots, home dots, add-to-bubble flyers
    {
      const n = N_TOPICS * 2 + MAX_FLYERS, g = new THREE.BufferGeometry();
      const mk = (name: string, k: number) => {
        const a = new THREE.BufferAttribute(new Float32Array(n * k), k);
        a.setUsage(THREE.DynamicDrawUsage);
        g.setAttribute(name, a);
      };
      mk("position", 3); mk("aColor", 3); mk("aHalo", 4); mk("aSize", 1); mk("aGlow", 1); mk("aRing", 1); mk("aAlpha", 1);
      this.dotMat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
          uScale: { value: 1 }, uRingCol: { value: new THREE.Color() }, uEdgeCol: { value: new THREE.Color() },
        }]),
        vertexShader: DOT_VERT, fragmentShader: DOT_FRAG, transparent: true, depthWrite: false, fog: true,
      });
      this.dots = new THREE.Points(g, this.dotMat);
      this.dots.frustumCulled = false;
      this.dots.renderOrder = 6;
      this.scene.add(this.dots);
    }

    // moons: one instanced sphere mesh, plus two faint orbit lines for the focused planet
    {
      const geo = new THREE.SphereGeometry(1, 20, 14), n = N_TOPICS;
      this.moonCol = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      this.moonAlpha = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
      this.moonCol.setUsage(THREE.DynamicDrawUsage); this.moonAlpha.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("aCol", this.moonCol); geo.setAttribute("aAlpha", this.moonAlpha);
      const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
        vertexShader: MOON_VERT, fragmentShader: MOON_FRAG, transparent: true, fog: true,
      });
      this.moonMesh = new THREE.InstancedMesh(geo, mat, n);
      this.moonMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.moonMesh.frustumCulled = false; this.moonMesh.renderOrder = 5; this.moonMesh.visible = false;
      this.scene.add(this.moonMesh);
      const pts: number[] = [];
      for (let i = 0; i < 128; i++) pts.push(Math.cos((i / 128) * Math.PI * 2), Math.sin((i / 128) * Math.PI * 2), 0);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      for (let k = 0; k < 2; k++) {
        const line = new THREE.LineLoop(lg, new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        line.visible = false; line.frustumCulled = false; line.renderOrder = 4;
        this.scene.add(line); this.moonLines.push(line);
      }
    }

    // faint planet-level connections shown on hover / focus
    for (let k = 0; k < CATEGORIES.length; k++) {
      const line = new FatLine(SEGS);
      line.obj.visible = false;
      line.obj.renderOrder = 1;
      this.scene.add(line.obj);
      this.hoverLines.push(line);
    }

    // topic labels come after the planet labels in DOM order
    for (const pl of this.planets) for (const t of pl.topics) this.labelsEl.appendChild(t.el);

    this.controls = new OrbitControls(this.camera, host);
    const ctl = this.controls;
    ctl.enableDamping = !reduceMotion();
    ctl.dampingFactor = 0.09;
    ctl.enablePan = false;
    ctl.zoomSpeed = 0.9;
    ctl.rotateSpeed = 0.7;
    ctl.addEventListener("change", this.requestRender);
    ctl.addEventListener("start", this.onControlsStart);
    ctl.addEventListener("end", this.requestRender);

    host.addEventListener("wheel", this.onWheel, { passive: true });
    host.addEventListener("pointerdown", this.onDown);
    host.addEventListener("pointermove", this.onMove);
    host.addEventListener("pointerup", this.onUp);
    host.addEventListener("pointerleave", this.onLeave);
    host.addEventListener("click", this.onClickCapture, true);
    this.labelsEl.addEventListener("focusin", this.onFocusIn);
    this.labelsEl.addEventListener("focusout", this.onFocusOut);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.mo = new MutationObserver(() => this.retheme());
    this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    this.mq = matchMedia("(prefers-color-scheme: dark)");
    this.mq.addEventListener("change", this.retheme);
    document.fonts?.ready.then(() => { this.needMeasure = true; this.requestRender(); }).catch(() => {});

    this.resize();
    this.retheme();
  }

  // ---------- public API ----------

  /** The bubble changed (or first call): recompute orbits and, for newly added topics, fly them to the sun. */
  setLayout(s: SceneLayout) {
    const first = !this.layState;
    this.layState = s;
    const sm = solarModel(s.lay, MODEL), pos = solarPositions(sm);
    const known = new Set(sm.home);
    const added = first ? [] : [...known].filter((id) => !this.prevKnown.has(id));
    this.prevKnown = known;
    this.known = known;

    // planet-level connection strengths at this threshold (aggregated topic links)
    this.pairMax.clear();
    for (const l of LINKS) {
      if (l.w < s.thr) continue;
      const a = MODEL.byId[l.a].category, b = MODEL.byId[l.b].category;
      if (a === b) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      this.pairMax.set(key, Math.max(this.pairMax.get(key) ?? 0, l.w));
    }

    this.flushPending();
    const flying = !first && added.length > 0 && !reduceMotion() && !!this.sm;
    if (flying) {
      this.startFlyers(added);
      this.pending = { sm, pos };
      window.clearTimeout(this.settleTimer);
      this.settleTimer = window.setTimeout(() => this.flushPending(), FLIGHT_MS + 40);
    } else {
      this.applyModel(sm, pos, first);
    }
    this.restyle();
    this.requestRender();
  }

  setView(v: SceneView) {
    const prev = this.view, prevMode = this.mode;
    this.view = { ...v };
    const mode: Mode = v.planet === null ? "overview" : v.planet === "home" ? "home" : "planet";
    this.mode = mode;
    this.focusIdx = v.planet && v.planet !== "home" ? CAT_INDEX[v.planet] : -1;
    const changed = mode !== prevMode || v.planet !== prev.planet;
    if (changed) { this.interacted = false; this.applySpinFor(v.planet); }
    if (!this.viewInit) { this.viewInit = true; this.interacted = false; this.snapCamera(this.poseForMode()); if (v.sel) this.snapSpin(v.sel); }
    else if (changed) this.flyTo(this.poseForMode());
    if (this.viewInit && (v.sel !== prev.sel || changed)) this.turnTo(v.sel);
    this.restyle();
    this.requestRender();
  }

  /** Fly back to the default framing for the current view (the Home / Map button). */
  recenter() {
    this.interacted = false;
    this.flyTo(this.poseForMode());
    if (this.view.sel) this.turnTo(this.view.sel);
  }

  /** Pixels of the canvas covered by overlay panels; the scene centres itself in what is left. */
  setInsets(i: Insets) {
    const same = (["top", "right", "bottom", "left"] as const).every((k) => Math.abs(this.insetsTo[k] - i[k]) < 1);
    if (same) return;
    this.insetsTo = { ...i };
    if (reduceMotion()) { this.insets = { ...i }; this.applyViewOffset(); }
    if (!this.interacted) this.refit();
    this.needMeasure = true;
    this.requestRender();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.settleTimer);
    this.ro.disconnect();
    this.mo.disconnect();
    this.mq.removeEventListener("change", this.retheme);
    const h = this.host;
    h.removeEventListener("wheel", this.onWheel);
    h.removeEventListener("pointerdown", this.onDown);
    h.removeEventListener("pointermove", this.onMove);
    h.removeEventListener("pointerup", this.onUp);
    h.removeEventListener("pointerleave", this.onLeave);
    h.removeEventListener("click", this.onClickCapture, true);
    this.labelsEl.removeEventListener("focusin", this.onFocusIn);
    this.labelsEl.removeEventListener("focusout", this.onFocusOut);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("webglcontextlost", this.onContextLost);
    canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.controls.dispose();
    for (const p of this.planets) p.route.dispose();
    for (const l of this.hoverLines) l.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(o as THREE.Points).isPoints) return;
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
      if (m.geometry) m.geometry.dispose();
    });
    this.sphereGeo.dispose(); this.atmoGeo.dispose(); this.quadGeo.dispose(); this.orbitGeo.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
    this.labelsEl.remove();
    h.classList.remove("as-host");
    h.style.cursor = "";
  }

  // ---------- construction ----------

  private get first() { return !this.sm; }

  private makePlanet(cat: Category, idx: number): PlanetObj {
    const body = new THREE.Mesh(this.sphereGeo, new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uBody: { value: new THREE.Color() }, uTint: { value: new THREE.Color() }, uBg: { value: new THREE.Color() },
        uSunPos: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
        uKeyI: { value: 0 }, uRimI: { value: 0 }, uSunI: { value: 1 }, uShadeLo: { value: 0.5 }, uGrid: { value: 0.3 },
        uSat: { value: 1 }, uBright: { value: 1 }, uFade: { value: 0 }, uDim: { value: 1 }, uRim: { value: 0.3 },
      }]),
      vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG, fog: true,
    }));
    const atmo = new THREE.Mesh(this.atmoGeo, new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color() }, uStrength: { value: 0.5 }, uCos: { value: 0.5 } }]),
      vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false, fog: true,
    }));
    atmo.renderOrder = -1;
    const prog = new THREE.Mesh(this.quadGeo, new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color() }, uTrack: { value: new THREE.Color() }, uFrac: { value: 0 }, uAlpha: { value: 1 },
        uInner: { value: 0.78 }, uOuter: { value: 0.86 }, uTrackA: { value: 0.35 },
      },
      vertexShader: GLOW_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false,
    }));
    prog.renderOrder = 3;
    this.scene.add(body, atmo, prog);

    const el = document.createElement("button");
    el.type = "button";
    el.className = "as-planet is-off";
    el.dataset.cat = String(idx);
    el.style.setProperty("--cat", `var(--c-${cat.id})`);
    const sw = document.createElement("i");
    const nameEl = document.createElement("span");
    nameEl.className = "as-nm";
    nameEl.textContent = cat.name;
    const subEl = document.createElement("small");
    el.append(sw, nameEl, subEl);
    el.addEventListener("click", this.onPlanetClick);
    el.addEventListener("pointerenter", () => this.setHover(idx, null));
    el.addEventListener("pointerleave", () => this.setHover(-2, null));
    this.labelsEl.appendChild(el);

    const route = new FatLine(SEGS);
    route.obj.renderOrder = 2;
    this.scene.add(route.obj);

    const pl: PlanetObj = {
      idx, id: cat.id, cat, topics: [], body, atmo, prog, center: new THREE.Vector3(),
      p: { ang: 0, R: 0, r: 1, k: 0 }, p0: { ang: 0, R: 0, r: 1, k: 0 }, p1: { ang: 0, R: 0, r: 1, k: 0 },
      spin: new THREE.Quaternion(), spin0: new THREE.Quaternion(), spin1: new THREE.Quaternion(), spinT0: 0, spinning: false,
      color: new THREE.Color(), dim: 1, el, nameEl, subEl, w: 0, h: 0, key: "", px: 0, py: 0, rpx: 0, dist: 1, shown: false,
      explored: 0, route, routeParent: -2, routeW: 0,
    };
    pl.spin.setFromUnitVectors(new THREE.Vector3(0, 0, 1), sphericalDir(PLANET_POLAR, 0));
    cat.topics.forEach((t, j) => pl.topics.push(this.makeTopic(t, pl, j)));
    return pl;
  }

  private makeTopic(topic: Topic, pl: PlanetObj, j: number): TopicObj {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "as-topic is-off";
    el.hidden = true;
    el.textContent = topic.name;
    el.dataset.id = topic.id;
    el.style.setProperty("--cat", `var(--c-${topic.category})`);
    el.addEventListener("click", this.onTopicClick);
    el.addEventListener("pointerenter", () => this.setHover(-2, topic.id));
    el.addEventListener("pointerleave", () => this.setHover(-2, null));
    const t: TopicObj = {
      i: TOPIC_INDEX[topic.id], topic, pl, el, w: 0, h: 0, key: "", ring: Infinity,
      dir: capDir(j, pl.cat.topics.length, THREE.MathUtils.degToRad(64)),
      homeDir: capDir(TOPIC_INDEX[topic.id], N_TOPICS, THREE.MathUtils.degToRad(88)),
      moon: new THREE.Vector3(), mr: 0,
      pos: new THREE.Vector3(), hpos: new THREE.Vector3(), px: 0, py: 0, vis: 0, hvis: 0,
    };
    const m = moonLayout(pl.cat.topics.length)[j];
    if (m) t.moon.set(m.x, m.y, m.z).applyQuaternion(this.moonQ);
    this.topics[t.i] = t;
    return t;
  }

  // ---------- colours / theme ----------

  private readonly retheme = () => {
    this.colors.clear();
    this.needMeasure = true;
    const tok = (n: string) => this.color(`var(${n})`);
    const bg = tok("--bg"), surface = tok("--surface"), fg = tok("--fg"), muted = tok("--muted");
    const lum = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b;
    this.dark = lum < 0.18;
    this.bgCol.copy(bg);
    (this.scene.fog as THREE.Fog).color.copy(bg);
    const sun = this.color("var(--sun, #e0a100)");
    this.sunCol.copy(sun);
    const su = this.sunMat.uniforms;
    su.uCore.value.copy(sun).lerp(new THREE.Color(0xfff3c4), this.dark ? 0.55 : 0.4);
    su.uEdge.value.copy(sun).multiplyScalar(this.dark ? 0.85 : 0.95);
    su.uBg.value.copy(bg);
    su.uGridCol.value.copy(sun).lerp(new THREE.Color(0xffffff), 0.5);
    this.coronaMat.uniforms.uColor.value.copy(sun);
    this.coronaMat.uniforms.uAlpha.value = this.dark ? 0.6 : 0.42;
    this.dotMat.uniforms.uRingCol.value.copy(fg);
    this.dotMat.uniforms.uEdgeCol.value.copy(this.dark ? bg : fg);
    this.starMat.uniforms.uColor.value.copy(this.dark ? fg : muted);
    this.starMat.uniforms.uAlpha.value = this.dark ? 0.55 : 0.1;
    for (const pl of this.planets) {
      const col = this.color(`var(--c-${pl.id})`);
      pl.color.copy(col);
      const u = (pl.body.material as THREE.ShaderMaterial).uniforms;
      u.uBody.value.copy(surface).lerp(col, this.dark ? 0.46 : 0.62);
      u.uTint.value.copy(col);
      u.uBg.value.copy(bg);
      u.uSunCol.value.copy(sun);
      u.uShadeLo.value = this.dark ? 0.34 : 0.62;
      u.uGrid.value = this.dark ? 0.3 : 0.26;
      u.uRim.value = this.dark ? 0.5 : 0.1;
      (pl.prog.material as THREE.ShaderMaterial).uniforms.uTrack.value.copy(this.dark ? muted : muted);
    }
    for (const o of this.orbitObjs) {
      const m = o.mesh.material as THREE.MeshBasicMaterial;
      m.color.copy(this.dark ? muted : fg).lerp(bg, this.dark ? 0.35 : 0.5);
    }
    this.recolorRoutes();
    this.restyle();
    this.requestRender();
  };

  /** Resolve `var(--token)` (or any CSS colour) to a THREE.Color via the page's computed style. */
  private color(spec: string): THREE.Color {
    const hit = this.colors.get(spec);
    if (hit) return hit;
    const m = /^var\((--[\w-]+)(?:,\s*([^)]+))?\)$/.exec(spec);
    const raw = m ? (getComputedStyle(this.host).getPropertyValue(m[1]).trim() || m[2] || "") : spec;
    const c = new THREE.Color(0x888888);
    try { c.setStyle(normaliseCss(raw || "#888888")); } catch { c.set(0x888888); }
    this.colors.set(spec, c);
    return c;
  }

  // ---------- model -> objects ----------

  /** Make `sm` the drawn state: planets tween to their new orbits, arcs and labels update. */
  private applyModel(sm: SolarModel, pos: SolarPositions, instant: boolean) {
    this.sm = sm;
    this.pos = pos;
    this.shownKnown = sm.home.length;
    const now = performance.now();
    const maxOrbits = Math.max(1, sm.orbits);
    for (const pl of this.planets) {
      const sp = pos.planets[pl.id], p = sm.planets[pl.id];
      const k = Number.isFinite(p.orbit) ? clamp((p.orbit - 1) / Math.max(1, maxOrbits - 1), 0, 1) : 1.25;
      pl.p0 = { ...pl.p };
      pl.p1 = { ang: sp.angle, R: sp.orbitR, r: sp.r, k };
      if (instant) pl.p = { ...pl.p1 };
      pl.explored = p.explored.length;
      pl.routeParent = p.parent === null ? -2 : p.parent === "home" ? -1 : CAT_INDEX[p.parent];
      pl.routeW = p.via?.w ?? 0;
      pl.route.obj.visible = pl.routeParent !== -2;
    }
    // orbit rings: one per finite orbit + one for out of reach
    const radii = pos.orbitRadii;
    this.orbitObjs.forEach((o, i) => {
      o.on = i < radii.length;
      o.R0 = o.R;
      o.R1 = radii[i] ?? o.R;
      o.orbit = sm.hasOut && i === radii.length - 1 ? Infinity : i + 1;
      o.el.textContent = orbitLabel(o.orbit);
      o.key = "";
      if (instant || !o.R) o.R = o.R1;
      o.mesh.visible = o.on;
    });
    const outer = Math.max(...radii, pos.home.r) * U;
    this.sysRadius = outer + 80;
    this.tweenT0 = now;
    this.tweenDur = instant || reduceMotion() ? 0 : TWEEN_MS * 1.3;
    this.tweening = true;
    this.geomDirty = true;
    // tab order home -> outward
    sm.order.forEach((id) => this.labelsEl.insertBefore(this.planets[CAT_INDEX[id]].el, this.topics[0].el));
    this.recolorRoutes();
    this.needMeasure = true;
    if (this.compact) { this.compact = false; this.host.toggleAttribute("data-compact", false); }
    this.updateLabelText();
    this.stepTween(now);
    this.computeOverview();
    if (instant) { this.snapCamera(this.poseForMode()); }
    else if (!this.interacted && this.mode === "overview") this.flyTo(this.poseForMode());
  }

  private flushPending() {
    window.clearTimeout(this.settleTimer);
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.applyModel(p.sm, p.pos, false);
    this.requestRender();
  }

  private updateLabelText() {
    const sm = this.sm;
    if (!sm) return;
    for (const pl of this.planets) {
      const p = sm.planets[pl.id];
      const sub = p.complete ? `All ${p.topics.length} explored` : `${p.explored.length} of ${p.topics.length} explored`;
      if (pl.subEl.textContent !== sub) pl.subEl.textContent = sub;
      const steps = Number.isFinite(p.orbit) ? orbitLabel(p.orbit).toLowerCase() : "out of reach";
      pl.el.setAttribute("aria-label", `${pl.cat.name}, ${steps}, ${p.explored.length} of ${p.topics.length} explored${p.complete ? ", complete" : ""}. Press Enter to open this planet.`);
      pl.el.classList.toggle("is-complete", p.complete);
      pl.el.classList.toggle("is-far", !Number.isFinite(p.orbit));
      (pl.prog.material as THREE.ShaderMaterial).uniforms.uFrac.value = p.topics.length ? p.explored.length / p.topics.length : 0;
    }
    const n = this.shownKnown;
    const txt = `You · ${n} ${n === 1 ? "topic" : "topics"}`;
    if (this.homeEl.textContent !== txt) { this.homeEl.textContent = txt; this.needMeasure = true; }
    this.homeEl.setAttribute("aria-label", `You, ${n} ${n === 1 ? "topic" : "topics"} in your bubble. Press Enter to open your bubble.`);
  }

  // ---------- state -> styling (cheap, no geometry work) ----------

  private restyle() {
    const s = this.layState;
    if (!s) return;
    const sel = this.view.sel;
    for (const t of this.topics) {
      const ring = s.lay.nodes[t.topic.id].ring;
      t.ring = ring;
      t.el.setAttribute("aria-label", `${t.topic.name}, ${t.pl.cat.name}, ${stepsPhrase(ring)}`);
      t.el.setAttribute("aria-pressed", String(t.topic.id === sel));
      t.el.classList.toggle("is-bubble", ring === 0);
      t.el.classList.toggle("is-sel", t.topic.id === sel);
    }
    this.writeDots();
    this.updateLabelText();
  }

  /** Dot colours / halos that depend on the bubble and selection, not on the camera. */
  private writeDots() {
    const g = this.dots.geometry;
    const col = g.getAttribute("aColor") as THREE.BufferAttribute, halo = g.getAttribute("aHalo") as THREE.BufferAttribute;
    const glow = g.getAttribute("aGlow") as THREE.BufferAttribute, ring = g.getAttribute("aRing") as THREE.BufferAttribute;
    const sun = this.sunCol, lit = this._lit.copy(sun).lerp(this._pale, this.dark ? 0.5 : 0.25);
    const sel = this.view.sel;
    for (const t of this.topics) {
      const known = t.ring === 0, isSel = t.topic.id === sel, hov = t.topic.id === this.hoverTopic || t.topic.id === this.focusTopic;
      const c = t.pl.color;
      if (known) {
        col.setXYZ(t.i, lit.r, lit.g, lit.b);
        halo.setXYZW(t.i, sun.r, sun.g, sun.b, 0.85);
      } else {
        const near = this.mode === "planet" && t.pl.idx === this.focusIdx; // readable up close, dim from afar
        const dim = this._dimC.copy(c).lerp(this.bgCol, near ? 0.12 : this.dark ? 0.55 : 0.5);
        col.setXYZ(t.i, dim.r, dim.g, dim.b);
        halo.setXYZW(t.i, c.r, c.g, c.b, near ? 0.4 : this.dark ? 0.16 : 0.12);
      }
      glow.setX(t.i, known || isSel ? 4.2 : 3.2);
      ring.setX(t.i, isSel ? 3 : hov ? 2.85 : 0); // >= 2: ring-only dot over the moon
      // the dot of this topic on the sun
      const h = N_TOPICS + t.i;
      col.setXYZ(h, lit.r, lit.g, lit.b);
      halo.setXYZW(h, sun.r, sun.g, sun.b, 0.9);
      glow.setX(h, 3.8);
      ring.setX(h, isSel || hov ? 0.9 : 0);
    }
    for (let f = 0; f < MAX_FLYERS; f++) {
      const i = N_TOPICS * 2 + f;
      col.setXYZ(i, 1, 1, 1);
      halo.setXYZW(i, sun.r, sun.g, sun.b, 1);
      glow.setX(i, 5);
      ring.setX(i, 0);
    }
    for (const a of [col, halo, glow, ring]) a.needsUpdate = true;
  }

  // ---------- animation ----------

  private stepTween(now: number): boolean {
    if (!this.tweening) return false;
    const k = this.tweenDur ? Math.min(1, (now - this.tweenT0) / this.tweenDur) : 1, e = easeInOut(k);
    for (const pl of this.planets) {
      const a = pl.p0, b = pl.p1, p = pl.p;
      p.ang = angLerp(a.ang, b.ang, e); p.R = lerp(a.R, b.R, e); p.r = lerp(a.r, b.r, e); p.k = lerp(a.k, b.k, e);
    }
    for (const o of this.orbitObjs) o.R = lerp(o.R0, o.R1, e);
    this.geomDirty = true;
    if (k >= 1) this.tweening = false;
    return this.tweening;
  }

  private stepSpin(now: number): boolean {
    let again = false;
    for (const pl of this.planets) {
      if (!pl.spinning) continue;
      const k = Math.min(1, (now - pl.spinT0) / 750);
      pl.spin.slerpQuaternions(pl.spin0, pl.spin1, easeInOut(k));
      if (k >= 1) pl.spinning = false; else again = true;
    }
    return again;
  }

  /** Smooth the fade / light factors towards what the current mode wants. */
  private stepFx(dt: number): boolean {
    const m = this.mode;
    const target = {
      routes: m === "overview" ? 1 : m === "home" ? 0.3 : 0,
      orbits: m === "overview" ? 1 : m === "home" ? 0.3 : 0,
      key: m === "planet" ? 1 : 0,
      home: m === "home" || m === "overview" ? 1 : DIM,
      view: m === "planet" ? 1 : 0,
    };
    const a = reduceMotion() ? 1 : 1 - Math.exp(-dt * 7);
    let moving = false;
    for (const k of Object.keys(target) as (keyof typeof target)[]) {
      const d = target[k] - this.fx[k];
      if (Math.abs(d) > 0.004) { this.fx[k] += d * a; moving = true; } else this.fx[k] = target[k];
    }
    for (const pl of this.planets) {
      const want = m === "overview" ? 1 : m === "home" ? 0.38 : pl.idx === this.focusIdx ? 1 : DIM;
      const d = want - pl.dim;
      if (Math.abs(d) > 0.004) { pl.dim += d * a; moving = true; } else pl.dim = want;
    }
    return moving;
  }

  private startFlyers(added: string[]) {
    const now = performance.now();
    this.flyers = this.flyers.filter((f) => now - f.t0 < FLIGHT_MS);
    added.slice(0, MAX_FLYERS).forEach((id, n) => {
      const t = this.topics[TOPIC_INDEX[id]];
      const from = t.pos.clone();
      const mid = from.clone().multiplyScalar(0.5);
      mid.y += from.length() * 0.35 + 60; // an arc up over the plane
      this.flyers.push({ t0: now + n * 110, topic: t.i, from, ctrl: mid });
    });
  }

  private stepFlyers(now: number): boolean {
    if (!this.flyers.length) return false;
    this.flyers = this.flyers.filter((f) => now - f.t0 < FLIGHT_MS);
    return this.flyers.length > 0 || !!this.pending;
  }

  private turnTo(_id: string | null) { /* moons are static: selecting one only highlights it */ }

  private snapSpin(_id: string) { /* see turnTo */ }

  /** Entering a planet view with no selection: face the default cap at the camera. */
  private applySpinFor(planet: PlanetKey | null) {
    if (!planet || planet === "home") return;
    const pl = this.planets[CAT_INDEX[planet]];
    const base = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), sphericalDir(PLANET_POLAR, 0));
    pl.spin0.copy(pl.spin);
    pl.spin1.copy(base);
    pl.spinT0 = performance.now();
    pl.spinning = !reduceMotion();
    if (!pl.spinning) pl.spin.copy(base);
  }

  // ---------- camera ----------

  /** The part of the canvas not covered by overlay panels (at the insets' destination, so framing doesn't lag). */
  private visibleSize() {
    const i = this.insetsTo;
    return {
      w: Math.max(80, this.w - i.left - i.right),
      h: Math.max(80, this.h - i.top - i.bottom),
    };
  }

  /** Distance at which a sphere of radius r spans `fill` of the visible (not covered) area's shorter side. */
  private fitDistance(r: number, fill = 0.9) {
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2)), v = this.visibleSize();
    const tv = t * (v.h / this.h), th = t * (v.w / this.h), tt = Math.min(tv, th);
    return (r / fill) * Math.sqrt(1 + tt * tt) / tt;
  }

  /** About 45 deg; a little steeper when the visible area is tall and narrow so the round system fills it. */
  private overviewPolar() {
    const v = this.visibleSize();
    return clamp(Math.acos(clamp((0.92 * v.h) / v.w, 0, 1)), THREE.MathUtils.degToRad(32), OVERVIEW_POLAR);
  }

  /** Smallest distance at which every planet, the outer orbit and a little label room fit the visible area. */
  private computeOverview() {
    const pos = this.pos;
    if (!pos) return;
    const vis = this.visibleSize();
    const tv = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * (vis.h / this.h);
    const cam = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(tv)), vis.w / vis.h, 1, 1e6);
    const dir = sphericalDir(this.overviewPolar(), 0, new THREE.Vector3());
    const pad = { x: 26, top: 54, bottom: 46 };
    const pts: { p: THREE.Vector3; r: number }[] = [];
    for (const pl of this.planets) pts.push({ p: this.planetPos(pl.p1, new THREE.Vector3()), r: pl.p1.r * U });
    pts.push({ p: new THREE.Vector3(), r: pos.home.r * U });
    const outer = Math.max(...pos.orbitRadii, 1) * U;
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; pts.push({ p: new THREE.Vector3(Math.cos(a) * outer, 0, Math.sin(a) * outer), r: 0 }); }
    const v = new THREE.Vector3();
    const ppu = vis.h / (2 * tv);
    const fits = (d: number) => {
      cam.position.copy(dir).multiplyScalar(d);
      cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      for (const { p, r } of pts) {
        v.copy(p).project(cam);
        const dist = cam.position.distanceTo(p), rpx = (r * ppu) / Math.sqrt(Math.max(1, dist * dist - r * r));
        const x = ((v.x + 1) / 2) * vis.w, y = ((1 - v.y) / 2) * vis.h;
        if (x - rpx < pad.x || x + rpx > vis.w - pad.x || y - rpx < pad.top || y + rpx > vis.h - pad.bottom) return false;
      }
      return true;
    };
    let lo = 100, hi = 40000;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
    this.overviewR = hi;
  }

  private planetPos(p: PP, out: THREE.Vector3) { return out.set(Math.cos(p.ang) * p.R * U, 0, Math.sin(p.ang) * p.R * U); }

  private poseForMode(): Pose {
    if (this.mode === "planet" && this.focusIdx >= 0) {
      const pl = this.planets[this.focusIdx];
      return { target: this.planetPos(pl.p1, new THREE.Vector3()), radius: this.fitDistance(this.moonExtent(pl, pl.p1.r * U), PLANET_FILL), polar: PLANET_POLAR, az: 0 };
    }
    if (this.mode === "home") {
      const r = (this.pos?.home.r ?? 1.8) * U;
      return { target: new THREE.Vector3(), radius: this.fitDistance(r, 0.46), polar: HOME_POLAR, az: 0 };
    }
    return { target: new THREE.Vector3(), radius: this.overviewR, polar: this.overviewPolar(), az: 0 };
  }

  private currentPose(): Pose {
    const off = this._v.copy(this.camera.position).sub(this.controls.target);
    this._sph.setFromVector3(off);
    return { target: this.controls.target.clone(), radius: this._sph.radius, polar: this._sph.phi, az: this._sph.theta };
  }

  /** Orbit / zoom limits for the settled mode; wide open while a flight is under way. */
  private applyLimits(m: Mode | "flight") {
    if (this.limitsFor === m) return;
    this.limitsFor = m;
    const c = this.controls;
    if (m === "flight") { c.minPolarAngle = 0.01; c.maxPolarAngle = Math.PI - 0.01; c.minDistance = 4; c.maxDistance = 40000; return; }
    if (m === "planet" && this.focusIdx >= 0) {
      const r = this.planets[this.focusIdx].p1.r * U;
      c.minPolarAngle = 0.12; c.maxPolarAngle = Math.PI - 0.12; c.minDistance = r * 1.5; c.maxDistance = this.fitDistance(this.moonExtent(this.planets[this.focusIdx], r), PLANET_FILL) * 2.4;
    } else if (m === "home") {
      const r = (this.pos?.home.r ?? 1.8) * U;
      c.minPolarAngle = MIN_POLAR; c.maxPolarAngle = MAX_POLAR; c.minDistance = r * 1.6; c.maxDistance = this.overviewR * 1.2;
    } else {
      c.minPolarAngle = MIN_POLAR; c.maxPolarAngle = MAX_POLAR; c.minDistance = this.overviewR * 0.3; c.maxDistance = this.overviewR * 1.5;
    }
  }

  private flyTo(to: Pose) {
    if (reduceMotion() || this.first) { this.snapCamera(to); return; }
    this.cam = { t0: performance.now(), from: this.currentPose(), to };
    this.applyLimits("flight");
    this.requestRender();
  }

  private setCamera(p: Pose) {
    this.controls.target.copy(p.target);
    sphericalDir(p.polar, p.az, this._v).multiplyScalar(p.radius).add(p.target);
    this.camera.position.copy(this._v);
  }

  private snapCamera(p: Pose) {
    this.cam = null;
    this.applyLimits(this.mode);
    this.setCamera(p);
    this.controls.update();
    this.requestRender();
  }

  private stepCamera(now: number): boolean {
    const c = this.cam;
    if (!c) return false;
    const k = Math.min(1, (now - c.t0) / CAM_MS), e = easeInOut(k);
    const a = c.from, b = c.to;
    this.setCamera({
      target: new THREE.Vector3().lerpVectors(a.target, b.target, e),
      radius: a.radius * Math.pow(b.radius / a.radius, e),
      polar: lerp(a.polar, b.polar, e),
      az: angLerp(a.az, b.az, e),
    });
    this.controls.update();
    if (k >= 1) { this.cam = null; this.limitsFor = "flight"; this.applyLimits(this.mode); }
    return k < 1;
  }

  /** Re-run the framing for the current mode (after a resize or panel change). */
  private refit() {
    this.computeOverview();
    if (this.interacted || !this.sm) return;
    this.limitsFor = "flight";
    const to = this.poseForMode();
    if (this.cam || !reduceMotion()) this.flyTo(to); else this.snapCamera(to);
  }

  private applyViewOffset() {
    const dx = (this.insets.left - this.insets.right) / 2, dy = (this.insets.top - this.insets.bottom) / 2;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(this.w, this.h, -dx, -dy, this.w, this.h);
    this.camera.updateProjectionMatrix();
  }

  private stepInsets(): boolean {
    const a = this.insets, b = this.insetsTo;
    let moving = false;
    for (const k of ["top", "right", "bottom", "left"] as const) {
      const d = b[k] - a[k];
      if (Math.abs(d) > 0.5) { a[k] += d * 0.22; moving = true; } else a[k] = b[k];
    }
    if (moving || this.camera.view?.enabled !== (Math.abs(a.left - a.right) + Math.abs(a.top - a.bottom) > 1)) this.applyViewOffset();
    return moving;
  }

  private readonly onControlsStart = () => {
    this.dragged = false;
    this.interacted = true;
    this.cam = null;
    this.limitsFor = "flight";
    this.applyLimits(this.mode);
  };

  private readonly onWheel = () => this.userMoved();

  private userMoved() {
    this.cam = null;
    this.interacted = true;
    this.cb.onUserMove();
  }

  // ---------- render loop (on demand) ----------

  private readonly requestRender = () => {
    if (!this.raf && !this.disposed) this.raf = requestAnimationFrame(this.loop);
  };

  private readonly loop = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    let again = false;
    if (this.stepTween(now)) again = true;
    if (this.stepInsets()) again = true;
    if (this.stepSpin(now)) again = true;
    if (this.stepFx(dt)) again = true;
    if (this.stepFlyers(now)) again = true;
    if (this.stepCamera(now)) again = true;
    else if (this.controls.update(dt)) again = true;
    this.constrainCamera();
    this.place();
    this.draw(now);
    if (again) this.requestRender();
    else this.last = 0;
  };

  private constrainCamera() {
    const cam = this.camera.position;
    const hr = (this.pos?.home.r ?? 1.8) * U * 1.12;
    if (cam.length() < hr) cam.setLength(hr);
    for (const pl of this.planets) {
      const d = cam.distanceTo(pl.center), min = pl.p.r * U * 1.06;
      if (d < min) cam.copy(pl.center).addScaledVector(this._v.copy(cam).sub(pl.center).normalize(), min);
    }
  }

  /** Push the tweened planet state into every object. */
  private place() {
    const sm = this.sm;
    if (!sm) return;
    const hr = (this.pos?.home.r ?? 1.8) * U;
    this.sunBody.position.set(0, 0, 0);
    this.sunBody.scale.setScalar(hr);
    this.corona.scale.setScalar(hr * 2.9);
    this.corona.quaternion.copy(this.camera.quaternion);
    const pos = this.dots.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (const pl of this.planets) {
      const r = pl.p.r * U;
      this.planetPos(pl.p, pl.center);
      pl.body.position.copy(pl.center); pl.body.scale.setScalar(r); pl.body.quaternion.copy(pl.spin);
      pl.atmo.position.copy(pl.center); pl.atmo.scale.setScalar(r * 1.13);
      pl.prog.position.copy(pl.center); pl.prog.scale.setScalar(r * 1.38); pl.prog.quaternion.copy(this.camera.quaternion);
      for (const t of pl.topics) {
        t.pos.copy(t.moon).multiplyScalar(r).add(pl.center);
        pos.setXYZ(t.i, t.pos.x, t.pos.y, t.pos.z);
        t.hpos.copy(t.homeDir).applyQuaternion(this.homeSpin()).multiplyScalar(hr * 1.012);
        pos.setXYZ(N_TOPICS + t.i, t.hpos.x, t.hpos.y, t.hpos.z);
      }
    }
    pos.needsUpdate = true;
    if (this.geomDirty || this.tweening) {
      for (const o of this.orbitObjs) o.mesh.scale.setScalar(Math.max(0.001, o.R * U));
      this.geomDirty = false;
    }
    this.updateRoutes();
  }

  private _homeSpin: THREE.Quaternion | null = null;
  private homeSpin() {
    return this._homeSpin ??= new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), sphericalDir(this.overviewPolar(), 0));
  }

  // ---------- routes ----------

  private recolorRoutes() {
    const cols = new Float32Array((SEGS + 1) * 3);
    const paint = (line: FatLine, a: THREE.Color, b: THREE.Color) => {
      for (let i = 0; i <= SEGS; i++) {
        const t = smooth(0.1, 0.9, i / SEGS);
        cols[i * 3] = a.r + (b.r - a.r) * t; cols[i * 3 + 1] = a.g + (b.g - a.g) * t; cols[i * 3 + 2] = a.b + (b.b - a.b) * t;
      }
      line.setColors(cols);
    };
    for (const pl of this.planets) {
      const from = pl.routeParent >= 0 ? this.planets[pl.routeParent].color : this.sunCol;
      paint(pl.route, from, pl.color);
    }
    this.hoverCols = (a, b, line) => paint(line, a, b);
  }
  private hoverCols: ((a: THREE.Color, b: THREE.Color, line: FatLine) => void) | null = null;

  /** A smooth arc between two bodies on the plane, bending a little and lifting over it. */
  private arc(A: THREE.Vector3, rA: number, B: THREE.Vector3, rB: number, bend: number, lift: number, out: Float32Array) {
    const d = this._a.copy(B).sub(A), len = d.length() || 1;
    d.divideScalar(len);
    const P0 = this._b.copy(A).addScaledVector(d, rA * 0.98), P2 = this._c.copy(B).addScaledVector(d, -rB * 0.98);
    const chord = P0.distanceTo(P2);
    const cx = (P0.x + P2.x) / 2 - d.z * chord * bend, cy = chord * lift, cz = (P0.z + P2.z) / 2 + d.x * chord * bend;
    for (let i = 0; i <= SEGS; i++) {
      const t = i / SEGS, m = 1 - t;
      out[i * 3] = m * m * P0.x + 2 * m * t * cx + t * t * P2.x;
      out[i * 3 + 1] = m * m * P0.y + 2 * m * t * cy + t * t * P2.y;
      out[i * 3 + 2] = m * m * P0.z + 2 * m * t * cz + t * t * P2.z;
    }
  }

  private updateRoutes() {
    const hr = (this.pos?.home.r ?? 1.8) * U, origin = this._v.set(0, 0, 0);
    const fxR = this.fx.routes;
    const hot = this.hoverPlanet >= 0 ? this.hoverPlanet : this.focusPlanetEl >= 0 ? this.focusPlanetEl : -2;
    for (const pl of this.planets) {
      const r = pl.route;
      if (pl.routeParent === -2) { r.obj.visible = false; continue; }
      const parent = pl.routeParent >= 0 ? this.planets[pl.routeParent] : null;
      const A = parent ? parent.center : origin, rA = parent ? parent.p.r * U : hr;
      this.arc(A, rA, pl.center, pl.p.r * U, 0.1, 0.07, this.pts);
      r.setPoints(this.pts);
      const wn = wNorm(pl.routeW), k = Math.min(1, pl.p.k);
      const op = (0.92 - 0.38 * k) * fxR * (hot === pl.idx ? 1 : 0.92);
      r.obj.visible = op > 0.02;
      r.mat.opacity = op;
      r.mat.linewidth = (1.5 + 3.4 * wn) * (1 - 0.25 * k) + (hot === pl.idx ? 1 : 0);
    }
    // faint planet-level connections of the hovered / focused planet
    let n = 0;
    if (hot >= 0 && fxR > 0.5) {
      const a = this.planets[hot];
      for (const o of this.planets) {
        if (o === a) continue;
        const key = a.id < o.id ? `${a.id}|${o.id}` : `${o.id}|${a.id}`;
        const w = this.pairMax.get(key);
        if (!w) continue;
        // routes are already drawn
        if ((a.routeParent === o.idx) || (o.routeParent === a.idx)) continue;
        const line = this.hoverLines[n++];
        this.arc(a.center, a.p.r * U, o.center, o.p.r * U, -0.16, 0.12, this.pts);
        line.setPoints(this.pts);
        this.hoverCols?.(a.color, o.color, line);
        line.obj.visible = true;
        line.mat.opacity = (0.22 + 0.3 * wNorm(w)) * fxR;
        line.mat.linewidth = 1.2 + 1.2 * wNorm(w);
      }
    }
    for (; n < this.hoverLines.length; n++) this.hoverLines[n].obj.visible = false;
  }

  // ---------- drawing ----------

  private draw(now: number) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const camPos = cam.position, focusD = camPos.distanceTo(this.controls.target);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = Math.max(20, focusD - this.sysRadius * 0.4);
    fog.far = focusD + this.sysRadius * 3.2;
    this.pxScale = this.h / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    const scale = this.pxScale * this.renderer.getPixelRatio();
    this.dotMat.uniforms.uScale.value = scale;
    this.starMat.uniforms.uScale.value = 0.9 * this.renderer.getPixelRatio();
    this.stars.position.copy(camPos);

    const fx = this.fx, home = fx.home;
    // sun
    this.sunMat.uniforms.uDim.value = home;
    this.coronaMat.uniforms.uAlpha.value = (this.dark ? 0.62 : 0.42) * (0.15 + 0.85 * home) * (this.hoverPlanet === -1 ? 1.2 : 1);
    this.corona.visible = home > 0.02;

    // planets: lighting + falloff with distance from home
    const key = this._a.copy(camPos).sub(this.controls.target).normalize();
    const up = this._b.set(0, 1, 0).applyQuaternion(cam.quaternion), right = this._c.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const keyDir = new THREE.Vector3().copy(key).multiplyScalar(0.75).addScaledVector(up, 0.6).addScaledVector(right, -0.55).normalize();
    for (const pl of this.planets) {
      const u = (pl.body.material as THREE.ShaderMaterial).uniforms;
      const k = Math.min(pl.p.k, 1.25), focused = pl.idx === this.focusIdx && this.mode === "planet";
      const hot = pl.idx === this.hoverPlanet || pl.idx === this.focusPlanetEl;
      u.uBright.value = 1.12 - 0.42 * Math.min(k, 1) + (hot ? 0.1 : 0);
      u.uSat.value = 1.05 - 0.55 * Math.min(k, 1.1);
      u.uFade.value = 0.42 * Math.min(k, 1.2) * (1 - fx.view * 0.6);
      u.uDim.value = pl.dim;
      u.uSunI.value = focused ? 1 - 0.45 * fx.view : 1;
      u.uKeyI.value = focused ? 1.05 * fx.key : 0;
      u.uRimI.value = focused ? 0.75 * fx.key : 0;
      u.uKeyDir.value.copy(keyDir);
      const a = (pl.atmo.material as THREE.ShaderMaterial).uniforms;
      a.uColor.value.copy(pl.color).lerp(this.bgCol, Math.min(0.55, 0.4 * Math.min(k, 1.2)));
      a.uStrength.value = ((this.dark ? 0.6 : 0.48) * (1 - 0.5 * Math.min(k, 1)) + (hot ? 0.25 : 0) + (focused ? 0.2 : 0)) * pl.dim;
      a.uCos.value = Math.sqrt(1 - 1 / (1.13 * 1.13));
      const pu = (pl.prog.material as THREE.ShaderMaterial).uniforms;
      pu.uColor.value.copy(this.sunCol).lerp(pl.color, 0.1);
      pu.uAlpha.value = (1 - 0.35 * Math.min(k, 1)) * pl.dim * (1 - fx.view);
      pu.uTrackA.value = hot ? 0.65 : 0.45;
      pu.uInner.value = hot ? 0.76 : 0.78;
      pu.uOuter.value = hot ? 0.87 : 0.86;
      pl.prog.visible = pu.uAlpha.value > 0.02;
    }
    const orbitOp = fx.orbits;
    for (const o of this.orbitObjs) {
      const m = o.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = (o.orbit === Infinity ? 0.3 : 0.6) * orbitOp * (this.dark ? 0.9 : 1);
      o.mesh.visible = o.on && orbitOp > 0.02;
    }
    // sun light on the planets
    for (const pl of this.planets) (pl.body.material as THREE.ShaderMaterial).uniforms.uSunPos.value.set(0, 0, 0);

    this.updateMoons(camPos);
    this.writeFrameDots(camPos, now);
    this.layoutLabels(camPos);
    this.renderer.render(this.scene, cam);
  }

  /** Moon spheres (min on-screen size) and the focused planet's orbit lines. */
  private updateMoons(camPos: THREE.Vector3) {
    const on = this.mode === "planet" && this.focusIdx >= 0 && this.fx.view > 0.02;
    this.moonMesh.visible = on;
    for (const l of this.moonLines) l.visible = false;
    if (!on) return;
    const fv = this.fx.view, sun = this.sunCol, lit = this._lit.copy(sun).lerp(this._pale, this.dark ? 0.5 : 0.25);
    for (const t of this.topics) {
      const focused = t.pl.idx === this.focusIdx;
      if (!focused) { this._mm.makeScale(0, 0, 0); this.moonMesh.setMatrixAt(t.i, this._mm); this.moonAlpha.setX(t.i, 0); t.mr = 0; continue; }
      const d = camPos.distanceTo(t.pos);
      t.mr = Math.max(MOON_R * t.pl.p.r * U, (7 * d) / this.pxScale);
      this._mm.makeScale(t.mr, t.mr, t.mr).setPosition(t.pos);
      this.moonMesh.setMatrixAt(t.i, this._mm);
      const c = t.ring === 0 ? lit : t.pl.color;
      this.moonCol.setXYZ(t.i, c.r, c.g, c.b);
      this.moonAlpha.setX(t.i, fv);
    }
    this.moonMesh.instanceMatrix.needsUpdate = true; this.moonCol.needsUpdate = true; this.moonAlpha.needsUpdate = true;
    const pl = this.planets[this.focusIdx], r = pl.p.r * U, radii = pl.topics.length > 10 ? [MOON_RING_IN, MOON_RING_OUT] : [MOON_RING];
    radii.forEach((R, k) => {
      const l = this.moonLines[k];
      l.visible = true;
      l.position.copy(pl.center); l.quaternion.copy(this.moonQ); l.scale.setScalar(R * r);
      const m = l.material as THREE.LineBasicMaterial;
      m.color.copy(pl.color); m.opacity = 0.28 * fv * (this.dark ? 1 : 0.9);
    });
  }

  /** Radius that frames the planet plus its outer moon ring. */
  private moonExtent(pl: PlanetObj, r: number) { return r * ((pl.cat.topics.length > 10 ? MOON_RING_OUT : MOON_RING) + MOON_R); }

  /** Per-frame dot positions' size / alpha: constant screen size, fade on the far side, flyers. */
  private writeFrameDots(camPos: THREE.Vector3, now: number) {
    const g = this.dots.geometry;
    const size = g.getAttribute("aSize") as THREE.BufferAttribute, alpha = g.getAttribute("aAlpha") as THREE.BufferAttribute;
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const col = g.getAttribute("aColor") as THREE.BufferAttribute;
    const planetMode = this.mode === "planet", homeMode = this.mode === "home";
    const sel = this.view.sel;
    const dpx = (px: number, p: THREE.Vector3) => (px * camPos.distanceTo(p)) / this.pxScale;
    const homeSpin = this.homeSpin();
    for (const t of this.topics) {
      const pl = t.pl;
      const focused = planetMode && pl.idx === this.focusIdx;
      t.vis = focused ? this.fx.view : 0;
      const isSel = t.topic.id === sel, hov = t.topic.id === this.hoverTopic || t.topic.id === this.focusTopic;
      size.setX(t.i, t.mr); // ring-only dot: the selection / hover ring around the moon
      alpha.setX(t.i, focused && (isSel || hov) ? this.fx.view : 0);

      // the topic on the sun
      const hn = this._a.copy(t.homeDir).applyQuaternion(homeSpin);
      const hToCam = this._b.copy(camPos).sub(t.hpos).normalize();
      t.hvis = smooth(0.02, 0.22, hn.dot(hToCam));
      size.setX(N_TOPICS + t.i, dpx(homeMode ? 5.6 : 3.4, t.hpos));
      const hs = this.known.has(t.topic.id) && (!this.pending || !this.isFlying(t.i)) ? 1 : 0;
      alpha.setX(N_TOPICS + t.i, t.hvis * hs * (planetMode ? this.fx.home * 0.6 : 1));
    }
    // add-to-bubble flyers: a glowing dot arcing from its planet to the sun
    const base = N_TOPICS * 2;
    for (let f = 0; f < MAX_FLYERS; f++) {
      const fl = this.flyers[f];
      if (!fl) { alpha.setX(base + f, 0); continue; }
      const k = (now - fl.t0) / FLIGHT_MS;
      if (k < 0) { alpha.setX(base + f, 0); continue; }
      const e = easeInOut(clamp(k, 0, 1)), m = 1 - e;
      this._a.set(0, 0, 0);
      const x = m * m * fl.from.x + 2 * m * e * fl.ctrl.x + e * e * this._a.x;
      const y = m * m * fl.from.y + 2 * m * e * fl.ctrl.y + e * e * this._a.y;
      const z = m * m * fl.from.z + 2 * m * e * fl.ctrl.z + e * e * this._a.z;
      pos.setXYZ(base + f, x, y, z);
      this._v.set(x, y, z);
      size.setX(base + f, dpx(7 + 3 * Math.sin(Math.PI * e), this._v));
      alpha.setX(base + f, k > 0.92 ? 1 - (k - 0.92) / 0.08 : 1);
      col.setXYZ(base + f, 1, 0.97, 0.85);
    }
    for (const a of [size, alpha, pos, col]) a.needsUpdate = true;
  }

  private isFlying(topicIdx: number) { return this.flyers.some((f) => f.topic === topicIdx); }

  // ---------- labels: projection, visibility, declutter ----------

  private measure() {
    const all: { el: HTMLElement; set: (w: number, h: number) => void }[] = [];
    for (const pl of this.planets) {
      all.push({ el: pl.el, set: (w, h) => { pl.w = w; pl.h = h; } });
      for (const t of pl.topics) all.push({ el: t.el, set: (w, h) => { t.w = w; t.h = h; } });
    }
    for (const o of this.orbitObjs) all.push({ el: o.el, set: (w, h) => { o.w = w; o.h = h; } });
    all.push({ el: this.homeEl, set: (w, h) => { this.homeBox = { w, h }; } });
    const sizes = all.map((a) => [a.el.offsetWidth, a.el.offsetHeight] as const);
    all.forEach((a, i) => a.set(sizes[i][0], sizes[i][1]));
    this.needMeasure = this.homeBox.w === 0;
  }

  private project(p: THREE.Vector3, out: { x: number; y: number }): number {
    const v = this._v.copy(p).project(this.camera);
    out.x = ((v.x + 1) / 2) * this.w;
    out.y = ((1 - v.y) / 2) * this.h;
    return v.z;
  }

  private visibleRect() {
    return { x0: this.insets.left + 6, x1: this.w - this.insets.right - 6, y0: this.insets.top + 6, y1: this.h - this.insets.bottom - 6 };
  }

  private layoutLabels(camPos: THREE.Vector3) {
    if (this.needMeasure) this.measure();
    const mode = this.mode, W = this.w, H = this.h, vr = this.visibleRect(), p = this._p;
    const boxes: Box[] = [];
    const hit = (x0: number, y0: number, x1: number, y1: number) => {
      for (const b of boxes) if (x0 < b.x1 + LABEL_PAD && x1 > b.x0 - LABEL_PAD && y0 < b.y1 + LABEL_PAD && y1 > b.y0 - LABEL_PAD) return true;
      return false;
    };
    const inside = (x0: number, y0: number, x1: number, y1: number, pad = 0) => x0 >= pad && y0 >= pad && x1 <= W - pad && y1 <= H - pad;
    const active = document.activeElement as HTMLElement | null;

    // sun: always labelled (its pill is the answer to "where is my knowledge")
    const homeZ = this.project(this._a.set(0, 0, 0), p);
    const hp = { x: p.x, y: p.y };
    const hr = (this.pos?.home.r ?? 1.8) * U;
    const hrpx = (hr * this.pxScale) / Math.max(1, camPos.length());
    {
      const w = this.homeBox.w, h = this.homeBox.h;
      let x0 = Math.round(hp.x - w / 2), y0 = Math.round(hp.y + hrpx + 8);
      if (mode !== "overview") y0 = Math.round(hp.y + hrpx + 8);
      const forced = active === this.homeEl;
      x0 = clamp(x0, vr.x0, Math.max(vr.x0, vr.x1 - w));
      y0 = clamp(y0, vr.y0, Math.max(vr.y0, vr.y1 - h));
      const ok = homeZ < 1 && (mode !== "planet" || forced);
      if (ok) boxes.push({ x0, y0, x1: x0 + w, y1: y0 + h });
      const key = `${ok}|${x0}|${y0}|${this.fx.home.toFixed(2)}`;
      if (key !== this.homeKey) {
        this.homeKey = key;
        this.homeEl.style.transform = `translate(${x0}px, ${y0}px)`;
        this.homeEl.classList.toggle("is-off", !ok);
        this.homeEl.style.setProperty("--a", String(clamp(this.fx.home + 0.2, 0, 1)));
      }
    }

    // planet names (overview + home view): home-outward priority, hovered / focused first
    const order = [...this.planets].sort((a, b) => {
      const ra = a.idx === this.hoverPlanet || a.el === active ? 0 : 1, rb = b.idx === this.hoverPlanet || b.el === active ? 0 : 1;
      return (ra - rb) || (a.p.k - b.p.k) || (CAT_INDEX[a.id] - CAT_INDEX[b.id]);
    });
    for (const pl of this.planets) {
      pl.dist = camPos.distanceTo(pl.center);
      const z = this.project(pl.center, p);
      pl.px = p.x; pl.py = p.y;
      pl.rpx = (pl.p.r * U * this.pxScale) / Math.max(1, Math.sqrt(Math.max(1, pl.dist * pl.dist - (pl.p.r * U) ** 2)));
      pl.shown = z < 1 && z > -1;
    }
    const discBoxes: Box[] = this.planets.filter((pl) => pl.shown && mode !== "planet").map((pl) => ({ x0: pl.px - pl.rpx, y0: pl.py - pl.rpx, x1: pl.px + pl.rpx, y1: pl.py + pl.rpx }));
    if (mode === "overview") boxes.push({ x0: hp.x - hrpx, y0: hp.y - hrpx, x1: hp.x + hrpx, y1: hp.y + hrpx });
    const hitDisc = (x0: number, y0: number, x1: number, y1: number, skip: Box | null) => {
      for (const b of discBoxes) if (b !== skip && x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0) return true;
      return false;
    };
    // orbit labels along the near-vertical axis above the sun, nudged away from anything in the way
    const showOrbit = mode === "overview" && this.fx.orbits > 0.5;
    for (const o of this.orbitObjs) {
      let placed: { x0: number; y0: number } | null = null;
      if (showOrbit && o.on && o.w > 0) {
        let best = Infinity;
        for (let i = 0; i < 72; i++) {
          const a = (i / 72) * Math.PI * 2;
          this._a.set(Math.cos(a) * o.R * U, 0, Math.sin(a) * o.R * U);
          if (this.project(this._a, p) > 1) continue;
          const x0 = Math.round(p.x - o.w / 2), y0 = Math.round(p.y - o.h / 2);
          // prefer the top of the ellipse, close to the vertical axis through the sun
          const score = Math.abs(p.x - hp.x) + (p.y > hp.y ? 400 : 0);
          if (score >= best || x0 < vr.x0 || x0 + o.w > vr.x1 || y0 < vr.y0 || y0 + o.h > vr.y1) continue;
          if (hit(x0, y0, x0 + o.w, y0 + o.h) || hitDisc(x0, y0, x0 + o.w, y0 + o.h, null)) continue;
          best = score; placed = { x0, y0 };
        }
      }
      if (placed) boxes.push({ x0: placed.x0, y0: placed.y0, x1: placed.x0 + o.w, y1: placed.y0 + o.h });
      this.styleLabel(o.el, o, !!placed, placed?.x0 ?? 0, placed?.y0 ?? 0, o.orbit === Infinity ? 0.85 : 1, 300);
    }

    let missing = 0;
    order.forEach((pl) => {
      const disc = discBoxes[this.planets.filter((q) => q.shown).indexOf(pl)] ?? null;
      const w = pl.w, h = pl.h;
      let placed: { x0: number; y0: number } | null = null;
      const forced = pl.el === active || pl.idx === this.hoverPlanet;
      if (mode !== "planet" && pl.shown) {
        const gap = 5;
        // outward from the sun first (labels sit outside the system, not between planets), then below / above / sides
        let ux = pl.px - hp.x, uy = pl.py - hp.y;
        const ul = Math.hypot(ux, uy) || 1;
        ux /= ul; uy /= ul;
        const rad = pl.rpx + gap;
        const at = (dx: number, dy: number, d: number) => [pl.px + dx * d + (dx - 1) * w / 2, pl.py + dy * d + (dy - 1) * h / 2] as const;
        const r2 = Math.SQRT1_2;
        const cands = [
          at(ux, uy, rad), at(0, 1, rad), at(0, -1, rad), at(1, 0, rad), at(-1, 0, rad),
          at(r2, r2, rad), at(-r2, r2, rad), at(r2, -r2, rad), at(-r2, -r2, rad),
          at(ux, uy, rad + 26), at(0, 1, rad + 22), at(0, -1, rad + 22),
        ];
        for (const strict of [true, false]) {
          for (const [cx, cy] of cands) {
            const x0 = Math.round(cx), y0 = Math.round(cy);
            if (!inside(x0, y0, x0 + w, y0 + h, 2) || x0 < vr.x0 - 4 || x0 + w > vr.x1 + 4 || y0 < vr.y0 - 4 || y0 + h > vr.y1 + 4) continue;
            if (hit(x0, y0, x0 + w, y0 + h) || (strict && hitDisc(x0, y0, x0 + w, y0 + h, disc))) continue;
            placed = { x0, y0 };
            break;
          }
          if (placed) break;
        }
        if (!placed && forced) placed = { x0: clamp(Math.round(pl.px - w / 2), vr.x0, Math.max(vr.x0, vr.x1 - w)), y0: clamp(Math.round(pl.py + pl.rpx + 5), vr.y0, Math.max(vr.y0, vr.y1 - h)) };
      }
      const modeOff = mode === "planet";
      pl.el.hidden = modeOff && pl.el !== active;
      const on = !!placed && !modeOff;
      if (placed && on) boxes.push({ x0: placed.x0, y0: placed.y0, x1: placed.x0 + w, y1: placed.y0 + h });
      const alpha = clamp(pl.dim + 0.25, 0, 1) * (1 - 0.18 * Math.min(1, pl.p.k));
      this.styleLabel(pl.el, pl, on, placed?.x0 ?? 0, placed?.y0 ?? 0, alpha, pl.idx === this.hoverPlanet ? 900 : 800 - Math.round(pl.p.k * 100));
      if (mode === "overview" && pl.shown && !on) missing++;
    });
    // every planet must keep its name: if some don't fit, drop the "x of y explored" line (the arc and aria-label keep it)
    if (missing > 0 && !this.compact && mode === "overview") { this.compact = true; this.host.toggleAttribute("data-compact", true); this.needMeasure = true; this.requestRender(); }

    // topic names: the focused planet's topics (planet view) or the known topics on the sun (home view)
    const cands: { t: TopicObj; x: number; y: number; vis: number; pr: number; cx: number; cy: number }[] = [];
    const sel = this.view.sel;
    for (const t of this.topics) {
      const inPlanet = mode === "planet" && t.pl.idx === this.focusIdx;
      const inHome = mode === "home" && this.known.has(t.topic.id) && !this.isFlying(t.i);
      const wanted = inPlanet || inHome;
      t.el.hidden = !wanted && t.el !== active;
      if (!wanted) { this.styleLabel(t.el, t, false, 0, 0, 0, 0); continue; }
      const pt = inPlanet ? t.pos : t.hpos, vis = inPlanet ? t.vis : t.hvis;
      const z = this.project(pt, p);
      t.px = p.x; t.py = p.y;
      const forced = t.el === active || t.topic.id === sel;
      if (z < 1 && (vis > 0.35 || forced)) {
        const c = inPlanet ? t.pl.center : this._c.set(0, 0, 0);
        this.project(c, this._p);
        cands.push({ t, x: t.px, y: t.py, vis, pr: t.topic.id === sel ? -2 : forced ? -1 : t.topic.id === this.hoverTopic ? 0 : t.ring === 0 ? 1 : 2 + (1 - vis), cx: this._p.x, cy: this._p.y });
      } else this.styleLabel(t.el, t, false, 0, 0, 0, 0);
    }
    cands.sort((a, b) => a.pr - b.pr);
    for (const c of cands) {
      const t = c.t, w = t.w, h = t.h;
      const dotPx = mode === "planet" ? 9 : 6, off = Math.round(dotPx + 7);
      // preferred side: away from the body's centre on screen
      const sx = c.x - c.cx, sy = c.y - c.cy;
      const prefs: Side[] = Math.abs(sx) * 0.6 > Math.abs(sy) ? (sx >= 0 ? ["r", "l", "t", "b"] : ["l", "r", "t", "b"]) : (sy >= 0 ? ["b", "t", sx >= 0 ? "r" : "l", sx >= 0 ? "l" : "r"] : ["t", "b", sx >= 0 ? "r" : "l", sx >= 0 ? "l" : "r"]);
      let placed: { x0: number; y0: number } | null = null;
      for (const sd of prefs) {
        const x0 = Math.round(sd === "r" ? c.x + off : sd === "l" ? c.x - off - w : c.x - w / 2);
        const y0 = Math.round(sd === "t" ? c.y - off - h : sd === "b" ? c.y + off : c.y - h / 2);
        if (x0 < vr.x0 - 2 || x0 + w > vr.x1 + 2 || y0 < vr.y0 - 2 || y0 + h > vr.y1 + 2) continue;
        if (!hit(x0, y0, x0 + w, y0 + h)) { placed = { x0, y0 }; break; }
      }
      if (!placed && c.pr <= -1) placed = { x0: clamp(Math.round(c.x + off), vr.x0, Math.max(vr.x0, vr.x1 - w)), y0: clamp(Math.round(c.y - h / 2), vr.y0, Math.max(vr.y0, vr.y1 - h)) };
      if (placed) {
        boxes.push({ x0: placed.x0, y0: placed.y0, x1: placed.x0 + w, y1: placed.y0 + h });
        this.styleLabel(t.el, t, true, placed.x0, placed.y0, 0.75 + 0.25 * c.vis, c.pr <= 0 ? 700 : 600 - Math.round(c.pr * 20));
      } else this.styleLabel(t.el, t, false, 0, 0, 0, 0);
    }
  }

  /** Apply a label's placement to the DOM, writing only what changed. */
  private styleLabel(el: HTMLElement, o: { key: string }, on: boolean, x: number, y: number, alpha: number, z: number) {
    const key = on ? `${x}|${y}|${alpha.toFixed(2)}|${z}` : "off";
    if (key === o.key) return;
    o.key = key;
    if (!on) { el.classList.add("is-off"); return; }
    el.classList.remove("is-off");
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.setProperty("--a", alpha.toFixed(2));
    el.style.zIndex = String(z);
  }

  // ---------- resize ----------

  private resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.applyViewOffset();
    const res = (l: FatLine) => l.mat.resolution.set(w, h);
    this.planets.forEach((p) => res(p.route));
    this.hoverLines.forEach(res);
    this.host.style.setProperty("--as-k", String(clamp(w / 1200, 0.86, 1.1)));
    this.host.toggleAttribute("data-narrow", w < 640);
    this._homeSpin = null;
    this.needMeasure = true;
    if (this.compact) { this.compact = false; this.host.toggleAttribute("data-compact", false); }
    if (this.sm) { this.computeOverview(); if (!this.interacted) this.snapCamera(this.poseForMode()); }
    this.requestRender();
  }

  private readonly onContextLost = (e: Event) => { e.preventDefault(); };
  private readonly onContextRestored = () => { this.geomDirty = true; this.requestRender(); };

  // ---------- pointer interaction ----------

  private pointer(e: PointerEvent) {
    const r = this.host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** The topic dot or planet under the pointer. */
  private pick(e: PointerEvent): { topic: string | null; planet: number } {
    const m = this.pointer(e);
    if (this.mode === "planet" || this.mode === "home") {
      let best: TopicObj | null = null, bd = this.mode === "planet" ? 26 : 20;
      for (const t of this.topics) {
        const inPlanet = this.mode === "planet" && t.pl.idx === this.focusIdx;
        const inHome = this.mode === "home" && this.known.has(t.topic.id);
        if (!(inPlanet || inHome) || (inPlanet ? t.vis : t.hvis) < 0.4) continue;
        const d = Math.hypot(t.px - m.x, t.py - m.y);
        if (d < bd) { bd = d; best = t; }
      }
      if (best) return { topic: best.topic.id, planet: -2 };
    }
    this._ray.setFromCamera(new THREE.Vector2((m.x / this.w) * 2 - 1, -((m.y / this.h) * 2 - 1)), this.camera);
    const ray = this.ray0(), hit = { idx: -2, d: Infinity };
    const test = (c: THREE.Vector3, r: number, idx: number) => {
      const p = ray.intersectSphere(new THREE.Sphere(c, r), this._v);
      if (p) { const d = p.distanceTo(ray.origin); if (d < hit.d) { hit.d = d; hit.idx = idx; } }
    };
    test(this._c.set(0, 0, 0), (this.pos?.home.r ?? 1.8) * U, -1);
    for (const pl of this.planets) test(pl.center, pl.p.r * U * 1.06, pl.idx);
    return { topic: null, planet: hit.idx };
  }
  private ray0() { return this._ray.ray; }

  private readonly onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
    this.dragged = false;
  };

  private readonly onMove = (e: PointerEvent) => {
    const d = this.down;
    if (d) {
      if (!this.dragged && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) { this.dragged = true; this.userMoved(); }
      return;
    }
    if (e.pointerType === "touch") return;
    const hit = this.pick(e);
    if (hit.topic !== this.hoverTopic || hit.planet !== this.hoverPlanet) this.setHover(hit.planet, hit.topic);
  };

  private readonly onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || this.dragged || e.button !== 0) return;
    // OrbitControls captures the pointer, so a tap on a name arrives here rather than on its button
    const under = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>(".as-topic, .as-planet, .as-home");
    if (under?.classList.contains("as-home")) return this.pickPlanet("home");
    if (under?.dataset.id) return this.pickTopic(under.dataset.id);
    if (under?.dataset.cat) return this.pickPlanet(CATEGORIES[Number(under.dataset.cat)].id);
    const hit = this.pick(e);
    if (hit.topic) this.pickTopic(hit.topic);
    else if (hit.planet === -1) this.pickPlanet("home");
    else if (hit.planet >= 0) this.pickPlanet(this.planets[hit.planet].id);
  };

  private readonly onLeave = () => { this.down = null; if (this.hoverTopic || this.hoverPlanet !== -2) this.setHover(-2, null); };

  /** Swallow the click that ends a drag that began on a name. */
  private readonly onClickCapture = (e: MouseEvent) => {
    if (this.dragged) { e.stopPropagation(); e.preventDefault(); this.dragged = false; }
  };

  private readonly onTopicClick = (e: MouseEvent) => {
    const id = (e.currentTarget as HTMLElement).dataset.id;
    if (id && performance.now() - this.pickedAt > 450) this.pickTopic(id);
  };

  private readonly onPlanetClick = (e: MouseEvent) => {
    const c = (e.currentTarget as HTMLElement).dataset.cat;
    if (c !== undefined && performance.now() - this.pickedAt > 450) this.pickPlanet(CATEGORIES[Number(c)].id);
  };

  private pickTopic(id: string) {
    this.pickedAt = performance.now();
    this.cb.onSelect(id);
  }

  private pickPlanet(id: PlanetKey) {
    this.pickedAt = performance.now();
    this.cb.onPlanet(id);
  }

  private setHover(planet: number, topic: string | null) {
    this.hoverTopic = topic;
    this.hoverPlanet = topic ? -2 : planet;
    this.host.style.cursor = topic || this.hoverPlanet !== -2 ? "pointer" : "";
    this.writeDots();
    this.requestRender();
  }

  private readonly onFocusIn = (e: FocusEvent) => {
    const el = e.target as HTMLElement;
    const id = el.dataset?.id;
    const keyboard = el.matches?.(":focus-visible");
    if (id) {
      this.focusTopic = id;
    } else if (el.dataset?.cat !== undefined) {
      this.focusPlanetEl = Number(el.dataset.cat);
      // keyboard focus on a planet's name flies to it
      if (keyboard && this.mode === "overview" && !reduceMotion()) {
        const pl = this.planets[this.focusPlanetEl];
        this.interacted = false;
        this.flyTo({ target: pl.center.clone().multiplyScalar(0.55), radius: this.overviewR * 0.62, polar: this.overviewPolar(), az: 0 });
      }
    } else if (el.classList.contains("as-home")) {
      this.focusPlanetEl = -1;
      if (keyboard && this.mode === "overview") this.flyTo({ target: new THREE.Vector3(), radius: this.overviewR * 0.6, polar: this.overviewPolar(), az: 0 });
    }
    this.writeDots();
    this.requestRender();
  };

  private readonly onFocusOut = () => {
    this.focusTopic = null;
    this.focusPlanetEl = -2;
    this.writeDots();
    this.requestRender();
  };
}

let colourCtx: CanvasRenderingContext2D | null | undefined;
/** Let the browser normalise any CSS colour (hex, rgb, hsl, named, color-mix) to something THREE can parse. */
function normaliseCss(raw: string): string {
  if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
  if (colourCtx === undefined) colourCtx = document.createElement("canvas").getContext("2d");
  if (!colourCtx) return raw;
  colourCtx.fillStyle = "#888888";
  colourCtx.fillStyle = raw;
  return colourCtx.fillStyle as string;
}
