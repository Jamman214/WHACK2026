import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

/** One route: a fat screen-space polyline whose points and gradient colours are rewritten in place. */
export class FatLine {
  readonly obj: LineSegments2;
  readonly mat: LineMaterial;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly bufs: THREE.InterleavedBuffer[];

  constructor(readonly segs: number) {
    const geom = new LineSegmentsGeometry();
    geom.setPositions(new Float32Array(6 * segs));
    geom.setColors(new Float32Array(6 * segs));
    this.mat = new LineMaterial({ color: 0xffffff, vertexColors: true, linewidth: 1, transparent: true, depthWrite: false, worldUnits: false });
    this.mat.fog = true;
    this.obj = new LineSegments2(geom, this.mat);
    this.obj.frustumCulled = false;
    const s = geom.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    const c = geom.attributes.instanceColorStart as THREE.InterleavedBufferAttribute;
    this.pos = s.data.array as Float32Array;
    this.col = c.data.array as Float32Array;
    this.bufs = [s.data, c.data];
  }

  /** `pts` holds segs + 1 xyz triples. */
  setPoints(pts: Float32Array) {
    const p = this.pos;
    for (let i = 0; i < this.segs; i++) {
      const a = i * 3, o = i * 6;
      for (let k = 0; k < 6; k++) p[o + k] = pts[a + k];
    }
    this.bufs[0].needsUpdate = true;
  }

  /** `cols` holds segs + 1 rgb triples. */
  setColors(cols: Float32Array) {
    const p = this.col;
    for (let i = 0; i < this.segs; i++) {
      const a = i * 3, o = i * 6;
      for (let k = 0; k < 6; k++) p[o + k] = cols[a + k];
    }
    this.bufs[1].needsUpdate = true;
  }

  dispose() { this.obj.geometry.dispose(); this.mat.dispose(); }
}
