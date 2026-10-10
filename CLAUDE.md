# FarmaUTI — preparação para a residência em Farmácia em Terapia Intensiva

Criado em 23/09/2026 a pedido do Matheus, para quem **já foi aprovado** na residência multiprofissional
de Farmácia em Terapia Intensiva e começa em **01/03/2027**. Não é app de prova: é para chegar à UTI
sabendo agir. Ênfases pedidas: **interações medicamentosas, principais classes da UTI e
antibioticoterapia**, com farmacologia (básica a avançada), fisiologia e semiologia voltadas à
farmácia clínica e ao acompanhamento farmacoterapêutico. Pediu também cronograma da semana seguinte
(28/09/2026) até março, painel de desempenho e meta diária, e "layout semelhante ao do ClínicaMed
(colorido, ícones arredondados e interativos)".

Público de farmácia. **Desde 10/10/2026 é vendido no MedTech** (produto `farmauti` do `planos.json`, linha
provas, R$ 49,90/mês ou R$ 397/ano) e **só abre com conta MedTech** (ver "Conta e venda"). Continua sem
trocador de apps do ecossistema e sem links para apps de médicos (público diferente). Repo
`MedTechBR/farmauti`, no ar em `medtechbr.com.br/farmauti/`.

## Arquitetura (sem framework, sem build)
- `index.html` (casca) + `app.css` + `app.js`. Roteamento por hash (`#leituras/<slug>`, `#casos/<id>`,
  `#bulario/<id>`, `#calculadoras/<id>`, `#questoes/simulado`, `#cartoes/<slug>`), então o voltar do
  celular funciona.
- **Dados gerados**: `python3 monta.py` lê `docs/curriculo.json`, `docs/farmacos.json` e `lotes/*.json`
  e grava `dados/estudo.js` (áreas, leituras, semanas, cartões, questões, casos, índice de busca) e
  `dados/referencia.js` (fármacos, bulário, interações). **Nunca editar `dados/` à mão.**
- Leituras são fragmentos HTML em `conteudo/<slug>.html`, buscados sob demanda e estilizados pelo app
  (classes permitidas no `docs/BRIEF.md`). Mermaid carregado do jsDelivr só se a página tiver fluxograma.
- Ids de cartão/questão = hash do CONTEÚDO (leitura + texto), nunca posição.
- Progresso: `localStorage` com prefixo `fu_` + espelho em IndexedDB (`farmauti/s/estado`) restaurado
  se o localStorage vier vazio; texto corrompido é guardado em `fu_<chave>_corrompido` antes de voltar
  ao padrão. Desde 10/10/2026 também na conta MedTech (ver "Conta e venda"); o backup por arquivo saiu.
- PWA: `sw.js` com três baldes (`fu-vN` casca, `fu-leituras-v1`, `fu-ext-v1`), HTML rede-primeiro,
  estáticos em stale-while-revalidate. **Antes de todo commit: `python3 bump.py`** (sobe `CACHE`, `V` e
  os `?v=` do index juntos).
- `servir.py` (porta 8731) serve com `charset=utf-8`, como o GitHub Pages; `launch.json` do usuário
  tem a entrada `farmauti`. `FU_TESTE=_teste python3 monta.py` monta com dados fictícios de `_teste/`
  (fora do git) para mexer na interface sem depender do conteúdo.

## Abas
Início · Cronograma · Leituras · Cartões · Questões · Casos clínicos · Prescrições · Interações · Bulário ·
Calculadoras · Desempenho · Ajustes. Celular: Início, Leituras, Cartões, Questões + "Mais".
Cor por seção via `body[data-aba]` → `--ac` (camada viva do ClínicaMed): índigo, verde, violeta, âmbar,
azul, rosa, vermelho, teal, laranja, ciano, cinza. Sem gradiente, sem emoji, fonte do sistema.

## Cronograma (`plano()` em app.js)
22 semanas a partir de `cfg.inicio` (padrão 28/09/2026; Ajustes muda e o plano inteiro se desloca).
Seg/qua/sex: leitura + cartões + questões dela (4 leituras: seg/ter/qui/sex). Ter/qui: 10 questões
intercaladas das semanas anteriores e casos clínicos (o caso cai na semana da última leitura que ele
exige). Sábado: revisão da semana (20 questões). Semana 12: simulado de 30; semana 22: simulado de 60.
Leitura, cartões, questões, casos e simulados **se marcam sozinhos** pelo que foi feito; as de
revisão contam as questões respondidas naquele dia; qualquer uma pode ser marcada à mão.

## Cartões
Variante do SM-2 (Errei/Difícil/Bom/Fácil). Novos por dia em `cfg.novos` (20); os novos vêm das
leituras lidas ou das semanas já liberadas. "Dominado" = intervalo ≥ 21 dias.

