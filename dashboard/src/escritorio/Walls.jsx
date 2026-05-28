/**
 * Paredes do escritorio — paredes norte (-Z) e oeste (-X) em tom creme,
 * com rodape de madeira escura e janelas neutras. Inclui quadro branco
 * e relogio na parede norte, e quadros decorativos na oeste.
 */
export default function Walls({ size = 20, height = 3.5 }) {
  const halfSize = size / 2;

  const wallColor = '#e9d9bd';   // creme bege
  const trimColor = '#5b3e2a';   // rodape madeira escura
  const glassColor = '#cfe1f0';  // vidro azul claro neutro
  const frameColor = '#3b2a1a';  // moldura janela

  return (
    <group>
      {/* ===== Parede NORTE ===== */}
      <mesh position={[0, height / 2, -halfSize]} receiveShadow>
        <boxGeometry args={[size, height, 0.3]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      {/* Rodape norte */}
      <mesh position={[0, 0.12, -halfSize + 0.18]} receiveShadow>
        <boxGeometry args={[size, 0.25, 0.1]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      {/* Sanca/teto norte */}
      <mesh position={[0, height - 0.15, -halfSize + 0.18]}>
        <boxGeometry args={[size, 0.18, 0.1]} />
        <meshStandardMaterial color="#f5ead4" />
      </mesh>

      {/* Janelas norte (skip centro - vai o whiteboard) */}
      {[-7, -3.5, 3.5, 7].map((x) => (
        <group key={`win-n-${x}`} position={[x, 2.3, -halfSize + 0.16]}>
          {/* Moldura */}
          <mesh>
            <boxGeometry args={[1.7, 1.3, 0.08]} />
            <meshStandardMaterial color={frameColor} />
          </mesh>
          {/* Vidro */}
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[1.5, 1.1, 0.04]} />
            <meshStandardMaterial color={glassColor} emissive={glassColor} emissiveIntensity={0.4} transparent opacity={0.9} />
          </mesh>
          {/* Cruzeta */}
          <mesh position={[0, 0, 0.08]}>
            <boxGeometry args={[1.5, 0.05, 0.02]} />
            <meshStandardMaterial color={frameColor} />
          </mesh>
          <mesh position={[0, 0, 0.08]}>
            <boxGeometry args={[0.05, 1.1, 0.02]} />
            <meshStandardMaterial color={frameColor} />
          </mesh>
        </group>
      ))}

      {/* Quadro branco no centro da parede norte */}
      <group position={[0, 1.6, -halfSize + 0.17]}>
        {/* Moldura */}
        <mesh>
          <boxGeometry args={[3.6, 1.8, 0.08]} />
          <meshStandardMaterial color="#9ca3af" />
        </mesh>
        {/* Quadro */}
        <mesh position={[0, 0, 0.05]}>
          <boxGeometry args={[3.4, 1.6, 0.02]} />
          <meshStandardMaterial color="#fafafa" />
        </mesh>
        {/* "Anotações" simuladas */}
        <mesh position={[-1.2, 0.4, 0.07]}>
          <boxGeometry args={[1.4, 0.08, 0.01]} />
          <meshStandardMaterial color="#1d4ed8" />
        </mesh>
        <mesh position={[-1.0, 0.15, 0.07]}>
          <boxGeometry args={[1.6, 0.06, 0.01]} />
          <meshStandardMaterial color="#1d4ed8" />
        </mesh>
        <mesh position={[0.6, 0.1, 0.07]}>
          <boxGeometry args={[1.5, 0.08, 0.01]} />
          <meshStandardMaterial color="#dc2626" />
        </mesh>
        <mesh position={[0.4, -0.2, 0.07]}>
          <boxGeometry args={[1.2, 0.06, 0.01]} />
          <meshStandardMaterial color="#16a34a" />
        </mesh>
        {/* Apagador */}
        <mesh position={[1.5, -0.78, 0.07]}>
          <boxGeometry args={[0.5, 0.12, 0.06]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
      </group>

      {/* Relógio de parede (canto superior direito da parede norte) */}
      <group position={[8.5, 2.8, -halfSize + 0.18]}>
        <mesh>
          <boxGeometry args={[0.9, 0.9, 0.08]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
        <mesh position={[0, 0, 0.05]}>
          <boxGeometry args={[0.78, 0.78, 0.02]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
        {/* ponteiros */}
        <mesh position={[0, 0.15, 0.07]}>
          <boxGeometry args={[0.05, 0.3, 0.01]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
        <mesh position={[0.12, 0, 0.07]}>
          <boxGeometry args={[0.22, 0.04, 0.01]} />
          <meshStandardMaterial color="#dc2626" />
        </mesh>
      </group>

      {/* ===== Parede OESTE ===== */}
      <mesh position={[-halfSize, height / 2, 0]} receiveShadow>
        <boxGeometry args={[0.3, height, size]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      {/* Rodape oeste */}
      <mesh position={[-halfSize + 0.18, 0.12, 0]} receiveShadow>
        <boxGeometry args={[0.1, 0.25, size]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      {/* Sanca oeste */}
      <mesh position={[-halfSize + 0.18, height - 0.15, 0]}>
        <boxGeometry args={[0.1, 0.18, size]} />
        <meshStandardMaterial color="#f5ead4" />
      </mesh>

      {/* Janelas oeste */}
      {[-6, 0, 6].map((z) => (
        <group key={`win-w-${z}`} position={[-halfSize + 0.16, 2.3, z]} rotation={[0, Math.PI / 2, 0]}>
          <mesh>
            <boxGeometry args={[1.7, 1.3, 0.08]} />
            <meshStandardMaterial color={frameColor} />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[1.5, 1.1, 0.04]} />
            <meshStandardMaterial color={glassColor} emissive={glassColor} emissiveIntensity={0.4} transparent opacity={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.08]}>
            <boxGeometry args={[1.5, 0.05, 0.02]} />
            <meshStandardMaterial color={frameColor} />
          </mesh>
          <mesh position={[0, 0, 0.08]}>
            <boxGeometry args={[0.05, 1.1, 0.02]} />
            <meshStandardMaterial color={frameColor} />
          </mesh>
        </group>
      ))}

      {/* Quadro "missão" decorativo na parede oeste (entre janelas) */}
      <group position={[-halfSize + 0.18, 1.3, -3]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <boxGeometry args={[1.6, 1, 0.05]} />
          <meshStandardMaterial color="#5b3e2a" />
        </mesh>
        <mesh position={[0, 0, 0.04]}>
          <boxGeometry args={[1.4, 0.85, 0.02]} />
          <meshStandardMaterial color="#7c5cff" emissive="#7c5cff" emissiveIntensity={0.2} />
        </mesh>
      </group>
      <group position={[-halfSize + 0.18, 1.3, 3]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <boxGeometry args={[1.6, 1, 0.05]} />
          <meshStandardMaterial color="#5b3e2a" />
        </mesh>
        <mesh position={[0, 0, 0.04]}>
          <boxGeometry args={[1.4, 0.85, 0.02]} />
          <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.2} />
        </mesh>
      </group>
    </group>
  );
}
