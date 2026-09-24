# FarmaUTI — preparação para a residência em Farmácia em Terapia Intensiva

Criado em 23/09/2026 a pedido do Matheus, para quem **já foi aprovado** na residência multiprofissional
de Farmácia em Terapia Intensiva e começa em **01/03/2027**. Não é app de prova: é para chegar à UTI
sabendo agir. Ênfases pedidas: **interações medicamentosas, principais classes da UTI e
antibioticoterapia**, com farmacologia (básica a avançada), fisiologia e semiologia voltadas à
farmácia clínica e ao acompanhamento farmacoterapêutico. Pediu também cronograma da semana seguinte
(28/09/2026) até março, painel de desempenho e meta diária, e "layout semelhante ao do ClínicaMed
(colorido, ícones arredondados e interativos)".

Público de farmácia: **fica fora dos portais e da vitrine do MedTech** (regra de
`reference_linhas_de_produto` e `feedback_publicos_e_layout_pwa`). Sem login MedTech, sem trocador do
ecossistema, sem selo MedTech. Repo `MedTechBR/farmauti`, no ar em `medtechbr.com.br/farmauti/`.

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
  ao padrão; exportar/importar backup em Ajustes. Sem nuvem por enquanto (ver Pendências).
- PWA: `sw.js` com três baldes (`fu-vN` casca, `fu-leituras-v1`, `fu-ext-v1`), HTML rede-primeiro,
  estáticos em stale-while-revalidate. **Antes de todo commit: `python3 bump.py`** (sobe `CACHE`, `V` e
  os `?v=` do index juntos).
- `servir.py` (porta 8731) serve com `charset=utf-8`, como o GitHub Pages; `launch.json` do usuário
  tem a entrada `farmauti`. `FU_TESTE=_teste python3 monta.py` monta com dados fictícios de `_teste/`
  (fora do git) para mexer na interface sem depender do conteúdo.

## Abas
Início · Cronograma · Leituras · Cartões · Questões · Casos clínicos · Interações · Bulário ·
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
Filtros: área, leitura, nível, situação (não respondidas, caderno de erros, marcadas), misturar
(Fisher-Yates + sorteio ponderado por leitura). Simulado com cronômetro e correção no fim.

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

## Pendências e ideias
- Sincronizar o progresso numa conta (hoje só aparelho + backup por arquivo).
- Notificação diária de lembrete (precisa de push/servidor).
- Revisão humana por amostragem das doses do bulário e dos gabaritos dos casos.
