# Brief: expansão do bulário e da base de interações (24/09/2026)

Leia antes `docs/BRIEF.md` (rigor, notação ISMP, escrita) e `docs/BRIEF_DADOS.md` (esquema EXATO das fichas
do bulário, vocabulário de tags e esquema das interações). Tudo o que está lá vale aqui.

O bulário tinha 152 fármacos e a base 267 pares. Entraram **134 fármacos novos**, listados em
`docs/farmacos-novos.json` (id, nome, grupo); a lista completa e canônica é `docs/farmacos.json` (286).
Use SÓ esses ids.

## Cota de buscas (obrigatória)
A sessão inteira tem um teto de cerca de 200 buscas web somando todos os agentes, e na rodada anterior
ele acabou no meio. **Cada agente pode fazer no máximo 25 WebSearch.** Prefira WebFetch direto em fonte
conhecida: DailyMed (bula FDA), bulário eletrônico da ANVISA, PubMed/Europe PMC (eutils), Guia
Farmacêutico do HSL, diretrizes em PMC. Quando não conseguir confirmar, escreva de forma que não dependa
do número ou diga que segue o protocolo institucional; nunca invente.

## Coerência com o que já existe
O app já tem leituras (`conteudo/*.html`), fichas (`lotes/bulario-a|b|c.json`) e pares
(`lotes/interacoes.json`). O que você escrever não pode contradizer isso. Antes de escrever uma ficha ou
um par, procure (grep) o fármaco nas leituras e nas fichas existentes. Se achar erro no que já existe,
não mexa no arquivo: relate no relatório final.

## Disponibilidade no Brasil
Vários novos têm registro limitado ou nenhum no Brasil (ex.: fomepizol, tedizolida, dalbavancina,
aztreonam-avibactam, meropenem-vaborbactam, isoprenalina, metaraminol, edoxabana, droperidol, foscarnet,
lorazepam injetável). Diga isso na ficha, como no bulário atual ("confirme na padronização local"),
sem afirmar o que não confirmou.
