# Brief: atividade "Avaliação de prescrições" do FarmaUTI

Leia antes `docs/BRIEF.md` (público, regras de escrita e notação ISMP) e `docs/curriculo.json`.

## O que é

Treino de triagem de prescrição, a tarefa que o residente de farmácia faz todo dia na UTI: abre a
prescrição do paciente, lê em 3 a 5 minutos, marca as linhas com problema e diz qual é o problema.
É diferente dos casos clínicos (que são longos e discursivos): aqui a prescrição é curta, realista,
no formato de prescrição médica de UTI brasileira, e o aluno TOCA nas linhas problemáticas. Depois o
app mostra o gabarito linha a linha: acerto, problema perdido e falso alarme.

As prescrições são **fictícias**. Nomes de paciente não aparecem (só idade, sexo, peso e altura).

## Fonte de verdade: o próprio app

A cota de buscas web desta sessão está esgotada. Não dependa de WebSearch. Toda dose, ajuste,
interação ou regra de administração que você usar como gabarito deve estar de acordo com o conteúdo
que JÁ está no app:
- as leituras em `conteudo/<slug>.html` (leia as que o seu bloco de semanas cobre);
- o bulário em `lotes/bulario-a.json`, `lotes/bulario-b.json`, `lotes/bulario-c.json`;
- a base de interações em `lotes/interacoes.json`.
Se o app diz X, o gabarito não pode dizer Y. Se precisar de algo que o app não cobre, prefira outro
erro que ele cubra. WebFetch direto em bula/diretriz é aceitável para desempate, sem busca.

## Formato (`lotes/prescricoes-<bloco>.json`, array JSON)

```json
{
 "id": "rx-07",
 "sem": 3,
 "titulo": "Pós-operatório de colectomia com LRA",
 "setor": "UTI cirúrgica",
 "nivel": "basico|intermediario|avancado",
 "paciente": {"idade": 71, "sexo": "M", "peso": 84, "altura": 172, "alergias": "Dipirona (urticária)"},
 "contexto": "2 a 4 frases: diagnóstico, dia de internação, dispositivos (SNE, CVC, TRS, VM), o que mudou hoje.",
 "dados": [["Creatinina", "2,1 mg/dL (ontem 1,2)"], ["TFG CKD-EPI 2021", "31 mL/min/1,73 m²"], ["K", "5,6 mEq/L"], ["Diurese 24 h", "450 mL"]],
 "itens": [
  {"texto": "Dieta enteral 1,5 kcal/mL a 50 mL/h por SNE", "problema": null},
  {"texto": "Dipirona 1 g IV 6/6 h se dor ou febre",
   "problema": {"tipos": ["contraindicacao"], "explicacao": "Paciente alérgico à dipirona (urticária).", "correcao": "Suspender; paracetamol 1 g por SNE 6/6 h se dor ou febre."}}
 ],
 "omissoes": [
  {"texto": "Profilaxia de tromboembolismo ausente", "explicacao": "Pós-operatório abdominal imóvel, sem sangramento: indicação clara.", "correcao": "Enoxaparina 40 mg SC 1x/dia (TFG ≥ 30) ou HNF 5.000 UI SC 8/8 h ou 12/12 h se TFG < 30."}
 ],
 "comentario": "2 a 4 frases de fechamento: prioridade das intervenções e o que monitorar.",
 "leituras": ["dose-disfuncao-renal", "eletrolitos"]
}
```

Regras:
- `itens`: **8 a 14 linhas**, escritas como numa prescrição real (fármaco, dose, via, frequência,
  diluição/velocidade quando é o caso; dieta, soro de manutenção, eletrólitos). Não numere o texto, o
  app numera.
- **3 a 6 linhas com problema** e o restante correto (as linhas corretas são o distrator: precisam ser
  plausíveis, inclusive algumas "suspeitas" que na verdade estão certas, como uma dose alta que é a
  certa para aquela indicação).
- **0 a 2 `omissoes`** (indicação sem tratamento ou monitorização obrigatória ausente, sem linha).
- `tipos` usa SÓ estes ids (um problema pode aceitar mais de um tipo quando ambos forem defensáveis):
  - `dose` dose alta ou baixa para a indicação/peso
  - `renal` sem ajuste à função renal, TRS ou hepática
  - `intervalo` frequência, duração ou horário inadequado
  - `interacao` interação medicamentosa relevante (diga com qual linha)
  - `via` via ou forma farmacêutica inadequada (inclui triturar liberação prolongada por sonda)
  - `admin` diluição, concentração, velocidade de infusão ou incompatibilidade
  - `duplicidade` duplicidade terapêutica
  - `semindicacao` medicamento sem indicação (ou mantido além do necessário)
  - `contraindicacao` contraindicação, alergia ou condição do paciente
  - `redacao` erro de redação: abreviação perigosa, zero à direita, "U" por unidade, falta de dado essencial, ambiguidade
  - `monitorizacao` falta nível sérico, exame ou parâmetro obrigatório ligado àquela linha
- `explicacao` curta e exata (1 a 3 frases), citando os dados do paciente que provam o problema.
  `correcao` = o que o farmacêutico propõe, com a conta quando houver dose.
- Números coerentes: TFG sempre por **CKD-EPI 2021** (confira a conta: `142 × min(Scr/k,1)^a ×
  max(Scr/k,1)^-1,200 × 0,9938^idade × 1,012 se mulher`; k 0,7 F / 0,9 M; a -0,241 F / -0,302 M),
  peso ideal por Devine quando usar, vazões de bomba conferidas.
- **Coerência com o cronograma:** o campo `sem` é a semana em que a prescrição entra no plano. Todas as
  `leituras` listadas precisam ser de semanas ≤ `sem` (ver `docs/curriculo.json`). Os problemas devem
  ser resolvíveis com o que foi estudado até ali, mais o bulário (sempre disponível). Nas semanas 1 a 6,
  quando ainda não houve leitura de classes de medicamentos, os erros devem ser os universais: redação
  ISMP, dose por peso, conta, intervalo incompatível com a meia-vida, via, duplicidade, alergia,
  medicamento sem indicação, eletrólito concentrado mal diluído.
- **3 prescrições por semana** do seu bloco, variando setor (clínica, cirúrgica, neurológica,
  cardiológica, trauma, oncológica, transplante, obstétrica), idade, sexo e gravidade, e crescendo em
  dificuldade dentro do bloco. Cubra, somando o bloco, todos os 11 tipos de problema; `interacao`,
  `renal` e `dose` são os mais frequentes na vida real e devem aparecer mais.
- Nada de travessão em excesso nem metanarração. Siglas usuais de prescrição (IV, SC, VO, SNE, ACM,
  SF 0,9%, SG 5%, BIC) são permitidas; nas linhas com problema `redacao`, a abreviação perigosa é o erro.

## Validação

`python3 docs/checa_lote.py lotes/prescricoes-<bloco>.json` tem de passar com 0 erros. Escreva só o seu
arquivo. No relatório final: lista (id, semana, título, tipos usados) e qualquer ponto em que o app
pareceu contradizer a si mesmo (leitura × bulário × interações), que é informação valiosa.
