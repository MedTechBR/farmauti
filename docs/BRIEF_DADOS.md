# Brief dos dados estruturados do FarmaUTI (bulário, interações, casos)

Leia antes `docs/BRIEF.md` (público, rigor clínico, regras de escrita). Tudo o que está lá vale aqui:
conferir na web o que for dose/conduta, citar fonte com ano, contexto brasileiro, notação ISMP,
nada de travessão em excesso, nada de metanarração. Os ids de fármaco são SEMPRE os de
`docs/farmacos.json` (não crie ids novos).

## Bulário (`lotes/bulario-a.json` e `lotes/bulario-b.json`)

Array JSON. Uma ficha por fármaco, ADULTO, foco no uso em UTI:

```json
{
 "id":"vancomicina", "nome":"Vancomicina", "classe":"Glicopeptídeo",
 "mecanismo":"…",
 "indicacoes":"principais usos na UTI",
 "dose":"dose de ataque e manutenção usuais; faixas; alvo terapêutico quando houver",
 "renal":"ajuste por faixa de TFG/ClCr e conduta em HD, TRS contínua; 'sem ajuste' quando for o caso",
 "hepatico":"ajuste na insuficiência hepática",
 "administracao":"reconstituição, diluente compatível, concentração, tempo de infusão, via periférica ou central, uso por sonda, fotossensibilidade",
 "monitorizacao":"o que e quando monitorar",
 "efeitos":"eventos adversos relevantes",
 "interacoes":"principais interações em texto corrido curto",
 "perolas":"2 a 4 dicas práticas para o farmacêutico de UTI",
 "altaVigilancia": true,
 "tags":["nefrotox","ototox"],
 "fonte":"Bula ANVISA (ano); diretriz X (ano)"
}
```

Cada campo de texto: 1 a 4 frases densas (sem HTML, sem markdown). `altaVigilancia` segue a lista de
medicamentos potencialmente perigosos de uso hospitalar do ISMP Brasil (confira a versão vigente).

`tags` alimenta o verificador de interações por efeito somado. Use SÓ estas, e só quando o efeito for
clinicamente relevante e reconhecido:
- `qt` prolonga QT (risco conhecido ou possível pela CredibleMeds)
- `serotonina` aumenta atividade serotoninérgica
- `sangramento` anticoagulante, antiplaquetário, trombolítico ou aumenta sangramento
- `hipercalemia` / `hipocalemia` eleva / reduz potássio
- `snc` depressão do SNC ou respiratória
- `nefrotox`, `ototox`, `hepatotox`, `mielotox`
- `bradicardia`, `hipotensao`, `convulsao` (reduz limiar convulsivo), `anticolinergico`, `hipoglicemia`
- `sub3a4` substrato do CYP3A4 cujo nível sobe/cai com relevância clínica
- `inib3a4` inibidor moderado ou forte do CYP3A4; `ind3a4` indutor do CYP3A4
- `quelante` cátion di/trivalente ou adsorvente que reduz absorção de outros por via oral/sonda
- `quelavel` absorção reduzida por quelantes (quinolonas, tetraciclinas, levotiroxina…)

## Interações (`lotes/interacoes.json`)

Array JSON de pares **específicos** e clinicamente relevantes na UTI (alvo: 230 a 280 pares). O app já
cobre sozinho os efeitos somados genéricos a partir das tags (dois fármacos com `qt`, por exemplo);
aqui entram os pares com mecanismo próprio, magnitude conhecida ou manejo específico, inclusive pares
clássicos de efeito somado que merecem manejo detalhado (ex.: linezolida + sertralina).

```json
{"a":"meropenem","b":"acido-valproico","grav":"grave","tipo":"PK",
 "mecanismo":"Carbapenêmicos inibem a acilpeptídeo hidrolase e reduzem a hidrólise do glicuronídeo de valproato…",
 "efeito":"Queda de 60 a 100% do nível de valproato em 24 a 48 h, com risco de crise.",
 "manejo":"Evitar a associação; trocar o anticonvulsivante (levetiracetam) ou o antimicrobiano. Aumentar a dose de valproato não resolve.",
 "evidencia":"estabelecida|provável|teórica",
 "fonte":"Referência com ano"}
```

