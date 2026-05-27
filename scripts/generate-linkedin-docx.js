#!/usr/bin/env node
/**
 * generate-linkedin-docx.js
 * Gera arquivo Word com os 30 posts LinkedIn formatado.
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  LevelFormat, PageBreak, BorderStyle, Table, TableRow, TableCell,
  WidthType, ShadingType, VerticalAlign
} = require('docx');

const GOLD = 'D4AF37';
const DARK = '08080A';
const MUTE = '8C8C85';
const WHITE_ON_BLACK = 'F5F5F0';

// ============================================================
// 30 POSTS
// ============================================================
const POSTS = [
  { n:1, semana:1, dia:'Segunda', categoria:'Provocação', nicho:'Imobiliária',
    texto:`70% dos leads da sua imobiliária morrem antes de você responder.

Não é exagero. É a média brasileira.

Lead clica no anúncio do Meta às 23h de sábado.
Sua equipe responde segunda às 10h.
Ele já fechou com outra imobiliária no domingo.

E você acha que o problema é falta de lead.

Não é.

É problema de arquitetura.

Humano não foi feito pra responder em 5 minutos, 24h por dia, sete dias por semana. Você pode dobrar a equipe. Triplicar. Escalar plantão. O custo cresce linear, o tempo de resposta nunca cai abaixo de 1 hora.

Outras imobiliárias estão respondendo em menos de 1 minuto.
Não com humano. Com infraestrutura.

E essa é a única razão pela qual elas estão crescendo mais que você.

Comenta "FUNIL" que mando o framework dos 3 vazamentos invisíveis do funil imobiliário.

#imobiliaria #automacao #ia` },

  { n:2, semana:1, dia:'Terça', categoria:'Carrossel', nicho:'Imobiliária',
    texto:`Quase toda imobiliária que conheci nos últimos 60 dias tem pelo menos 2 desses 5 sinais.

E nenhum deles é "falta de lead".

Salva esse carrossel pra olhar de novo quando for revisar a operação.

#imobiliaria #gestao #vendas`,
    roteiro:`SLIDE 1 (capa):
5 sinais que sua imobiliária está
PERDENDO DINHEIRO
(e como corrigir cada um)

SLIDE 2:
Sinal 1 — Você não sabe quantos leads chegaram esta semana
→ Centralizar todos os pontos de entrada (Meta, WhatsApp, site, indicação)

SLIDE 3:
Sinal 2 — Tempo médio de primeira resposta acima de 1 hora
→ Separar primeiro contato (automatizado) do fechamento (humano)

SLIDE 4:
Sinal 3 — Corretor escolhe quem atende
→ Distribuição inteligente: round-robin + roteamento por região/valor

SLIDE 5:
Sinal 4 — Você não sabe o que aconteceu com leads de 60 dias atrás
→ Fluxo de nutrição automático (dia 7, 15, 30, 60, 90)

SLIDE 6:
Sinal 5 — Você decide com base em "o corretor disse"
→ Dashboard em tempo real, decisão vira matemática

SLIDE 7:
A raiz dos 5 problemas
A operação depende 100% de memória, disponibilidade e boa vontade de pessoas

SLIDE 8:
A solução não é contratar mais gente
É transferir o que humano faz mal (resposta em segundos, follow-up consistente, relatório em tempo real) pra um sistema 24/7

SLIDE 9:
Resultado típico em 60-90 dias
2x mais visita marcada · Mesma equipe · Mesmo orçamento de ads

SLIDE 10 (CTA):
Comenta "DIAGNOSTICO"
que envio uma análise gratuita
dos vazamentos do seu funil.` },

  { n:3, semana:1, dia:'Quarta', categoria:'Storytelling', nicho:'Imobiliária',
    texto:`Esta semana entrei na operação comercial de uma imobiliária pra fazer diagnóstico.

A primeira coisa que pedi foi: me passa o último lead que chegou.

A gestora abriu o WhatsApp. Mensagem de 11 dias atrás. Nunca respondida.

"Provavelmente o João viu e esqueceu", ela disse.

Pedi pra ela me mostrar os últimos 30 leads. Apenas 12 tinham primeira resposta no mesmo dia. Os outros 18 chegaram, esperaram, esfriaram.

A imobiliária investe R$ 8 mil por mês em anúncio.

Pra você ter ideia do tamanho do problema: 60% dos leads que chegaram pagos não viraram nem CONVERSA.

Quando mostrei isso na tela pra ela, ela parou de falar por alguns segundos.

Esse é o vazamento mais caro que existe em operação imobiliária. E o mais invisível, porque ninguém olha pra ele. Todo mundo olha pra "quanto fechou" e esquece de olhar pra "quanto chegou e morreu".

A solução não é cobrar mais o time. É construir uma camada que responda quando o time não pode.

Estou implementando essa camada nessa imobiliária a partir de segunda. Vou compartilhar a jornada aqui no LinkedIn.

Quem quiser acompanhar o passo a passo, segue + comenta "JORNADA" pra eu te incluir no follow.

#imobiliaria #automacao #operacao` },

  { n:4, semana:1, dia:'Quinta', categoria:'Debate', nicho:'Imobiliária',
    texto:`Pergunta direta pra quem gerencia imobiliária:

Quanto tempo seu time leva pra responder uma mensagem de WhatsApp que chegou às 22h num sábado?

Não é pergunta retórica. Quero respostas reais nos comentários.

Hipóteses possíveis:
A) Responde em até 30 minutos (tem plantão real)
B) Responde no domingo manhã (alguém olha)
C) Responde só na segunda (horário comercial)
D) Nunca responde (depende do humor do corretor)

Pesquisei 12 imobiliárias no último mês. A resposta mais comum foi C (segunda-feira). A segunda mais comum foi D (nunca).

Lead que esperou de sábado pra segunda já fechou em outro lugar. É matemática, não opinião.

Curioso pra ver as respostas honestas.

#imobiliaria #atendimento` },

  { n:5, semana:1, dia:'Sexta', categoria:'Framework', nicho:'Imobiliária',
    texto:`Como fazer sua imobiliária responder lead em 30 segundos, 24h por dia, sem contratar mais ninguém.

Em 3 etapas:

ETAPA 1 — Primeira resposta automatizada
Não chatbot genérico. Agente treinado no seu portfólio que responde com nome do imóvel, valor, condições, em menos de 1 minuto. Em qualquer horário.

ETAPA 2 — Qualificação antes do corretor
O sistema faz 4 perguntas: orçamento, prazo de mudança, financiamento ou à vista, morar ou investir.
Em 5 minutos, o lead está classificado em quente, morno ou frio.
Corretor só recebe quem está quente. Com histórico completo da conversa.

ETAPA 3 — Painel em tempo real no celular do gestor
Quantos leads entraram, o que foi conversado, quem está quente, quem esfriando. Decisão deixa de ser fé. Vira dado.

O resultado típico em 60-90 dias:
- Conversão lead → visita marcada dobra
- Mesma equipe
- Mesmo orçamento

Quem leu até aqui e quer aplicar esse framework na própria imobiliária, comenta "QUERO" que mando a checklist de implantação semana a semana.

#imobiliaria #operacao #ia` },

  // SEMANA 2
  { n:6, semana:2, dia:'Segunda', categoria:'Provocação', nicho:'Imobiliária',
    texto:`Sua imobiliária ainda escala plantão de domingo na escala 6x1?

Tá fazendo errado.

Não pelo time. Pelo modelo.

Domingo é o dia que mais lead chega pra imobiliária. É quando o cliente potencial tá em casa, sem pressa, olhando os imóveis no Instagram. Manda mensagem direto.

Você bota o corretor X pra cobrir o plantão. Ele recebe 30, 40, às vezes 60 mensagens em uma tarde. Tenta responder todas. Algumas escapam. As que respondeu são respostas curtas, sem qualificação, sem coleta de informação.

Resultado:
- Lead bom recebe resposta ruim
- Lead ruim toma tempo do corretor
- Lead quente vira lead morno
- E a maioria dos leads ainda fica esperando

Não é o corretor que falhou. É a expectativa de que UMA PESSOA consegue responder 60 mensagens em 4 horas com qualidade.

A solução é colocar a primeira camada de resposta no piloto automático e usar o corretor humano só pra fechar.

Quem implantou esse modelo no Brasil em 2026 está vendo plantão dobrar conversão sem nenhum corretor a mais.

Quem quiser entender como, comenta "PLANTAO".

#imobiliaria #vendas #plantao` },

  { n:7, semana:2, dia:'Terça', categoria:'Dado', nicho:'Imobiliária',
    texto:`21x.

Esse é o multiplicador de conversão quando você responde um lead imobiliário em 5 minutos vs em 30 minutos.

Não 2x. Não 5x. 21 vezes.

Dado da Harvard Business Review, replicado em pesquisas brasileiras com resultado similar.

Significa que se você está respondendo em 30 minutos e seu concorrente em 5, ele converte 21 vezes mais pelo mesmo investimento em anúncio. Não é vantagem marginal. É domínio absoluto do mercado.

E aqui vai a parte que machuca: o tempo médio de resposta de imobiliária brasileira é de 17 horas.

Não 17 minutos. 17 horas.

Se você está nessa média, está convertendo 21x menos que poderia. E você nem sabe disso, porque o vazamento é invisível.

A boa notícia: responder em menos de 1 minuto, 24h por dia, é 100% viável em 2026. Não com humano. Com infraestrutura.

A má notícia: enquanto você decide se vai fazer, seus concorrentes já estão fazendo.

#imobiliaria #ia #dados` },

  { n:8, semana:2, dia:'Quarta', categoria:'Storytelling', nicho:'Imobiliária',
    texto:`Dia 7 da implantação que comentei semana passada.

O sistema está respondendo lead em 30 segundos. Em qualquer horário. Sete dias por semana.

Primeira observação que me chamou atenção: o volume de mensagem recebida pela imobiliária NÃO mudou. Continua igual. O que mudou é que TODA mensagem agora recebe resposta. Antes, 40% morria sem resposta.

Segunda observação: o tipo de lead que CHEGA NO CORRETOR mudou. Antes, o corretor recebia uma enxurrada de "tô só pesquisando", "qual o preço?", "tem outras opções?". Agora, chega só quem já está qualificado: orçamento confirmado, prazo definido, intenção real.

A gestora me ligou ontem: "O João disse que pela primeira vez em meses ele está tendo tempo de fazer follow-up direito".

Sabe por quê? Porque o tempo que ele gastava com 50 leads ruins agora ele gasta com 10 leads bons.

A produtividade dele triplicou sem ele trabalhar mais hora.

Continua na sexta com os números da segunda semana.

Quem quer acompanhar a jornada completa, segue + comenta "JORNADA".

#imobiliaria #operacao #automacao` },

  { n:9, semana:2, dia:'Quinta', categoria:'Debate', nicho:'Imobiliária',
    texto:`Pergunta provocativa pra corretor de imóveis:

Você acha que IA vai te substituir?

Eu não acho.

Mas eu acho que IA vai substituir o CORRETOR QUE NÃO USA IA.

Isso vale pra qualquer profissão hoje. Médico que usa IA pra diagnóstico vai substituir médico que não usa. Advogado que usa IA pra petição vai substituir advogado que não usa. Corretor que usa IA pra qualificar lead vai substituir corretor que ainda responde manualmente.

A IA não rouba seu emprego. Ela rouba SUA HORA. Cada hora que você gasta respondendo "qual o valor?" pra lead frio é uma hora que você não tá com lead quente fechando.

O corretor sênior que entendeu isso já está com IA respondendo o primeiro contato e ele só pegando a conversa quando o lead está pronto.

O corretor que ainda tá batendo no peito dizendo "eu prefiro responder pessoalmente" vai perder mercado pra quem entendeu o jogo novo.

Não é sobre escolher entre humano e IA. É sobre escolher entre ficar pra trás ou ir junto.

Concorda? Discorda? Quero ver nos comentários.

#imobiliaria #ia #corretor` },

  { n:10, semana:2, dia:'Sexta', categoria:'Transição', nicho:'B2B',
    texto:`Pare de tentar gerar mais leads.

Comece a responder os que você já tem.

Pega uma operação comercial B2B média: 200 leads chegam por mês. Em torno de 80 são respondidos no mesmo dia. Os outros 120 esperam horas, dias, às vezes uma semana. 60% deles esfriam antes do primeiro contato real.

Você pagou pra captar TODOS os 200. Pagou ads, pagou time, pagou estrutura. E está deixando 120 morrerem sem nem encostar neles.

A pergunta certa não é "como gerar mais lead?". É "como não desperdiçar os que já tenho?"

Custa 5 vezes menos resolver o segundo problema do que o primeiro. E o impacto na receita é 3 vezes maior.

Em quase toda empresa B2B que conheço, o maior vazamento não está no topo do funil (volume). Está no meio (resposta + qualificação). Mas todo mundo só olha pro topo, porque é o que mais aparece em palestra.

Olhe pro meio. É onde está o dinheiro.

Comenta "MEIO" que mando o framework dos 5 estágios do funil B2B com conversão saudável de cada um.

#vendas #b2b #funil` },

  // SEMANA 3
  { n:11, semana:3, dia:'Segunda', categoria:'Opinião', nicho:'B2B',
    texto:`90% dos times comerciais B2B vão ser obsoletos até 2027.

Não pela IA substituir vendedor. Pelo modelo operacional ficar obsoleto.

O time comercial padrão de 2020 tinha 3-5 SDRs qualificando, 4-6 closers fechando, 1 gestor com planilha. Custo: R$60-150k/mês. Forecast baseado em "o vendedor disse".

O time emergente de 2026 tem 1-2 closers humanos focados em fechamento e contas estratégicas, 1 SDR neural (IA) qualificando 24/7, 1 sistema de BI com forecast em tempo real. Custo: R$15-35k/mês. Forecast com margem de erro de 12%.

Custo 4x menor. Output 3x maior. Conversão 2x maior.

Empresas que operam no modelo emergente estão competindo contra empresas que operam no modelo antigo. Os dois modelos vão coexistir por um tempo. Mas o gap de eficiência é tão grande que daqui a 18 meses o modelo antigo simplesmente não vai mais competir em preço.

Não é tese de futurista. É o que já está acontecendo nas empresas que migraram.

A pergunta não é "isso vai acontecer?". É "quando vou começar?".

Se você é fundador ou gestor comercial B2B, esse é o momento de fazer essa conta.

#vendas #b2b #ia #futurodotrabalho` },

  { n:12, semana:3, dia:'Terça', categoria:'Framework', nicho:'B2B',
    texto:`BANT está morto.

(Pra quem não conhece: BANT = Budget, Authority, Need, Timing. Framework de qualificação de lead B2B usado desde 1960.)

Por que morreu:
1. Lead B2B em 2026 já vem informado. Pergunta "qual seu orçamento" assusta antes de criar valor.
2. "Authority" é cinza — decisão B2B raramente é uma pessoa só.
3. "Need" é genérico — todo lead diz que precisa.
4. "Timing" é fingido — "preciso pra ontem" virou padrão.

O que está substituindo:
SPICED. Situation, Pain, Impact, Critical Event, Decision.

Em vez de perguntar "qual seu orçamento", você pergunta:
"Me conta como o problema X está afetando a operação hoje?"
"Quanto isso está custando por mês (estimativa)?"
"Qual evento te fez procurar solução agora e não daqui a 6 meses?"
"Quem mais participa dessa decisão e qual o critério deles?"

A diferença é que SPICED gera contexto. BANT gera filtro.

Contexto te dá venda. Filtro te dá descarte.

Quem usa SPICED desde 2024 está vendo conversão lead → reunião subir 40-70%.

Comenta "SPICED" que mando o guia de aplicação com perguntas exatas pra cada estágio.

#vendas #b2b #qualificacao` },

  { n:13, semana:3, dia:'Quarta', categoria:'Storytelling', nicho:'B2B',
    texto:`Esta semana, um closer me disse:

"IA vai roubar meu emprego em 2 anos. Por que eu deveria adotar?"

Respondi:

"Não. IA vai te dar 5 horas de volta por dia."

Ele riu. Eu mostrei os números.

O time dele recebia 80 leads por mês. Ele gastava em média 4 horas por dia entrando em conversa com lead morno, fazendo qualificação básica, perguntando coisa óbvia tipo "qual seu orçamento?".

Implantamos qualificação automática. Ele agora recebe 25 leads pré-qualificados por mês. Os outros 55 foram filtrados pelo agente IA (35 viraram nutrição, 20 foram descartados).

Resultado depois de 60 dias:
- Antes: 80 leads tocados → 8 fechamentos
- Depois: 25 leads tocados → 9 fechamentos

Mesmo número de venda. 70% menos tempo gasto.

Ele me ligou esta semana: "Acabei o expediente às 16h ontem. Fui pegar meu filho no colégio. Não fazia isso há 3 anos."

Aí ele me perguntou: "Onde estava essa tecnologia 5 anos atrás?"

A resposta: não existia. Existe agora. Quem vai usar primeiro vai ter mais tempo, não menos.

#vendas #ia #closer` },

  { n:14, semana:3, dia:'Quinta', categoria:'Debate', nicho:'B2B',
    texto:`Pergunta provocativa pra quem lidera time comercial:

Você prefere um vendedor humano que faz 30 conversas por dia OU um time híbrido (1 humano + IA) que faz 150 conversas por dia com qualificação automatizada?

Resposta intuitiva: humano. Porque "vendedor é arte, é relacionamento".

Resposta com dado: time híbrido. Porque vendedor está usando arte/relacionamento em 30 conversas, e 28 dessas 30 são com gente que não vai fechar. Sobrou 2 conversas onde a arte importou. As outras 28 foram desperdício.

Modelo híbrido: IA faz as 120 primeiras conversas (pré-qualificação). Vendedor humano pega as 30 conversas com gente real. 100% da arte/relacionamento dele agora é com quem vai comprar.

Mesma carga de "arte", 5x mais output.

A pergunta que importa não é "humano OU IA". É "humano focado no momento certo OU humano dispersando energia?".

Quero ver argumentos contrários nos comentários. Genuinamente.

#vendas #b2b #lideranca` },

  { n:15, semana:3, dia:'Sexta', categoria:'Dado', nicho:'B2B',
    texto:`SDR humano qualifica 30-50 leads por dia.
SDR com IA qualifica 200-500 leads por dia.

Mas o ponto não é volume.

É consistência.

SDR humano numa segunda-feira de manhã, depois de café, alinhado com o gestor, é EXCELENTE. Vai qualificar 50 leads com perguntas certas, follow-up impecável, registro completo.

SDR humano numa sexta às 17h30, depois de uma reunião ruim, com o noivo brigando no WhatsApp, é OUTRO. Mesma pessoa, performance 40% pior.

Lead que cai no SDR ruim na sexta às 17h não tem culpa. Mas ele virou estatística.

SDR com IA não muda performance. Sexta às 17h é igual a segunda às 8h. Quantidade igual de perguntas, mesmo tom, mesmo follow-up, mesmo registro.

Isso não é "IA é melhor". É "IA é consistente". Em volume e em qualidade.

O closer humano, com lead já qualificado de forma consistente, é que faz arte de venda. Aí sim o humano é insubstituível.

A pergunta não é "humano OU IA". É "em que parte do funil cada um agrega mais valor?".

Resposta:
- Qualificação consistente em volume → IA
- Fechamento + relacionamento de alto valor → humano

Quem inverter, perde.

#vendas #sdr #b2b` },

  // SEMANA 4
  { n:16, semana:4, dia:'Segunda', categoria:'Opinião', nicho:'B2B',
    texto:`Você não tem problema de leads.

Você tem problema de meio do funil.

Conversa típica com gestor B2B: "Tô investindo R$30k em ads e não tô vendendo o suficiente."

Pergunta minha: "Quantos leads chegam por mês?"
"200."
"E quantos viram cliente?"
"Uns 5-8."
"E quantos respondidos no mesmo dia?"
Silêncio.

A maioria dos gestores B2B sabe quantos leads chegam (topo) e quantos viraram venda (fundo). Mas não tem ideia de quantos morreram no meio (resposta + qualificação).

Esse é o vazamento mais comum, o mais caro, e o menos visível.

Mapa de funil saudável B2B:
- 95% dos leads respondidos no mesmo dia
- 60% dos respondidos viram qualificados
- 70% dos qualificados marcam reunião
- 75% das reuniões viram proposta
- 35% das propostas viram cliente

Mapa real da empresa média:
- 40% respondidos no mesmo dia (50% perdidos aqui)
- 50% dos respondidos qualificados
- 55% qualificados → reunião
- 70% reunião → proposta
- 30% proposta → cliente

Vê onde tá o gap? Não tá em proposta. Tá em RESPOSTA.

Comenta "FUNIL" que mando o checklist completo de auditoria de funil B2B.

#vendas #b2b #funil` },

  { n:17, semana:4, dia:'Terça', categoria:'Framework', nicho:'B2B',
    texto:`O stack comercial moderno em 2026 tem 3 camadas obrigatórias.

CAMADA 1 — Canal: WhatsApp Business API (oficial Meta)
Por quê: 70%+ das interações B2B no Brasil passam por WhatsApp em algum ponto. Sem API oficial (não Business app, não comum), você não tem múltiplos atendentes simultâneos nem histórico estruturado.

CAMADA 2 — Dado: CRM com API aberta
Por quê: dado disperso é dado morto. Vendedor sai, leva tudo. Sem CRM, gestor decide com palpite.
Opções no Brasil: Pipedrive (simples), RD Station (marketing+vendas), HubSpot (caro mas completo).

CAMADA 3 — Execução: IA (agente conversacional + lead scoring + BI)
Por quê: resposta em segundos, qualificação consistente, follow-up sem falha, forecast com dado real.

Stack incompleto (só 1 ou 2 camadas) não funciona:
- Só WhatsApp sem CRM: dado morre
- WhatsApp + CRM sem IA: lento
- IA sem WhatsApp: cliente não fala com você

As 3 camadas integradas é o mínimo viável pra competir em 2026.

Custo total pra operação SMB média: R$3-8k/mês.
Retorno típico em 60-90 dias: 50-150% de receita mensal nova.

#vendas #b2b #stack #ferramentas` },

  { n:18, semana:4, dia:'Quarta', categoria:'Storytelling', nicho:'B2B',
    texto:`Um cliente me procurou semana passada.

Tinha investido R$28k em cold email automation nos últimos 4 meses. Resultado: zero cliente novo.

"A ferramenta não funciona."

Perguntei como ele tinha implantado. Ele descreveu:
- Comprou 12k contatos
- Configurou 5 sequências de email
- Disparou 3.000 emails por semana
- Aguardou conversão

Resultado real:
- 0,3% taxa de resposta (média do mercado é 1-3%)
- Domínio em blacklist (alto volume = spam score)
- Reputação queimada (precisará criar domínio novo)
- 12 reclamações de spam (risco legal)

O erro não foi a ferramenta. Foi automatizar TOPO de funil em vez de MEIO.

O cliente já tinha leads chegando (60-80 por mês via marketing inbound). Mas RESPONDIA EM 6 HORAS na média. 50% deles morria sem virar cliente.

Em vez de gastar R$28k tentando gerar MAIS leads frios via cold email, ele deveria ter gasto R$5k automatizando RESPOSTA + QUALIFICAÇÃO dos que já chegavam.

Cálculo: pegando os 60 leads que ele já recebia, com resposta automatizada em 1 min, ele teria fechado 4-6 clientes a mais POR MÊS. R$80-120k/mês de receita nova vs zero.

Conserto: paramos cold email. Implantamos resposta automatizada nos leads inbound. Em 45 dias: 7 clientes novos.

A pergunta certa antes de automatizar é: ONDE está vazando dinheiro?

Comenta "AUDITORIA" se quiser mapeamento do seu próprio funil.

#vendas #b2b #automacao` },

  { n:19, semana:4, dia:'Quinta', categoria:'Provocação', nicho:'B2B',
    texto:`Cold email automation está morto.

Não estou dizendo isso porque vendo o concorrente. Estou dizendo porque é fato.

Por quê:
1. Inboxes B2B em 2026 recebem 50-200 cold emails por semana. Filtros de spam ficaram absurdamente bons. Mesmo email "personalizado" cai em junk.
2. Google e Microsoft mudaram regras de envio em massa (2024 — autenticação DMARC, SPF, DKIM obrigatórias). Sender reputation ficou crítica.
3. Os prospects aprenderam a ignorar. Open rate caiu de 40% (2020) pra 15% (2026). Reply rate caiu de 3% pra 0.5%.

O que substituiu:
1. Outbound LinkedIn 1-a-1 com mensagem genuína (não scraping em massa).
2. Inbound bem feito + resposta em segundos (paid + organic gerando lead, IA respondendo).
3. Indicação engenheirada (cliente atual ganha incentivo pra trazer 2 indicações qualificadas).
4. Content marketing focado (blog SEO + LinkedIn pessoal = inbound orgânico contínuo).

Cold email ainda funciona em DOIS casos:
- Lista hiperqualificada (max 100 contatos) + email manual hiperpersonalizado.
- Setores muito específicos onde inbound não existe.

Pra resto: não vale o investimento.

Quem ainda está pagando R$2-5k/mês em ferramenta de cold email + lista comprada está jogando dinheiro fora.

#vendas #b2b #outbound` },

  { n:20, semana:4, dia:'Sexta', categoria:'Debate', nicho:'B2B',
    texto:`Você ainda usa PLANILHA pra controlar pipeline comercial em 2026?

Sem julgar. Genuinamente quero entender.

Pesquisei rapidamente: 47% das empresas B2B brasileiras com faturamento até R$10M/ano ainda usam planilha como sistema principal de gestão comercial.

Razões comuns que ouço:
"Time não preenche CRM mesmo."
"Caro pra começar."
"Vendedor não gosta de mudança."
"A gente tentou e ninguém usou."

Razões reais (mais incômodas):
- Gestor não enxerga o custo do dado morto (lead que sumiu, contexto perdido, follow-up esquecido)
- Não tem benchmark do que CRM faz quando é usado direito (decisão por dado, não palpite)
- Mudança de planilha pra CRM gera atrito inicial (3-6 semanas) e gestor abandona antes da curva subir

A verdade: quem ainda opera com planilha em 2026 está deixando R$10-50k/mês na mesa porque não consegue ver onde está vazando.

Não é planilha vs CRM. É achismo vs dado.

Comenta "PILOT" se quer um piloto gratuito de 30 dias num CRM pra ver a diferença.

(E me dá os argumentos contrários nos comentários se discorda — quero entender.)

#vendas #b2b #crm` },

  // SEMANA 5
  { n:21, semana:5, dia:'Segunda', categoria:'Opinião', nicho:'Saúde',
    texto:`Clínicas particulares perdem 50% dos contatos pela mesma razão.

E não é falta de demanda.

É a janela de 4 horas entre o paciente mandar mensagem e a secretária responder.

Funciona assim: paciente decidiu marcar consulta. Manda mensagem no WhatsApp da clínica às 14h. Secretária está atendendo paciente presencial. Não vê. Responde às 18h: "Olá, em que posso ajudar?"

Paciente já marcou na clínica concorrente.

Pessoas em decisão de saúde NÃO esperam. Especialmente quando a decisão é trocar de clínica, fazer uma consulta nova, ou agendar um exame que adiaram.

Em clínica particular média:
- 50-300 contatos por mês entram via WhatsApp + Instagram + ligação
- 40-60% NUNCA viram consulta agendada
- Não é por falta de horário. É por falta de resposta a tempo.

A solução não é contratar mais uma secretária (custa R$3-5k/mês e ainda não cobre noite/fim de semana). É agente que responde em 30 segundos, consulta a agenda em tempo real, agenda direto.

Clínicas que implantaram esse modelo no Brasil em 2026:
- Tempo médio de resposta: < 1 min (era 2-6h)
- Conversão contato → agendamento: 80-90% (era 40-60%)
- Taxa de no-show: 5-10% (era 15-25%, com lembrete automático)

Custo: R$800-2.500/mês.
Retorno: triplo de agendamento em 60-90 dias.

Quem administra clínica e tá perdendo paciente por demora de resposta, comenta "CLINICA" pra eu mandar o framework de implantação.

#saude #clinicas #automacao` },

  { n:22, semana:5, dia:'Terça', categoria:'Framework', nicho:'Saúde',
    texto:`Como uma clínica triplica agendamento em 60 dias (sem aumentar mídia paga).

Não é mágica. É arquitetura de atendimento.

Etapa 1 — Resposta automática em 30 segundos
Paciente manda mensagem em qualquer horário. Agente responde imediatamente, identifica intenção (marcar consulta, info, falar com secretária).

Etapa 2 — Qualificação básica
"Primeira consulta ou retorno?"
"Convênio ou particular?"
"Período preferencial?"
2 minutos. Sem secretária. Sem espera.

Etapa 3 — Agenda em tempo real
Agente consulta Google Calendar ou sistema da clínica, mostra 3 horários disponíveis, paciente escolhe, agente confirma e lança no calendário.

Etapa 4 — Lembrete automático
24h antes: lembrete com horário e endereço.
2h antes: confirma presença.
Não confirma em 30 min: secretária recebe alerta.

Etapa 5 — Encaminhamento humano quando necessário
Emergência, dúvida clínica complexa, paciente delicado: agente identifica e passa pra secretária imediatamente, com histórico completo.

Resultado em 60-90 dias:
- 3x agendamento mensal
- Redução de 60-80% no no-show
- Secretária livre pra atender paciente presencial bem
- 30-40% dos agendamentos vêm de fora do horário comercial (que antes morria)

Custo: R$800-2.500/mês.
Comparação: contratar mais uma secretária = R$3-5k/mês e ainda não cobre 24/7.

Salva esse post pra olhar de novo quando for revisar atendimento.

#saude #clinicas #agendamento` },

  { n:23, semana:5, dia:'Quarta', categoria:'Opinião', nicho:'Advocacia',
    texto:`Advogados não podem prospectar clientes ativamente. OAB proíbe.

Mas advogados podem RESPONDER em menos de 1 minuto.

E é exatamente nesse gap que estão os escritórios que crescem mais hoje.

Funciona assim: o escritório investe em conteúdo (Instagram, LinkedIn, site, indicação). Cliente potencial procura sozinho. Manda mensagem.

Aqui é onde a maioria dos escritórios trava.

O cliente potencial manda mensagem às 22h depois de um problema (briga societária, divórcio, ação trabalhista). Sente urgência. Manda pra 3 escritórios.

Escritório A responde às 22h05.
Escritório B responde no dia seguinte 10h.
Escritório C responde na semana seguinte.

O cliente A fecha com A. B e C perdem o caso sem nem saber que estava em disputa.

A OAB não proíbe automatizar o PRIMEIRO ATENDIMENTO (coleta de informações, agendamento de consulta inicial). Proíbe dar OPINIÃO JURÍDICA sem ser advogado. Esse é o limite.

Dentro dessa fronteira, dá pra ter:
- Resposta inteligente em 30 segundos, 24h por dia
- Coleta automatizada do caso (sem dar opinião)
- Triagem por área (escritório atende só X áreas)
- Agendamento da consulta inicial com sócio especializado

Escritórios que implantaram isso no Brasil em 2026 estão dobrando os casos efetivamente assumidos sem nem uma indicação a mais.

Quem é sócio ou administrador de banca e quer entender, comenta "OAB".

#advocacia #escritorio #oab` },

  { n:24, semana:5, dia:'Quinta', categoria:'Debate', nicho:'Advocacia',
    texto:`Pergunta provocativa pra advogado:

IA num escritório de advocacia é vantagem competitiva ou risco ético?

Resposta curta: depende DE ONDE você coloca a IA.

ÉTICO (e funcional):
- Triagem inicial de caso (perguntas estruturadas, sem opinião jurídica)
- Agendamento de consulta com advogado
- Encaminhamento por área de atuação
- Lembretes de prazo processual pra cliente
- Resumo de processo pra advogado revisar

NÃO ÉTICO (e perigoso):
- Dar opinião jurídica direto ao cliente (privativo do advogado)
- Prospecção ativa de cliente desconhecido (OAB proíbe)
- Promessa de resultado (OAB proíbe)
- Geração de petição sem revisão de advogado humano

A IA bem configurada faz a parte estruturada (triagem, agendamento, organização) e libera o advogado pra o que realmente exige formação jurídica (interpretação, estratégia, julgamento).

A IA mal configurada (ou sem fronteiras éticas claras) pode gerar problema com a OAB e queimar a banca.

A diferença entre vantagem e risco está em QUEM configura. Sistema genérico não serve pra advogado. Sistema específico pra setor jurídico, configurado por quem entende OAB, é o caminho.

Quem é sócio de banca e quer discutir caso específico, comenta. Curioso pra ver argumentos contrários.

#advocacia #oab #ia` },

  { n:25, semana:5, dia:'Sexta', categoria:'Síntese', nicho:'Geral',
    texto:`3 setores onde IA dobrou (ou triplicou) conversão em 2026.

NÃO porque IA é mágica. Porque o gargalo nesses setores é o MESMO: tempo de resposta + qualificação inicial.

IMOBILIÁRIA
- Antes: 17h tempo médio de resposta (média Brasil)
- Depois: < 1 min com IA
- Resultado: 2x visita marcada com mesma equipe

CLÍNICAS PARTICULARES
- Antes: 2-6h tempo médio, secretária ocupada
- Depois: 30s, agente que consulta agenda em tempo real
- Resultado: 3x agendamento mensal, no-show cai 60-80%

ESCRITÓRIOS DE ADVOCACIA
- Antes: 4-24h tempo médio
- Depois: < 1 min com triagem automatizada (sem violar OAB)
- Resultado: 2x casos efetivamente assumidos, advogados liberados pra trabalho jurídico real

Padrão comum: cada um desses setores tem volume de contato (lead, paciente, cliente potencial) BAIXO o suficiente pra parecer gerenciável manualmente, mas ALTO o suficiente pra vazar muito sem ninguém perceber.

E a maioria dos gestores nesses setores ainda acha que "contratar mais uma secretária / corretor / estagiário" resolve.

Não resolve. Multiplica o custo, não a velocidade.

A solução é mudar de modelo, não inflar a equipe.

Quem é desses 3 setores e quer mapear o vazamento da própria operação, comenta com a área que atua.

#vendas #automacao #saude #imobiliaria #advocacia` },

  // SEMANA 6
  { n:26, semana:6, dia:'Segunda', categoria:'Opinião', nicho:'B2B',
    texto:`O que mudou em IA aplicada a vendas em 2026 (e o que vem em 2027).

Mudou em 2026:
1. Modelos atingiram nível em que conversa de venda bem configurada é INDISTINGUÍVEL de humano experiente. GPT-4.5, Claude 3.5/4, Gemini 2.
2. Voice agents (IA fazendo ligação telefônica de qualificação) saíram do beta. Bland.ai, Vapi, Retell.
3. Cold outreach genérico morreu. Tudo personalizado em escala virou commodity.
4. Forecast preditivo (margem de erro 10-15%) substituiu forecast humano (margem 40-60%).
5. Agentes especializados substituíram chatbots (treinados em produto, com acesso a banco de dados, capazes de tomar ações).

Vem em 2027:
1. Agentes que negociam preço dentro de regras configuradas (B2B SMB, tickets R$2-15k/mês).
2. Reuniões de venda assistidas por IA em tempo real (escuta a chamada, sugere objeções a responder, alerta sobre tom esfriando).
3. CRM autônomo (preenche tudo sozinho a partir de conversas, emails, ligações).
4. Avatares de vídeo realistas em outreach (HeyGen, Synthesia evoluindo).
5. Modelo de empresa R$5-20M ARR operando com 3-8 pessoas no comercial vai virar PADRÃO.

NÃO vem em 2027 (apesar do hype):
- IA substituindo fechamento de venda complexa
- AGI resolvendo comercial sozinho
- Fim do CRM

A diferença entre quem ganha e quem perde nesse cenário não é "ter IA". É APLICAR IA NO LUGAR CERTO.

Aplicar IA no fechamento (errado): perde cliente.
Aplicar IA na qualificação + follow-up (certo): triplica eficiência do humano.

Quem está há mais de 6 meses sem reavaliar onde IA opera na operação tá ficando pra trás.

#vendas #ia #futurodotrabalho #b2b` },

  { n:27, semana:6, dia:'Terça', categoria:'Framework', nicho:'B2B',
    texto:`5 perguntas pra avaliar se IA faz sentido pro seu negócio (sem cair em hype).

1. Você recebe pelo menos 50 leads/contatos por mês?
Sim → IA agrega valor real (escala).
Não → custo pode não justificar.

2. Seu ticket médio é maior que R$2k/mês recorrente OU R$10k contrato único?
Sim → ROI vai aparecer rápido.
Não → calcule com cuidado se o math fecha.

3. Existe trabalho estruturado e repetitivo no seu processo comercial?
(Primeiro contato, qualificação, follow-up, agendamento)
Sim → IA libera humano pra fechamento.
Não → IA não tem onde agregar.

4. Você tem CRM ou sistema centralizado pra dados de cliente?
Sim → IA integra e potencializa.
Não → precisa criar essa base primeiro. IA sozinha não resolve.

5. Você consegue investir R$2-5k/mês inicialmente e esperar 60-90 dias pra ver ROI?
Sim → vale começar pelo SDR com IA.
Não → talvez não seja o momento.

3+ "sim" = vale investigar.
4+ "sim" = vale começar piloto.
5 "sim" = você está PERDENDO dinheiro por NÃO ter.

Se quiser, mando o passo a passo de avaliação detalhada. Comenta "AVALIAR".

#vendas #b2b #ia` },

  { n:28, semana:6, dia:'Quarta', categoria:'Storytelling', nicho:'Geral',
    texto:`O dia que percebi que eu estava vendendo a coisa errada.

Anos atrás (não tantos), eu vendia "automação comercial" como se fosse ferramenta. Como se fosse software. Olhava planilha de feature, comparava com concorrente, mostrava demo.

E perdia venda.

Cliente potencial olhava a demo, achava interessante, dizia "vou pensar". E não voltava.

Demorei pra entender o que estava errado.

O cliente B2B em 2026 NÃO compra software. Não compra automação. Não compra IA.

Ele compra UMA MUDANÇA NA OPERAÇÃO DELE.

Quando eu mostrava demo, eu vendia features. Quando comecei a mostrar O QUE MUDA na operação dele depois de 90 dias (números reais, dores específicas resolvidas, capacidade adicional), comecei a fechar.

Não vendo IA. Vendo "sua operação respondendo em segundos, 24h por dia, sem você contratar mais ninguém".

Não vendo automação. Vendo "seus corretores liberados pra fechar venda em vez de filtrar lead".

Não vendo agentes. Vendo "seu pipeline atualizado em tempo real no seu celular, em vez de planilha que você esquece de abrir".

A diferença não é semântica. É de OFERTA.

Software é commodity. Transformação operacional é valor.

Vendedor que ainda vende feature vai perder cliente em 2027.
Vendedor que vende mudança operacional fecha mais sem precisar baixar preço.

Vale a reflexão pra qualquer um que está numa venda consultiva.

#vendas #b2b #mindset` },

  { n:29, semana:6, dia:'Quinta', categoria:'Provocação', nicho:'B2B',
    texto:`Pergunta provocativa pra dono de empresa B2B:

Você está montando time de 20 pessoas no comercial OU time de 5 pessoas + IA?

Os dois modelos vão existir nos próximos 12-18 meses. Só um vai prosperar depois disso.

Empresa de 20 pessoas no comercial em 2026:
- Salário + encargos: R$130-280k/mês
- Coordenação: pelo menos 2 gestores no meio
- Reuniões internas: 30-40% do tempo
- Output: 50-150 fechamentos/mês
- Custo por fechamento: R$1.500-4.000

Empresa de 5 pessoas (3 closers + 1 gestor + 1 ops) + IA em 2026:
- Salário + encargos: R$40-80k/mês
- Stack IA: R$8-15k/mês
- Coordenação: 1 gestor direto
- Reuniões internas: 10% do tempo
- Output: 80-200 fechamentos/mês (qualificação melhor + follow-up sem falha)
- Custo por fechamento: R$400-900

Custo/fechamento 3-5x menor. Output equivalente ou maior. Coordenação simplificada.

Empresa pequena com leverage de IA vai bater empresa grande sem leverage. Não por sorte. Por matemática.

Onde isso te coloca? Você é da equipe inflada que ainda vai sentir o impacto, ou da equipe enxuta que vai aproveitar?

Resposta honesta, pode comentar.

#vendas #b2b #futurodotrabalho` },

  { n:30, semana:6, dia:'Sexta', categoria:'Síntese', nicho:'Geral',
    texto:`30 dias falando sobre IA comercial aqui no LinkedIn.

O que mudou na sua cabeça nesse período?

Genuinamente quero saber. Comenta. Vou ler todos.

Por aqui, o que tentei deixar claro nesses 30 posts:

1. IA não substitui vendedor. Substitui TAREFA REPETITIVA que vendedor fazia mal.
2. O maior vazamento em quase toda operação comercial é o MEIO do funil (resposta + qualificação), não o topo.
3. Sites institucionais sem resposta em 1 min são propaganda de cliente perdido.
4. WhatsApp é onde a decisão de compra acontece em 2026 no Brasil. Operação sem WhatsApp Business API + agente IA está jogando dinheiro fora.
5. Stack comercial mínimo viável em 2026: WhatsApp API + CRM + IA. Sem 1 das 3 camadas, o resto não funciona direito.
6. Nichos verticais (imobiliária, clínica, advocacia) têm o MESMO gargalo: tempo de resposta. Solução é a mesma, com configuração específica.
7. Empresas que migram cedo dominam. Empresas que esperam ficam correndo atrás.

Se você leu, refletiu, e quer dar o próximo passo na sua operação comercial: agendamos uma sessão diagnóstica gratuita de 30 minutos.

Sem proposta. Sem agenda comercial. Mapeamos os vazamentos do seu funil e quanto isso representa em receita perdida.

Vagas: 5 esta semana.

Comenta "DIAGNOSTICO" que mando o link pra agendar.

#vendas #b2b #ia` },
];

// ============================================================
// CONSTRUÇÃO DO DOCUMENTO
// ============================================================

// Helper: cria parágrafos a partir de texto (preserva quebras de linha)
function textToParagraphs(text, opts = {}) {
  return text.split('\n').map(line => {
    if (!line.trim()) {
      return new Paragraph({ children: [new TextRun({ text: '' })], spacing: { before: 0, after: 60 } });
    }
    return new Paragraph({
      children: [new TextRun({ text: line, font: opts.font || 'Calibri', size: opts.size || 22, color: opts.color || '262626' })],
      spacing: { before: 0, after: 60 },
    });
  });
}

const SEMANA_TITULOS = [
  '', 'Imobiliária — Consolidação', 'Imobiliária Avançado + Transição B2B',
  'B2B Comercial', 'B2B + Stack + Erros Comuns',
  'Nichos Verticais (Saúde + Advocacia)', 'Tendências + Fechamento'
];

const children = [];

// =====================================
// CAPA
// =====================================
children.push(
  new Paragraph({
    children: [new TextRun({ text: 'L2 AUTOMATIONS', font: 'Calibri', size: 28, color: GOLD, bold: true })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 2400, after: 100 },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Sistema Operacional de IA Integrada', font: 'Calibri', size: 22, color: MUTE, italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 1200 },
  }),
  new Paragraph({
    children: [new TextRun({ text: '30 Posts LinkedIn', font: 'Calibri', size: 72, color: '0A0A0A', bold: true })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Pacote estratégico — 6 semanas de conteúdo', font: 'Calibri', size: 28, color: '4A4A4A' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 1800 },
  }),
  new Paragraph({
    children: [new TextRun({ text: '5 posts por semana · Segunda a Sexta · 8h-10h BRT', font: 'Calibri', size: 22, color: MUTE })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Documento Interno — Compartilhamento Restrito a Sócios', font: 'Calibri', size: 18, color: MUTE, italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 2400 },
  }),
  new Paragraph({ children: [new PageBreak()] }),
);

// =====================================
// INTRODUÇÃO
// =====================================
children.push(
  new Paragraph({
    children: [new TextRun({ text: 'Como Usar Este Documento', font: 'Calibri', size: 36, color: '0A0A0A', bold: true })],
    spacing: { before: 200, after: 240 },
    border: { bottom: { color: GOLD, space: 6, style: BorderStyle.SINGLE, size: 12 } },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Este documento contém 30 posts prontos para publicação no LinkedIn, organizados em 6 semanas (5 posts/semana, segunda a sexta-feira).', font: 'Calibri', size: 22, color: '262626' })],
    spacing: { after: 200 },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Estratégia geral', font: 'Calibri', size: 26, color: GOLD, bold: true })],
    spacing: { before: 280, after: 160 },
  }),
  ...textToParagraphs(`Cada post foi construído seguindo princípios de copywriting B2B: gancho forte nas duas primeiras linhas (LinkedIn corta no "ver mais"), estrutura escaneable, opinião clara, CTA contextual nos comentários.

A série progride por nichos: Imobiliária (semanas 1-2), B2B Comercial (semanas 3-4), Nichos Verticais — Saúde e Advocacia (semana 5), Tendências e Fechamento (semana 6).`),

  new Paragraph({
    children: [new TextRun({ text: 'Regras de publicação no LinkedIn', font: 'Calibri', size: 26, color: GOLD, bold: true })],
    spacing: { before: 280, after: 160 },
  }),
  new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: [new TextRun({ text: 'NUNCA cole link externo no corpo do post — o algoritmo do LinkedIn reduz alcance drasticamente. Cole o link no primeiro comentário ou envie por DM.', font: 'Calibri', size: 22, color: '262626' })],
  }),
  new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: [new TextRun({ text: 'Responda comentários nos primeiros 30-60 minutos após publicar. O algoritmo dá boost para posts com engajamento rápido.', font: 'Calibri', size: 22, color: '262626' })],
  }),
  new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: [new TextRun({ text: 'Horário ideal para B2B: 8h às 10h da manhã (BRT). Evite finais de semana e feriados.', font: 'Calibri', size: 22, color: '262626' })],
  }),
  new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: [new TextRun({ text: 'Não duplique o conteúdo do blog L2 — o LinkedIn algoritmo detecta e penaliza. Cada post deste documento foi reescrito com tom e formato próprios do LinkedIn.', font: 'Calibri', size: 22, color: '262626' })],
  }),
  new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: [new TextRun({ text: 'Hashtags: máximo de 5 por post, sempre no final.', font: 'Calibri', size: 22, color: '262626' })],
  }),

  new Paragraph({
    children: [new TextRun({ text: 'Convenção do CTA', font: 'Calibri', size: 26, color: GOLD, bold: true })],
    spacing: { before: 280, after: 160 },
  }),
  ...textToParagraphs(`Cada post pede uma palavra-chave específica nos comentários (ex.: "FUNIL", "DIAGNOSTICO", "OAB"). Quem comenta está pedindo o material complementar. Responda via DM com o link do WhatsApp ou material relevante. Isso constrói lista qualificada e gera conversa privada.`),

  new Paragraph({ children: [new PageBreak()] }),
);

// =====================================
// POSTS POR SEMANA
// =====================================

let currentWeek = 0;

POSTS.forEach((post, idx) => {
  // Separador de semana
  if (post.semana !== currentWeek) {
    currentWeek = post.semana;
    if (idx > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `SEMANA ${post.semana}`, font: 'Calibri', size: 24, color: GOLD, bold: true })],
        alignment: AlignmentType.LEFT,
        spacing: { before: 100, after: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: SEMANA_TITULOS[post.semana], font: 'Calibri', size: 44, color: '0A0A0A', bold: true })],
        spacing: { after: 360 },
        border: { bottom: { color: GOLD, space: 8, style: BorderStyle.SINGLE, size: 16 } },
      }),
    );
  }

  // Cabeçalho do post (numero + dia + categoria + nicho)
  const headerTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: {
              top: { style: BorderStyle.SINGLE, color: GOLD, size: 8 },
              bottom: { style: BorderStyle.SINGLE, color: GOLD, size: 8 },
              left: { style: BorderStyle.NONE, size: 0 },
              right: { style: BorderStyle.NONE, size: 0 },
            },
            width: { size: 9360, type: WidthType.DXA },
            shading: { fill: 'F9F4E4', type: ShadingType.CLEAR },
            margins: { top: 200, bottom: 200, left: 240, right: 240 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `POST ${String(post.n).padStart(2, '0')}   `, font: 'Calibri', size: 24, color: GOLD, bold: true }),
                  new TextRun({ text: ` ${post.dia} · Semana ${post.semana}   `, font: 'Calibri', size: 22, color: '4A4A4A' }),
                  new TextRun({ text: ` ${post.categoria}   `, font: 'Calibri', size: 22, color: '4A4A4A', italics: true }),
                  new TextRun({ text: ` ${post.nicho}`, font: 'Calibri', size: 22, color: GOLD, bold: true }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
  children.push(headerTable);
  children.push(new Paragraph({ children: [new TextRun('')], spacing: { after: 160 } }));

  // Texto do post (preserva quebras de linha)
  post.texto.split('\n').forEach(line => {
    if (!line.trim()) {
      children.push(new Paragraph({ children: [new TextRun('')], spacing: { before: 0, after: 80 } }));
      return;
    }
    // Hashtags em destaque (linha que começa com #)
    if (line.trim().startsWith('#')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, font: 'Calibri', size: 20, color: '6B6B6B', italics: true })],
        spacing: { before: 240, after: 0 },
      }));
      return;
    }
    children.push(new Paragraph({
      children: [new TextRun({ text: line, font: 'Calibri', size: 22, color: '262626' })],
      spacing: { before: 0, after: 80 },
    }));
  });

  // Char counter
  children.push(new Paragraph({
    children: [
      new TextRun({ text: `[ ${post.texto.length} caracteres / 3000 máx do LinkedIn ]`, font: 'Calibri', size: 16, color: MUTE, italics: true }),
    ],
    alignment: AlignmentType.RIGHT,
    spacing: { before: 200, after: 200 },
  }));

  // Roteiro do carrossel (se houver)
  if (post.roteiro) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: '◆ ROTEIRO DO CARROSSEL', font: 'Calibri', size: 22, color: GOLD, bold: true })],
        spacing: { before: 280, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Monte os slides abaixo no Canva (template "Post LinkedIn Carrossel" 1080×1350px, paleta preto e dourado).', font: 'Calibri', size: 20, color: MUTE, italics: true })],
        spacing: { after: 200 },
      }),
    );

    const roteiroTable = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [9360],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: {
                top: { style: BorderStyle.SINGLE, color: GOLD, size: 4 },
                bottom: { style: BorderStyle.SINGLE, color: GOLD, size: 4 },
                left: { style: BorderStyle.SINGLE, color: GOLD, size: 4 },
                right: { style: BorderStyle.SINGLE, color: GOLD, size: 4 },
              },
              width: { size: 9360, type: WidthType.DXA },
              shading: { fill: 'FAF6E8', type: ShadingType.CLEAR },
              margins: { top: 240, bottom: 240, left: 240, right: 240 },
              children: post.roteiro.split('\n').map(line => {
                if (!line.trim()) return new Paragraph({ children: [new TextRun('')], spacing: { after: 60 } });
                const isSlideHeader = /^SLIDE \d+/i.test(line.trim());
                return new Paragraph({
                  children: [new TextRun({
                    text: line, font: 'Calibri', size: 20,
                    color: isSlideHeader ? '7A5C00' : '262626',
                    bold: isSlideHeader,
                  })],
                  spacing: { before: isSlideHeader ? 160 : 0, after: 40 },
                });
              }),
            }),
          ],
        }),
      ],
    });
    children.push(roteiroTable);
  }

  // Separador entre posts (espaço + linha)
  children.push(new Paragraph({
    children: [new TextRun('')],
    spacing: { before: 240, after: 240 },
    border: { bottom: { color: 'D4D4D4', space: 4, style: BorderStyle.SINGLE, size: 4 } },
  }));
});

// =====================================
// CRIA O DOCUMENTO
// =====================================
const doc = new Document({
  creator: 'L2 Automations',
  title: '30 Posts LinkedIn - L2 Automations',
  styles: {
    default: { document: { run: { font: 'Calibri', size: 22 } } },
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    children: children,
  }],
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = path.resolve(__dirname, '..', 'linkedin-posts.docx');
  fs.writeFileSync(outPath, buffer);
  console.log('✓ Documento criado:');
  console.log('  ' + outPath);
  console.log('  Tamanho: ' + (buffer.length / 1024).toFixed(1) + ' KB');
});
