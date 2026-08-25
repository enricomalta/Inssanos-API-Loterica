# Inssanos API de Loterias e Machine Learning

Projeto Node.js uma API responsável pela coleta e processamento de resultados oficiais das loterias da CAIXA, além de executar treinamentos, backtests e evolução de modelos de Machine Learning para análise dos resultados.

- Suporte a Mega-Sena, Lotofácil, Quina e Dupla Sena.
- Descoberta dinâmica da API da CAIXA através do params.txt.
- Utiliza proxy brasileiro com sessão sticky para realizar as requisições.
- Normaliza os dados retornados pela CAIXA para um formato padronizado.
- Atualiza automaticamente os resultados históricos em arquivos JSON.
- Coleta resultados da Mega-Sena, Lotofácil, Quina e Dupla Sena via Browserless/BrowserQL.
- Normaliza e mantém o histórico dos concursos.
- Executa treinamentos e backtests sobre dados históricos.
- Mantém uma população de modelos e avalia seu desempenho a cada novo concurso.
- Utiliza seleção, mutação e persistência dos melhores modelos para evolução contínua.
- Disponibiliza endpoints para consulta dos resultados e execução dos processos de treinamento.

Loterias suportadas:

- Mega-Sena
- Quina
- Lotofacil
- Dupla Sena

## Como funciona

- Cada endpoint le um arquivo local em results.
- A API calcula frequencia, resumo, previsao heuristica e classificacao de acumulou.
- O cache usa memoria da instancia e invalida automaticamente quando o hash do JSON muda.

Arquivos de dados oficiais:

- results/megasena.json
- results/quina.json
- results/lotofacil.json
- results/duplasena.json

## Atualizacao automatica dos resultados

Para buscar o concurso mais recente das 4 loterias e atualizar os arquivos oficiais sem duplicar concurso:

node api/resultsCaixa.js

Esse script faz:

- consulta dos dados oficiais da Caixa para 4 loterias
- mapeamento para o mesmo schema dos arquivos em results
- upsert por concurso (atualiza se existe, insere se nao existe)
- ordenacao por concurso decrescente
- geracao de preview em results/scraped

Arquivos de preview:

- results/scraped/megasena.json
- results/scraped/quina.json
- results/scraped/lotofacil.json
- results/scraped/duplasena.json

## Rodando localmente

Analise em console (uma execucao):

npm start

Analise em modo watch:

npm run dev:analyze

API local (Vercel dev):

npm run dev:api

Rotas locais:

- http://localhost:3000/api/megasena
- http://localhost:3000/api/quina
- http://localhost:3000/api/lotofacil
- http://localhost:3000/api/duplasena

## API em producao

Base URL:

https://inssanos-api.vercel.app

Rotas:

Machine Learning Rotas:
- https://inssanos-api.vercel.app/api/megasena
- https://inssanos-api.vercel.app/api/quina
- https://inssanos-api.vercel.app/api/lotofacil
- https://inssanos-api.vercel.app/api/duplasena

Resultados Salvos:
- https://inssanos-api.vercel.app/api/resultados?loteria=megasena&ultimos=10
- https://inssanos-api.vercel.app/api/resultados?loteria=quina&ultimos=10
- https://inssanos-api.vercel.app/api/resultados?loteria=lotofacil&ultimos=10
- https://inssanos-api.vercel.app/api/resultados?loteria=duplasena&ultimos=10

Resultado Scrap Caixa Oficial:
- https://inssanos-api.vercel.app/api/scrape-resultado?loteria=megasena
- https://inssanos-api.vercel.app/api/scrape-resultado?loteria=quina
- https://inssanos-api.vercel.app/api/scrape-resultado?loteria=lotofacil
- https://inssanos-api.vercel.app/api/scrape-resultado?loteria=duplasena

Exemplo com parametros:

https://inssanos-api.vercel.app/api/megasena?top=10&ultimos=500&medias=20

Exemplo com horario seedado para predicao alternativa:

https://inssanos-api.vercel.app/api/megasena?top=10&ultimos=500&medias=20&seedAt=2026-05-24T20:00:00-03:00

Exemplo com seed do horario atual:

https://inssanos-api.vercel.app/api/megasena?top=10&ultimos=500&medias=20&seedMode=now

Exemplo com seed baseado no proximo sorteio:

