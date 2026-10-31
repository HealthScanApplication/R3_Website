/**
 * The owner's R³ Ring: a binary STL (public/models/r3-ring.stl, simplified to 50k triangles) turned into a smooth,
 * centred, unit-sized mesh. The model's ring axis (through the finger hole) is its Y axis; the scene stands it up.
 */
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { finishSpec, type Finish } from './finishes';

/** Parse, weld, smooth, centre at the origin and scale so the largest dimension is exactly 1. */
export function buildRingGeometry(stlBytes: ArrayBuffer): THREE.BufferGeometry {
  const raw = new STLLoader().parse(stlBytes);
  // STL stores one normal per face (and sometimes colours); drop everything but positions so corners can weld.
  for (const name of Object.keys(raw.attributes)) if (name !== 'position') raw.deleteAttribute(name);
  const triangles = (raw.getAttribute('position')?.count ?? 0) / 3;
  if (triangles < 1) {
    raw.dispose();
    throw new Error('Ring model has no triangles');
  }
  const geo = mergeVertices(raw);
  raw.dispose();

  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  geo.translate(-centre.x, -centre.y, -centre.z);
  if (longest > 0) geo.scale(1 / longest, 1 / longest, 1 / longest);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/** Fetch the STL and return the ring mesh in the given finish (default 'black': dark, glossy brushed metal). */
export async function loadRing(url: string, finish: Finish = 'black'): Promise<THREE.Mesh> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ring model request failed: status ${res.status} for ${url}`);
  const bytes = await res.arrayBuffer();
  if (!bytes || bytes.byteLength === 0) throw new Error(`Ring model response was empty (status ${res.status}) for ${url}`);
  const geometry = buildRingGeometry(bytes);
  const material = new THREE.MeshPhysicalMaterial({
    ...finishSpec(finish).ring,
    clearcoat: 0.4,
    clearcoatRoughness: 0.25,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ring';
  return mesh;
}

/** Re-colour a loaded ring in place (no new geometry). */
export function applyRingFinish(mesh: THREE.Mesh, finish: Finish): void {
  const { color, metalness, roughness } = finishSpec(finish).ring;
  const mat = mesh.material as THREE.MeshPhysicalMaterial;
  mat.color.set(color);
  mat.metalness = metalness;
  mat.roughness = roughness;
}
