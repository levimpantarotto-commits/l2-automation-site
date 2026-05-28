import { useEffect, useState } from 'react';

const API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002'}/api`;

const apiFetch = (url, opts = {}) => fetch(url, { ...opts, credentials: opts.credentials ?? 'include' });

export default function Usuarios({ authedUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novoUser, setNovoUser] = useState({ username: '', password: '', email: '', role: 'admin' });
  const [erro, setErro] = useState(null);
  const [criando, setCriando] = useState(false);

  const carregar = async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/auth/users`);
      if (r.ok) {
        const data = await r.json();
        setUsers(data.users || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const criar = async (e) => {
    e.preventDefault();
    setErro(null);
    if (novoUser.password.length < 8) {
      setErro('Senha precisa ter no mínimo 8 caracteres.');
      return;
    }
    setCriando(true);
    try {
      const r = await apiFetch(`${API_BASE}/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novoUser),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(data.error || 'Erro ao criar usuário');
      } else {
        setNovoUser({ username: '', password: '', email: '', role: 'admin' });
        carregar();
      }
    } finally {
      setCriando(false);
    }
  };

  const toggle = async (id) => {
    await apiFetch(`${API_BASE}/auth/users/${id}/toggle`, { method: 'POST' });
    carregar();
  };

  const remover = async (id, username) => {
    if (!confirm(`Remover usuário "${username}"? Essa ação é permanente.`)) return;
    await apiFetch(`${API_BASE}/auth/users/${id}`, { method: 'DELETE' });
    carregar();
  };

  return (
    <div style={{ padding: '40px 50px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: 'var(--accent-mute)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          Administração
        </div>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 600, marginTop: 8 }}>
          Usuários
        </h2>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
          Apenas admins podem ver esta tela. Senhas armazenadas com bcrypt cost 10.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 24, alignItems: 'start' }}>
        {/* Form de novo usuário */}
        <form
          onSubmit={criar}
          style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--success)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 14, fontWeight: 700 }}>
            Adicionar usuário
          </div>

          <Campo label="Username">
            <input value={novoUser.username} onChange={e => setNovoUser({ ...novoUser, username: e.target.value })} required style={inpStyle} disabled={criando} autoComplete="off" />
          </Campo>
          <Campo label="Senha (min 8)">
            <input type="password" value={novoUser.password} onChange={e => setNovoUser({ ...novoUser, password: e.target.value })} required minLength={8} style={inpStyle} disabled={criando} autoComplete="new-password" />
          </Campo>
          <Campo label="Email (opcional)">
            <input type="email" value={novoUser.email} onChange={e => setNovoUser({ ...novoUser, email: e.target.value })} style={inpStyle} disabled={criando} />
          </Campo>
          <Campo label="Role">
            <select value={novoUser.role} onChange={e => setNovoUser({ ...novoUser, role: e.target.value })} style={{ ...inpStyle, height: 38 }} disabled={criando}>
              <option value="admin">admin (acesso total)</option>
              <option value="user">user (sem gerenciar usuários)</option>
            </select>
          </Campo>

          {erro && (
            <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(220, 38, 38, 0.12)', border: '1px solid rgba(220, 38, 38, 0.4)', borderRadius: 4, fontSize: 11, color: '#fecaca' }}>
              {erro}
            </div>
          )}

          <button type="submit" disabled={criando} style={{
            marginTop: 14,
            width: '100%',
            padding: '10px 14px',
            background: criando ? '#3a3f4a' : 'var(--accent)',
            color: '#000',
            border: 'none',
            borderRadius: 6,
            fontWeight: 700,
            letterSpacing: 0.5,
            cursor: criando ? 'wait' : 'pointer',
          }}>
            {criando ? 'Criando…' : 'Criar usuário'}
          </button>
        </form>

        {/* Lista de usuários */}
        <div style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
        }}>
          <div style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 14, fontWeight: 700 }}>
            Usuários ({users.length})
          </div>

          {loading ? (
            <div style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: 13 }}>Carregando…</div>
          ) : users.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: 13 }}>Nenhum usuário ainda.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
                  <th style={th}>username</th>
                  <th style={th}>role</th>
                  <th style={th}>último login</th>
                  <th style={th}>status</th>
                  <th style={{ ...th, textAlign: 'right' }}>ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const eu = u.id === authedUser?.id;
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px dashed var(--border)' }}>
                      <td style={td}>
                        <strong style={{ color: 'var(--text-1)' }}>{u.username}</strong>
                        {eu && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--accent)' }}>(você)</span>}
                        {u.email && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{u.email}</div>}
                      </td>
                      <td style={td}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                          background: u.role === 'admin' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(125, 211, 252, 0.15)',
                          color: u.role === 'admin' ? '#fbbf24' : '#7dd3fc',
                        }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={td}>
                        {u.last_login
                          ? new Date(u.last_login + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                          : <span style={{ color: 'var(--text-3)' }}>nunca</span>}
                      </td>
                      <td style={td}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                          background: u.ativo ? 'rgba(34, 197, 94, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                          color: u.ativo ? '#22c55e' : '#64748b',
                        }}>
                          {u.ativo ? 'ativo' : 'inativo'}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {!eu && (
                          <>
                            <button onClick={() => toggle(u.id)} style={btn}>{u.ativo ? 'Desativar' : 'Ativar'}</button>
                            <button onClick={() => remover(u.id, u.username)} style={{ ...btn, color: '#f87171', marginLeft: 6 }}>Remover</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4, fontWeight: 600 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const inpStyle = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--surface-0)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-1)',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const th = { padding: '8px 6px', fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' };
const td = { padding: '10px 6px', verticalAlign: 'top' };
const btn = {
  appearance: 'none',
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--text-2)',
  padding: '4px 10px',
  borderRadius: 4,
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
