import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text, Html } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Agente executivo procedural — paletó/gravata/careca.
 * Mantém EXATAMENTE as mesmas props e comportamento do VoxelAgent antigo:
 * idle/typing/walking, hover popup, click, billboard, selected ring.
 * Trocou só a geometria voxel cubo por uma versão mais elaborada.
 */
const SKIN = '#f4c08c';
const PANTS = '#14141A';
const SHOES = '#06060A';
const WHITE_SHIRT = '#E8E0D0';
const TIE_COLOR = '#B89030';

export default function VoxelAgent({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  status = 'idle',
  shirtColor = '#22d3ee',
  walkTargets = null,
  walkSpeed = 1.6,
  phaseOffset = 0,
  name = null,
  paused = false,
  seated = false,
  agentInfo = null,
  descricao = null,
  onSelect = null,
  selected = false,
}) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef();
  const torsoRef = useRef();
  const leftArmRef = useRef();
  const rightArmRef = useRef();
  const leftForearmRef = useRef();
  const rightForearmRef = useRef();
  const leftLegRef = useRef();
  const rightLegRef = useRef();
  const lowerLegLRef = useRef();
  const lowerLegRRef = useRef();

  const walkProgress = useRef(0);
  const walkDir = useRef(1);

  // tom escuro do paletó (sombra) — pra ombros/lapelas
  const blazerShade = useMemo(() => new THREE.Color(shirtColor).multiplyScalar(0.7).getStyle(), [shirtColor]);

  useFrame((state, dt) => {
    if (paused) return;
    const t = state.clock.elapsedTime + phaseOffset;

    if (status !== 'walking' && groupRef.current) {
      groupRef.current.position.x = position[0];
      groupRef.current.position.z = position[2];
      groupRef.current.rotation.y = rotation[1] || 0;
      walkProgress.current = 0;
      walkDir.current = 1;
    }

    // Pose pernas: seated = coxa horizontal pra frente (-PI/2), canela vertical (PI/2). Em pé: 0.
    const hipBase = seated ? -Math.PI / 2 : 0;
    const kneeBase = seated ? Math.PI / 2 : 0;
    const effectiveStatus = (seated && status === 'walking') ? 'idle' : status;

    if (effectiveStatus === 'idle') {
      if (torsoRef.current) {
        torsoRef.current.scale.y = 1 + Math.sin(t * 1.8) * 0.04;
      }
      // Braços relaxados quando sentado: forearms levemente caídos pra frente
      const armBase = seated ? -Math.PI / 2 : 0;
      const forearmBase = seated ? -Math.PI / 14 : 0;
      if (leftArmRef.current) leftArmRef.current.rotation.x = armBase;
      if (rightArmRef.current) rightArmRef.current.rotation.x = armBase;
      if (leftForearmRef.current) leftForearmRef.current.rotation.x = forearmBase;
      if (rightForearmRef.current) rightForearmRef.current.rotation.x = forearmBase;
      if (leftLegRef.current) leftLegRef.current.rotation.x = hipBase;
      if (rightLegRef.current) rightLegRef.current.rotation.x = hipBase;
      if (lowerLegLRef.current) lowerLegLRef.current.rotation.x = kneeBase;
      if (lowerLegRRef.current) lowerLegRRef.current.rotation.x = kneeBase;

    } else if (effectiveStatus === 'typing') {
      if (torsoRef.current) torsoRef.current.scale.y = 1;
      // Braços horizontais pra frente, antebraços oscilando (digitando)
      const armBase = seated ? -Math.PI / 2 : -Math.PI / 4;
      const forearmBase = -Math.PI / 14;
      const wobble = Math.sin(t * 12) * 0.10;
      if (leftArmRef.current) leftArmRef.current.rotation.x = armBase;
      if (rightArmRef.current) rightArmRef.current.rotation.x = armBase;
      if (leftForearmRef.current) leftForearmRef.current.rotation.x = forearmBase + wobble;
      if (rightForearmRef.current) rightForearmRef.current.rotation.x = forearmBase - wobble;
      if (leftLegRef.current) leftLegRef.current.rotation.x = hipBase;
      if (rightLegRef.current) rightLegRef.current.rotation.x = hipBase;
      if (lowerLegLRef.current) lowerLegLRef.current.rotation.x = kneeBase;
      if (lowerLegRRef.current) lowerLegRRef.current.rotation.x = kneeBase;

    } else if (effectiveStatus === 'walking') {
      if (torsoRef.current) torsoRef.current.scale.y = 1;
      const swing = Math.sin(t * 6) * 0.65;
      if (leftLegRef.current) leftLegRef.current.rotation.x = swing;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -swing;
      if (lowerLegLRef.current) lowerLegLRef.current.rotation.x = 0;
      if (lowerLegRRef.current) lowerLegRRef.current.rotation.x = 0;
      if (leftArmRef.current) leftArmRef.current.rotation.x = -swing * 0.8;
      if (rightArmRef.current) rightArmRef.current.rotation.x = swing * 0.8;
      if (leftForearmRef.current) leftForearmRef.current.rotation.x = 0;
      if (rightForearmRef.current) rightForearmRef.current.rotation.x = 0;

      if (walkTargets && walkTargets.length >= 2 && groupRef.current) {
        const [a, b] = walkTargets;
        const dx0 = b[0] - a[0];
        const dz0 = b[1] - a[1];
        const dist = Math.hypot(dx0, dz0) || 1;
        let p = walkProgress.current + (walkDir.current * walkSpeed * dt) / dist;
        if (p >= 1) { p = 1; walkDir.current = -1; }
        if (p <= 0) { p = 0; walkDir.current = 1; }
        walkProgress.current = p;

        groupRef.current.position.x = a[0] + dx0 * p;
        groupRef.current.position.z = a[1] + dz0 * p;

        const dx = dx0 * walkDir.current;
        const dz = dz0 * walkDir.current;
        groupRef.current.rotation.y = Math.atan2(dx, dz) + Math.PI;
      }
    }
  });

  const statusColor =
    status === 'typing' ? '#22c55e' :
    status === 'walking' ? '#facc15' :
    '#64748b';

  const apiStatus = agentInfo?.status || '—';
  const segDesde = agentInfo?.segundos_desde_ultimo;
  const runs24 = agentInfo?.runs_24h ?? 0;
  const erros24 = agentInfo?.erros_24h ?? 0;

  const handleOver = (e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; };
  const handleOut = (e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = 'auto'; };
  const handleClick = (e) => { e.stopPropagation(); if (onSelect) onSelect(); };

  // Quando sentado, baixa o group inteiro pra alinhar com cadeira (assento y=0.55)
  const seatedOffset = seated ? -0.45 : 0;

  return (
    <group
      ref={groupRef}
      position={[position[0], position[1] + seatedOffset, position[2]]}
      rotation={rotation}
      onPointerOver={handleOver}
      onPointerOut={handleOut}
      onClick={handleClick}
    >
      {/* Hitbox transparente pra estabilizar hover/click */}
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[1.3, 3, 1.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Anel selecionado */}
      {selected && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.85, 1.05, 32]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.85} />
        </mesh>
      )}

      {/* Popup hover */}
      {hovered && !selected && agentInfo && (
        <Html position={[0, seated ? 2.6 : 3.1, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
          <div style={{
            background: 'rgba(8,10,16,0.94)', border: '1px solid #fbbf24', borderRadius: 8,
            padding: '8px 10px', fontSize: 11, color: '#e5e7eb', minWidth: 160,
            fontFamily: 'system-ui, sans-serif', boxShadow: '0 4px 14px rgba(0,0,0,0.5)', whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: 700, color: '#fef3c7', marginBottom: 4 }}>{name}</div>
            {descricao && <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 6 }}>{descricao}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: apiStatus === 'rodando' ? '#22c55e' :
                  apiStatus === 'recente' ? '#84cc16' :
                  apiStatus === 'aguardando' ? '#3b82f6' :
                  apiStatus === 'pronto' ? '#a78bfa' :
                  apiStatus === 'degradado' ? '#ef4444' : '#64748b',
              }} />
              <span style={{ textTransform: 'uppercase', fontSize: 9, letterSpacing: 0.5 }}>{apiStatus}</span>
            </div>
            <div style={{ fontSize: 10, opacity: 0.85 }}>
              Último run: {
                segDesde === null || segDesde === undefined ? 'nunca' :
                segDesde < 60 ? `${segDesde}s atrás` :
                segDesde < 3600 ? `${Math.floor(segDesde / 60)}min atrás` :
                segDesde < 86400 ? `${Math.floor(segDesde / 3600)}h atrás` :
                `${Math.floor(segDesde / 86400)}d atrás`
              }
            </div>
            <div style={{ fontSize: 10, opacity: 0.85 }}>
              Runs 24h: {runs24}{erros24 > 0 ? ` · ${erros24} erros` : ''}
            </div>
            <div style={{ fontSize: 9, opacity: 0.5, marginTop: 4 }}>click pra abrir detalhes</div>
          </div>
        </Html>
      )}

      {/* Label flutuante (Billboard) */}
      {name && (
        <Billboard position={[0, 3.35, 0]}>
          <mesh position={[-0.55, 0, 0]}>
            <circleGeometry args={[0.09, 16]} />
            <meshBasicMaterial color={statusColor} />
          </mesh>
          <Text
            fontSize={0.28}
            color="#ffffff"
            anchorX="left"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#000000"
            position={[-0.4, 0, 0]}
          >
            {name}
          </Text>
        </Billboard>
      )}

      {/* ================ GEOMETRIA EXECUTIVO ================ */}

      {/* PERNA ESQUERDA — coxa (pivot no quadril) */}
      <group ref={leftLegRef} position={[-0.13, 0.78, 0]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <capsuleGeometry args={[0.10, 0.30, 6, 12]} />
          <meshStandardMaterial color={PANTS} roughness={0.9} />
        </mesh>
        {/* Canela (pivot no joelho) */}
        <group ref={lowerLegLRef} position={[0, -0.45, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.08, 0.30, 6, 12]} />
            <meshStandardMaterial color={PANTS} roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.36, 0.04]} castShadow>
            <boxGeometry args={[0.15, 0.07, 0.25]} />
            <meshStandardMaterial color={SHOES} roughness={0.35} metalness={0.4} />
          </mesh>
        </group>
      </group>

      {/* PERNA DIREITA */}
      <group ref={rightLegRef} position={[0.13, 0.78, 0]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <capsuleGeometry args={[0.10, 0.30, 6, 12]} />
          <meshStandardMaterial color={PANTS} roughness={0.9} />
        </mesh>
        <group ref={lowerLegRRef} position={[0, -0.45, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.08, 0.30, 6, 12]} />
            <meshStandardMaterial color={PANTS} roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.36, 0.04]} castShadow>
            <boxGeometry args={[0.15, 0.07, 0.25]} />
            <meshStandardMaterial color={SHOES} roughness={0.35} metalness={0.4} />
          </mesh>
        </group>
      </group>

      {/* TRONCO — paletó capsule magra */}
      <mesh ref={torsoRef} position={[0, 1.0, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.48, 8, 20]} />
        <meshStandardMaterial color={shirtColor} roughness={0.85} />
      </mesh>

      {/* OMBROS — esferas laterais */}
      <mesh position={[-0.22, 1.20, 0]} scale={[1, 0.9, 0.9]} castShadow>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color={shirtColor} roughness={0.85} />
      </mesh>
      <mesh position={[0.22, 1.20, 0]} scale={[1, 0.9, 0.9]} castShadow>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color={shirtColor} roughness={0.85} />
      </mesh>

      {/* CAMISA BRANCA visível no V */}
      <mesh position={[0, 1.13, 0.225]}>
        <planeGeometry args={[0.14, 0.24]} />
        <meshStandardMaterial color={WHITE_SHIRT} roughness={0.55} />
      </mesh>

      {/* GRAVATA — nó + corpo */}
      <mesh position={[0, 1.23, 0.230]} castShadow>
        <boxGeometry args={[0.055, 0.05, 0.018]} />
        <meshStandardMaterial color={TIE_COLOR} roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0, 1.07, 0.230]} castShadow>
        <boxGeometry args={[0.045, 0.26, 0.015]} />
        <meshStandardMaterial color={TIE_COLOR} roughness={0.4} metalness={0.3} />
      </mesh>

      {/* PESCOÇO */}
      <mesh position={[0, 1.36, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.09, 0.10, 16]} />
        <meshStandardMaterial color={SKIN} roughness={0.7} />
      </mesh>

      {/* CABEÇA (careca) */}
      <mesh position={[0, 1.57, 0]} scale={[0.95, 1.05, 0.95]} castShadow>
        <sphereGeometry args={[0.21, 32, 32]} />
        <meshStandardMaterial color={SKIN} roughness={0.7} />
      </mesh>

      {/* OLHOS — branco + íris */}
      <mesh position={[-0.068, 1.58, 0.185]}>
        <sphereGeometry args={[0.028, 16, 16]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.2} />
      </mesh>
      <mesh position={[0.068, 1.58, 0.185]}>
        <sphereGeometry args={[0.028, 16, 16]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.2} />
      </mesh>
      <mesh position={[-0.068, 1.58, 0.205]}>
        <sphereGeometry args={[0.014, 12, 12]} />
        <meshStandardMaterial color="#2A1810" roughness={0.3} />
      </mesh>
      <mesh position={[0.068, 1.58, 0.205]}>
        <sphereGeometry args={[0.014, 12, 12]} />
        <meshStandardMaterial color="#2A1810" roughness={0.3} />
      </mesh>

      {/* SOBRANCELHAS */}
      <mesh position={[-0.068, 1.625, 0.20]} rotation={[0, 0, 0.12]}>
        <boxGeometry args={[0.055, 0.010, 0.018]} />
        <meshStandardMaterial color="#1A0E08" roughness={0.6} />
      </mesh>
      <mesh position={[0.068, 1.625, 0.20]} rotation={[0, 0, -0.12]}>
        <boxGeometry args={[0.055, 0.010, 0.018]} />
        <meshStandardMaterial color="#1A0E08" roughness={0.6} />
      </mesh>

      {/* NARIZ */}
      <mesh position={[0, 1.555, 0.215]} scale={[0.9, 1.2, 1.0]}>
        <sphereGeometry args={[0.022, 16, 16]} />
        <meshStandardMaterial color={SKIN} roughness={0.7} />
      </mesh>

      {/* BOCA — sorriso sutil (torus parcial) */}
      <mesh position={[0, 1.495, 0.205]} rotation={[Math.PI, 0, 0]}>
        <torusGeometry args={[0.025, 0.004, 6, 12, Math.PI * 0.8]} />
        <meshStandardMaterial color="#6A3A2A" roughness={0.6} />
      </mesh>

      {/* ORELHAS */}
      <mesh position={[-0.20, 1.56, -0.01]} scale={[0.5, 1.2, 0.8]} castShadow>
        <sphereGeometry args={[0.030, 12, 12]} />
        <meshStandardMaterial color={SKIN} roughness={0.7} />
      </mesh>
      <mesh position={[0.20, 1.56, -0.01]} scale={[0.5, 1.2, 0.8]} castShadow>
        <sphereGeometry args={[0.030, 12, 12]} />
        <meshStandardMaterial color={SKIN} roughness={0.7} />
      </mesh>

      {/* BRAÇO ESQUERDO — pivot no ombro */}
      <group ref={leftArmRef} position={[-0.32, 1.15, 0]}>
        <mesh position={[0, -0.16, 0]} castShadow>
          <capsuleGeometry args={[0.08, 0.20, 6, 12]} />
          <meshStandardMaterial color={shirtColor} roughness={0.85} />
        </mesh>
        {/* Antebraço (pivot no cotovelo) */}
        <group ref={leftForearmRef} position={[0, -0.30, 0]}>
          <mesh position={[0, -0.13, 0]} castShadow>
            <capsuleGeometry args={[0.07, 0.20, 6, 12]} />
            <meshStandardMaterial color={shirtColor} roughness={0.85} />
          </mesh>
          {/* Mão */}
          <mesh position={[0, -0.26, 0]} scale={[1.1, 0.7, 1.3]} castShadow>
            <sphereGeometry args={[0.07, 16, 16]} />
            <meshStandardMaterial color={SKIN} roughness={0.7} />
          </mesh>
        </group>
      </group>

      {/* BRAÇO DIREITO */}
      <group ref={rightArmRef} position={[0.32, 1.15, 0]}>
        <mesh position={[0, -0.16, 0]} castShadow>
          <capsuleGeometry args={[0.08, 0.20, 6, 12]} />
          <meshStandardMaterial color={shirtColor} roughness={0.85} />
        </mesh>
        <group ref={rightForearmRef} position={[0, -0.30, 0]}>
          <mesh position={[0, -0.13, 0]} castShadow>
            <capsuleGeometry args={[0.07, 0.20, 6, 12]} />
            <meshStandardMaterial color={shirtColor} roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.26, 0]} scale={[1.1, 0.7, 1.3]} castShadow>
            <sphereGeometry args={[0.07, 16, 16]} />
            <meshStandardMaterial color={SKIN} roughness={0.7} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