- `grav`: `contraindicada` (não associar), `grave` (evitar ou exige intervenção e monitorização intensa),
  `moderada` (ajuste ou monitorização), `menor` (pouca relevância, documentar).
- `tipo`: `PK`, `PD` ou `PK/PD`. `a` e `b` em qualquer ordem; não repita o par.
- Cubra de forma equilibrada: antimicrobianos (azóis, macrolídeos, rifampicina, linezolida, quinolonas,
  carbapenêmicos, SMX-TMP, metronidazol, aminoglicosídeos e polimixinas com nefrotóxicos), sedoanalgesia,
  anticoagulantes e antiplaquetários, amiodarona, digoxina, anticonvulsivantes indutores, imunossupressores,
  psicofármacos, IBP, eletrólitos e quelação por sonda, estatinas, vasoativos.
- Seja honesto na evidência. Não invente magnitude numérica que você não confirmou.

## Casos clínicos (`lotes/casos.json`)

Array JSON com **18 casos** de acompanhamento farmacoterapêutico na UTI. Cada caso simula o que o
residente encontra no round: paciente, evolução, exames e a PRESCRIÇÃO do dia, com problemas
relacionados a medicamentos plantados para ele achar.

```json
{
 "id":"caso-01", "titulo":"Choque séptico de foco urinário em paciente em hemodiálise contínua",
 "area":"atb", "nivel":"intermediario",
 "resumo":"uma frase",
 "paciente":{"idade":67,"sexo":"F","peso":72,"altura":160,"alergias":"Nega"},
 "historia":"HDA, antecedentes, medicações de uso domiciliar, evolução na UTI (texto corrido, 120 a 250 palavras)",
 "sinais":[["PA","92/54 mmHg"],["FC","112 bpm"],["Temp.","38,4 °C"],["Diurese","0,3 mL/kg/h"],["RASS","-2"]],
 "labs":[["Creatinina","2,8 mg/dL","0,6–1,1"],["Potássio","5,9 mEq/L","3,5–5,0"]],
 "prescricao":[{"item":"Meropenem","dose":"2 g","via":"IV","freq":"8/8 h","obs":"infusão em 30 min"}],
 "tarefa":"Avalie a prescrição, identifique os problemas relacionados a medicamentos e proponha as intervenções.",
 "gabarito":[
  {"problema":"…","tipo":"Dose inadequada (necessidade/efetividade/segurança)","evidencia":"dados do caso que sustentam","intervencao":"o que propor à equipe, com a conta quando houver","prioridade":"alta|média|baixa"}
 ],
 "discussao":"2 a 4 parágrafos que explicam o raciocínio e o que monitorar depois",
 "leituras":["slugs de docs/curriculo.json que o caso exige"],
 "fontes":["Referência com ano"]
}
```

- 4 a 7 problemas por caso no gabarito, com classificação de PRM coerente com a leitura
  "acompanhamento-farmacoterapeutico" (necessidade, efetividade, segurança; ou a classificação de
  Cipolle/Strand/Morley, desde que consistente em todos os casos).
- Os 18 casos devem cobrir, juntos: ajuste renal e em TRS contínua; vancomicina por AUC; carbapenêmico
  com valproato; linezolida com ISRS; azol com tacrolimo em transplantado; QT longo por soma de fármacos
  com hipocalemia e hipomagnesemia; hipercalemia por associação; fenitoína com hipoalbuminemia;
  anticoagulação e sangramento com reversão; profilaxia de TEV em obeso e em LRA; sedação e delirium
  pela PADIS; bloqueio neuromuscular prolongado; vasoativos com cálculo de vazão; nutrição parenteral e
  síndrome de realimentação; cetoacidose diabética (insulina e potássio); estado de mal epiléptico;
  Enterobacterales resistente a carbapenêmico (KPC ou metalo); candidemia; conciliação medicamentosa na
  admissão; administração por sonda (omeprazol, fenitoína com dieta, liberação prolongada).
- Números coerentes entre si (peso, creatinina, TFG por CKD-EPI 2021, doses). Confira as contas.
- `nivel`: basico | intermediario | avancado (distribua: 5, 8, 5).
