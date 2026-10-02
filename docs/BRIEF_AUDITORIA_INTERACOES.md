# Brief: auditoria da base de interações do FarmaUTI (01/10/2026)

A pessoa que usa o app (farmacêutica que vai começar a residência em UTI) reclamou: "você está colocando
interação com o motivo errado. Por exemplo, anlodipino e sinvastatina." O par existe, mas o mecanismo dizia
só "Inibição fraca do CYP3A4", sem dizer QUEM inibe e QUEM é afetado, e o efeito dizia "Aumento da
sinvastatina". Texto assim é ambíguo, não ensina, e em vários pares o motivo de fato está errado ou
invertido. Sua tarefa é auditar e reescrever, um a um, os pares da sua fatia.

Leia antes `docs/BRIEF.md` (notação ISMP, escrita sem travessão, sem metanarração) e `docs/BRIEF_DADOS.md`
(escala de gravidade). Os ids de fármaco estão em `docs/farmacos.json`.

## Para cada par da fatia

1. **Confira se a interação existe e é clinicamente relevante.** Se não existir, se o mecanismo for
   inventado ou se for irrelevante na UTI, marque `"remover": true` com `"motivo_remocao"`.
2. **Defina a direção**:
   - `"precipitante"`: id do fármaco que CAUSA a alteração (o inibidor, o indutor, o quelante, o que desloca);
   - `"objeto"`: id do fármaco que SOFRE a alteração.
   - Interação farmacodinâmica de soma de efeitos (dois prolongam o QT, dois sedam): `"precipitante": "ambos"`,
     `"objeto": "ambos"`.
   - Interação em que os dois se afetam: use "ambos" e explique no mecanismo.
3. **Reescreva o `mecanismo`** (1 a 3 frases) começando pelo precipitante e terminando na consequência
   farmacocinética ou farmacodinâmica, com a via exata. Modelo:
   - Ruim: "Inibição fraca do CYP3A4."
   - Bom: "O anlodipino é inibidor fraco do CYP3A4, principal via de metabolismo da sinvastatina. A sinvastatina
     sofre grande metabolismo de primeira passagem pelo CYP3A4, por isso mesmo uma inibição fraca aumenta
     bastante a sua exposição."
4. **Reescreva o `efeito`** dizendo o que acontece com o paciente, com a magnitude só se confirmada:
   - Bom: "A exposição à sinvastatina aumenta (AUC cerca de 1,8 vez) e sobe o risco de miopatia e
     rabdomiólise, que é dose-dependente."
5. **Reescreva o `manejo`** como conduta do farmacêutico: o que propor, dose-limite, alternativa, o que
   monitorar e por quanto tempo. Ex.: "Limitar a sinvastatina a 20 mg/dia ou trocar por estatina que não
   depende do CYP3A4 (rosuvastatina, pravastatina); orientar a observar dor muscular e dosar CPK se houver
   sintomas."
6. **Confira `grav`, `tipo` (PK, PD, PK/PD), `evidencia` e `fonte`.** A fonte deve ser real e conferível,
   com ano. Se a única fonte era "Stockley's 12ª ed., 2019" e você puder confirmar em bula (DailyMed/openFDA),
   artigo (PubMed) ou diretriz, troque ou acrescente. Não invente número de AUC, porcentagem ou ano.
7. Erros que já foram encontrados e que você deve caçar: direção invertida (quem inibe quem), mecanismo de
   classe errado (ex.: chamar de CYP3A4 o que é P-gp, OATP1B1, glicuronidação ou competição pela secreção
   tubular), interação farmacodinâmica descrita como farmacocinética, gravidade exagerada ou subestimada,
   manejo genérico ("monitorar") quando existe conduta específica na bula.

## Cota de buscas
No máximo **12 WebSearch** por agente (o teto da sessão é compartilhado por ~20 agentes). Prefira WebFetch
direto: openFDA (`https://api.fda.gov/drug/label.json?search=openfda.generic_name:"simvastatin"`), DailyMed,
PubMed eutils (`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/...`), Liverpool Drug Interactions
(hiv-druginteractions.org, covid19-druginteractions.org), tabela de CYP da FDA. Coerência com as leituras do
app (`conteudo/interacoes-*.html`) e com o bulário (`lotes/bulario-*.json`): se o app contradiz o que você
confirmou, relate no fim (não edite outros arquivos).

## Saída
Grave `lotes/revisao-int/parte-<N>.json`: um array com TODOS os pares da sua fatia (mesma ordem), cada um no
esquema completo: `a, b, precipitante, objeto, grav, tipo, mecanismo, efeito, manejo, evidencia, fonte`, mais
`"remover": true` e `"motivo_remocao"` quando for o caso, e `"mudou": "curta descrição do que estava errado"`
quando o conteúdo clínico mudou (não só a redação). Mantenha `a` e `b` como estão. Remova o campo `_arquivo`.

Validação: `python3 docs/checa_lote.py lotes/revisao-int/parte-<N>.json` com 0 erros.
No relatório final: quantos pares estavam com motivo errado ou invertido (com 3 a 5 exemplos), quantos
removidos e por quê, gravidades alteradas, buscas usadas.
