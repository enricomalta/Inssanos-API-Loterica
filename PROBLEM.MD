## Problemas tecnicos

Memoria do node explodindo em 4024MB(LIMITE) no modelo de treinamento na 2 geração

opção 1 aumentar o hearp (não vai resolver)
opção 2 criar threadings para dividir o fluxo e tirar carga da CPU/RAM (não vai resolver)
opção 3 a cada geração X numeros de individuos salvar os dados e liberar a memoria (melhor solução plausivel)
opção 4 fazer as 3 opções acima para um arquitetura robsuta e tabelar limites de geração por ram e acrescentar commandos de execução como --gen --ramMax e etc 