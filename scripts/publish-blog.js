#!/usr/bin/env node
/**
 * publish-blog.js
 *
 * Roda diariamente (Coolify Scheduled Task) ou manualmente.
 * Lê todos os JSONs em /posts/, gera HTML estático em /blog/ pra cada post
 * cuja publishDate <= hoje, atualiza /blog/index.html e /sitemap.xml.
 *
 * Uso:
 *   node scripts/publish-blog.js           # gera só posts já vencidos (cron diário)
 *   node scripts/publish-blog.js --all     # força gerar todos (incluindo futuros) — útil pra preview
 *   node scripts/publish-blog.js --post N  # gera só o post com data <= hoje OU número N
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const BLOG_DIR = path.join(ROOT, 'blog');
const SITE_URL = 'https://l2automation.com.br';
const FORCE_ALL = process.argv.includes('--all');

if (!fs.existsSync(BLOG_DIR)) fs.mkdirSync(BLOG_DIR, { recursive: true });

const today = new Date().toISOString().split('T')[0];

// Lê todos os posts
const postFiles = fs.readdirSync(POSTS_DIR)
  .filter(f => f.endsWith('.json'))
  .sort();

const allPosts = postFiles.map(f => {
  const data = JSON.parse(fs.readFileSync(path.join(POSTS_DIR, f), 'utf8'));
  data._file = f;
  return data;
});

// Filtra os que devem estar publicados
const toPublish = allPosts.filter(p => FORCE_ALL || p.publishDate <= today);

console.log(`Hoje: ${today}`);
console.log(`Posts encontrados: ${allPosts.length}`);
console.log(`A publicar: ${toPublish.length}`);

// Markdown → HTML simplificado (sem dependências externas)
function mdToHtml(md) {
  return md
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/<\/blockquote>\n<blockquote>/g, '<br/>')
    // Tabelas (formato GFM básico)
    .replace(/((?:^\|.+\|\n)+)/gm, table => {
      const rows = table.trim().split('\n');
      const header = rows[0].split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      const body = rows.slice(2).map(row => {
        const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
    })
    // Listas com -
    .replace(/((?:^- .+\n?)+)/gm, list => {
      const items = list.trim().split('\n').map(l => `<li>${l.replace(/^- /, '')}</li>`).join('');
      return `<ul>${items}</ul>`;
    })
    // Listas numeradas
    .replace(/((?:^\d+\. .+\n?)+)/gm, list => {
      const items = list.trim().split('\n').map(l => `<li>${l.replace(/^\d+\.\s/, '')}</li>`).join('');
      return `<ol>${items}</ol>`;
    })
    // Parágrafos
    .split(/\n\n+/)
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (/^<(h[1-6]|ul|ol|table|blockquote)/.test(block)) return block;
      return `<p>${block.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');
}

// Template do post individual
function renderPost(post, allPosts) {
  const html = mdToHtml(post.content);
  const url = `${SITE_URL}/blog/${post.slug}`;
  const publishedAt = new Date(post.publishDate + 'T' + (post.publishTime || '08:00') + ':00-03:00').toISOString();

  // Posts relacionados: mesma categoria, exclui este, max 3
  const related = allPosts
    .filter(p => p.slug !== post.slug && p.category === post.category && p.publishDate <= today)
    .slice(0, 3);

  // JSON-LD Schema.org
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.title,
    "description": post.description,
    "author": { "@type": "Organization", "name": post.author || "L2 Automations" },
    "publisher": {
      "@type": "Organization",
      "name": "L2 Automations",
      "logo": { "@type": "ImageObject", "url": `${SITE_URL}/logo.svg` }
    },
    "datePublished": publishedAt,
    "dateModified": publishedAt,
    "mainEntityOfPage": { "@type": "WebPage", "@id": url },
    "keywords": post.keywords,
    "articleSection": post.category
  };

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escapeHtml(post.title)} | L2 Automations</title>
  <meta name="description" content="${escapeHtml(post.description)}"/>
  <meta name="keywords" content="${escapeHtml(post.keywords || '')}"/>
  <meta name="author" content="${escapeHtml(post.author || 'L2 Automations')}"/>
  <link rel="canonical" href="${url}"/>

  <!-- Open Graph -->
  <meta property="og:type" content="article"/>
  <meta property="og:title" content="${escapeHtml(post.title)}"/>
  <meta property="og:description" content="${escapeHtml(post.description)}"/>
  <meta property="og:url" content="${url}"/>
  <meta property="og:site_name" content="L2 Automations"/>
  <meta property="og:image" content="${SITE_URL}${post.ogImage || '/img/bg-manifesto.webp'}"/>
  <meta property="article:published_time" content="${publishedAt}"/>
  <meta property="article:section" content="${escapeHtml(post.category)}"/>
  ${(post.tags || []).map(t => `<meta property="article:tag" content="${escapeHtml(t)}"/>`).join('\n  ')}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${escapeHtml(post.title)}"/>
  <meta name="twitter:description" content="${escapeHtml(post.description)}"/>
  <meta name="twitter:image" content="${SITE_URL}${post.ogImage || '/img/bg-manifesto.webp'}"/>

  <!-- Schema.org Article -->
  <script type="application/ld+json">${JSON.stringify(schema)}</script>

  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,600&display=swap" rel="stylesheet"/>

  <!-- Analytics -->
  <script type="text/javascript">
    (function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "wx8e6qbkzf");
  </script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-D6C6KV9KJX"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-D6C6KV9KJX');
  </script>

  <style>
    :root{--black:#08080A;--black2:#0D0D10;--gold:#D4AF37;--white:#F5F5F0;--mute:rgba(245,245,240,.55);--line:rgba(212,175,55,.16);--sans:'Inter Tight',sans-serif;--serif:'Playfair Display',serif;}
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
    body{background:var(--black);color:var(--white);font-family:var(--sans);-webkit-font-smoothing:antialiased;line-height:1.7;}
    a{color:var(--gold);text-decoration:none;}
    a:hover{text-decoration:underline;}

    /* Top bar */
    .top-bar{position:fixed;top:0;left:0;right:0;background:rgba(8,8,10,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);z-index:100;padding:18px 40px;display:flex;align-items:center;justify-content:space-between;}
    .top-bar a.brand{display:flex;align-items:center;gap:12px;color:var(--white);font-size:14px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;}
    .top-bar a.brand:hover{text-decoration:none;}
    .top-bar a.brand svg{flex-shrink:0;}
    .top-bar .nav-right{display:flex;align-items:center;gap:28px;}
    .top-bar .nav-right a{font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--mute);}
    .top-bar .nav-right a:hover{color:var(--gold);text-decoration:none;}
    .top-bar .nav-right a.btn{padding:10px 22px;border:1px solid var(--gold);color:var(--gold);}
    .top-bar .nav-right a.btn:hover{background:var(--gold);color:var(--black);}

    /* Article container */
    article{max-width:760px;margin:120px auto 80px;padding:0 32px;}
    .article-header{margin-bottom:48px;}
    .article-category{font-size:11px;font-weight:800;letter-spacing:.3em;text-transform:uppercase;color:var(--gold);margin-bottom:18px;display:inline-block;}
    .article-title{font-size:clamp(32px,4.5vw,52px);font-weight:900;letter-spacing:-.025em;line-height:1.08;margin-bottom:22px;}
    .article-meta{font-size:13px;color:var(--mute);display:flex;gap:18px;align-items:center;flex-wrap:wrap;}
    .article-meta time{color:var(--mute);}
    .article-meta .sep{opacity:.4;}

    /* Conteúdo */
    .article-content{font-size:17px;color:rgba(245,245,240,.86);}
    .article-content > * + *{margin-top:24px;}
    .article-content h1{font-size:clamp(28px,4vw,40px);font-weight:900;letter-spacing:-.02em;line-height:1.15;margin-top:56px;}
    .article-content h2{font-size:clamp(24px,3vw,32px);font-weight:900;letter-spacing:-.02em;line-height:1.2;margin-top:56px;color:var(--white);}
    .article-content h3{font-size:clamp(19px,2.2vw,23px);font-weight:800;letter-spacing:-.01em;margin-top:40px;color:var(--white);}
    .article-content p{line-height:1.78;}
    .article-content strong{color:var(--white);font-weight:700;}
    .article-content em{font-family:var(--serif);font-style:italic;color:var(--gold);}
    .article-content a{color:var(--gold);text-decoration:underline;text-underline-offset:3px;}
    .article-content ul,.article-content ol{padding-left:24px;}
    .article-content li{margin-bottom:10px;line-height:1.7;}
    .article-content blockquote{border-left:3px solid var(--gold);padding:18px 24px;background:rgba(212,175,55,.05);font-style:italic;color:var(--white);font-size:18px;line-height:1.6;border-radius:0 4px 4px 0;}
    .article-content table{width:100%;border-collapse:collapse;margin:32px 0;font-size:14px;}
    .article-content th{background:rgba(212,175,55,.08);padding:12px 14px;text-align:left;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);border-bottom:1px solid var(--line);}
    .article-content td{padding:14px;border-bottom:1px solid rgba(245,245,240,.06);color:rgba(245,245,240,.8);}
    .article-content tr:last-child td{border-bottom:none;}

    /* CTA block (Final do post) */
    .post-cta{margin-top:80px;padding:48px 40px;background:linear-gradient(135deg,#0f0f12 0%,#18140a 100%);border:1px solid var(--line);border-radius:6px;text-align:center;}
    .post-cta h3{font-size:28px;font-weight:900;letter-spacing:-.02em;margin-bottom:14px;color:var(--white);}
    .post-cta p{color:var(--mute);max-width:42ch;margin:0 auto 28px;font-size:15px;line-height:1.65;}
    .post-cta a.cta-button{display:inline-block;padding:18px 44px;background:var(--gold);color:var(--black);font-size:11px;font-weight:900;letter-spacing:.3em;text-transform:uppercase;border-radius:3px;text-decoration:none;transition:transform .3s,box-shadow .3s;}
    .post-cta a.cta-button:hover{transform:translateY(-2px);box-shadow:0 18px 40px -10px rgba(212,175,55,.4);text-decoration:none;}

    /* Tags */
    .article-tags{margin-top:48px;padding-top:32px;border-top:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap;}
    .article-tags span{font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--mute);padding:6px 12px;border:1px solid var(--line);border-radius:2px;}

    /* Related posts */
    .related{margin-top:80px;}
    .related h3{font-size:11px;font-weight:800;letter-spacing:.4em;text-transform:uppercase;color:var(--gold);margin-bottom:24px;}
    .related-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;}
    .related-item{padding:24px 22px;background:var(--black2);border:1px solid var(--line);border-radius:4px;transition:border-color .3s,transform .3s;}
    .related-item:hover{border-color:rgba(212,175,55,.35);transform:translateY(-2px);text-decoration:none;}
    .related-item .rel-cat{font-size:9px;font-weight:800;letter-spacing:.25em;text-transform:uppercase;color:var(--gold);margin-bottom:10px;}
    .related-item .rel-title{font-size:15px;font-weight:700;letter-spacing:-.01em;color:var(--white);line-height:1.4;}

    /* Footer */
    footer{margin-top:120px;padding:60px 40px;border-top:1px solid var(--line);text-align:center;color:rgba(245,245,240,.35);font-size:11px;letter-spacing:.1em;}

    /* FAB WhatsApp */
    .wa-float{position:fixed;bottom:24px;right:24px;width:58px;height:58px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;z-index:200;box-shadow:0 14px 32px -8px rgba(37,211,102,.55),0 6px 16px -4px rgba(0,0,0,.4);transition:transform .3s;text-decoration:none;}
    .wa-float:hover{transform:translateY(-3px) scale(1.06);text-decoration:none;}
    .wa-float svg{width:30px;height:30px;}

    @media(max-width:700px){
      .top-bar{padding:14px 18px;}
      .top-bar a.brand{font-size:12px;gap:8px;}
      .top-bar .nav-right{gap:14px;}
      .top-bar .nav-right a:not(.btn){display:none;}
      article{margin:96px auto 60px;padding:0 22px;}
      .article-content{font-size:16px;}
      .post-cta{padding:36px 24px;}
    }
  </style>
