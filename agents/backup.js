// Backup — copia o SQLite pra /data/backups/YYYY-MM-DD.db com rotação (mantém últimos 14).
// Se BACKUP_S3_BUCKET configurado, sobe pro S3 (requer aws cli ou SDK — não embarcado ainda).

const AgenteBase = require('./base');
const fs = require('fs');
const path = require('path');

class Backup extends AgenteBase {
  constructor(db) {
    super(db, 'backup');
    this.timeoutMs = 120000;
  }

  async execute() {
    const dbPath = process.env.DB_PATH || './data/l2.db';
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const ts = new Date().toISOString().slice(0, 10);
    const destino = path.join(backupDir, `l2-${ts}.db`);

    // SQLite tem comando VACUUM INTO pra hot-backup consistente
    try {
      this.db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
    } catch (e) {
      // Fallback: cópia de arquivo (menos consistente)
      fs.copyFileSync(dbPath, destino);
    }

    const stat = fs.statSync(destino);

    this.db.prepare(`
      INSERT INTO backups_log (arquivo, tamanho_bytes, destino, sucesso)
      VALUES (?, ?, 'local', 1)
    `).run(destino, stat.size);

    // Rotação — mantém últimos 14
    const arquivos = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('l2-') && f.endsWith('.db'))
      .map(f => ({ f, mtime: fs.statSync(path.join(backupDir, f)).mtime.getTime() }))
      .sort((a, b) => b.mtime - a.mtime);
    const removidos = [];
    for (const old of arquivos.slice(14)) {
      try { fs.unlinkSync(path.join(backupDir, old.f)); removidos.push(old.f); } catch {}
    }

    return {
      arquivo: destino,
      tamanho_mb: (stat.size / 1024 / 1024).toFixed(2),
      total_backups: arquivos.length,
      removidos,
    };
  }
}

module.exports = Backup;