https://inssanos-api.vercel.app/api/megasena?top=10&ultimos=500&medias=20&seedMode=nextDraw

## Parametros opcionais

- top: quantidade de dezenas mais frequentes (padrao: 6)
- ultimos: quantidade de concursos mais recentes para analisar (padrao: todos)
- medias: quantidade de medias recentes retornadas (padrao: 10, max: 50)
- seedAt: string usada como semente da predicao alternativa (ex.: horario exato do sorteio)
- seedMode: now | nextDraw | custom (padrao: custom)

Para /api/resultados:

- loteria: megasena | quina | lotofacil | duplasena (padrao: megasena)
- ultimos: quantidade de concursos retornados (padrao: todos)

Para /api/scrape-resultado:

- loteria: megasena | quina | lotofacil | duplasena (padrao: megasena)
- retorna apenas o ultimo resultado vindo da API da Caixa, sem atualizar arquivos locais

## Rota de atualizacao com token

Endpoint:

- POST https://inssanos-api.vercel.app/api/atualizar-resultados

Seguranca:

- definir env UPDATE_RESULTS_TOKEN
- enviar token por Authorization: Bearer <token>
- alternativa: header x-update-token ou query ?token=

Exemplo com curl:

curl -X POST https://inssanos-api.vercel.app/api/atualizar-resultados \
	-H "Authorization: Bearer SEU_TOKEN"

Observacao importante:

- em Vercel Serverless, alteracoes em arquivos locais nao persistem entre invocacoes (filesystem somente leitura para deploy)
- para persistencia real em producao, use banco/blob/kv ou atualize os JSONs no repositorio e redeploy

## Estrutura da resposta

A resposta inclui:

- updatedAt
- loteria
- dataHash
- params
- summary
- topFrequent
- prediction
- predictionSeeded
- recentContestAverages
- acumulouMl

Sobre predictionSeeded:

- combina frequencia historica + aleatoriedade seedada
- usa a chance matematica base por numero: pickCount / totalNumbers
- com mesmo seedAt e mesmo dataset, o resultado e deterministico
- seedMode=now usa o timestamp atual no momento da chamada
- seedMode=nextDraw usa data do proximo concurso com horario padrao 20:00:00-03:00

## Cache e invalidacao

Headers usados:

- Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=600
- X-Cache: MISS na primeira execucao por combinacao de parametros
- X-Cache: HIT nas chamadas seguintes dentro do TTL

Invalidacao:

- a chave de cache inclui hash SHA-256 do JSON da loteria
- ao atualizar o arquivo de resultados, o hash muda e o cache antigo nao e reutilizado

## Deploy na Vercel

Arquivo de configuracao:

- vercel.json

O includeFiles garante que os JSONs de results sejam empacotados dentro das funcoes serverless, evitando erro ENOENT em producao.

## Bypass Caixa

Para podermos bypassar a caixa tivemos que simular um ambiente legitmo atraves de um navegador com cookies para ter acesso ao params.txt que informa qual URL_API da Caixa vai sair o resultado da sessão do cookie que capturamos, ao esperar a chamada da API, obtemos os resultados via scrape usando Browserless com configuração de Proxy Ip Residencial Brasileiro (importante pois o ip da vercel é bloqueado na caixa por ser de data-center)
https://www.browserless.io/account/bql

exemplo de Request:

```text
mutation CaixaRequests {
  proxy(
    type: [document, xhr]
    country: BR
    sticky: true
  ) {
    time
  }

  paramsPage: goto(
    url: "https://loterias.caixa.gov.br/Style%20Library/json/params.txt"
    waitUntil: networkIdle
  ) {
    status
  }

  paramsResponse: response(
    url: "*params.txt*"
  ) {
    url
    body
  }

  apiPage: goto(
    url: "https://servicebus3.caixa.gov.br/portaldeloterias/api/megasena"
    waitUntil: networkIdle
  ) {
    status
  }

  apiResponse: response(
    url: "*portaldeloterias/api/megasena*"
  ) {
    url
    body
  }
}
```

## Cloudflare Bucket v1.5

Os arquivos agora são armazenados via CDN na Cloudflare para obteção dos resultados, analises e atualização o Cron ao identificar atualização na plataforma Inssanos irá disparar uma chamada na API que atualiza os resultados e salvos os novos dados nos arquivos .jsons de sua loteria com a mesma arquitetura dos arquivos locais antiga do projeto.
