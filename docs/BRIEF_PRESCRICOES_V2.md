# Brief: prescrições mais completas (01/10/2026)

A pessoa pediu a aba de prescrições "mais interativa, layout mais bonito e mais completa". O layout é
trabalho do app; o seu trabalho é ENRIQUECER o conteúdo das prescrições do seu bloco, sem quebrar o
progresso já gravado.

Leia antes `docs/BRIEF_PRESCRICOES.md` (formato original) e `docs/BRIEF.md` (notação e escrita).
Fonte de verdade: leituras (`conteudo/*.html`), bulário (`lotes/bulario-*.json`) e interações
(`lotes/interacoes*.json`) do próprio app. Cota: no máximo 5 WebSearch.

## Regra que não pode ser quebrada
O progresso do aluno é gravado pela POSIÇÃO de cada item. **Não reordene, não acrescente e não remova
itens nem omissões**, e não mude `id`, `sem`, `tipos` nem o texto das linhas. Se achar erro clínico num
gabarito, corrija só `explicacao`/`correcao` e relate no fim.

## Campos novos (acrescentar em cada prescrição)
- `"resumo"`: 2 a 3 frases com o raciocínio de entrada, o que um farmacêutico experiente olha primeiro
  neste paciente e por quê (ex.: "TFG de 28 e oligúria mudam a dose de tudo que é eliminado pelo rim;
  potássio de 5,6 com IECA e espironolactona pede revisão imediata").
- `"dicas"`: 3 dicas progressivas, da mais vaga à mais direta, SEM entregar a resposta inteira
  (1. "Compare a função renal com cada antimicrobiano." 2. "Uma das linhas mistura dois fármacos que
  prolongam o QT." 3. "Olhe o potássio antes de olhar a linha 7.").
- Em CADA item sem problema: `"ok"`: 1 frase dizendo por que a linha está adequada para ESTE paciente
  (isto ensina a não dar falso alarme). Ex.: "Dose de meropeném já ajustada para TFG de 26 a 50."
- Em cada item com problema, dentro de `problema`: `"prioridade"`: "alta" | "media" | "baixa" (alta = risco de
  dano grave nas próximas horas).
- `"intervencao"`: o texto que o farmacêutico registraria ou diria ao prescritor, curto e cordial,
  priorizando o mais grave, 3 a 6 linhas (ex.: "Sugiro ajustar meropeném para 1 g 12/12 h (TFG 30 por
  CKD-EPI 2021)…").
- `"fixacao"`: 2 perguntas de múltipla escolha que fixam o principal aprendizado da prescrição, cada uma
  `{"p": "...", "alts": ["...","...","...","..."], "gab": 0-3, "exp": "por que a correta está certa e a
  pegadinha mais comum está errada"}`. Alternativas com comprimento parecido (90 a 110% da correta),
  gabarito variando de posição.

## Saída
Reescreva o seu arquivo `lotes/prescricoes-<bloco>.json` com tudo o que existia mais os campos novos.
Valide com `python3 docs/checa_lote.py lotes/prescricoes-<bloco>.json` (0 erros). Antes de gravar, compare
com o original por script: mesmos ids, mesmo número de itens e omissões, mesmos textos de linha.
Relatório final: o que corrigiu nos gabaritos e por quê.