</head>
<body>

  <div class="top-bar">
    <a href="/" class="brand">
      <svg width="26" height="28" viewBox="0 0 240 260" fill="none" aria-hidden="true">
        <path d="M 148,18 L 52,18 L 18,54 L 18,154 L 52,190 L 100,190" stroke="#D4AF37" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M 100,190 L 100,200 L 185,200" stroke="#D4AF37" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <circle cx="185" cy="200" r="9" fill="#D4AF37"/>
        <text x="52" y="168" font-family="Inter Tight,sans-serif" font-weight="900" font-size="112" letter-spacing="-4" fill="#FFFFFF">L2</text>
      </svg>
      L2 Automations
    </a>
    <div class="nav-right">
      <a href="/blog/">Blog</a>
      <a href="/#osia">OSIA</a>
      <a href="/diagnostico/">Diagnóstico</a>
      <a href="https://wa.me/5511996112620?text=Ol%C3%A1!%20Vim%20do%20blog%20da%20L2%20Automations." target="_blank" rel="noopener noreferrer" class="btn" data-wa-source="blog-top">Falar Agora</a>
    </div>
  </div>

  <article>
    <header class="article-header">
      <span class="article-category">${escapeHtml(post.category)}</span>
      <h1 class="article-title">${escapeHtml(post.title)}</h1>
      <div class="article-meta">
        <time datetime="${publishedAt}">${formatDate(post.publishDate)}</time>
        <span class="sep">·</span>
        <span>${post.readTime || '6 min'} de leitura</span>
        <span class="sep">·</span>
        <span>${escapeHtml(post.author || 'L2 Automations')}</span>
      </div>
    </header>

    <div class="article-content">
      ${html}
    </div>

    <div class="post-cta">
      <h3>Quer saber se isso se aplica ao seu caso?</h3>
      <p>Agendamos uma sessão diagnóstica de 30 minutos. Sem proposta de venda. Mapeamos os vazamentos do seu funil e quanto isso representa de receita perdida.</p>
      <a href="https://wa.me/5511996112620?text=Ol%C3%A1!%20Li%20o%20post%20sobre%20${encodeURIComponent(post.title.substring(0, 60))}%20e%20quero%20agendar%20um%20diagn%C3%B3stico." target="_blank" rel="noopener noreferrer" class="cta-button" data-wa-source="blog-${post.slug}">Agendar Diagnóstico no WhatsApp</a>
    </div>

    <div class="article-tags">
      ${(post.tags || []).map(t => `<span>${escapeHtml(t)}</span>`).join('')}
    </div>

    ${related.length > 0 ? `
    <div class="related">
      <h3>Continuar lendo</h3>
      <div class="related-list">
        ${related.map(r => `
          <a href="/blog/${r.slug}" class="related-item">
            <div class="rel-cat">${escapeHtml(r.category)}</div>
            <div class="rel-title">${escapeHtml(r.title)}</div>
          </a>
        `).join('')}
      </div>
    </div>
    ` : ''}
  </article>

  <footer>
    © 2026 L2 Automations · Sistema Operacional de IA Integrada
  </footer>

  <a class="wa-float" href="https://wa.me/5511996112620?text=Ol%C3%A1!%20Vim%20do%20blog%20da%20L2." target="_blank" rel="noopener noreferrer" data-wa-source="blog-fab" aria-label="WhatsApp">
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M27.2 4.7C24.3 1.8 20.3.2 16.1.2 7.5.2.5 7.2.5 15.8c0 2.7.7 5.4 2.1 7.7L.4 31.8l8.5-2.2c2.2 1.2 4.7 1.9 7.2 1.9 8.6 0 15.6-7 15.6-15.6 0-4.2-1.6-8.1-4.5-11.2zm-11.1 23.9c-2.2 0-4.4-.6-6.3-1.7l-.4-.3-4.6 1.2 1.2-4.5-.3-.5c-1.2-2-1.9-4.3-1.9-6.7C3.8 9 9.3 3.5 16.1 3.5c3.3 0 6.4 1.3 8.7 3.6 2.3 2.3 3.6 5.4 3.6 8.7 0 6.8-5.5 12.3-12.3 12.3zm6.8-9.2c-.4-.2-2.2-1.1-2.6-1.2-.3-.1-.6-.2-.8.2-.2.4-1 1.2-1.2 1.5-.2.2-.4.3-.8.1-.4-.2-1.6-.6-3-1.9-1.1-1-1.9-2.2-2.1-2.6-.2-.4 0-.6.2-.8.2-.2.4-.4.5-.7.2-.2.2-.4.4-.7.1-.2.1-.5 0-.7-.1-.2-.8-2-1.1-2.7-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.6.1-1 .5-.3.4-1.3 1.3-1.3 3.1 0 1.8 1.3 3.6 1.5 3.9.2.3 2.6 4 6.3 5.6.9.4 1.6.6 2.1.8.9.3 1.7.2 2.3.1.7-.1 2.2-.9 2.5-1.8.3-.9.3-1.6.2-1.8-.1-.2-.4-.3-.7-.5z" fill="#fff"/>
    </svg>
  </a>

  <script>
    document.querySelectorAll('a[data-wa-source]').forEach(link => {
      link.addEventListener('click', () => {
        const source = link.dataset.waSource;
        if (typeof gtag === 'function') gtag('event', 'whatsapp_click', { source: source, event_category: 'engagement', value: 1 });
        if (typeof clarity === 'function') clarity('event', 'whatsapp_click_' + source);
      });
    });
  </script>
