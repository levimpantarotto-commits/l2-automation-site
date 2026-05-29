import React, { useState, useEffect } from 'react';
import './App.css';
import OfficeArena from './escritorio/OfficeArena.jsx';
import Login from './Login.jsx';
import Usuarios from './Usuarios.jsx';

// L2 Automation: VITE_API_BASE_URL='' em prod → mesma origem (relativo). Localhost:3004 em dev.
const API_BASE = `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3004'}/api`;
const BACKEND_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3004';

// Wrapper: toda fetch pra backend passa credentials pro cookie HTTP-only viajar.
// Também intercepta 401 → dispara logout no listener global.
function apiFetch(url, opts = {}) {
  return fetch(url, { ...opts, credentials: opts.credentials ?? 'include' }).then(r => {
    if (r.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('lmp:unauthorized'));
    }
    return r;
  });
}

// Personagem cartoon (boneco) — cores INLINE pra garantir render
function Character({ corRoupa = '#3a5a8a' }) {
  return (
    <g className="parte-superior">
      <rect className="braco braco-l" x="-13" y="-19" width="4" height="14" rx="2" fill={corRoupa} />
      <rect className="braco braco-r" x="9" y="-19" width="4" height="14" rx="2" fill={corRoupa} />
      <circle cx="-11" cy="-5" r="2.5" fill="#f4c69a" />
      <circle cx="11" cy="-5" r="2.5" fill="#f4c69a" />
      <rect x="-10" y="-22" width="20" height="22" rx="3" fill={corRoupa} />
      <rect x="-3" y="-26" width="6" height="5" fill="#f4c69a" />
      <circle cx="0" cy="-34" r="11" fill="#f4c69a" />
      <path d="M -10 -38 Q -8 -46 0 -47 Q 8 -46 10 -38 L 10 -34 Q 0 -38 -10 -34 Z" fill="#2a1a0e" />
      <circle cx="-3.5" cy="-34" r="1.2" fill="#000" />
      <circle cx="3.5" cy="-34" r="1.2" fill="#000" />
      <path d="M -3 -29 Q 0 -27 3 -29" stroke="#000" fill="none" strokeWidth="0.8" strokeLinecap="round" />
      <circle cx="0" cy="-34" r="0" className="aro-trab" fill="none" stroke="#c9a84c" strokeWidth="2" />
    </g>
  );
}

// Mobilia de uma estacao — cores INLINE
function EstacaoMobilia() {
  return (
    <>
      <rect x="2" y="2" width="156" height="126" rx="4" fill="rgba(163,150,136,0.025)" stroke="rgba(163,150,136,0.25)" strokeWidth="1" strokeDasharray="4 6" />
      <rect x="20" y="78" width="120" height="6" rx="1" fill="#2a2218" />
      <rect x="20" y="74" width="120" height="6" rx="1" fill="#3a2e22" />
      <rect x="22" y="84" width="2" height="20" fill="#2a2218" />
      <rect x="136" y="84" width="2" height="20" fill="#2a2218" />
      <rect x="62" y="58" width="36" height="20" rx="1" fill="#1a3a5a" />
      <rect x="76" y="78" width="8" height="3" fill="#222" />
      <rect x="70" y="81" width="20" height="2" fill="#222" />
      <ellipse cx="80" cy="108" rx="14" ry="4" fill="#1a1a1a" />
      <rect x="78" y="100" width="4" height="14" fill="#1a1a1a" />
      <rect x="68" y="92" width="24" height="10" rx="2" fill="#1a1a1a" />
      <rect x="32" y="73" width="14" height="3" transform="rotate(-3 39 75)" fill="#d4c5a8" />
      <rect x="110" y="74" width="12" height="3" transform="rotate(2 116 76)" fill="#d4c5a8" />
      <ellipse cx="148" cy="76" rx="6" ry="4" fill="#2a4a2a" />
      <ellipse cx="148" cy="72" rx="8" ry="5" fill="#2a4a2a" />
      <rect x="144" y="78" width="8" height="8" fill="#5a3a2a" />
    </>
  );
}

const VIEWS_VALIDAS = ['inicio', 'kanban', 'cerebro', 'roteiros', 'aprovacoes', 'trafego', 'yt-trends', 'miner', 'calendar', 'escritorio', 'usuarios', 'inbox', 'leads', 'config', 'posts', 'ideias', 'ia', 'comecar', 'sobre', 'dashboard'];
function getViewFromHash() {
  const h = (window.location.hash || '').replace(/^#/, '');
  return VIEWS_VALIDAS.includes(h) ? h : 'inicio';
}

// Páginas standalone que renderizam dentro de um iframe (sem rebuild do React)
const STANDALONE_VIEWS = {
  inbox: '/admin/standalone/inbox',
  leads: '/admin/standalone/leads',
  config: '/admin/standalone/config',
  posts: '/admin/standalone/posts',
  ideias: '/admin/standalone/ideias',
  ia: '/admin/standalone/ia',
  comecar: '/admin/standalone/comecar',
  sobre: '/admin/standalone/sobre',
  dashboard: '/admin/standalone/dashboard',
};

function App() {
  // === Auth ===
  // authState: 'loading' | 'guest' (precisa login) | 'authed' (logado) | 'open' (AUTH_REQUIRED=false no backend)
  const [authState, setAuthState] = useState('loading');
  const [authedUser, setAuthedUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
        if (cancelled) return;
        if (r.ok) {
          const data = await r.json();
          setAuthedUser(data.user);
          setAuthState('authed');
        } else if (r.status === 401) {
          // /me retornou 401: ou auth é exigido mas não logado, ou flag desligada e sem cookie
          // Pra distinguir: tenta uma rota protegida (ex: /clientes). Se passar, auth é OFF; se 401, auth ON.
          const probe = await fetch(`${API_BASE}/clientes`, { credentials: 'include' });
          if (cancelled) return;
          if (probe.ok) {
            // Auth não exigido no backend — segue sem login
            setAuthState('open');
          } else {
            setAuthState('guest');
          }
        }
      } catch {
        // Backend offline ou CORS — assume modo aberto pra não travar
        if (!cancelled) setAuthState('open');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Listener global: qualquer 401 vinda de apiFetch força volta pra tela de login
  useEffect(() => {
    const onUnauth = () => {
      if (authState === 'authed') {
        setAuthState('guest');
        setAuthedUser(null);
      }
    };
    window.addEventListener('lmp:unauthorized', onUnauth);
    return () => window.removeEventListener('lmp:unauthorized', onUnauth);
  }, [authState]);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      /* ignora — vamos pro guest mesmo */
    }
    setAuthedUser(null);
    setAuthState('guest');
  };

  // Render guards
  if (authState === 'loading') {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0b1020', color: '#9ca3af', fontFamily: 'system-ui, sans-serif',
        fontSize: 13, letterSpacing: 0.5,
      }}>
        Carregando sessão…
      </div>
    );
  }
  if (authState === 'guest') {
    return <Login onLogin={(u) => { setAuthedUser(u); setAuthState('authed'); }} />;
  }

  // authState === 'authed' OU 'open' → libera o app
  return <AppCore authedUser={authedUser} onLogout={handleLogout} />;
}

