/**
 * A soft elliptical contact shadow: a flat, transparent plane with a radial-gradient alpha map, built from a small
 * DataTexture (no canvas needed, so it works in any environment). Lies in the XZ floor plane, facing up.
 */
import * as THREE from 'three';

const PX = 64;

function gradientTexture(): THREE.DataTexture {
  const data = new Uint8Array(PX * PX * 4);
  for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
    const dx = (x + 0.5) / PX * 2 - 1, dy = (y + 0.5) / PX * 2 - 1;
    const r = Math.hypot(dx, dy);
    const k = r >= 1 ? 0 : Math.pow(1 - r * r, 2); // dense core, feathered rim, exactly 0 at the edge
    data[(y * PX + x) * 4 + 3] = Math.round(255 * k); // rgb stay 0: a black shadow
  }
  const tex = new THREE.DataTexture(data, PX, PX, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createShadowBlob(width: number, depth: number, opacity: number): { mesh: THREE.Mesh; dispose(): void } {
  const map = gradientTexture();
  const material = new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, toneMapped: false });
  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'shadowBlob';
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(width, depth, 1);
  mesh.renderOrder = -1;
  let disposed = false;
  return {
    mesh,
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
      map.dispose();
    },
  };
}
