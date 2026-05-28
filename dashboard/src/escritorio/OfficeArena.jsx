/**
 * OfficeArena — agora renderiza o escritorio.html (Three.js vanilla portado do L2)
 * via iframe. Toda a lógica visual + estilo cinematográfico está no HTML standalone,
 * que faz fetch direto da API LMP (/api/agentes/status) e mantém terminal Maestro
 * + painel detalhes funcionando.
 *
 * Os componentes filhos (Floor.jsx, Chair.jsx, Desk.jsx, VoxelAgent.jsx) ficaram
 * obsoletos — podem ser removidos numa próxima limpeza.
 */
export default function OfficeArena() {
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: 'calc(100vh - 80px)',
      minHeight: 480,
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid #1F1F26',
      background: '#0A0A0E',
    }}>
      <iframe
        src="/admin/escritorio.html"
        title="Escritório L2 — Sala OSIA"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
        allow="fullscreen"
      />
    </div>
  );
}
