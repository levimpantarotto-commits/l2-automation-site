/**
 * Cadeira ergonômica de escritório — assento + encosto + braços + base com 5 rodinhas.
 * Topo do assento mantido em y=0.55 (compatível com pose seated do VoxelAgent).
 */
export default function Chair({ position = [0, 0, 0], color = '#1f2937' }) {
  // 5 pés da estrela
  const feet = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    feet.push({ angle, x: Math.sin(angle) * 0.17, z: Math.cos(angle) * 0.17 });
  }

  return (
    <group position={position}>
      {/* Base — pistão central */}
      <mesh position={[0, 0.20, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 0.40, 12]} />
        <meshStandardMaterial color="#14141A" roughness={0.3} metalness={0.9} />
      </mesh>

      {/* 5 pés + rodinhas */}
      {feet.map((f, i) => (
        <group key={i}>
          <mesh position={[f.x, 0.08, f.z]} rotation={[0, f.angle, 0]} castShadow>
            <boxGeometry args={[0.32, 0.04, 0.06]} />
            <meshStandardMaterial color="#14141A" roughness={0.3} metalness={0.9} />
          </mesh>
          <mesh position={[Math.sin(f.angle) * 0.32, 0.05, Math.cos(f.angle) * 0.32]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 0.04, 10]} />
            <meshStandardMaterial color="#0A0A0E" roughness={0.6} metalness={0.5} />
          </mesh>
        </group>
      ))}

      {/* Assento — topo em y=0.55 (compatível com pose seated) */}
      <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.75, 0.10, 0.65]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>

      {/* Almofada (topo do assento) */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.70, 0.05, 0.60]} />
        <meshStandardMaterial color="#252530" roughness={0.9} />
      </mesh>

      {/* Encosto */}
      <mesh position={[0, 0.88, 0.30]} rotation={[-0.08, 0, 0]} castShadow>
        <boxGeometry args={[0.60, 0.65, 0.06]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>

      {/* Apoios de braço (esquerdo) */}
      <mesh position={[-0.40, 0.78, 0]} castShadow>
        <boxGeometry args={[0.06, 0.04, 0.35]} />
        <meshStandardMaterial color="#1A1A22" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[-0.40, 0.67, 0]} castShadow>
        <boxGeometry args={[0.04, 0.18, 0.04]} />
        <meshStandardMaterial color="#14141A" roughness={0.4} metalness={0.7} />
      </mesh>

      {/* Apoios de braço (direito) */}
      <mesh position={[0.40, 0.78, 0]} castShadow>
        <boxGeometry args={[0.06, 0.04, 0.35]} />
        <meshStandardMaterial color="#1A1A22" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0.40, 0.67, 0]} castShadow>
        <boxGeometry args={[0.04, 0.18, 0.04]} />
        <meshStandardMaterial color="#14141A" roughness={0.4} metalness={0.7} />
      </mesh>
    </group>
  );
}