## Questões
Ordem de exibição das alternativas por `ordemAlts(q)` (hash do id); histórico grava o índice ORIGINAL.
Filtros: áreas (várias de uma vez, `mtfiltro.js` de `~/Documents/Claude/_mtfiltro/`, não editar a cópia),
leitura, nível, situação (não respondidas, caderno de erros, marcadas), misturar
(Fisher-Yates + sorteio ponderado por leitura). Simulado com cronômetro e correção no fim, também com várias áreas.
Filtro = `{areas: [...], ...}` (vazia = todas; até 25/09/2026 era `area` string, `normFiltro()` converte) e fica
gravado em `ST.pos.q.f`, então recarregar mantém filtro e posição.

Sinalizar erro (26/09/2026): bandeira `mtsinal.js` (cópia de `~/Documents/Claude/_mtsinal/`, não editar) no alto da
questão, no gabarito do simulado e no cartão; `ST.sinal` (chave = id da questão/cartão) entra no backup; lista
"Questões sinalizadas" no fim de Desempenho. Cada ação vai também à caixa central do Matheus
(`medtechbr.com.br/sinalizacoes.html`, função `mtSinal`, app `farmauti`, sem conta: id aleatório do aparelho).

## Interações
`analisaInt()`: pares específicos de `lotes/interacoes.json` primeiro; depois **efeitos somados** a
partir das `tags` do bulário (QT, serotonina, sangramento, K+, SNC, nefro/oto/hepato/mielotox,
bradicardia, hipotensão, convulsão, anticolinérgico, hipoglicemia) e alertas gerais de CYP3A4
(inibidor/indutor × substrato) e quelação, só quando o par não está coberto pela base específica.

## Conteúdo (rigor)
Escrito por 15 agentes em paralelo em 23/09/2026 com `docs/BRIEF.md` e `docs/BRIEF_DADOS.md`:
10 lotes de leituras (a1–a10, 64 leituras, 14 cartões e 6 questões por leitura), bulário em 3 partes,
base de interações e 18 casos. Cada agente conferiu diretriz vigente na web e citou fonte com ano.
`python3 docs/checa_lote.py lotes/<arquivo>.json` valida estrutura, contagens, travessões,
metanarração e **viés de tamanho** das alternativas (correta mais longa em mais de 45% derruba).
Função renal: CKD-EPI 2021 (padrão do ecossistema) com desindexação para dose.
Achado do bulário A: a lista ISMP Brasil de MPP hospitalar vigente é a de 2019.
Limite de ~200 buscas web por sessão pode ter cortado a verificação de alguns agentes: os relatórios
de cada um listam o que não conseguiram confirmar.

## Avaliação de prescrições (24/09/2026)
Aba "Prescrições": 66 prescrições fictícias de UTI (3 por semana, `lotes/prescricoes-a|b|c.json`, brief em
`docs/BRIEF_PRESCRICOES.md`), cada uma com 8 a 14 linhas, 3 a 6 erros plantados em 11 tipos e até 2 omissões.
O aluno marca as linhas e o tipo; nota = (achados + omissões − metade dos falsos alarmes) ÷ total. Tarefa "P"
do cronograma em ter/qui/sáb, marcada sozinha ao corrigir. Gabaritos escritos a partir das leituras e do
bulário do próprio app; os agentes apontaram contradições internas, corrigidas na mesma rodada.

## Expansão do bulário e das interações (24/09/2026)
`docs/farmacos.json` foi de 152 para 286 (lista dos novos em `docs/farmacos-novos.json`; grupos novos:
antídotos, respiratório, hematologia, antiparasitários). Fichas em `lotes/bulario-d|e|f|g.json`; pares em
`lotes/interacoes-2.json` (novos cardiovasculares/endócrino/GI/imuno) e `interacoes-3.json` (novos de
sedação, psicofármacos, antídotos, anti-infecciosos). `monta.py` lê `interacoes*.json` em ordem e o par
já existente vence. Total: 684 pares. Cota de 25 buscas por agente funcionou (usaram 0 a 12).

## Rodada de 01/10/2026: revisão essencial, auditoria das interações, prescrições v2
Pedidos dela: (1) "você aprofunda, mas não explica": conteúdo de revisão objetivo que ensina o básico e agrega
nas questões, prescrições e casos; (2) "interação com o motivo errado (anlodipino e sinvastatina)": revisar
TODAS; (3) prescrições "mais interativas, layout mais bonito, mais completas".
- **Revisão essencial**: `conteudo/revisao/<slug>.html` para as 64 leituras (brief `docs/BRIEF_REVISAO.md`,
  validador `docs/checa_revisao.py --todas`). Estrutura fixa: O que é e por que importa (glossário `dl.gl`),
  Como funciona (`ol.passos`), O essencial em números, Como aparece na prescrição, Como cai nas questões e nos
  casos, Teste rápido. Abre PRIMEIRO no leitor (`modoLeitura`, abas "Revisão essencial / Texto completo");
  concluir a revisão (`ST.revs`) já cumpre a tarefa de leitura do cronograma. Busca por seção força o texto completo.
