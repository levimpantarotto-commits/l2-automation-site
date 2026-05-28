import { useMemo } from 'react';
import * as THREE from 'three';

function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, '#3a2818');
  grad.addColorStop(0.5, '#4a3422');
  grad.addColorStop(1, '#382616');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 80; i++) {
    ctx.strokeStyle = `rgba(${20 + Math.random() * 30},${10 + Math.random() * 20},5,${0.15 + Math.random() * 0.3})`;
    ctx.lineWidth = 0.5 + Math.random() * 1.5;
    ctx.beginPath();
    const y = Math.random() * 512;
    ctx.moveTo(0, y);
    for (let x = 0; x < 512; x += 8) {
      ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 4 + (Math.random() - 0.5) * 2);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Mesa de trabalho — tampo madeira + pernas metal + monitor com tela emissive + teclado + mouse.
 * Mantém props { position, color } por compatibilidade.
 * `color` agora vai pra emissive da tela do monitor.
 */
export default function Desk({ position = [0, 0, 0], color = '#22d3ee' }) {
  const woodTex = useMemo(makeWoodTexture, []);

  // Renderiza teclas individuais
  const keys = [];
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 14; k++) {
      keys.push(
        <mesh key={`k-${r}-${k}`} position={[-0.31 + k * 0.045, 0.925 + 0.5 - 0.5, 0.42 + r * 0.05]}>
          <boxGeometry args={[0.04, 0.005, 0.04]} />
          <meshStandardMaterial color="#2A2A30" roughness={0.7} />
        </mesh>
      );
    }
  }

  return (
    <group position={position}>
      {/* TAMPO da mesa */}
      <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.08, 1.2]} />
        <meshStandardMaterial map={woodTex} roughness={0.4} metalness={0.1} />
      </mesh>

      {/* 4 pernas metal escuro */}
      {[[-1.0, -0.5], [1.0, -0.5], [-1.0, 0.5], [1.0, 0.5]].map(([x, z], i) => (
        <mesh key={`leg-${i}`} position={[x, 0.425, z]} castShadow>
          <boxGeometry args={[0.06, 0.85, 0.06]} />
          <meshStandardMaterial color="#1A1A20" roughness={0.4} metalness={0.9} />
        </mesh>
      ))}

      {/* MONITOR — base */}
      <mesh position={[0, 0.91, -0.3]} castShadow>
        <cylinderGeometry args={[0.12, 0.16, 0.03, 24]} />
        <meshStandardMaterial color="#0F0F12" roughness={0.3} metalness={0.8} />
      </mesh>

      {/* MONITOR — pescoço */}
      <mesh position={[0, 1.12, -0.3]} castShadow>
        <boxGeometry args={[0.05, 0.4, 0.05]} />
        <meshStandardMaterial color="#1A1A20" roughness={0.3} metalness={0.85} />
      </mesh>

      {/* MONITOR — corpo */}
      <mesh position={[0, 1.5, -0.32]} castShadow>
        <boxGeometry args={[1.4, 0.85, 0.04]} />
        <meshStandardMaterial color="#0A0A0E" roughness={0.3} metalness={0.7} />
      </mesh>

      {/* MONITOR — tela (emissive com cor do agente) */}
      <mesh position={[0, 1.5, -0.295]}>
        <planeGeometry args={[1.28, 0.75]} />
        <meshStandardMaterial
          color="#0A0A12"
          emissive={color}
          emissiveIntensity={0.6}
          roughness={0.1}
        />
      </mesh>

      {/* TECLADO */}
      <mesh position={[0, 0.905, 0.42]} castShadow>
        <boxGeometry args={[0.7, 0.03, 0.22]} />
        <meshStandardMaterial color="#16161C" roughness={0.6} metalness={0.3} />
      </mesh>

      {/* Teclas */}
      {keys}

      {/* MOUSE */}
      <mesh position={[0.45, 0.91, 0.42]} scale={[1, 0.5, 1.4]} castShadow>
        <sphereGeometry args={[0.05, 16, 12]} />
        <meshStandardMaterial color="#16161C" roughness={0.5} metalness={0.4} />
      </mesh>
    </group>
  );
}
