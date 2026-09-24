# Brief de conteúdo do FarmaUTI

App de estudo para quem **já foi aprovado** na residência multiprofissional de **Farmácia em Terapia
Intensiva** e começa em março de 2027. O objetivo não é passar em prova: é chegar à UTI no primeiro dia
sabendo agir. Público: farmacêutico recém-formado, com base de graduação, que precisa ir de farmacologia
básica a avançada, fisiologia e semiologia **aplicadas ao acompanhamento farmacoterapêutico do paciente
crítico**. Ênfase declarada pela pessoa: **interações medicamentosas, principais classes de medicamentos
da UTI e antibioticoterapia**.

Pasta do projeto: `/Users/matheusparente/Documents/Claude/farmauti/`.
Currículo completo (todas as leituras, áreas e semanas): `docs/curriculo.json`.
Lista canônica de fármacos (ids usados em bulário e interações): `docs/farmacos.json`.

## Regra de ouro: rigor clínico

- **Nunca escrever conduta, dose ou recomendação de memória sem conferir.** Use WebSearch/WebFetch para
  confirmar a diretriz VIGENTE (2023–2026) de cada tema antes de escrever. Diretrizes mudam; seu
  conhecimento de treino pode estar defasado. Exemplos que já sabemos terem versão nova: Surviving Sepsis
  Campaign 2026, KDIGO 2024 (DRC), ADA 2026. Confirme também: SCCM PADIS (2018 e atualização focada de
  2025, se existir), IDSA Guidance on the Treatment of Antimicrobial-Resistant Gram-Negative Infections
  (versão mais recente), consenso ASHP/IDSA/PIDS/SIDP 2020 de vancomicina, ESPEN 2023 / ASPEN de nutrição
  no crítico, ensaios recentes (BLING III 2024, REVISE 2024 etc.).
- **Cite fonte e ano** em toda recomendação relevante. Nunca invente referência, DOI, número de página,
  classe de recomendação ou nível de evidência. Se não conseguiu confirmar, escreva de forma que não
  dependa do dado ou deixe claro que é prática usual e varia por protocolo institucional.
- Contexto **brasileiro**: ANVISA, BrCAST (pontos de corte), ISMP Brasil, CFF (Resoluções 585/2013 e
  586/2013 e o que houver de mais recente), RDC 7/2010 (UTI), RDC 36/2013 e Programa Nacional de
  Segurança do Paciente, disponibilidade no Brasil (ex.: bromoprida e dipirona existem aqui; labetalol
  e clevidipino injetáveis não são comercializados; lorazepam injetável não é comercializado — confira).
- Função renal: o padrão do ecossistema para ESTIMAR a TFG é **CKD-EPI 2021 sem raça**. Ao ensinar
  ajuste de dose, explique que para dose o KDIGO recomenda a TFG **não indexada** (mL/min, desfazendo
  o 1,73 m² pela superfície corporal) e que bulas e tabelas antigas usam Cockcroft-Gault; ensine os dois
  conceitos, mas qualquer exemplo de cálculo "padrão" usa CKD-EPI 2021.
- Doses sempre de **adulto**, em notação brasileira (vírgula decimal: 0,5 mg/kg), com unidade explícita
  (mg, mcg, UI, mEq, mmol) e via. Nunca abreviar "U" para unidades nem "µg" (use mcg). Nunca usar zero à
  direita (5 mg, não 5,0 mg) nem vírgula sem zero à esquerda (0,5, não ,5): são regras do ISMP.
- Direito autoral: escreva texto **próprio**. Não copie parágrafos de livros, bulas, UpToDate ou
  diretrizes. Tabelas de dose podem sintetizar dados de fontes públicas com citação.

## Regras de escrita (a pessoa rejeita "cara de texto gerado")

- Português do Brasil, registro de manual técnico (tipo Goodman, Koda-Kimble, Sanford), não de blog.
- **Travessão (—) quase nunca.** Use vírgula, parênteses ou ponto. No máximo 2 por mil palavras.
- Títulos e h2 são **substantivos** ("Vancomicina", "Dose de ataque"), nunca "Assunto: manchete".
- Sem metanarração: proibido "Neste texto", "Nesta leitura", "Vamos ver", "Em resumo", "É importante
  ressaltar", "Vale lembrar". Sem frase de efeito no fim de seção. Sem "não é X, é Y" repetido.
- h2 **sem numeração**. Sem emoji. Negrito com parcimônia (termos-chave, no máximo ~1 por parágrafo).
- Exemplos numéricos e casos curtos são bem-vindos: é assim que se aprende a calcular e decidir.

## Leituras (conteúdo teórico)

Cada leitura é um **fragmento HTML** em `conteudo/<slug>.html` (sem `<html>`, `<head>`, `<body>`,
`<style>` ou `<script>`). O app aplica o estilo. Extensão: **2.800 a 4.500 palavras** (a de cálculos e a
de antimicrobianos podem passar disso). Denso, profundo, do básico ao avançado dentro do tema.