- **Interações**: cada par tem `precipitante` e `objeto` (id ou "ambos"); o app mostra "A → B", a frase de
  quem causa e quem sofre e três blocos (por que acontece, o que acontece com o paciente, o que o farmacêutico
  faz). Auditoria em 6 fatias (`docs/BRIEF_AUDITORIA_INTERACOES.md`, `lotes/revisao-int/`), aplicada por
  `docs/aplica_auditoria.py` (log em `docs/auditoria_interacoes_log.json`): 158 pares com conteúdo clínico
  corrigido, 7 removidos (não eram interação), 677 no total. Tags do bulário auditadas (`docs/auditoria_tags.json`):
  amiodarona deixou de ser `inib3a4`; QT entrou em propofol, dexmedetomidina, tramadol, terlipressina etc.
  **Decisão**: fármacos de risco QT "condicional" na CredibleMeds (quetiapina, olanzapina, azóis…) MANTÊM a tag
  `qt`, porque a condição (hipocalemia, outro QT, doença grave) é a regra na UTI.
- **Prescrições v2**: etapas (paciente, triagem, correção, fixação), folha com faixa de alergia, dicas
  progressivas, tipo + "sua intervenção" por linha, painel de resultado, "só os problemas", "por que esta linha
  está certa" (`ok`), prioridade, raciocínio (`resumo`), modelo de comunicação (`intervencao`, copiar), 2 perguntas
  de fixação; lista com acerto por tipo de erro, filtros de nível e situação, e Modo plantão (3 seguidas).
  Os campos novos foram acrescentados SEM mexer em itens (progresso gravado por posição).
- Divergências entre leituras e bulário encontradas pelos agentes e corrigidas: `docs/PENDENCIAS_01-10.md`.

## Conta e venda (10/10/2026)
- `mtsync.js` = cópia SEM mudança de `~/Documents/Claude/_mtsync/mtsync.js`, síncrono no `<head>` (portão de login
  antes do primeiro pixel). `conta-farmauti.js` = adaptador (desenho do `conta-estudo.js`): espera o evento
  `fu-pronto` do app (ganchos em `window.__fu`), nuvem em `users/{uid}/apps/farmauti/sync`. `/_mtacesso.js?v=8`
  (do site) faz CPF e paywall: `MTAcesso.verificar({appId: "farmauti"})`. SDK do Firebase vem de
  `/vendor/firebase/` do site. Os três + `_mtacesso.js` estão no precache do `sw.js`; `/planos.json` é rede primeiro.
  `bump.py` não mexe em `?v=` de caminho absoluto (o `_mtacesso.js?v=8` tem versão própria).
- Coleções: `mapa` por item para lidas, prog, notas, resp, fav, srs, tarefas, casos, presc, revs, sinal (dois
  aparelhos se unem item a item; no mesmo item a nuvem vence no primeiro login); `lista` sims (id = ts); `soma`
  ativ (o adaptador converte `{dia: {q, qa, c, cn, min, l, rx}}` em `"dia|campo": n`; `seg` e `meta` ficam no
  aparelho); `doc` cfg. Fora: pos, recentes, tema, fu_mts*, fu_*_corrompido.
- **Regra do dono: nada do progresso no aparelho é apagado por causa da conta.** Primeiro login: cópia crua de
  todas as chaves `fu_*` (+ espelho) no IndexedDB `farmauti-reserva`, chave `antes-da-conta` (imutável, conferida
  lendo de volta). `limparLocal` (Sair da conta e troca de conta) NÃO apaga: grava `saida-<uid>-<momento>` na
  reserva e guarda o estado do motor em `fu_mtsr:<uid>` (a mesma conta, ao voltar, continua sem somar de novo
  as contagens). **Consequência aceita: outra conta que entrar no mesmo aparelho recebe esse progresso.**
  O adaptador nunca grava vazio por cima de chave com itens; chave corrompida ou vazia aqui com a nuvem cheia
  não sobe exclusões (a base do motor dela é zerada e a nuvem a devolve). "Apagar todo o progresso" saiu.
- Primeiro login do aparelho: as contagens de `ativ` entram somadas às da conta (`somaIni` gravado antes de o motor
  nascer), salvo se o estado veio do espelho IndexedDB.
- Sinalizações vão à caixa central com o token da conta. Teste: cópia fora do repo com `fake-firebase.js`
  (ver `_mtsync/README.md`) e um script que dá `getIdTokenResult` ao usuário falso (`__fakeMt`).

## Pendências e ideias
- Notificação diária de lembrete (precisa de push/servidor).
- Revisão humana por amostragem das doses do bulário e dos gabaritos dos casos.