</body>
</html>`;
}

// Index do blog (/blog/index.html)
function renderIndex(publishedPosts) {
  // Ordena do mais recente pro mais antigo
  const sorted = [...publishedPosts].sort((a, b) => b.publishDate.localeCompare(a.publishDate));

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Blog L2 Automations — IA, Automação Comercial e Tendências</title>
  <meta name="description" content="Insights sobre IA, automação comercial, vendas B2B e tendências do mercado. Conteúdo para gestores que querem escalar operação com tecnologia."/>
  <link rel="canonical" href="${SITE_URL}/blog/"/>

  <meta property="og:type" content="website"/>
  <meta property="og:title" content="Blog L2 Automations"/>
  <meta property="og:description" content="Insights sobre IA, automação comercial e vendas B2B."/>
  <meta property="og:url" content="${SITE_URL}/blog/"/>
  <meta property="og:site_name" content="L2 Automations"/>

  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;700;900&family=Playfair+Display:ital,wght@1,400;1,600&display=swap" rel="stylesheet"/>

  <!-- Analytics -->
  <script type="text/javascript">
    (function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "wx8e6qbkzf");
  </script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-D6C6KV9KJX"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-D6C6KV9KJX');
  </script>

  <style>
    :root{--black:#08080A;--black2:#0D0D10;--gold:#D4AF37;--white:#F5F5F0;--mute:rgba(245,245,240,.55);--line:rgba(212,175,55,.16);}
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
    body{background:var(--black);color:var(--white);font-family:'Inter Tight',sans-serif;-webkit-font-smoothing:antialiased;}
    a{color:var(--gold);text-decoration:none;}

    .top-bar{position:fixed;top:0;left:0;right:0;background:rgba(8,8,10,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);z-index:100;padding:18px 40px;display:flex;align-items:center;justify-content:space-between;}
    .top-bar a.brand{display:flex;align-items:center;gap:12px;color:var(--white);font-size:14px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;}
    .top-bar .nav-right{display:flex;gap:28px;align-items:center;}
    .top-bar .nav-right a{font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--mute);}
    .top-bar .nav-right a.btn{padding:10px 22px;border:1px solid var(--gold);color:var(--gold);}

    .hero-blog{padding:160px 40px 80px;max-width:1180px;margin:0 auto;text-align:center;}
    .hero-blog .label{font-size:11px;font-weight:800;letter-spacing:.4em;text-transform:uppercase;color:var(--gold);margin-bottom:24px;display:inline-flex;align-items:center;gap:14px;}
    .hero-blog .label::before,.hero-blog .label::after{content:'';width:30px;height:1px;background:var(--gold);opacity:.5;}
    .hero-blog h1{font-size:clamp(40px,5.5vw,68px);font-weight:900;letter-spacing:-.035em;line-height:1.05;max-width:18ch;margin:0 auto;}
    .hero-blog h1 em{font-family:'Playfair Display',serif;font-style:italic;font-weight:400;color:var(--gold);}
    .hero-blog p{margin:28px auto 0;color:var(--mute);font-size:17px;line-height:1.65;max-width:48ch;}

    .posts-grid{max-width:1180px;margin:0 auto;padding:0 40px 100px;display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:28px;}
    .post-card{background:var(--black2);border:1px solid var(--line);border-radius:6px;padding:34px 32px;display:flex;flex-direction:column;gap:18px;text-decoration:none;color:inherit;transition:border-color .35s,transform .35s,box-shadow .35s;}
    .post-card:hover{border-color:rgba(212,175,55,.35);transform:translateY(-3px);box-shadow:0 22px 50px -20px rgba(0,0,0,.6);text-decoration:none;}
    .post-card .pc-cat{font-size:10px;font-weight:800;letter-spacing:.3em;text-transform:uppercase;color:var(--gold);}
    .post-card h2{font-size:21px;font-weight:800;letter-spacing:-.015em;line-height:1.3;color:var(--white);}
    .post-card .pc-desc{color:var(--mute);font-size:14px;line-height:1.65;}
    .post-card .pc-meta{margin-top:auto;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:rgba(245,245,240,.35);padding-top:18px;border-top:1px solid var(--line);}
    .post-card .pc-meta .read{color:var(--gold);font-weight:700;}

    footer{padding:60px 40px;border-top:1px solid var(--line);text-align:center;color:rgba(245,245,240,.35);font-size:11px;letter-spacing:.1em;}

    .wa-float{position:fixed;bottom:24px;right:24px;width:58px;height:58px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;z-index:200;box-shadow:0 14px 32px -8px rgba(37,211,102,.55);text-decoration:none;}
    .wa-float svg{width:30px;height:30px;}

    @media(max-width:700px){
      .top-bar{padding:14px 18px;}
      .top-bar .nav-right a:not(.btn){display:none;}
      .hero-blog{padding:120px 22px 60px;}
      .posts-grid{padding:0 22px 60px;grid-template-columns:1fr;}
    }
  </style>
</head>
<body>

  <div class="top-bar">
    <a href="/" class="brand">
      <svg width="26" height="28" viewBox="0 0 240 260" fill="none" aria-hidden="true">
        <path d="M 148,18 L 52,18 L 18,54 L 18,154 L 52,190 L 100,190" stroke="#D4AF37" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M 100,190 L 100,200 L 185,200" stroke="#D4AF37" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <circle cx="185" cy="200" r="9" fill="#D4AF37"/>
        <text x="52" y="168" font-family="Inter Tight,sans-serif" font-weight="900" font-size="112" letter-spacing="-4" fill="#FFFFFF">L2</text>
      </svg>
      L2 Automations
    </a>
    <div class="nav-right">
      <a href="/">Início</a>
      <a href="/diagnostico/">Diagnóstico</a>
      <a href="https://wa.me/5511996112620?text=Ol%C3%A1!%20Vim%20do%20blog%20da%20L2." target="_blank" rel="noopener noreferrer" class="btn" data-wa-source="blog-index-top">Falar Agora</a>
    </div>
  </div>

  <section class="hero-blog">
    <p class="label">Insights L2 Automations</p>
    <h1>Inteligência aplicada a <em>operações comerciais</em></h1>
    <p>Análises, tendências e estratégias práticas sobre IA, automação comercial e a arquitetura por trás de operações que escalam.</p>
  </section>

  <section class="posts-grid">
    ${sorted.map(p => `
    <a href="/blog/${p.slug}" class="post-card">
      <span class="pc-cat">${escapeHtml(p.category)}</span>
      <h2>${escapeHtml(p.title)}</h2>
      <p class="pc-desc">${escapeHtml(p.description)}</p>
      <div class="pc-meta">
        <time>${formatDate(p.publishDate)}</time>
        <span class="read">${p.readTime || '6 min'}</span>
      </div>
    </a>
    `).join('')}
  </section>

  <footer>
    © 2026 L2 Automations · Sistema Operacional de IA Integrada
  </footer>

  <a class="wa-float" href="https://wa.me/5511996112620?text=Ol%C3%A1!%20Vim%20do%20blog%20da%20L2." target="_blank" rel="noopener noreferrer" data-wa-source="blog-index-fab" aria-label="WhatsApp">
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M27.2 4.7C24.3 1.8 20.3.2 16.1.2 7.5.2.5 7.2.5 15.8c0 2.7.7 5.4 2.1 7.7L.4 31.8l8.5-2.2c2.2 1.2 4.7 1.9 7.2 1.9 8.6 0 15.6-7 15.6-15.6 0-4.2-1.6-8.1-4.5-11.2zm-11.1 23.9c-2.2 0-4.4-.6-6.3-1.7l-.4-.3-4.6 1.2 1.2-4.5-.3-.5c-1.2-2-1.9-4.3-1.9-6.7C3.8 9 9.3 3.5 16.1 3.5c3.3 0 6.4 1.3 8.7 3.6 2.3 2.3 3.6 5.4 3.6 8.7 0 6.8-5.5 12.3-12.3 12.3zm6.8-9.2c-.4-.2-2.2-1.1-2.6-1.2-.3-.1-.6-.2-.8.2-.2.4-1 1.2-1.2 1.5-.2.2-.4.3-.8.1-.4-.2-1.6-.6-3-1.9-1.1-1-1.9-2.2-2.1-2.6-.2-.4 0-.6.2-.8.2-.2.4-.4.5-.7.2-.2.2-.4.4-.7.1-.2.1-.5 0-.7-.1-.2-.8-2-1.1-2.7-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.6.1-1 .5-.3.4-1.3 1.3-1.3 3.1 0 1.8 1.3 3.6 1.5 3.9.2.3 2.6 4 6.3 5.6.9.4 1.6.6 2.1.8.9.3 1.7.2 2.3.1.7-.1 2.2-.9 2.5-1.8.3-.9.3-1.6.2-1.8-.1-.2-.4-.3-.7-.5z" fill="#fff"/>
    </svg>
  </a>

  <script>
    document.querySelectorAll('a[data-wa-source]').forEach(link => {
      link.addEventListener('click', () => {
        const source = link.dataset.waSource;
        if (typeof gtag === 'function') gtag('event', 'whatsapp_click', { source: source, event_category: 'engagement', value: 1 });
        if (typeof clarity === 'function') clarity('event', 'whatsapp_click_' + source);
      });
    });
  </script>
</body>
</html>`;
}

