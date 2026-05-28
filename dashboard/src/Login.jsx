import { useState } from 'react';

const API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002'}/api`;

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setErro(null);
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(data.error || 'Falha no login');
        setLoading(false);
        return;
      }
      onLogin?.(data.user);
    } catch {
      setErro('Erro de conexão com o servidor');
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0b1020 0%, #1a1530 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#e5e7eb',
    }}>
      <form
        onSubmit={submit}
        style={{
          width: 360,
          padding: 32,
          background: 'rgba(15, 15, 22, 0.95)',
          border: '1px solid #3a3f4a',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#fbbf24', letterSpacing: 3, textTransform: 'uppercase' }}>
            L2 Automation
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '8px 0 4px', color: '#fef3c7' }}>
            Acesso ao Admin
          </h1>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>
            Painel restrito — necessário usuário e senha.
          </div>
        </div>

        <Label>Usuário</Label>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
          disabled={loading}
          style={inputStyle}
        />

        <Label style={{ marginTop: 14 }}>Senha</Label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
          disabled={loading}
          style={inputStyle}
        />

        {erro && (
          <div style={{
            marginTop: 14,
            padding: '8px 12px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 6,
            fontSize: 12,
            color: '#fecaca',
          }}>
            {erro}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !username.trim() || !password}
          style={{
            width: '100%',
            marginTop: 20,
            padding: '11px 16px',
            background: loading ? '#3a3f4a' : '#fbbf24',
            color: loading ? '#9ca3af' : '#1a1530',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 0.5,
            cursor: loading ? 'wait' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>

        <div style={{ marginTop: 16, fontSize: 10, color: '#6b7280', textAlign: 'center', lineHeight: 1.4 }}>
          Sessão de 7 dias · cookie HTTP-only<br />
          Esqueceu? Reset via CLI: <code style={{ color: '#9ca3af' }}>npm run user:add &lt;u&gt; &lt;senha&gt;</code>
        </div>
      </form>
    </div>
  );
}

function Label({ children, style }) {
  return (
    <div style={{
      fontSize: 10, color: '#9ca3af', letterSpacing: 1.5,
      textTransform: 'uppercase', fontWeight: 600,
      marginBottom: 6, ...style,
    }}>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: '#0b1020',
  border: '1px solid #3a3f4a',
  borderRadius: 6,
  color: '#e5e7eb',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};
