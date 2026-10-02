# Brief: "Revisão essencial" de cada leitura do FarmaUTI (01/10/2026)

## O pedido
A pessoa que usa o app disse sobre as leituras atuais: "você coloca coisas que são bem específicas, mas você
esquece de aprofundar o básico. Você aprofunda, mas você não explica. Eu quero um conteúdo que seja para
revisão, para ir sabendo o básico de forma objetiva, que agregue nas questões, nas prescrições e nos casos
clínicos."

Ela é farmacêutica recém-formada, aprovada na residência de Farmácia em Terapia Intensiva. As leituras
longas (`conteudo/<slug>.html`) continuam no app como aprofundamento. A Revisão essencial vira a PRIMEIRA
coisa que ela lê de cada tema: curta, objetiva, que EXPLICA do zero e liga cada conceito ao que ela vai
encontrar na prescrição, nas questões e nos casos.

## Regras de ouro
1. **Explicar antes de detalhar.** Todo termo técnico é definido na primeira vez que aparece, em uma frase
   simples. Toda afirmação traz o porquê ("a dose de ataque não muda na insuficiência renal PORQUE ela
   depende do volume de distribuição, e não da eliminação"). Nada de citar um número sem dizer de onde ele
   vem ou para que serve.
2. **O básico primeiro, sempre.** Comece do que a graduação pode ter deixado frouxo e suba até o nível da UTI.
   Prefira 5 conceitos bem explicados a 20 citados. Detalhe raro, só se for o que mais cai ou o que mais
   mata.
3. **Fonte de verdade = o próprio app.** Leia a leitura completa `conteudo/<slug>.html` do tema antes de
   escrever, e consulte o bulário (`lotes/bulario-*.json`) e as interações (`lotes/interacoes*.json`).
   A revisão NÃO pode contradizer a leitura completa. Não traga fato novo que não esteja na leitura, a não
   ser o básico de graduação (definições, mecanismo, fisiologia) que ela pressupõe. Cota: no máximo
   5 WebSearch por agente; quase nunca será preciso.
4. **Objetiva.** 1.400 a 2.200 palavras. Frases curtas. Listas quando ajudam a memorizar. Nada de
   introdução de enfeite, metanarração ("Nesta revisão…"), travessão, emoji ou frase de efeito.
5. Notação ISMP (vírgula decimal, mcg, UI, sem zero à direita), doses de adulto, contexto brasileiro.

## Estrutura (fixa, nesta ordem, com estes h2 exatamente)

```html
<p class="dek">Uma ou duas frases: o que você precisa saber ao terminar esta revisão.</p>

<h2>O que é e por que importa</h2>
  Definições do zero. Use <dl class="gl"><dt>Termo</dt><dd>definição em uma frase</dd>…</dl> para o
  glossário dos 4 a 8 termos centrais. Depois, 1 a 2 parágrafos sobre por que isso muda a conduta na UTI.

<h2>Como funciona</h2>
  O mecanismo ou a fisiologia em sequência de causa e consequência, sem saltos. Use
  <ol class="passos"><li>…</li></ol> para cadeias causais ("1. A sepse dilata os vasos → 2. …"). Um
  <div class="cx chave"><b>Ponto-chave</b><p>…</p></div> com a ideia que não pode ser esquecida.

<h2>O essencial em números</h2>
  Tabela curta (5 a 12 linhas) embrulhada em <div class="tab">: | Valor | O que significa | Por que
  importa |. Só os números que realmente se usam no dia a dia.

<h2>Como aparece na prescrição</h2>
  O que o farmacêutico confere, em lista, ligado aos tipos de erro da atividade de prescrições (dose,
  ajuste renal, intervalo, interação, via, diluição/velocidade, duplicidade, sem indicação, contraindicação,
  redação, monitorização). Um exemplo curto de linha ERRADA e a linha CORRIGIDA, com a explicação, dentro
  de <div class="cx farma"><b>Na prescrição</b><p>…</p></div>. Se houver conta, um
  <div class="cx calculo"><b>Conta rápida</b><p>…</p></div>.

<h2>Como cai nas questões e nos casos</h2>
  4 a 6 armadilhas típicas, cada uma no formato: <p><strong>Se aparecer …</strong> pense em …, porque …</p>.
  Um <div class="cx alerta"><b>Atenção</b><p>…</p></div> com o erro que mais causa dano.

<h2>Teste rápido</h2>
  6 a 8 perguntas curtas: <details class="rev"><summary>Pergunta</summary><p>Resposta com o porquê</p></details>
```

Classes permitidas: `dek`, `gl`, `passos`, `tab`, `cx chave|alerta|farma|calculo`, `rev`. Sem `fontes`
(a leitura completa já cita as fontes); se trouxer algo que exigiu checagem, cite a fonte entre parênteses
no próprio texto.

## Exemplo do tom (trecho, tema "parâmetros farmacocinéticos")

> **O que é e por que importa**
> Volume de distribuição (Vd): o "tamanho do tanque" em que o fármaco parece estar diluído. Não é um lugar
> do corpo, é uma conta: quantidade no corpo dividida pela concentração no plasma. Fármaco que fica no
> sangue tem Vd pequeno; fármaco que entra nos tecidos tem Vd enorme.
> Depuração (CL): quantos litros de plasma o corpo "limpa" do fármaco por hora.
> Por que importa: a dose de ataque enche o tanque (depende do Vd); a dose de manutenção repõe o que sai
> (depende da CL). Na UTI os dois mudam ao mesmo tempo: o Vd cresce com o soro e o edema, a CL cai com a
> lesão renal. Por isso o paciente crítico precisa, muitas vezes, de ataque MAIOR e manutenção MENOR.

## Saída
Para cada slug seu: `conteudo/revisao/<slug>.html` (fragmento, sem html/head/body/style/script).
Valide com `python3 docs/checa_revisao.py <slug> [<slug> …]` até 0 erros. Escreva só os seus arquivos.
Relatório final curto: palavras por revisão e qualquer contradição que tenha visto na leitura completa.