function AppCore({ authedUser, onLogout }) {
  const [view, setViewRaw] = useState(getViewFromHash());
  const setView = (v) => { setViewRaw(v); window.location.hash = v; };

  // Sincroniza quando o usuário usa back/forward do browser
  useEffect(() => {
    const onHashChange = () => setViewRaw(getViewFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const [posts, setPosts] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlatforms, setSelectedPlatforms] = useState({});
  const [expandedCards, setExpandedCards] = useState({});
  const [failedImages, setFailedImages] = useState({});
  const [previewPost, setPreviewPost] = useState(null);
  const [toast, setToast] = useState(null);
  const [schedulingPost, setSchedulingPost] = useState(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [minerReport, setMinerReport] = useState('');
  const [minerEntries, setMinerEntries] = useState([]);
  const [runningMiner, setRunningMiner] = useState(false);
  const [showNewPost, setShowNewPost] = useState(false);
  const [newPostData, setNewPostData] = useState({ title: '', content: '', platforms: [] });
  const [newPostImage, setNewPostImage] = useState(null);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [newPostTema, setNewPostTema] = useState('');
  const [maestroInput, setMaestroInput] = useState('');
  const [maestroHistory, setMaestroHistory] = useState([
    { sender: 'Maestro Levi', text: 'Console operacional. Digite "help" para ver os comandos.' }
  ]);
  const [maestroLoading, setMaestroLoading] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [clienteAtivo, setClienteAtivo] = useState('levi-mp');
  const [notifCount, setNotifCount] = useState(0);
  const [notifList, setNotifList] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [agentesStatus, setAgentesStatus] = useState([]);
  const [agentesRuns, setAgentesRuns] = useState([]);
  const [clienteData, setClienteData] = useState(null);
  const [roteiros, setRoteiros] = useState([]);
  const [roteiroSelecionado, setRoteiroSelecionado] = useState(null);
  const [novoRoteiro, setNovoRoteiro] = useState({ tema: '', plataforma: 'youtube', duracao_min: 5 });
  const [gerandoRoteiro, setGerandoRoteiro] = useState(false);
  const [aprovacoes, setAprovacoes] = useState([]);
  const [campanhas, setCampanhas] = useState([]);
  const [novaCampanha, setNovaCampanha] = useState({ plataforma: 'meta', nome: '', objetivo: '', publico_alvo: '', orcamento_diario: 0, orcamento_total: 0 });
  const [showNovaCampanha, setShowNovaCampanha] = useState(false);
  const [ytStatus, setYtStatus] = useState(null);
  const [ytVideos, setYtVideos] = useState([]);
  const [ytCanais, setYtCanais] = useState([]);
  const [ytKeywords, setYtKeywords] = useState([]);
  const [novoYtCanal, setNovoYtCanal] = useState('');
  const [novaYtKeyword, setNovaYtKeyword] = useState('');

  useEffect(() => {
    apiFetch(`${API_BASE}/clientes`).then(r => r.json()).then(setClientes).catch(e => console.error('Erro ao carregar clientes', e));
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [clienteAtivo]);

  useEffect(() => {
    const q = clienteAtivo ? `?cliente=${clienteAtivo}` : '';
    if (view === 'miner') {
      apiFetch(`${API_BASE}/miner-report`)
        .then(res => res.json())
        .then(data => {
          setMinerReport(data.content || '');
          setMinerEntries(data.entries || []);
        });
    }
    if (view === 'calendar') {
      apiFetch(`${API_BASE}/calendar${q}`)
        .then(res => res.json())
        .then(data => setCalendarEvents(data));
    }
    if (view === 'cerebro' && clienteAtivo) {
      setClienteData(null);
      apiFetch(`${API_BASE}/clientes/${clienteAtivo}`)
        .then(res => res.json())
        .then(setClienteData)
        .catch(e => console.error('Erro ao carregar cérebro', e));
    }
    if (view === 'roteiros') {
      apiFetch(`${API_BASE}/roteiros${q}`).then(r => r.json()).then(setRoteiros);
    }
    if (view === 'aprovacoes') {
      apiFetch(`${API_BASE}/aprovacoes${q}`).then(r => r.json()).then(setAprovacoes);
    }
    if (view === 'trafego') {
      apiFetch(`${API_BASE}/campanhas${q}`).then(r => r.json()).then(setCampanhas);
    }
    if (view === 'yt-trends') {
      apiFetch(`${API_BASE}/yt/health`).then(r => r.json()).then(setYtStatus);
      apiFetch(`${API_BASE}/yt/videos?limit=50`).then(r => r.json()).then(d => setYtVideos(Array.isArray(d) ? d : (d._offline ? [] : []))).catch(() => setYtVideos([]));
      apiFetch(`${API_BASE}/yt/canais`).then(r => r.json()).then(d => setYtCanais(Array.isArray(d) ? d : [])).catch(() => setYtCanais([]));
      apiFetch(`${API_BASE}/yt/keywords`).then(r => r.json()).then(d => setYtKeywords(Array.isArray(d) ? d : [])).catch(() => setYtKeywords([]));
    }
  }, [view, clienteAtivo]);

  const fetchData = async () => {
    try {
      const q = clienteAtivo ? `?cliente=${clienteAtivo}` : '';
      const [pRes, aRes] = await Promise.all([
        apiFetch(`${API_BASE}/posts${q}`),
        apiFetch(`${API_BASE}/analytics${q}`)
      ]);
      setPosts(await pRes.json());
      setAnalytics(await aRes.json());
      setLoading(false);
    } catch (e) { console.error(e); }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleExpand = (id) => setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));

  const handleTogglePlatform = (postId, plat) => {
    const current = selectedPlatforms[postId] || [];
    const updated = current.includes(plat) ? current.filter(p => p !== plat) : [...current, plat];
    setSelectedPlatforms({ ...selectedPlatforms, [postId]: updated });
  };

  const handlePublish = async (postId) => {
    const platforms = selectedPlatforms[postId] || [];
    if (!platforms.length) return showToast('Selecione uma rede social.', 'error');
    setPublishing(true);
    try {
      const res = await apiFetch(`${API_BASE}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, platforms })
      });
      if (res.ok) { showToast('Publicado com Sucesso'); fetchData(); }
      else showToast('Erro na publicação', 'error');
    } catch (e) { showToast('Erro de conexão', 'error'); }
    setPublishing(false);
  };

  const handleScheduleSubmit = async () => {
    const postId = schedulingPost;
    const platforms = selectedPlatforms[postId] || [];
    if (!scheduleDate) return showToast('Selecione uma data.', 'error');
    await apiFetch(`${API_BASE}/posts/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, scheduledAt: scheduleDate, platforms })
    });
    setSchedulingPost(null);
    fetchData();
    showToast('Agendamento Concluído');
  };

  const handleDelete = async (id) => {
    if (window.confirm('Excluir post permanentemente?')) {
      await apiFetch(`${API_BASE}/posts/${id}`, { method: 'DELETE' });
      fetchData();
    }
  };

  const handleApprove = async (postId) => {
    // Aprovação em 2 níveis: clientes externos passam por cliente_review primeiro;
    // levi-mp vai direto pra estratégicos (sem 2º nível).
    const novoStatus = clienteAtivo === 'levi-mp' ? 'pending' : 'cliente_review';
    await apiFetch(`${API_BASE}/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: novoStatus })
    });
    fetchData();
    showToast(novoStatus === 'cliente_review'
      ? 'Aprovado internamente — enviado pra revisão do cliente'
      : 'Post aprovado — movido para Estratégicos');
  };

  const fetchAgentesStatus = async () => {
    try {
      const r = await apiFetch(`${API_BASE}/agentes/status`);
      const data = await r.json();
      setAgentesStatus(data.agentes || []);
      if (view === 'network') {
        const r2 = await apiFetch(`${API_BASE}/agentes/runs?limit=20`);
        const list = await r2.json();
        setAgentesRuns(Array.isArray(list) ? list : []);
      }
    } catch (e) { /* silencioso */ }
  };

  useEffect(() => {
    fetchAgentesStatus();
    const intervalo = view === 'network' ? 5000 : 20000;
    const id = setInterval(fetchAgentesStatus, intervalo);
    return () => clearInterval(id);
  }, [view]);

  const fetchNotificacoes = async () => {
    try {
      const r = await apiFetch(`${API_BASE}/notificacoes/count`);
      const data = await r.json();
      setNotifCount(data.nao_lidas || 0);
      if (notifOpen) {
        const r2 = await apiFetch(`${API_BASE}/notificacoes?limit=30`);
        const list = await r2.json();
        setNotifList(Array.isArray(list) ? list : []);
      }
    } catch (e) { /* silencioso */ }
  };

  useEffect(() => {
    fetchNotificacoes();
    const id = setInterval(fetchNotificacoes, 30000);
    return () => clearInterval(id);
  }, [notifOpen]);

  const abrirNotificacoes = async () => {
    setNotifOpen(prev => !prev);
    if (!notifOpen) {
      const r = await apiFetch(`${API_BASE}/notificacoes?limit=30`);
      const list = await r.json();
      setNotifList(Array.isArray(list) ? list : []);
    }
  };

  const handleMarcarNotifLida = async (id) => {
    await apiFetch(`${API_BASE}/notificacoes/${id}/lida`, { method: 'POST' });
    fetchNotificacoes();
  };

  const handleMarcarTodasLidas = async () => {
    await apiFetch(`${API_BASE}/notificacoes/marcar-todas-lidas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    fetchNotificacoes();
  };

  const handleGerarLinkAprovacao = async () => {
    if (clienteAtivo === 'levi-mp') return showToast('Levi MP não usa fluxo de aprovação externa.', 'error');
    // Inclui posts em approval (pendente de aval interno) E em cliente_review
    const paraAprovar = posts.filter(p =>
      (p.status === 'cliente_review' || p.status === 'approval') &&
      p.cliente_id === clienteAtivo
    );
    if (!paraAprovar.length) return showToast('Nenhum post disponível para link de aprovação.', 'error');
    try {
      // Promover automaticamente os que ainda estão em 'approval' → 'cliente_review'
      const toPromote = paraAprovar.filter(p => p.status === 'approval').map(p => p.id);
      if (toPromote.length) {
        await apiFetch(`${API_BASE}/posts/bulk-to-cliente-review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post_ids: toPromote })
        });
      }
      const r = await apiFetch(`${API_BASE}/aprovacao-externa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_slug: clienteAtivo,
          post_ids: paraAprovar.map(p => p.id),
          titulo: `Aprovação ${new Date().toISOString().slice(0, 10)} — ${paraAprovar.length} peça(s)`
        })
      });
      const data = await r.json();
      if (!data.success) return showToast(`Erro: ${data.error}`, 'error');
      const urlCompleta = `${BACKEND_BASE}${data.url_relativa}`;
      try { await navigator.clipboard.writeText(urlCompleta); } catch (e) { /* clipboard pode falhar — exibir mesmo assim */ }
      showToast(`Link copiado (${paraAprovar.length} peças): ${urlCompleta}`);
      fetchData(); // Atualiza kanban para refletir nova coluna
    } catch (e) { showToast('Falha ao gerar link', 'error'); }
  };

  const handleValidarDNA = async (postId) => {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    try {
      const r = await apiFetch(`${API_BASE}/agentes/curador/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: clienteAtivo, texto: post.content })
      });
      const data = await r.json();
      if (!data.success) return showToast(`Erro Curador: ${data.error}`, 'error');
      if (data.ok) {
        showToast(`Validação OK — sem violações no DNA de ${data.cliente}`);
      } else {
        const detalhes = data.violacoes.map(v => v.termo || v.trecho || v.emoji).join(', ');
        showToast(`${data.total} violação(ões): ${detalhes}`, 'error');
      }
    } catch (e) { showToast('Falha ao validar', 'error'); }
  };

  const handleCreatePost = async () => {
    if (!newPostData.title || !newPostData.content) return showToast('Preencha título e conteúdo.', 'error');
    let imageFilename = null;
    if (newPostImage) {
      const formData = new FormData();
      formData.append('image', newPostImage);
      const upRes = await apiFetch(`${API_BASE}/upload-image`, { method: 'POST', body: formData });
      const upData = await upRes.json();
      if (upData.success) imageFilename = upData.filename;
    }
    await apiFetch(`${API_BASE}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newPostData, image: imageFilename, cliente_id: clienteAtivo })
    });
    setShowNewPost(false);
    setNewPostData({ title: '', content: '', platforms: [] });
    setNewPostImage(null);
    setNewPostTema('');
    fetchData();
    showToast('Post criado — aguardando aval');
  };

  const handleGenerateAI = async () => {
    if (!newPostTema) return showToast('Digite o tema antes de gerar.', 'error');
    setGeneratingAI(true);
    try {
      const res = await apiFetch(`${API_BASE}/generate-post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tema: newPostTema, plataforma: newPostData.platforms[0] || 'LinkedIn' })
      });
      const data = await res.json();
      if (data.success) {
        setNewPostData(prev => ({ ...prev, content: data.content, title: newPostTema }));
        showToast('Post gerado pela IA');
      } else {
        showToast(data.error || 'Erro na geração', 'error');
      }
    } catch (e) { showToast('Erro de conexão com IA', 'error'); }
    setGeneratingAI(false);
  };

  const handleMaestroCommand = async (e) => {
    if (e.key === 'Enter' && maestroInput.trim()) {
      const cmd = maestroInput.trim();
      setMaestroInput('');
      setMaestroHistory(prev => [...prev, { sender: 'Maestro Levi', text: cmd }]);
      setMaestroLoading(true);
      
      if (cmd.toLowerCase() === 'clear' || cmd.toLowerCase() === 'cls') {
          setMaestroHistory([]);
          setMaestroLoading(false);
          return;
      }

      try {
        const res = await apiFetch(`${API_BASE}/maestro`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd })
        });
        const data = await res.json();
        
        if (data.response === 'CLEAR_CONSOLE') {
            setMaestroHistory([]);
        } else {
            setMaestroHistory(prev => [...prev, { sender: 'Agente Maestro', text: data.response || data.error }]);
        }
      } catch (err) {
        setMaestroHistory(prev => [...prev, { sender: 'Sistema', text: 'Erro de conexão com o servidor.' }]);
      }
      setMaestroLoading(false);
    }
  };

  const updatePostContent = (id, newContent) => {
    setPosts(posts.map(p => p.id === id ? { ...p, content: newContent } : p));
  };

  const onDragStart = (e, postId) => e.dataTransfer.setData('postId', postId);
  const onDragOver = (e) => e.preventDefault();
  const onDrop = async (e, newStatus) => {
    const postId = e.dataTransfer.getData('postId');
    if (!postId) return;
    setPosts(posts.map(p => p.id === postId ? { ...p, status: newStatus } : p));
    try {
      await apiFetch(`${API_BASE}/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      showToast(`Movido para: ${newStatus}`);
    } catch (e) { showToast('Erro ao sincronizar', 'error'); }
  };

  const renderCard = (post) => {
    const selected = selectedPlatforms[post.id] || [];
    const isExpanded = expandedCards[post.id];
    const isApproval = post.status === 'approval';

    const tipoLabel = post.tipo === 'story' ? 'STORY' : 'POST';
    const tipoClass = post.tipo === 'story' ? 'tipo-story' : 'tipo-post';
    return (
      <div key={post.id} className={`post-card ${isExpanded ? 'expanded' : ''} ${isApproval ? 'approval-card' : ''}`} draggable onDragStart={(e) => onDragStart(e, post.id)}>
        <button className="delete-btn-top" onClick={(e) => { e.stopPropagation(); handleDelete(post.id); }}>×</button>
        <div className="card-top-meta">
          <span className={`tipo-badge ${tipoClass}`}>{tipoLabel}</span>
          {clienteAtivo !== 'levi-mp' && isApproval && (
            <button className="btn-validar-dna" onClick={(e) => { e.stopPropagation(); handleValidarDNA(post.id); }} title="Valida texto contra negativas do DNA">Validar DNA</button>
          )}
        </div>
        {post.isAuto && (
          <div className="auto-info-header">
            <span className="auto-badge">AUTO L2</span>
            {post.score && (
              <span className={`score-badge ${post.score >= 95 ? 'score-high' : post.score >= 80 ? 'score-mid' : 'score-low'}`}>
                Engajamento: {post.score}%
              </span>
            )}
          </div>
        )}
        <span className="card-title" onClick={() => toggleExpand(post.id)}>{post.title} {isExpanded ? '▲' : '▼'}</span>
        <div className="card-scroll-area">
          {post.viralReference && <div className="viral-reference-badge">🎯 Ref: {post.viralReference}</div>}
          {post.image && !failedImages[post.image] && (
            <div className="card-image-mini" onClick={() => setPreviewPost(post)}>
              <img
                src={`${BACKEND_BASE}/media/${post.image}`}
                alt="Preview"
                onError={() => {
                  console.warn('[kanban] Imagem falhou ao carregar:', post.image);
                  setFailedImages(prev => ({ ...prev, [post.image]: true }));
                }}
              />
            </div>
          )}
          <textarea className="content-editor" value={post.content} onDragStart={e => e.preventDefault()} onChange={(e) => updatePostContent(post.id, e.target.value)} />
          <div className="char-counter">
            {selected.includes('instagram') ? <span>IG: {post.content.length} / 2200</span> : <span>LI: {post.content.length} / 3000</span>}
          </div>
        </div>
        <div className="card-footer-fixed">
          {isApproval ? (
            <button className="btn-v8 approve-btn" onClick={() => handleApprove(post.id)}>APROVAR ESTE POST</button>
          ) : (
            <>
              <div className="platform-selector" style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                <div className={`plat-btn-v8 li ${selected.includes('linkedin') ? 'active' : ''}`} onClick={() => handleTogglePlatform(post.id, 'linkedin')}>LinkedIn</div>
                <div className={`plat-btn-v8 ig ${selected.includes('instagram') ? 'active' : ''}`} onClick={() => handleTogglePlatform(post.id, 'instagram')}>Instagram</div>
              </div>
              <div className="btn-group">
                <button className="btn-v8 primary" onClick={() => handlePublish(post.id)} disabled={publishing}>POSTAR</button>
                <button className="btn-v8" onClick={() => setSchedulingPost(post.id)}>AGENDAR</button>
                <button className="btn-v8" onClick={() => setPreviewPost(post)}>PREVIEW</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderCalendar = () => {
    const year = 2026;
    const month = 4;
    const daysInMonth = 31;
    const firstDay = new Date(year, month, 1).getDay();
    const dayHasEvent = (day) => calendarEvents.filter(e => {
      if (!e.scheduledAt) return false;
      const d = new Date(e.scheduledAt);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
    return (
      <div style={{ padding: '30px', flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 900 }}>Calendário Editorial <span style={{ color: 'var(--accent)' }}>Maio 2026</span></h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
          {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'].map(d => <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', color: '#444', fontWeight: 900, padding: '8px 0' }}>{d}</div>)}
          {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const events = dayHasEvent(day);
            const isToday = day === new Date().getDate() && new Date().getMonth() === month;
            return (
              <div key={day} style={{ minHeight: '80px', background: isToday ? 'rgba(237, 111, 92, 0.08)' : 'rgba(255,255,255,0.01)', border: isToday ? '1px solid var(--accent)' : '1px solid #1a1a1a', borderRadius: '8px', padding: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: isToday ? 'var(--accent)' : '#444', fontWeight: 900 }}>{day}</span>
                {events.map(ev => <div key={ev.id} style={{ fontSize: '0.65rem', color: '#fff', background: ev.platforms.includes('linkedin') ? '#0077b5' : '#E1306C', borderRadius: '3px', padding: '2px 4px', marginTop: '4px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{ev.title}</div>)}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAnalytics = () => {
    const published = posts.filter(p => p.status === 'published');
    return (
      <div style={{ padding: '30px', flex: 1, overflowY: 'auto' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: '30px' }}>Métricas de Operação</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '30px' }}>
          {[
            { label: 'Posts Publicados', value: analytics?.publishedCount ?? published.length, color: '#00ff88' },
            { label: 'Taxa de Sucesso', value: `${analytics?.successRate ?? 0}%`, color: 'var(--accent)' },
            { label: 'Aguardando Aval', value: analytics?.approvalCount ?? 0, color: '#C9A84C' },
          ].map(card => (
            <div key={card.label} style={{ background: '#0c0c0c', padding: '20px 25px', borderRadius: '12px', border: '1px solid #1a1a1a' }}>
              <div style={{ color: '#444', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '8px' }}>{card.label}</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const triggerMinerRun = async () => {
    setRunningMiner(true);
    try {
      const res = await apiFetch(`${API_BASE}/run-miner`, { method: 'POST' });
      if (res.ok) showToast('Miner iniciado em background. Verifique em alguns minutos.');
      else showToast('Erro ao iniciar Miner', 'error');
    } catch (e) {
      showToast('Erro de conexão com o Miner', 'error');
    }
    setRunningMiner(false);
    setTimeout(() => {
      apiFetch(`${API_BASE}/miner-report`).then(r => r.json()).then(data => {
        setMinerReport(data.content || '');
        setMinerEntries(data.entries || []);
      });
    }, 5000);
  };

  const renderMinerReport = () => {
    const approvalPosts = posts.filter(p => p.status === 'approval');
    return (
      <div style={{ padding: '30px', flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff' }}>Inteligência do Agente</h3>
            <div style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: '6px' }}>
              Cliente ativo: {clienteAtivo} · {approvalPosts.length} aguardando aval · {minerEntries.length} entradas no log do Miner
            </div>
          </div>
          <button className="btn-v8 primary" style={{ width: 'auto', padding: '10px 20px' }} onClick={triggerMinerRun} disabled={runningMiner}>{runningMiner ? 'Gerando...' : 'Rodar Miner Agora'}</button>
        </div>

        {approvalPosts.length > 0 && (
          <div style={{ marginBottom: '35px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}><span style={{ fontSize: '0.7rem', fontWeight: 900, color: '#C9A84C' }}>{approvalPosts.length} POST(S) AGUARDANDO SEU AVAL</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
              {approvalPosts.map(post => (
                <div key={post.id} style={{ background: '#0c0c0c', border: '1px solid rgba(201,168,76,0.35)', borderRadius: '16px', overflow: 'hidden' }}>
                  <div style={{ padding: '18px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff', marginBottom: '10px' }}>{post.title}</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn-v8 approve-btn" onClick={() => handleApprove(post.id)}>APROVAR</button>
                      <button className="btn-v8" onClick={() => setPreviewPost(post)}>VER COMPLETO</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '10px', color: 'var(--accent)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '14px', fontWeight: 700 }}>Histórico do Miner (últimas 20)</div>
          {minerEntries.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: '13px', padding: '20px', background: 'var(--surface-1)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              Nenhuma varredura registrada ainda. Clique em "Rodar Miner Agora" para iniciar a primeira coleta.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {minerEntries.map(e => (
                <div key={e.id} style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{e.source || 'desconhecido'}</span>
                    <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>{e.created_at} · score: {e.score}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.6 }}>{e.insight || e.topic || '(sem insight)'}</div>
                  {e.format && <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>format: {e.format}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {minerReport && (
          <div>
            <div style={{ fontSize: '10px', color: 'var(--success)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '14px', fontWeight: 700 }}>Relatório (Markdown)</div>
            <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px', maxHeight: '400px', overflowY: 'auto' }}>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-main)', fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>{minerReport}</pre>
            </div>
          </div>
        )}
      </div>
    );
  };

  const toggleAutoPilot = async () => {
    if (!clienteData) return;
    const current = clienteData.cliente.auto_pilot === 1;
    const newVal = !current;
    try {
      const res = await apiFetch(`${API_BASE}/clientes/${clienteAtivo}/autopilot`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_pilot: newVal })
      });
      if (res.ok) {
        setClienteData({ ...clienteData, cliente: { ...clienteData.cliente, auto_pilot: newVal ? 1 : 0 } });
        showToast(newVal ? 'Piloto Automático ATIVADO' : 'Piloto Automático DESATIVADO');
      }
    } catch(e) {
      showToast('Erro ao alterar Piloto Automático', 'error');
    }
  };

  const renderCerebro = () => {
    if (!clienteData || !clienteData.cliente) return <div style={{ padding: '50px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>Carregando cérebro de {clienteAtivo}...</div>;
    const c = clienteData.cliente;
    const isAutoPilot = c.auto_pilot === 1;
    const safeFlow = clienteData.neuralFlow || [];
    const safeStats = clienteData.stats || {};
    
    return (
      <div style={{ padding: '40px 50px', flex: 1, overflowY: 'auto' }}>
        <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--accent-mute)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Cérebro do Cliente</div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 600, marginTop: '8px' }}>{c.nome}</h2>
            <div style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: '6px' }}>
              slug: {c.slug} {c.vault_folder && `· vault: ${c.vault_folder}`} · posts: {safeStats.manualPosts}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            <button 
              onClick={toggleAutoPilot}
              style={{
                background: isAutoPilot ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${isAutoPilot ? '#00ff88' : '#333'}`,
                color: isAutoPilot ? '#00ff88' : '#aaa',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.3s'
              }}
            >
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isAutoPilot ? '#00ff88' : '#aaa', boxShadow: isAutoPilot ? '0 0 8px #00ff88' : 'none' }} />
              {isAutoPilot ? 'PILOTO AUTOMÁTICO: ON' : 'PILOTO AUTOMÁTICO: OFF'}
            </button>
            {isAutoPilot ? (
              <span style={{ fontSize: '10px', color: '#00ff88', fontFamily: 'var(--font-mono)' }}>Incluso no rolante diário do Maestro.</span>
            ) : (
              <span style={{ fontSize: '10px', color: '#ff4444', fontFamily: 'var(--font-mono)' }}>Cliente FORA do rolante automático.</span>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ fontSize: '10px', color: 'var(--accent)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '14px', fontWeight: 700 }}>DNA.md</div>
            {clienteData.dna ? (
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-main)', fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.7, margin: 0 }}>{clienteData.dna}</pre>
            ) : (
              <div style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: '13px' }}>Sem DNA.md no vault deste cliente.</div>
            )}
          </div>

          <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ fontSize: '10px', color: 'var(--accent)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '14px', fontWeight: 700 }}>Log.md</div>
            {clienteData.log ? (
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-main)', fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.7, margin: 0 }}>{clienteData.log}</pre>
            ) : (
              <div style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: '13px' }}>Sem Log.md no vault deste cliente.</div>
            )}
          </div>
        </div>

        <div style={{ marginTop: '30px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ fontSize: '10px', color: 'var(--success)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>Neural Flow (99_Neural_Flow/)</div>
            <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{safeFlow.length} entradas</span>
          </div>
          {safeFlow.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: '13px' }}>Nenhuma entrada ainda. Os agentes escreverão aqui.</div>
          ) : (
            safeFlow.map(entry => (
              <details key={entry.file} style={{ marginBottom: '10px', background: 'var(--surface-0)', borderRadius: '8px', padding: '12px 16px', border: '1px solid var(--border)' }}>
                <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-2)', fontWeight: 600 }}>{entry.file}</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-main)', fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.6, marginTop: '12px', margin: 0 }}>{entry.content}</pre>
              </details>
            ))
          )}
        </div>
      </div>
    );
  };

  // ── ROTEIROS ───────────────────────────────────────────────────────────────
  const handleGerarRoteiro = async () => {
    if (!novoRoteiro.tema) return showToast('Digite um tema', 'error');
    setGerandoRoteiro(true);
    try {
      const res = await apiFetch(`${API_BASE}/roteiros`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...novoRoteiro, cliente_id: clienteAtivo })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Roteiro gerado');
        setNovoRoteiro({ tema: '', plataforma: 'youtube', duracao_min: 5 });
        const r = await apiFetch(`${API_BASE}/roteiros?cliente=${clienteAtivo}`).then(r => r.json());
        setRoteiros(r);
        setRoteiroSelecionado(data);
      } else showToast(data.error || 'Erro ao gerar', 'error');
    } catch (e) { showToast('Erro de conexão', 'error'); }
    setGerandoRoteiro(false);
  };

  const renderRoteiros = () => (
    <div style={{ padding: '40px 50px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '11px', color: 'var(--accent-mute)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Roteirista IA</div>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 600, marginTop: '8px' }}>Roteiros de {clientes.find(c => c.slug === clienteAtivo)?.nome || clienteAtivo}</h2>
      </div>

      <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <div style={{ fontSize: '10px', color: 'var(--accent)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '16px', fontWeight: 700 }}>Novo Roteiro</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
          <input type="text" placeholder="Tema (ex: Como o INSS analisa um pedido de auxílio-doença)" value={novoRoteiro.tema} onChange={e => setNovoRoteiro({ ...novoRoteiro, tema: e.target.value })} style={{ padding: '12px', background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontFamily: 'var(--font-main)' }} />
          <select value={novoRoteiro.plataforma} onChange={e => setNovoRoteiro({ ...novoRoteiro, plataforma: e.target.value })} style={{ padding: '12px', background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
            <option value="youtube">YouTube</option>
            <option value="tiktok">TikTok / Reels</option>
            <option value="linkedin">LinkedIn (vídeo)</option>
            <option value="podcast">Podcast</option>
          </select>
          <input type="number" min="1" max="60" placeholder="min" value={novoRoteiro.duracao_min} onChange={e => setNovoRoteiro({ ...novoRoteiro, duracao_min: parseInt(e.target.value) || 5 })} style={{ padding: '12px', background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontFamily: 'var(--font-mono)' }} />
          <button className="btn-v8 primary" onClick={handleGerarRoteiro} disabled={gerandoRoteiro} style={{ width: 'auto', padding: '12px 24px' }}>{gerandoRoteiro ? 'Gerando...' : 'Gerar'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: roteiroSelecionado ? '1fr 2fr' : '1fr', gap: '20px' }}>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-3)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '12px', fontWeight: 700 }}>Histórico ({roteiros.length})</div>
          {roteiros.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: '13px', padding: '16px', background: 'var(--surface-1)', borderRadius: '8px' }}>Nenhum roteiro gerado ainda.</div>
          ) : (
            roteiros.map(r => (
              <div key={r.id} onClick={() => setRoteiroSelecionado(r)} style={{ cursor: 'pointer', background: roteiroSelecionado?.id === r.id ? 'var(--surface-2)' : 'var(--surface-1)', border: `1px solid ${roteiroSelecionado?.id === r.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '8px', padding: '12px 16px', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>{r.tema}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{r.plataforma} · {r.duracao_min}min · {r.created_at}</div>
              </div>
            ))
          )}
        </div>
        {roteiroSelecionado && (
          <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', color: 'var(--accent)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>Roteiro #{roteiroSelecionado.id}</div>
              <button className="btn-v8" onClick={() => { navigator.clipboard.writeText(roteiroSelecionado.conteudo); showToast('Copiado'); }}>Copiar</button>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-main)', fontSize: '14px', color: 'var(--text)', lineHeight: 1.7, margin: 0 }}>{roteiroSelecionado.conteudo}</pre>
          </div>
        )}
      </div>
    </div>
  );

  // ── APROVAÇÕES ─────────────────────────────────────────────────────────────
  const handleDecidirAprovacao = async (id, status) => {
    await apiFetch(`${API_BASE}/aprovacoes/${id}/decidir`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, decided_by: 'Levi' })
    });
    showToast(status === 'aprovado' ? 'Aprovado' : 'Rejeitado');
    apiFetch(`${API_BASE}/aprovacoes?cliente=${clienteAtivo}`).then(r => r.json()).then(setAprovacoes);
  };

  const renderAprovacoes = () => (
    <div style={{ padding: '40px 50px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '11px', color: 'var(--accent-mute)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Fila de Aprovação Humana</div>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 600, marginTop: '8px' }}>Aprovações Pendentes</h2>
        <div style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: '6px' }}>{aprovacoes.length} item(s) aguardando você · cliente: {clienteAtivo}</div>
      </div>

      {aprovacoes.length === 0 ? (
        <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '12px', padding: '40px', textAlign: 'center', color: 'var(--text-3)' }}>
          <div style={{ fontSize: '14px', marginBottom: '8px' }}>Nada na fila.</div>
          <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>Quando um agente quiser fazer algo sensível (publicar, gastar em ads, mandar DM), aparece aqui pra você liberar.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '14px' }}>
          {aprovacoes.map(a => (
            <div key={a.id} style={{ background: 'var(--surface-1)', border: '1px solid #C9A84C40', borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#C9A84C', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700, background: '#C9A84C20', padding: '4px 10px', borderRadius: '4px' }}>{a.tipo}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{a.created_at}</span>
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text)', marginBottom: '10px' }}>{a.descricao}</div>
                  {a.payload && (
                    <details style={{ marginTop: '8px' }}>
                      <summary style={{ fontSize: '11px', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>ver payload</summary>
                      <pre style={{ background: 'var(--surface-0)', padding: '12px', borderRadius: '6px', fontSize: '11px', color: 'var(--text-2)', marginTop: '8px', overflowX: 'auto' }}>{JSON.stringify(a.payload, null, 2)}</pre>
                    </details>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '140px' }}>
                  <button className="btn-v8 primary" onClick={() => handleDecidirAprovacao(a.id, 'aprovado')}>APROVAR</button>
                  <button className="btn-v8" onClick={() => handleDecidirAprovacao(a.id, 'rejeitado')}>Rejeitar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── TRÁFEGO PAGO ───────────────────────────────────────────────────────────
  const handleCriarCampanha = async () => {
    if (!novaCampanha.nome) return showToast('Nome obrigatório', 'error');
    await apiFetch(`${API_BASE}/campanhas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...novaCampanha, cliente_id: clienteAtivo })
    });
    showToast('Campanha criada');
    setShowNovaCampanha(false);
    setNovaCampanha({ plataforma: 'meta', nome: '', objetivo: '', publico_alvo: '', orcamento_diario: 0, orcamento_total: 0 });
    apiFetch(`${API_BASE}/campanhas?cliente=${clienteAtivo}`).then(r => r.json()).then(setCampanhas);
  };

  const renderTrafego = () => (
    <div style={{ padding: '40px 50px', flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--accent-mute)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Tráfego Pago</div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 600, marginTop: '8px' }}>Campanhas — {clientes.find(c => c.slug === clienteAtivo)?.nome || clienteAtivo}</h2>
          <div style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: '6px' }}>{campanhas.length} campanha(s) · APIs Meta/Google ainda não conectadas (rascunho local)</div>
        </div>
        <button className="btn-v8 primary" onClick={() => setShowNovaCampanha(true)} style={{ width: 'auto', padding: '12px 24px' }}>+ Nova Campanha</button>
      </div>

      {campanhas.length === 0 ? (
        <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '12px', padding: '40px', textAlign: 'center', color: 'var(--text-3)' }}>
          <div style={{ fontSize: '14px' }}>Nenhuma campanha ainda. Crie a primeira.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
          {campanhas.map(c => (
            <div key={c.id} style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: c.plataforma === 'meta' ? '#1877F2' : '#4285F4', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}>{c.plataforma}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{c.status}</span>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px', fontFamily: 'var(--font-serif)' }}>{c.nome}</div>
              {c.objetivo && <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '8px' }}>{c.objetivo}</div>}
              <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: '12px' }}>
                <span>R$ {c.orcamento_diario || 0}/dia</span>
                <span>R$ {c.orcamento_total || 0} total</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNovaCampanha && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#111', padding: '40px', borderRadius: '20px', width: '600px', border: '1px solid #333' }}>
            <h3 style={{ color: 'var(--accent)', marginBottom: '20px', fontFamily: 'var(--font-serif)' }}>NOVA CAMPANHA</h3>
            <select value={novaCampanha.plataforma} onChange={e => setNovaCampanha({ ...novaCampanha, plataforma: e.target.value })} style={{ width: '100%', padding: '12px', marginBottom: '12px', background: '#000', border: '1px solid #333', color: '#fff' }}>
              <option value="meta">Meta Ads (Facebook/Instagram)</option>
              <option value="google">Google Ads</option>
              <option value="tiktok">TikTok Ads</option>
              <option value="linkedin">LinkedIn Ads</option>
            </select>
            <input type="text" placeholder="Nome da campanha" value={novaCampanha.nome} onChange={e => setNovaCampanha({ ...novaCampanha, nome: e.target.value })} style={{ width: '100%', padding: '12px', marginBottom: '12px', background: '#000', border: '1px solid #333', color: '#fff' }} />
            <input type="text" placeholder="Objetivo (ex: gerar leads, vendas, awareness)" value={novaCampanha.objetivo} onChange={e => setNovaCampanha({ ...novaCampanha, objetivo: e.target.value })} style={{ width: '100%', padding: '12px', marginBottom: '12px', background: '#000', border: '1px solid #333', color: '#fff' }} />
            <textarea placeholder="Público-alvo" value={novaCampanha.publico_alvo} onChange={e => setNovaCampanha({ ...novaCampanha, publico_alvo: e.target.value })} style={{ width: '100%', minHeight: '80px', padding: '12px', marginBottom: '12px', background: '#000', border: '1px solid #333', color: '#fff' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <input type="number" placeholder="Orçamento/dia (R$)" value={novaCampanha.orcamento_diario} onChange={e => setNovaCampanha({ ...novaCampanha, orcamento_diario: parseFloat(e.target.value) || 0 })} style={{ padding: '12px', background: '#000', border: '1px solid #333', color: '#fff' }} />
              <input type="number" placeholder="Orçamento total (R$)" value={novaCampanha.orcamento_total} onChange={e => setNovaCampanha({ ...novaCampanha, orcamento_total: parseFloat(e.target.value) || 0 })} style={{ padding: '12px', background: '#000', border: '1px solid #333', color: '#fff' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={handleCriarCampanha} className="btn-v8 primary">Criar</button>
              <button onClick={() => setShowNovaCampanha(false)} className="btn-v8">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── YOUTUBE TRENDS ─────────────────────────────────────────────────────────
  const handleAddYtCanal = async () => {
    if (!novoYtCanal) return;
    await apiFetch(`${API_BASE}/yt/canais`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ youtube_id: novoYtCanal }) });
    setNovoYtCanal('');
    apiFetch(`${API_BASE}/yt/canais`).then(r => r.json()).then(d => setYtCanais(Array.isArray(d) ? d : []));
    showToast('Canal adicionado');
  };
  const handleAddYtKeyword = async () => {
    if (!novaYtKeyword) return;
    await apiFetch(`${API_BASE}/yt/keywords`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ termo: novaYtKeyword }) });
    setNovaYtKeyword('');
    apiFetch(`${API_BASE}/yt/keywords`).then(r => r.json()).then(d => setYtKeywords(Array.isArray(d) ? d : []));
    showToast('Keyword adicionada');
  };
  const handleColetarYt = async () => {
    await apiFetch(`${API_BASE}/yt/coletar`, { method: 'POST' });
    showToast('Coleta YT iniciada');
  };
  const handleGerarDeOutlier = async (videoId) => {
    if (!clienteAtivo) { showToast('Selecione um cliente primeiro', 'error'); return; }
    showToast('Gerando post... pode levar alguns segundos');
    try {
      const r = await apiFetch(`${API_BASE}/maestro/gerar-de-outlier`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: clienteAtivo, videoId, plataforma: 'linkedin' }) });
      const data = await r.json();
      if (data.success) showToast(`Post criado em Aprovações (${data.caracteres} chars)`, 'success');
      else showToast(`Erro: ${data.error || 'desconhecido'}`, 'error');
    } catch (e) { showToast(`Erro: ${e.message}`, 'error'); }
  };
  const handleGerarVideoLongo = async (videoId) => {
    if (!clienteAtivo) { showToast('Selecione um cliente primeiro', 'error'); return; }
    showToast('Gerando roteiro YT (~30-60s, alvo 10k+ chars + Storyboard)...', 'info');
    try {
      const r = await apiFetch(`${API_BASE}/maestro/gerar-video-longo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: clienteAtivo, videoId, duracaoAlvoMin: 12 }) });
      const data = await r.json();
      if (data.success) {
        const atingiu = data.atingiu_minimo ? 'OK' : `curto: ${data.caracteres} chars`;
        const sb = data.storyboard ? ` + Storyboard ${data.storyboard.tamanho} chars` : '';
        showToast(`Roteiro criado (${data.caracteres} chars, ${atingiu})${sb}`, 'success');
      }
      else showToast(`Erro: ${data.error || 'desconhecido'}`, 'error');
    } catch (e) { showToast(`Erro: ${e.message}`, 'error'); }
  };

  const renderYtTrends = () => {
    const offline = ytStatus?._offline;
    return (
      <div style={{ padding: '40px 50px', flex: 1, overflowY: 'auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', color: 'var(--accent-mute)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Tendências YouTube — Outliers do Nicho</div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 600, marginTop: '8px' }}>Caçador de Virais</h2>
        </div>

        {offline && (
          <div style={{ background: '#3a1a1a', border: '1px solid var(--err)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
            <div style={{ color: 'var(--err)', fontSize: '12px', fontWeight: 700, marginBottom: '10px', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Backend YouTube-Trends OFFLINE</div>
            <div style={{ color: 'var(--text-2)', fontSize: '13px', marginBottom: '12px' }}>Pra ativar essa aba, abra um terminal e rode (uma vez):</div>
            <pre style={{ background: '#000', padding: '14px', borderRadius: '6px', fontSize: '12px', color: '#0f0', fontFamily: 'var(--font-mono)', overflowX: 'auto' }}>cd C:\Users\55119\Documents\Levi\Milhonario\Mente Milhonaria\20_Projetos\03_App_Trafego\youtube-trends{'\n'}docker compose up -d --build{'\n'}# OU sem Docker:{'\n'}cd backend && uvicorn app.main:app --reload</pre>
          </div>
        )}

        {!offline && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
              <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                <div style={{ fontSize: '10px', color: 'var(--accent)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '12px', fontWeight: 700 }}>Canais Monitorados ({ytCanais.length})</div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <input type="text" placeholder="UCxxxxxxxxxxxxx (YouTube ID)" value={novoYtCanal} onChange={e => setNovoYtCanal(e.target.value)} style={{ flex: 1, padding: '10px', background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '12px', fontFamily: 'var(--font-mono)' }} />
                  <button className="btn-v8 primary" onClick={handleAddYtCanal} style={{ width: 'auto' }}>Add</button>
                </div>
                <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                  {ytCanais.map((c, i) => <div key={i} style={{ fontSize: '12px', color: 'var(--text-2)', padding: '6px 0', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>{c.nome || c.youtube_id}</div>)}
                </div>
              </div>

              <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                <div style={{ fontSize: '10px', color: 'var(--accent)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '12px', fontWeight: 700 }}>Keywords ({ytKeywords.length})</div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <input type="text" placeholder="ex: automação n8n" value={novaYtKeyword} onChange={e => setNovaYtKeyword(e.target.value)} style={{ flex: 1, padding: '10px', background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '12px', fontFamily: 'var(--font-mono)' }} />
                  <button className="btn-v8 primary" onClick={handleAddYtKeyword} style={{ width: 'auto' }}>Add</button>
                </div>
                <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                  {ytKeywords.map((k, i) => <div key={i} style={{ fontSize: '12px', color: 'var(--text-2)', padding: '6px 0', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>{k.termo}</div>)}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', color: 'var(--success)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>Outliers detectados ({ytVideos.length})</div>
              <button className="btn-v8 primary" onClick={handleColetarYt} style={{ width: 'auto', padding: '10px 20px' }}>Coletar Agora</button>
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {ytVideos.length === 0 ? (
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px', color: 'var(--text-3)', fontSize: '13px', fontStyle: 'italic' }}>Nenhum outlier detectado ainda. Adicione canais/keywords e clique em "Coletar Agora".</div>
              ) : (
                ytVideos.slice(0, 30).map(v => (
                  <div key={v.id} style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '14px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>{v.titulo}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{v.canal_nome || v.canal_id} · {v.views} views</div>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                      <div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: v.score_total >= 80 ? '#ff3366' : v.score_total >= 60 ? '#ffb800' : 'var(--success)' }}>{v.score_total?.toFixed?.(0) || 0}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>SCORE</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <button className="btn-v8" onClick={() => handleGerarDeOutlier(v.id)} style={{ fontSize: '11px', padding: '6px 10px', width: 'auto' }} title={clienteAtivo ? `Gerar post curto pra ${clienteAtivo}` : 'Selecione um cliente'}>
                          Gerar post {clienteAtivo ? `(${clienteAtivo})` : ''}
                        </button>
                        <button onClick={() => handleGerarVideoLongo(v.id)} style={{ fontSize: '11px', padding: '6px 10px', width: 'auto', background: '#7c5cff', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }} title={clienteAtivo ? `Gerar roteiro YT 10k+ chars pra ${clienteAtivo} + Storyboard` : 'Selecione um cliente'}>
                          Gerar Roteiro YT
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  if (loading) return <div className="loading">L2 Automation — Inicializando...</div>;

  const COLUMNS = [
    { key: 'approval', label: 'Aguardando Aval' },
    { key: 'cliente_review', label: 'Cliente Aprovando' },
    { key: 'pending', label: 'Estratégicos' },
    { key: 'scheduled', label: 'Agendados' },
    { key: 'published', label: 'Publicados' },
  ];

  return (
    <div className="app-wrapper">
      <aside className="sidebar">
        <div className="sidebar-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '14px', padding: '8px 0 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src="/admin/favicon.svg" alt="L2" style={{ width: 54, height: 54, flexShrink: 0 }} />
            <div style={{ lineHeight: 1.0 }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.85rem', fontWeight: 600, color: '#fff', letterSpacing: '-0.01em' }}>L2</div>
              <div style={{ fontSize: '10px', letterSpacing: '0.42em', color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', marginTop: '2px' }}>Automation</div>
            </div>
          </div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '9.5px', letterSpacing: '0.32em', color: 'var(--text-3)', textTransform: 'uppercase', borderTop: '1px solid var(--border)', paddingTop: '12px', width: '100%' }}>
            IA · Automação · Negócios
          </div>
        </div>
        <nav>
          <button className={`nav-item ${view === 'inicio' ? 'active' : ''}`} onClick={() => setView('inicio')}>Início</button>
          <button className={`nav-item ${view === 'kanban' ? 'active' : ''}`} onClick={() => setView('kanban')}>Kanban</button>
          <button className={`nav-item ${view === 'inbox' ? 'active' : ''}`} onClick={() => setView('inbox')}>Inbox</button>
          <button className={`nav-item ${view === 'leads' ? 'active' : ''}`} onClick={() => setView('leads')}>Leads</button>
          <button className={`nav-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>Dashboard</button>
          <button className={`nav-item ${view === 'posts' ? 'active' : ''}`} onClick={() => setView('posts')}>Posts</button>
          <button className={`nav-item ${view === 'roteiros' ? 'active' : ''}`} onClick={() => setView('roteiros')}>Roteiros</button>
          <button className={`nav-item ${view === 'ideias' ? 'active' : ''}`} onClick={() => setView('ideias')}>Ideias</button>
          <button className={`nav-item ${view === 'cerebro' ? 'active' : ''}`} onClick={() => setView('cerebro')}>Cérebro</button>
          <button className={`nav-item ${view === 'ia' ? 'active' : ''}`} onClick={() => setView('ia')}>Fila IA</button>
          <button className={`nav-item ${view === 'config' ? 'active' : ''}`} onClick={() => setView('config')}>Configurar</button>
          <button className={`nav-item ${view === 'comecar' ? 'active' : ''}`} onClick={() => setView('comecar')}>Como Começar</button>
          <button className={`nav-item ${view === 'sobre' ? 'active' : ''}`} onClick={() => setView('sobre')}>Sobre</button>
          <button className={`nav-item ${view === 'aprovacoes' ? 'active' : ''}`} onClick={() => setView('aprovacoes')}>Aprovações (LMP)</button>
          <button className={`nav-item ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView('calendar')}>Calendário</button>
          <button className={`nav-item ${view === 'escritorio' ? 'active' : ''}`} onClick={() => setView('escritorio')}>Escritório 3D</button>
          {authedUser?.role === 'admin' && (
            <button className={`nav-item ${view === 'usuarios' ? 'active' : ''}`} onClick={() => setView('usuarios')}>Usuários</button>
          )}
        </nav>
        {authedUser && (
          <div style={{
            marginTop: 'auto',
            padding: '14px 12px',
            borderTop: '1px solid var(--border)',
            fontSize: 11,
            color: 'var(--text-3)',
            fontFamily: 'var(--font-mono)',
          }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ opacity: 0.6 }}>logado:</span><br />
              <strong style={{ color: 'var(--text-1)' }}>{authedUser.username}</strong>
              {authedUser.role === 'admin' && <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.6 }}>(admin)</span>}
            </div>
            <button
              onClick={onLogout}
              style={{
                width: '100%',
                padding: '6px 10px',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-2)',
                borderRadius: 4,
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >Sair</button>
          </div>
        )}
      </aside>
      <main className="main-area">
        <header className="header-v8">
          <h2>L2 Automation</h2>
          <div className="status-group">
            <div className="cliente-switcher">
              <label className="cliente-switcher-label">Cliente Ativo</label>
              <select className="cliente-switcher-select" value={clienteAtivo} onChange={e => setClienteAtivo(e.target.value)}>
                {clientes.map(c => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
              </select>
            </div>
            {clienteAtivo !== 'levi-mp' && (
              <button className="btn-v8" style={{ width: 'auto', padding: '8px 14px', fontSize: '10px' }} onClick={handleGerarLinkAprovacao} title="Gera link público pro cliente final aprovar as peças em Cliente Aprovando">
                Link p/ Cliente
              </button>
            )}
            <div className="notif-wrapper">
              <button className="notif-btn" onClick={abrirNotificacoes} title="Notificações do sistema">
                <span>Notif</span>
                {notifCount > 0 && <span className="notif-badge">{notifCount}</span>}
              </button>
              {notifOpen && (
                <div className="notif-dropdown">
                  <div className="notif-dropdown-header">
                    <span>Notificações ({notifList.length})</span>
                    {notifList.some(n => !n.lida) && <button className="notif-mark-all" onClick={handleMarcarTodasLidas}>Marcar todas lidas</button>}
                  </div>
                  {notifList.length === 0 && <div className="notif-empty">Sem notificações.</div>}
                  {notifList.map(n => (
                    <div key={n.id} className={`notif-item ${n.lida ? 'lida' : ''} sev-${n.severidade}`} onClick={() => !n.lida && handleMarcarNotifLida(n.id)}>
                      <div className="notif-titulo">{n.titulo}</div>
                      {n.mensagem && <div className="notif-msg">{n.mensagem}</div>}
                      <div className="notif-meta">{n.tipo} · {n.created_at?.slice(0,16).replace('T',' ')}{n.cliente_slug ? ' · ' + n.cliente_slug : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="status-badge"><div className="dot"></div> LinkedIn</div>
            <div className="status-badge" style={{ color: 'var(--accent)' }}>LEVI MP.</div>
          </div>
        </header>
        {view === 'inicio' ? (
          <div style={{ padding: '40px 50px', overflowY: 'auto' }}>
            <div style={{ marginBottom: 36 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.03em', textTransform: 'uppercase', background: 'linear-gradient(180deg,#fff,#888)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>O que você quer fazer?</h2>
              <p style={{ marginTop: 8, color: 'var(--text-3)', fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600 }}>Atalhos pra cada ferramenta · clique e abre nessa tela</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
              {[
                { id: 'comecar', icon: '→', title: 'Como Começar', desc: 'Wizard de setup em 7 passos. Comece aqui se for tua primeira vez.', highlight: true },
                { id: 'config', icon: '⚙', title: 'Configurar', desc: 'Define que empresa prospectar (CNAE, UF, porte). Personas de copy.' },
                { id: 'inbox', icon: '✉', title: 'Inbox', desc: 'Mensagens geradas esperando teu OK. Aprovar, editar, rejeitar.' },
                { id: 'leads', icon: '◎', title: 'Leads', desc: 'Filtra por status, BANT, UF. Detalhe com conversas e follow-ups.' },
                { id: 'dashboard', icon: '▤', title: 'Dashboard', desc: 'Métricas do funil, performance por canal, saúde dos agentes.' },
                { id: 'posts', icon: '◫', title: 'Posts', desc: 'LinkedIn / Instagram gerados pelo Claude Max. Aprovar.' },
                { id: 'roteiros', icon: '▶', title: 'Roteiros', desc: 'Reels / Shorts / YouTube com gancho, cenas, CTA.' },
                { id: 'ideias', icon: '✦', title: 'Ideias', desc: 'Banco de ideias / transcrições do Drive pra alimentar conteúdo.' },
                { id: 'cerebro', icon: '◉', title: 'Cérebro', desc: '7 livros de persuasão (Kahneman, Damásio, Sobral, Clássicos).' },
                { id: 'ia', icon: '⚡', title: 'Fila IA', desc: 'Tarefas esperando teu worker Claude Max processar localmente.' },
                { id: 'sobre', icon: '?', title: 'Sobre o sistema', desc: 'O que cada um dos 15 agentes faz. Explicado em português.' },
                { id: 'escritorio', icon: '◭', title: 'Escritório 3D', desc: 'Visualização espacial dos agentes — agora com dados reais.' },
              ].map(card => (
                <button key={card.id} onClick={() => setView(card.id)} style={{
                  textAlign: 'left', cursor: 'pointer',
                  background: card.highlight ? 'rgba(255,210,74,0.06)' : 'var(--surface-1)',
                  border: '1px solid', borderColor: card.highlight ? 'rgba(255,210,74,0.40)' : 'var(--border)',
                  borderRadius: 8, padding: '26px 28px', color: 'var(--text)',
                  fontFamily: 'inherit', transition: 'all 0.25s ease', display: 'flex', flexDirection: 'column', minHeight: 170, position: 'relative', overflow: 'hidden'
                }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 18px 50px rgba(255,210,74,0.12)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = card.highlight ? 'rgba(255,210,74,0.40)' : 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ width: 44, height: 44, border: '1px solid var(--border-hover)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontSize: 18, fontWeight: 900, marginBottom: 18, background: 'radial-gradient(circle at 30% 30%, rgba(255,210,74,0.20), transparent 70%)', textShadow: '0 0 12px var(--accent-glow-strong)' }}>{card.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.015em', textTransform: 'uppercase', marginBottom: 8, color: card.highlight ? 'var(--accent)' : 'var(--text)' }}>{card.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.55, letterSpacing: '0.02em' }}>{card.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ) : STANDALONE_VIEWS[view] ? (
          <iframe src={STANDALONE_VIEWS[view]} style={{ width: '100%', height: '100%', border: 'none', flex: 1, background: 'var(--bg)' }} title={view} />
        ) : view === 'kanban' ? (
          <div className="kanban-board">
            {COLUMNS.map(col => {
              const colPosts = posts.filter(p => p.status === col.key);
              const postsCount = colPosts.filter(p => p.tipo === 'post').length;
              const storiesCount = colPosts.filter(p => p.tipo === 'story').length;
              return (
                <div key={col.key} className="kanban-column" onDragOver={onDragOver} onDrop={(e) => onDrop(e, col.key)}>
                  <div className="column-header">
                    <h3>{col.label}</h3>
                    <span className="column-count" title={`${postsCount} posts · ${storiesCount} stories`}>
                      {colPosts.length}{postsCount + storiesCount > 0 ? ` · ${postsCount}P/${storiesCount}S` : ''}
                    </span>
                  </div>
                  <div className="column-content">{colPosts.map(renderCard)}</div>
                </div>
              );
            })}
          </div>
        ) : view === 'NETWORK_LEGADO_REMOVIDO' ? (
          <div style={{ display: 'none' }}>
            <div className="rede-neural-real-DEAD" style={{ display: 'none' }}>
              <div className="rede-cabecalho">
                <h3>Sala dos Agentes — Hierarquia e Atividade</h3>
                <div className="rede-subtitulo">Atualiza a cada 5s · {agentesStatus.length} agentes · Maestro orquestra os demais</div>
              </div>

              {/* SALA DOS AGENTES — desativada por enquanto (problema visual no setup, voltar depois) */}
              <div className="sala-container" style={{ display: 'none' }}>
                <svg className="sala-svg" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid meet">
                  {/* Sem defs — todos os personagens e mobilias inline pra garantir render */}

                  {/* Parede (topo) */}
                  <rect x="0" y="0" width="1000" height="110" className="parede-fundo" />
                  <rect x="0" y="110" width="1000" height="6" fill="#0d0a07" opacity="0.9" />

                  {/* Janelas no topo (decoracao) */}
                  <g>
                    <rect className="janela" x="60" y="20" width="80" height="55" rx="2" />
                    <rect className="janela-luz" x="62" y="22" width="76" height="51" rx="1" />
                    <rect className="janela" x="860" y="20" width="80" height="55" rx="2" />
                    <rect className="janela-luz" x="862" y="22" width="76" height="51" rx="1" />
                  </g>

                  {/* Piso */}
                  <rect x="0" y="118" width="1000" height="522" className="piso-fundo" />

                  {/* Tapetes embaixo das estacoes */}
                  <rect x="50" y="150" width="190" height="135" fill="rgba(201,168,76,0.05)" rx="3" />
                  <rect x="280" y="150" width="190" height="135" fill="rgba(201,168,76,0.05)" rx="3" />
                  <rect x="530" y="150" width="190" height="135" fill="rgba(201,168,76,0.05)" rx="3" />
                  <rect x="760" y="150" width="190" height="135" fill="rgba(201,168,76,0.05)" rx="3" />
                  <rect x="170" y="430" width="190" height="135" fill="rgba(201,168,76,0.05)" rx="3" />
                  <rect x="640" y="430" width="190" height="135" fill="rgba(201,168,76,0.05)" rx="3" />
                  {/* Tapete grande embaixo da sala do maestro */}
                  <ellipse cx="500" cy="500" rx="200" ry="80" fill="rgba(201,168,76,0.07)" />

                  {/* Faixa logo */}
                  <g transform="translate(380 615)">
                    <rect x="0" y="0" width="240" height="20" rx="2" fill="rgba(201,168,76,0.1)" stroke="var(--border)" />
                    <text x="120" y="14" textAnchor="middle" fontSize="11" className="logo-empresa">L2 AUTOMATION</text>
                  </g>

                  {/* SALA CENTRAL DO MAESTRO */}
                  {(() => {
                    const statusPorNome = Object.fromEntries(agentesStatus.map(a => [a.nome, a]));
                    const statMaestro = statusPorNome['maestro'] || {};
                    const corpoCls = statMaestro.status === 'rodando' || statMaestro.status === 'recente' ? 'corpo trabalhando' : 'corpo idle';
                    return (
                      <g transform="translate(370 320)">
                        <rect className="estacao-frame maestro" x="0" y="0" width="260" height="200" rx="6" />
                        <text className="estacao-label maestro" x="130" y="16" textAnchor="middle">SALA DO MAESTRO</text>
                        {/* lampada */}
                        <circle className="lampada acesa" cx="130" cy="30" r="14" />
                        <line x1="130" y1="0" x2="130" y2="16" stroke="#444" strokeWidth="1" />
                        {/* mesa grande */}
                        <rect className="mesa" x="50" y="120" width="160" height="8" rx="1" />
                        <rect className="mesa-tampo" x="50" y="115" width="160" height="6" rx="1" />
                        <rect className="monitor" x="100" y="90" width="60" height="30" rx="1" />
                        <rect className="monitor-base" x="125" y="120" width="10" height="4" />
                        {/* cadeira */}
                        <ellipse className="cadeira" cx="130" cy="158" rx="20" ry="5" />
                        <rect className="cadeira" x="128" y="148" width="4" height="14" />
                        <rect className="cadeira" x="112" y="135" width="36" height="14" rx="2" />
                        {/* Maestro (com gravata) */}
                        <g className={corpoCls} transform="translate(130 175)">
                          <Character corRoupa="#1a1a1a" />
                          <polygon points="-1.5,-22 -2,-12 0,-9 2,-12 1.5,-22" fill="#c9a84c" />
                          <text y="32" textAnchor="middle" fill="#c9a84c" fontSize="12" fontWeight="700">Maestro</text>
                        </g>
                      </g>
                    );
                  })()}

                  {/* 6 ESTAÇÕES SATÉLITES */}
                  {(() => {
                    const ESTACOES = [
                      { nome: 'briefing', x: 50, y: 150, roupa: '#3a5a8a', label: 'Briefing', tag: 'preparação' },
                      { nome: 'roteirista', x: 280, y: 150, roupa: '#6a3a3a', label: 'Roteirista', tag: 'criação' },
                      { nome: 'curador', x: 530, y: 150, roupa: '#2a5a3a', label: 'Curador', tag: 'validação' },
                      { nome: 'visual', x: 760, y: 150, roupa: '#5a2a6a', label: 'Visual', tag: 'criação' },
                      { nome: 'seo', x: 170, y: 430, roupa: '#8a7a2a', label: 'SEO', tag: 'otimização' },
                      { nome: 'publicador', x: 640, y: 430, roupa: '#2a5a6a', label: 'Publicador', tag: 'execução' }
                    ];
                    const statusPorNome = Object.fromEntries(agentesStatus.map(a => [a.nome, a]));
                    return ESTACOES.map(e => {
                      const stat = statusPorNome[e.nome] || {};
                      const trabalhando = stat.status === 'rodando' || stat.status === 'recente';
                      const offline = stat.status === 'degradado';
                      const corpoCls = `corpo ${trabalhando ? 'trabalhando' : offline ? 'offline' : 'idle'}`;
                      const runs24 = stat.runs_24h ?? 0;
                      const erros = stat.erros_24h ?? 0;
                      return (
                        <g key={e.nome} transform={`translate(${e.x} ${e.y})`}>
                          <EstacaoMobilia />
                          {/* personagem na cadeira */}
                          <g className={corpoCls} transform="translate(80 100)" style={{ '--cor-roupa': e.roupa }}>
                            <Character corRoupa={e.roupa} />
                            <text className="nome-agente" y="22" textAnchor="middle" fill="#e8e8e8" fontSize="10" fontWeight="700">{e.label}</text>
                            {runs24 > 0 && (
                              <g transform="translate(14 -42)">
                                <circle className="badge-runs" r="9" fill={erros > 0 ? '#b04a4a' : '#4ca85c'} stroke="#000" strokeWidth="0.5" />
                                <text y="3" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">{runs24}</text>
                              </g>
                            )}
                          </g>
                          {/* tag de funcao */}
                          <text x="80" y="138" textAnchor="middle" className="tag-funcao">{e.tag}</text>
                        </g>
                      );
                    });
                  })()}

                  {/* Linhas Maestro → cada agente (linhas de comando quando trabalhando) */}
                  {(() => {
                    const statusPorNome = Object.fromEntries(agentesStatus.map(a => [a.nome, a]));
                    const POSICOES_DESTINO = {
                      briefing: { x: 130, y: 250 },
                      roteirista: { x: 360, y: 250 },
                      curador: { x: 610, y: 250 },
                      visual: { x: 840, y: 250 },
                      seo: { x: 250, y: 510 },
                      publicador: { x: 720, y: 510 }
                    };
                    return Object.entries(POSICOES_DESTINO).map(([nome, pos]) => {
                      const stat = statusPorNome[nome] || {};
                      const ativo = stat.status === 'rodando' || stat.status === 'recente';
                      return (
                        <line key={`cmd-${nome}`} x1="500" y1="380" x2={pos.x} y2={pos.y}
                          className={`linha-comando ${ativo ? 'ativa' : ''}`} />
                      );
                    });
                  })()}
                </svg>
              </div>

              <div className="agentes-grid">
                {agentesStatus.map(a => {
                  const ICONES = { briefing: '🧠', roteirista: '🎬', curador: '🛡️', visual: '🎨', maestro: '🎼', publicador: '📡' };
                  const LABELS = { briefing: 'Briefing', roteirista: 'Roteirista', curador: 'Curador', visual: 'Visual', maestro: 'Maestro', publicador: 'Publicador' };
                  const DESCRICAO = {
                    briefing: 'Extrai DNA estruturado do vault',
                    roteirista: 'Gera texto de posts/stories',
                    curador: 'Valida texto contra negativas do DNA',
                    visual: 'Gera imagem postavel',
                    maestro: 'Orquestra ciclo mensal',
                    publicador: 'Publica em LI/IG no horario'
                  };
                  const segTxt = a.segundos_desde_ultimo === null ? 'nunca' :
                    a.segundos_desde_ultimo < 60 ? `${a.segundos_desde_ultimo}s atrás` :
                    a.segundos_desde_ultimo < 3600 ? `${Math.floor(a.segundos_desde_ultimo/60)}min atrás` :
                    a.segundos_desde_ultimo < 86400 ? `${Math.floor(a.segundos_desde_ultimo/3600)}h atrás` :
                    `${Math.floor(a.segundos_desde_ultimo/86400)}d atrás`;
                  const proxTxt = a.proximo_run ? new Date(a.proximo_run).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : (a.cron_ativo ? 'em breve' : '—');
                  return (
                    <div key={a.nome} className={`agente-card status-${a.status}`}>
                      <div className="agente-card-top">
                        <span className="agente-icone">{ICONES[a.nome] || '🤖'}</span>
                        <div>
                          <div className="agente-nome">{LABELS[a.nome] || a.nome}</div>
                          <div className="agente-descricao">{DESCRICAO[a.nome] || ''}</div>
                        </div>
                      </div>
                      <div className="agente-status-pill">{a.status}</div>
                      <div className="agente-stats">
                        <div className="agente-stat-row"><span>Último run</span><span>{segTxt}</span></div>
                        <div className="agente-stat-row"><span>Próximo run</span><span>{proxTxt}</span></div>
                        <div className="agente-stat-row"><span>Runs 24h</span><span>{a.runs_24h}{a.erros_24h > 0 ? ` · ${a.erros_24h} erros` : ''}</span></div>
                        <div className="agente-stat-row"><span>Cron</span><span>{a.cron_ativo ? 'ATIVO' : 'manual'}</span></div>
                      </div>
                      {a.ultimo_erro && <div className="agente-ultimo-erro" title={a.ultimo_erro}>Último erro: {a.ultimo_erro.slice(0, 60)}…</div>}
                    </div>
                  );
                })}
              </div>

              <div className="agentes-feed">
                <h4>Feed de Atividade (últimas 20 execuções)</h4>
                <div className="feed-lista">
                  {agentesRuns.length === 0 && <div className="feed-vazio">Nenhuma execução ainda nesta janela.</div>}
                  {agentesRuns.map(r => (
                    <div key={r.id} className={`feed-item ${r.erro ? 'feed-erro' : ''}`}>
                      <span className="feed-timestamp">{r.created_at?.slice(11, 19)}</span>
                      <span className="feed-agente">{r.agente}</span>
                      <span className="feed-modo">{r.modo}</span>
                      {r.cliente_slug && <span className="feed-cliente">{r.cliente_slug}</span>}
                      <span className="feed-duracao">{r.duracao_ms ?? '—'}ms</span>
                      {r.erro && <span className="feed-erro-msg">erro: {r.erro.slice(0, 70)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="maestro-console-wrapper">
              <div className="console-header">
                <div className="console-actions">
                  <div className="console-btn r"></div>
                  <div className="console-btn y"></div>
                  <div className="console-btn g"></div>
                </div>
                Maestro Interactive Terminal
              </div>
              <div className="console-body">
                {maestroHistory.map((msg, i) => {
                  const isLevi = msg.sender === 'Maestro Levi';
                  const isSys = msg.sender === 'Sistema';
                  const pClass = isLevi ? 'prompt-levi' : (isSys ? 'prompt-system' : 'prompt-agent');
                  const char = isLevi ? '>' : '•';
                  return (
                    <div key={i} style={{ whiteSpace: 'pre-wrap' }}>
                      <span className={`prompt-prefix ${pClass}`}>{char} </span> 
                      <span style={{ fontWeight: 800 }}>{msg.sender}:</span> {msg.text}
                    </div>
                  );
                })}
                {maestroLoading && <div><span className="prompt-prefix prompt-agent">• </span> <span style={{ fontWeight: 800 }}>Agente Maestro:</span> Processando...</div>}
              </div>
              <div className="console-input-area">
                <span className="prompt-prefix prompt-levi">{'>'}</span>
                <input 
                  type="text" 
                  value={maestroInput} 
                  onChange={e => setMaestroInput(e.target.value)} 
                  onKeyDown={handleMaestroCommand}
                  placeholder="Comando operacional..."
                  disabled={maestroLoading}
                  autoFocus
                />
              </div>
            </div>
          </div>
        ) : view === 'calendar' ? renderCalendar() : view === 'miner' ? renderMinerReport() : view === 'cerebro' ? renderCerebro() : view === 'roteiros' ? renderRoteiros() : view === 'aprovacoes' ? renderAprovacoes() : view === 'trafego' ? renderTrafego() : view === 'yt-trends' ? renderYtTrends() : view === 'escritorio' ? <OfficeArena /> : view === 'usuarios' ? <Usuarios authedUser={authedUser} /> : renderAnalytics()}
      </main>
      {toast && <div className="toast-v8">{toast.msg}</div>}
      {showNewPost && (
        <div className="modal-v8" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#111', padding: '40px', borderRadius: '20px', width: '600px', border: '1px solid #333' }}>
            <h3 style={{ color: 'var(--accent)', marginBottom: '20px' }}>NOVO POST</h3>
            <input type="text" placeholder="Título" value={newPostData.title} onChange={e => setNewPostData({ ...newPostData, title: e.target.value })} style={{ width: '100%', padding: '12px', marginBottom: '12px', background: '#000', border: '1px solid #333', color: '#fff' }} />
            <textarea placeholder="Conteúdo..." value={newPostData.content} onChange={e => setNewPostData({ ...newPostData, content: e.target.value })} style={{ width: '100%', minHeight: '180px', padding: '12px', marginBottom: '20px', background: '#000', border: '1px solid #333', color: '#fff' }} />
            <div style={{ display: 'flex', gap: '12px' }}><button onClick={handleCreatePost} className="btn-v8 primary">Enviar</button><button onClick={() => setShowNewPost(false)} className="btn-v8">Cancelar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;
