import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Chão de madeira premium — 1 PlaneGeometry com textura procedural
 * (tábuas verticais com veios + nós + emendas, geradas via canvas).
 * Muito mais leve que voxel cubos.
 */
function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1A120A';
  ctx.fillRect(0, 0, 1024, 1024);
  const plankCount = 8;
  const plankW = 1024 / plankCount;
  for (let p = 0; p < plankCount; p++) {
    const x = p * plankW;
    const tone = 30 + Math.random() * 25;
    ctx.fillStyle = `rgb(${tone + 10},${tone},${Math.max(0, tone - 8)})`;
    ctx.fillRect(x, 0, plankW, 1024);
    // veios
    for (let v = 0; v < 25; v++) {
      ctx.strokeStyle = `rgba(${10 + Math.random() * 15},${5 + Math.random() * 10},2,${0.15 + Math.random() * 0.35})`;
      ctx.lineWidth = 0.4 + Math.random() * 1.2;
      ctx.beginPath();
      const veiY = Math.random() * 1024;
      ctx.moveTo(x, veiY);
      for (let xx = 0; xx < plankW; xx += 6) {
        ctx.lineTo(x + xx, veiY + Math.sin(xx * 0.03 + v) * 3 + (Math.random() - 0.5) * 1.5);
      }
      ctx.stroke();
    }
    // nó
    if (Math.random() > 0.5) {
      const nx = x + Math.random() * plankW;
      const ny = Math.random() * 1024;
      const nr = 4 + Math.random() * 10;
      const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
      ng.addColorStop(0, 'rgba(10,5,2,0.85)');
      ng.addColorStop(1, 'rgba(10,5,2,0)');
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.arc(nx, ny, nr, 0, Math.PI * 2);
      ctx.fill();
    }
    // separação entre tábuas
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, 1024);
    ctx.stroke();
  }
  // emendas horizontais
  for (let p = 0; p < plankCount; p++) {
    const x = p * plankW;
    const numJoints = 1 + Math.floor(Math.random() * 2);
    for (let j = 0; j < numJoints; j++) {
      const jy = 200 + Math.random() * 624;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, jy); ctx.lineTo(x + plankW, jy);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

export default function Floor({ size = 20 }) {
  const tex = useMemo(makeWoodTexture, []);
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial map={tex} roughness={0.55} metalness={0.15} />
    </mesh>
  );
}