// Sitemap.xml
function renderSitemap(publishedPosts) {
  const today = new Date().toISOString().split('T')[0];
  const urls = [
    { loc: SITE_URL + '/', lastmod: today, priority: '1.0', changefreq: 'weekly' },
    { loc: SITE_URL + '/blog/', lastmod: today, priority: '0.9', changefreq: 'daily' },
    ...publishedPosts.map(p => ({
      loc: `${SITE_URL}/blog/${p.slug}`,
      lastmod: p.publishDate,
      priority: '0.7',
      changefreq: 'monthly'
    }))
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}

// Helpers
function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00-03:00');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// === EXECUÇÃO ===

// Limpa /blog/ exceto subpastas que não foram geradas (não tem)
fs.readdirSync(BLOG_DIR).forEach(f => {
  if (f.endsWith('.html')) fs.unlinkSync(path.join(BLOG_DIR, f));
});

// Gera HTML de cada post publicado
toPublish.forEach(post => {
  const html = renderPost(post, allPosts);
  const outPath = path.join(BLOG_DIR, post.slug + '.html');
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`  ✓ ${post.slug}.html`);
});

// Gera /blog/index.html
fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), renderIndex(toPublish), 'utf8');
console.log(`  ✓ index.html (${toPublish.length} posts listados)`);

// Gera /sitemap.xml
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), renderSitemap(toPublish), 'utf8');
console.log(`  ✓ sitemap.xml`);

console.log('\nConcluído.');
