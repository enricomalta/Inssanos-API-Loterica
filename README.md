# Mega Node Vercel

Projeto de estudo da Mega-Sena em Node.js com arquitetura modular e leitura local de dados em `results/mega.json`.

## Como funciona

- Os concursos sao lidos diretamente de `../results/mega.json`.
- Sempre que voce atualizar o JSON com novos concursos e fizer commit, a API passa a responder com os dados mais recentes.
- A previsao e heuristica (nao garante resultado), baseada em frequencia historica e proximidade da media global.

## Rodando localmente

Analise em console (uma execucao):

```bash
npm start
```

Analise em modo watch:

```bash
npm run dev:analyze
```

API local (fica online aguardando chamadas):

```bash
npm run dev:api
```

Depois acesse no navegador ou cliente HTTP:

- `http://localhost:3000/api/mega`
- `http://localhost:3000/api/quina`
- `http://localhost:3000/api/lotofacil`
- `http://localhost:3000/api/duplasena`

## Endpoint para Vercel

- Endpoints:
	- `/api/mega`
	- `/api/quina`
	- `/api/lotofacil`
	- `/api/duplasena`
- Arquivos:
	- `api/mega.js`
	- `api/quina.js`
	- `api/lotofacil.js`
	- `api/duplasena.js`
- Cache: memoria da instancia (TTL 5 min) + `Cache-Control` para CDN da Vercel + invalidacao por hash SHA-256 do JSON de cada loteria

Parametros opcionais de query:

- `top` quantidade de dezenas mais frequentes (padrao: 6, max: 30)
- `ultimos` quantidade de concursos mais recentes para analisar (padrao: todos)
- `medias` quantidade de medias recentes retornadas (padrao: 10, max: 50)

Exemplo:

```bash
/api/mega?top=10&ultimos=500&medias=15
```

Resposta inclui:

- resumo geral dos concursos
- dezenas mais frequentes (de acordo com `top`)
- previsao heuristica de 6 dezenas
- medias dos concursos mais recentes
- classificador de `acumulou` (acuracia e probabilidade estimada)

Headers de cache:

- `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=600`
- `X-Cache: MISS` na primeira execucao por combinacao de parametros
- `X-Cache: HIT` nas proximas chamadas dentro do TTL

Invalidacao por hash:

- A chave de cache inclui o hash SHA-256 do conteudo do JSON da loteria consultada
- Quando voce atualiza o arquivo (novos concursos), o hash muda e o cache anterior deixa de ser reutilizado automaticamente

Arquivos monitorados por endpoint:

- `/api/mega` usa `results/mega.json`
- `/api/quina` usa `results/quina.json`
- `/api/lotofacil` usa `results/lotofacil.json`
- `/api/duplasena` usa `results/duplasena.json`
