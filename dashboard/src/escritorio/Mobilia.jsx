/**
 * Mobília decorativa do escritório (encostada nas paredes).
 * Componentes:
 *   - 2 armários de arquivo encostados na parede oeste
 *   - bebedouro/garrafão de água no canto NE da sala
 *   - planta grande de chão no canto SO próximo da entrada
 *   - tapete sob a área do Maestro (destacando a "sala dele")
 *   - luminária de chão ao lado do Maestro
 */
export default function Mobilia() {
  return (
    <group>
      {/* ===== Armário de arquivo 1 (parede oeste, perto do canto NW) ===== */}
      <ArmarioArquivo position={[-9.5, 0, -8]} />
      <ArmarioArquivo position={[-9.5, 0, -5.5]} />

      {/* ===== Estante/livros (parede oeste, mais ao sul) ===== */}
      <Estante position={[-9.5, 0, 5]} />

      {/* ===== Bebedouro / garrafão (parede norte, canto NE) ===== */}
      <Bebedouro position={[8.5, 0, -8.7]} />

      {/* ===== Planta de chão (canto SE, entrada) ===== */}
      <PlantaChao position={[8.5, 0, 8.5]} />

      {/* ===== Tapete sob a área do Maestro ===== */}
      <mesh position={[0, 0.015, -6]} receiveShadow>
        <boxGeometry args={[5, 0.03, 3.5]} />
        <meshStandardMaterial color="#5b3e2a" />
      </mesh>
      <mesh position={[0, 0.03, -6]} receiveShadow>
        <boxGeometry args={[4.6, 0.02, 3.1]} />
        <meshStandardMaterial color="#7c5cff" />
      </mesh>

      {/* ===== Luminária de pé ao lado do Maestro ===== */}
      <Luminaria position={[2.5, 0, -6]} />

      {/* ===== Quadro de cortiça atras do Maestro (em cima do armario) ===== */}

    </group>
  );
}

function ArmarioArquivo({ position = [0, 0, 0] }) {
  const [x, y, z] = position;
  return (
    <group position={[x, y, z]}>
      {/* Corpo do armário */}
      <mesh position={[0, 0.8, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 1.6, 1.2]} />
        <meshStandardMaterial color="#4a5568" />
      </mesh>
      {/* 3 gavetas */}
      {[1.3, 0.8, 0.3].map((gy, i) => (
        <group key={i}>
          <mesh position={[0.36, gy, 0]} castShadow>
            <boxGeometry args={[0.02, 0.4, 1.1]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
          {/* Puxador */}
          <mesh position={[0.38, gy, 0]} castShadow>
            <boxGeometry args={[0.04, 0.06, 0.25]} />
            <meshStandardMaterial color="#cbd5e1" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Estante({ position = [0, 0, 0] }) {
  const [x, y, z] = position;
  return (
    <group position={[x, y, z]}>
      {/* Estrutura */}
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 2.4, 1.6]} />
        <meshStandardMaterial color="#6b4226" />
      </mesh>
      {/* Prateleiras com livros simulados */}
      {[0.3, 0.9, 1.5, 2.1].map((py, idx) => (
        <group key={idx} position={[0, py, 0]}>
          {/* Prateleira */}
          <mesh position={[0.05, 0, 0]} castShadow>
            <boxGeometry args={[0.5, 0.04, 1.5]} />
            <meshStandardMaterial color="#3b2a1a" />
          </mesh>
          {/* Livros */}
          {[-0.6, -0.4, -0.2, 0, 0.25, 0.5].map((bz, bi) => {
            const cores = ['#dc2626', '#16a34a', '#1d4ed8', '#f59e0b', '#7c5cff', '#ec4899'];
            return (
              <mesh key={bi} position={[0.05, 0.22, bz]} castShadow>
                <boxGeometry args={[0.4, 0.4, 0.15]} />
                <meshStandardMaterial color={cores[(idx * 3 + bi) % cores.length]} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

function Bebedouro({ position = [0, 0, 0] }) {
  const [x, y, z] = position;
  return (
    <group position={[x, y, z]}>
      {/* Base */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 1, 0.7]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      {/* Galão de água azul (cilindro voxel) */}
      <mesh position={[0, 1.4, 0]} castShadow>
        <boxGeometry args={[0.55, 0.7, 0.55]} />
        <meshStandardMaterial color="#7dd3fc" transparent opacity={0.75} />
      </mesh>
      <mesh position={[0, 1.78, 0]} castShadow>
        <boxGeometry args={[0.3, 0.08, 0.3]} />
        <meshStandardMaterial color="#0284c7" />
      </mesh>
      {/* Torneiras */}
      <mesh position={[0, 0.7, 0.36]} castShadow>
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshStandardMaterial color="#dc2626" />
      </mesh>
      <mesh position={[0.18, 0.7, 0.36]} castShadow>
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshStandardMaterial color="#1d4ed8" />
      </mesh>
      {/* Copo */}
      <mesh position={[0.35, 0.05, 0.35]} castShadow>
        <boxGeometry args={[0.18, 0.2, 0.18]} />
        <meshStandardMaterial color="#f1f5f9" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

function PlantaChao({ position = [0, 0, 0] }) {
  const [x, y, z] = position;
  return (
    <group position={[x, y, z]}>
      {/* Vaso */}
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.8, 0.9]} />
        <meshStandardMaterial color="#6b4226" />
      </mesh>
      {/* Tronco */}
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[0.18, 0.7, 0.18]} />
        <meshStandardMaterial color="#3b2a1a" />
      </mesh>
      {/* Folhagens */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <boxGeometry args={[1.2, 0.9, 1.2]} />
        <meshStandardMaterial color="#2a4a2a" />
      </mesh>
      <mesh position={[-0.2, 2.4, 0.2]} castShadow>
        <boxGeometry args={[0.8, 0.6, 0.8]} />
        <meshStandardMaterial color="#3a5a3a" />
      </mesh>
      <mesh position={[0.3, 2.7, -0.1]} castShadow>
        <boxGeometry args={[0.5, 0.4, 0.5]} />
        <meshStandardMaterial color="#4a6a4a" />
      </mesh>
    </group>
  );
}

function Luminaria({ position = [0, 0, 0] }) {
  const [x, y, z] = position;
  return (
    <group position={[x, y, z]}>
      {/* Base */}
      <mesh position={[0, 0.05, 0]} castShadow>
        <boxGeometry args={[0.4, 0.1, 0.4]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {/* Haste */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[0.08, 2.2, 0.08]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {/* Cúpula */}
      <mesh position={[0, 2.4, 0]} castShadow>
        <boxGeometry args={[0.6, 0.4, 0.6]} />
        <meshStandardMaterial color="#fde68a" emissive="#fde047" emissiveIntensity={0.55} />
      </mesh>
    </group>
  );
}