Estrutura:
1. Primeira linha: `<p class="dek">…</p>` com o escopo e as fontes principais em uma ou duas frases
   ("Mecanismo, espectro, dose e toxicidade dos aminoglicosídeos e polimixinas, com base no consenso
   internacional de polimixinas de 2019 e nas bulas brasileiras.").
2. Seções com `<h2>` e subseções `<h3>`. Parágrafos `<p>`, listas `<ul>/<ol>`.
3. Tabelas SEMPRE embrulhadas: `<div class="tab"><table><thead>…</thead><tbody>…</tbody></table></div>`.
4. Caixas (use as quatro ao longo do texto; `farma` é obrigatória, ao menos duas por leitura):
   - `<div class="cx chave"><b>Ponto-chave</b><p>…</p></div>`
   - `<div class="cx alerta"><b>Atenção</b><p>…</p></div>` (risco, armadilha, erro grave)
   - `<div class="cx farma"><b>Na prática do farmacêutico</b><p>…</p></div>` (o que olhar na prescrição,
     que intervenção fazer, o que monitorar, como argumentar com a equipe)
   - `<div class="cx calculo"><b>Exemplo de cálculo</b><p>…</p></div>` (conta resolvida passo a passo)
   Pode trocar o título em negrito quando fizer sentido (ex.: `<b>Caso</b>`), mantendo a classe.
5. Fluxograma opcional (até 2 por leitura), mermaid:
   `<div class="fluxo"><div class="leg"><b>Fluxograma</b> descrição curta</div><pre class="mermaid">
   flowchart TD
     A["Texto"] --> B["Texto"]
   </pre></div>` Rótulos sempre entre aspas, `<br/>` para quebrar linha, sem parênteses fora das aspas.
6. Em leituras de classe de medicamento e de antimicrobiano: seção **"Interações relevantes"** (tabela
   fármaco × efeito × manejo) e seção sobre **monitorização**.
7. Penúltima seção `<h2>Erros frequentes</h2>` (lista de erros reais de prescrição/administração/raciocínio).
8. Última seção `<h2>Perguntas de revisão</h2>` com 5 a 8 itens
   `<details class="rev"><summary>Pergunta</summary><p>Resposta</p></details>`.
9. Fecha com `<section class="fontes"><h2>Referências</h2><ol><li>…</li></ol></section>` com as fontes
   primárias (autor/entidade, título, periódico ou editora, ano). Só o que você realmente conferiu.

Classes permitidas além das tags comuns: `dek`, `tab`, `cx chave|alerta|farma|calculo`, `fluxo`, `leg`,
`mermaid`, `rev`, `fontes`. Não invente outras (o app não as estiliza).

## Cartões (flashcards) e questões: `lotes/<agente>.json`

Cada agente de leitura grava UM arquivo JSON estrito (`lotes/a1.json` etc.):

```json
{
 "leituras": [
  {"slug":"parametros-pk","titulo":"Parâmetros farmacocinéticos e seus cálculos",
   "dek":"mesmo texto do <p class=dek>","palavras":3650,"fontes":["Rowland & Tozer, 5ª ed., 2019"]}
 ],
 "cartoes": [
  {"leitura":"parametros-pk","frente":"Pergunta objetiva","verso":"Resposta curta (até ~60 palavras)"}
 ],
 "questoes": [
  {"leitura":"parametros-pk","nivel":"basico|intermediario|avancado",
   "enun":"Enunciado (vinheta clínica sempre que possível)",
   "alts":["A","B","C","D","E"], "gab":2,
   "coment":"Comentário que ensina (mínimo 250 caracteres)",
   "porAlt":["por que A está errada/certa","…","…","…","…"],
   "base":"Fonte e ano (ex.: ASHP/IDSA/PIDS/SIDP 2020)"}
 ]
}
```

- **14 cartões por leitura.** Frente = pergunta direta (não cloze). Mistura de tipos: conceito, mecanismo,
  dose, ajuste, monitorização, interação, cálculo curto, "o que fazer se…". Verso curto e exato.
- **6 questões por leitura**, 5 alternativas, uma só correta, 2 básicas + 2 intermediárias + 2 avançadas.
  Pelo menos metade com vinheta de paciente de UTI e prescrição.
- **Viés de tamanho (proibido):** questão gerada por IA costuma ter a correta muito mais longa. Aqui,
  TODAS as alternativas devem ter comprimento entre 90% e 110% do comprimento da correta. Distratores
  errados por **conteúdo** (dose errada, mecanismo trocado, conduta invertida, fármaco parecido), nunca
  por vagueza. Não concentre "sempre/nunca/apenas" nos distratores. Acentue os distratores normalmente.
- Varie a posição do gabarito (0 a 4) de forma equilibrada dentro do seu lote.
- `porAlt` tem 5 itens, um por alternativa, na mesma ordem.

## Validação antes de terminar

- `python3 -c "import json;json.load(open('lotes/<agente>.json'))"` precisa passar.
- Conte as palavras de cada leitura (`python3 - <<'E'` com regex de tags) e registre em `palavras`.
- Rode `python3 docs/checa_lote.py lotes/<agente>.json` (confere estrutura, contagens e viés de tamanho)
  e corrija tudo o que ele apontar.
- Escreva SOMENTE os seus arquivos. Não edite arquivos de outros agentes nem o app.

No relatório final: lista das leituras com contagem de palavras, fontes confirmadas na web (com ano),
qualquer ponto em que a diretriz mudou recentemente e o que você deixou de fora por não conseguir
confirmar.
