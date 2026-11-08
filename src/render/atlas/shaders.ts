// GLSL for the solar-system Atlas scene. Plain strings so the main renderer stays readable.

export const MIN_DOT_PX = 2.6;

/** Planet body: sun light + key/rim lights (planet view), lat/long grid, falloff with distance from home. */
export const PLANET_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vObj; varying vec3 vV; varying vec3 vW; varying vec3 vWN;
#include <fog_pars_vertex>
void main() {
  vObj = position;
  vN = normalize(normalMatrix * normal);
  vWN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  vV = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export const PLANET_FRAG = /* glsl */ `
uniform vec3 uBody; uniform vec3 uTint; uniform vec3 uBg; uniform vec3 uSunPos; uniform vec3 uSunCol;
uniform vec3 uKeyDir; uniform float uKeyI; uniform float uRimI; uniform float uSunI; uniform float uShadeLo;
uniform float uGrid; uniform float uSat; uniform float uBright; uniform float uFade; uniform float uDim; uniform float uRim;
uniform float uGold; uniform vec3 uGoldBody; uniform vec3 uGoldTint;
varying vec3 vN; varying vec3 vObj; varying vec3 vV; varying vec3 vW; varying vec3 vWN;
#include <fog_pars_fragment>
float line(float d) { return 1.0 - smoothstep(0.0, fwidth(d) * 1.25, abs(d)); }
void main() {
  vec3 n = normalize(vN); vec3 v = normalize(vV); vec3 wn = normalize(vWN);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  // light from the sun at the origin: wrapped lambert so the night side never goes black
  vec3 L = normalize(uSunPos - vW);
  float lamS = pow(clamp(dot(wn, L) * 0.5 + 0.5, 0.0, 1.0), 1.25);
  float lamK = max(dot(wn, normalize(uKeyDir)), 0.0);
  float lit = mix(uShadeLo, 1.0, lamS) * uSunI + lamK * uKeyI;
  // a fully explored planet turns gold: surface and grid/rim tint both swap to the sun's colour
  vec3 body = mix(uBody, uGoldBody, uGold); vec3 tint = mix(uTint, uGoldTint, uGold);
  vec3 col = body * lit;
  col += uSunCol * pow(clamp(dot(wn, L), 0.0, 1.0), 3.0) * 0.16 * uSunI;
  // lat / long grid so rotation and depth read on an otherwise plain sphere
  vec3 p = normalize(vObj);
  float g = 0.0;
  for (int i = 1; i < 6; i++) { float lat = (float(i) - 3.0) * 0.5236; g = max(g, line(p.y - sin(lat)) * (i == 3 ? 1.0 : 0.6)); }
  for (int i = 0; i < 6; i++) { float a = float(i) * 0.5236; g = max(g, line(dot(p, vec3(-sin(a), 0.0, cos(a)))) * 0.5 * (1.0 - smoothstep(0.86, 0.99, abs(p.y)))); }
  col = mix(col, tint, g * uGrid);
  float fres = pow(1.0 - ndv, 2.4);
  col = mix(col, tint, smoothstep(0.35, 1.0, fres) * 0.7);
  col += tint * fres * (uRim + uRimI * (0.6 + 0.4 * lamK));
  // falloff with distance from home: desaturate, darken, fade into the page colour
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uSat) * uBright;
  col = mix(col, uBg, uFade);
  col = mix(uBg, col, uDim);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export const ATMO_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uStrength; uniform float uCos;
varying vec3 vN; varying vec3 vV;
#include <fog_pars_fragment>
void main() {
  float a = abs(dot(normalize(vN), normalize(vV)));
  float t = clamp(a / uCos, 0.0, 1.0);
  gl_FragColor = vec4(uColor, pow(t, 1.7) * uStrength);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export const ATMO_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV;
#include <fog_pars_vertex>
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vV = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

/** The home planet: a self-lit sun. */
export const SUN_FRAG = /* glsl */ `
uniform vec3 uCore; uniform vec3 uEdge; uniform vec3 uBg; uniform float uDim; uniform float uGrid; uniform vec3 uGridCol;
varying vec3 vN; varying vec3 vObj; varying vec3 vV; varying vec3 vW; varying vec3 vWN;
float line(float d) { return 1.0 - smoothstep(0.0, fwidth(d) * 1.25, abs(d)); }
void main() {
  vec3 n = normalize(vN); vec3 v = normalize(vV);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  vec3 col = mix(uEdge, uCore, pow(ndv, 0.7));
  vec3 p = normalize(vObj);
  float g = 0.0;
  for (int i = 1; i < 6; i++) { float lat = (float(i) - 3.0) * 0.5236; g = max(g, line(p.y - sin(lat)) * 0.6); }
  for (int i = 0; i < 6; i++) { float a = float(i) * 0.5236; g = max(g, line(dot(p, vec3(-sin(a), 0.0, cos(a)))) * 0.5 * (1.0 - smoothstep(0.86, 0.99, abs(p.y)))); }
  col = mix(col, uGridCol, g * uGrid);
  col = mix(uBg, col, uDim);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** Soft radial glow quad (the sun's corona and the hover / selection halos). */
export const GLOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha; uniform float uInner;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = pow(1.0 - smoothstep(uInner, 1.0, r), 2.2);
  gl_FragColor = vec4(uColor, a * uAlpha);
  #include <colorspace_fragment>
}`;

/** Progress ring (billboard): a faint track plus a lit arc covering `uFrac` of the circle, starting at 12 o'clock. */
export const RING_FRAG = /* glsl */ `
uniform vec3 uColor; uniform vec3 uTrack; uniform float uFrac; uniform float uAlpha; uniform float uInner; uniform float uOuter; uniform float uTrackA;
varying vec2 vUv;
const float TAU = 6.2831853;
void main() {
  float r = length(vUv);
  float w = fwidth(r) * 1.1;
  float band = smoothstep(uInner - w, uInner + w, r) - smoothstep(uOuter - w, uOuter + w, r);
  if (band <= 0.001) discard;
  float a = mod(atan(vUv.x, vUv.y) + TAU, TAU) / TAU;
  float lit = step(a, uFrac);
  vec3 c = mix(uTrack, uColor, lit);
  gl_FragColor = vec4(c, band * uAlpha * mix(uTrackA, 1.0, lit));
  #include <colorspace_fragment>
}`;

export const DOT_VERT = /* glsl */ `
attribute vec3 aColor; attribute vec4 aHalo; attribute float aSize; attribute float aGlow; attribute float aRing; attribute float aAlpha;
uniform float uScale;
varying vec3 vColor; varying vec4 vHalo; varying float vCore; varying float vRing; varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  vColor = aColor; vHalo = aHalo; vRing = aRing; vAlpha = aAlpha; vCore = 1.0 / aGlow;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float quad = 2.0 * aSize * aGlow * uScale / max(1.0, -mvPosition.z);
  gl_PointSize = clamp(quad, 2.0 * ${MIN_DOT_PX.toFixed(1)} * aGlow, 2.0 * 26.0 * aGlow);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export const DOT_FRAG = /* glsl */ `
uniform vec3 uRingCol; uniform vec3 uEdgeCol;
varying vec3 vColor; varying vec4 vHalo; varying float vCore; varying float vRing; varying float vAlpha;
#include <fog_pars_fragment>
void main() {
  if (vAlpha < 0.004) discard;
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r = length(uv);
  if (r > 1.0) discard;
  float w = max(fwidth(r), 0.004), c = vCore;
  vec4 o = vec4(vHalo.rgb, vHalo.a * pow(1.0 - smoothstep(c * 0.9, 1.0, r), 2.0));
  bool ro = vRing > 1.5; // ring-only dot: just the selection ring, no halo or core
  if (ro) o.a = 0.0;
  float ring = (ro ? vRing - 2.0 : vRing) * (smoothstep(c * 1.28 - w, c * 1.28 + w, r) - smoothstep(c * 1.62 - w, c * 1.62 + w, r));
  o.rgb = mix(o.rgb, uRingCol, ring); o.a = max(o.a, ring);
  float core = ro ? 0.0 : 1.0 - smoothstep(c - w, c + w, r);
  vec3 cc = mix(vColor, mix(vColor, uEdgeCol, 0.55), smoothstep(c * 0.7 - w, c * 0.7 + w, r));
  o.rgb = mix(o.rgb, cc, core); o.a = max(o.a, core);
  gl_FragColor = vec4(o.rgb, o.a * vAlpha);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export const STAR_VERT = /* glsl */ `
attribute float aSize; uniform float uScale;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uScale, 1.0, 3.0);
  gl_Position = projectionMatrix * mvPosition;
}`;

export const STAR_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha;
void main() {
  float r = length(gl_PointCoord * 2.0 - 1.0);
  if (r > 1.0) discard;
  gl_FragColor = vec4(uColor, uAlpha * (1.0 - smoothstep(0.3, 1.0, r)));
  #include <colorspace_fragment>
}`;

export const MOON_VERT = /* glsl */ `
attribute vec3 aCol; attribute float aAlpha;
varying vec3 vCol; varying float vA; varying vec3 vN;
#include <fog_pars_vertex>
void main() {
  vCol = aCol; vA = aAlpha;
  vN = normalize(mat3(viewMatrix) * mat3(instanceMatrix) * normal / max(1e-4, length(vec3(instanceMatrix[0])))); 
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export const MOON_FRAG = /* glsl */ `
varying vec3 vCol; varying float vA; varying vec3 vN;
#include <fog_pars_fragment>
void main() {
  if (vA < 0.004) discard;
  vec3 n = normalize(vN);
  float l = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);
  vec3 c = vCol * (0.38 + 0.72 * l) + vCol * pow(1.0 - n.z, 3.0) * 0.18;
  gl_FragColor = vec4(c, vA);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
