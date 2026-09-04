import {
  readR2JsonArray,
  readR2Object,
  writeR2Json,
  getR2PublicUrl
} from "../src/services/r2StorageService.js";

import {
  loadLotteryMetadata
} from "../src/lottery/metadata.js";

import {
  shouldCheckLottery,
  getCacheTTL
} from "../src/lottery/schedule.js";

const BROWSERQL_URL =
  "https://production-sfo.browserless.io/chromium/bql";

const PARAMS_URL =
  "https://loterias.caixa.gov.br/Style%20Library/json/params.txt";

export const LOTTERY_SOURCES = {
  megasena: {
    loteria: "megasena",
    pageUrl:
      "https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx",
    outputFile: "megasena.json"
  },

  lotofacil: {
    loteria: "lotofacil",
    pageUrl:
      "https://loterias.caixa.gov.br/paginas/lotofacil.aspx",
    outputFile: "lotofacil.json"
  },

  quina: {
    loteria: "quina",
    pageUrl:
      "https://loterias.caixa.gov.br/Paginas/Quina.aspx",
    outputFile: "quina.json"
  },

  duplasena: {
    loteria: "duplasena",
    pageUrl:
      "https://loterias.caixa.gov.br/Paginas/Dupla-Sena.aspx",
    outputFile: "duplasena.json"
  }
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function sanitizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

function buildLocal(raw) {
  const localSorteio =
    sanitizeText(raw?.localSorteio);

  const municipioUf =
    sanitizeText(raw?.nomeMunicipioUFSorteio);

  if (localSorteio && municipioUf) {
    return `${localSorteio} em ${municipioUf}`;
  }

  return localSorteio || municipioUf || "";
}

function mapPremiacoes(rateios) {
  if (!Array.isArray(rateios)) {
    return [];
  }

  return rateios.map((item) => ({
    descricao:
      sanitizeText(item?.descricaoFaixa),

    faixa:
      toNumber(item?.faixa),

    ganhadores:
      toNumber(item?.numeroDeGanhadores),

    valorPremio:
      toNumber(item?.valorPremio)
  }));
}

function normalizeDezenas(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => String(value).trim())
    .filter(Boolean)
    .sort(
      (a, b) =>
        toNumber(a) - toNumber(b)
    )
    .map((value) =>
      value.padStart(2, "0")
    );
}

function mapDezenas(raw, loteria) {
  if (loteria !== "duplasena") {
    return Array.isArray(
      raw?.listaDezenas
    )
      ? normalizeDezenas(
          raw.listaDezenas
        )
      : [];
  }

  const primeiroSorteio =
    normalizeDezenas(
      raw?.listaDezenas
    );

  const segundoSorteio =
    normalizeDezenas(
      raw?.listaDezenasSegundoSorteio
    );

  return [
    ...primeiroSorteio,
    ...segundoSorteio
  ];
}

function mapToResultsSchema(raw, loteria) {
  return {
    loteria,

    concurso:
      toNumber(raw?.numero),

    data:
      sanitizeText(
        raw?.dataApuracao
      ),

    local:
      buildLocal(raw),

    concursoEspecial:
      toNumber(
        raw?.indicadorConcursoEspecial
      ) > 1,

    dezenasOrdemSorteio:
      Array.isArray(
        raw?.dezenasSorteadasOrdemSorteio
      )
        ? raw.dezenasSorteadasOrdemSorteio
        : [],

    dezenas:
      mapDezenas(
        raw,
        loteria
      ),

    trevos: [],

    timeCoracao: null,

    mesSorte: null,

    premiacoes:
      mapPremiacoes(
        raw?.listaRateioPremio
      ),

    estadosPremiados: [],

    observacao:
      sanitizeText(
        raw?.observacao
      ),

    acumulou:
      Boolean(raw?.acumulado),

    proximoConcurso:
      toNumber(
        raw?.numeroConcursoProximo
      ),

    dataProximoConcurso:
      sanitizeText(
        raw?.dataProximoConcurso
      ),

    localGanhadores:
      Array.isArray(
        raw?.listaMunicipioUFGanhadores
      )
        ? raw.listaMunicipioUFGanhadores
        : [],

    valorArrecadado:
      toNumber(
        raw?.valorArrecadado
      ),

    valorAcumuladoConcurso_0_5:
      toNumber(
        raw?.valorAcumuladoConcurso_0_5
      ),

    valorAcumuladoConcursoEspecial:
      toNumber(
        raw?.valorAcumuladoConcursoEspecial
      ),

    valorAcumuladoProximoConcurso:
      toNumber(
        raw?.valorAcumuladoProximoConcurso
      ),

    valorEstimadoProximoConcurso:
      toNumber(
        raw?.valorEstimadoProximoConcurso
      )
  };
}

/**
 * Executa uma mutation BrowserQL.
 */
async function executeBrowserQL(mutation) {
  const token =
    process.env.BROWSERLESS_TOKEN;

  if (!token) {
    throw new Error(
      "BROWSERLESS_TOKEN não configurado."
    );
  }

  const response = await fetch(
    `${BROWSERQL_URL}?token=${encodeURIComponent(token)}`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        query: mutation
      })
    }
  );

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `BrowserQL retornou HTTP ${response.status}: ${text.slice(
        0,
        1000
      )}`
    );
  }

  let result;

  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(
      `BrowserQL não retornou JSON válido: ${text.slice(
        0,
        1000
      )}`
    );
  }

  if (result?.errors?.length) {
    throw new Error(
      result.errors
        .map(
          (error) =>
            error?.message ||
            "Erro desconhecido no BrowserQL."
        )
        .join("; ")
    );
  }

  if (!result?.data) {
    throw new Error(
      "BrowserQL não retornou data."
    );
  }

  return result.data;
}

/**
 * Busca a URL atual da API da CAIXA através
 * do params.txt.
 */
async function resolveCaixaApiBaseUrl() {
  const mutation = `
    mutation CaixaParams {
      proxy(
        type: [document, xhr]
        country: BR
        sticky: true
      ) {
        time
      }

      paramsPage: goto(
        url: "${PARAMS_URL}"
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
    }
  `;

  console.log(
    "[BROWSERQL] Buscando params.txt da CAIXA..."
  );

  const data =
    await executeBrowserQL(
      mutation
    );

  if (
    data?.paramsPage?.status !== 200
  ) {
    throw new Error(
      `CAIXA retornou HTTP ${
        data?.paramsPage?.status ??
        "unknown"
      } ao buscar params.txt.`
    );
  }

  const response =
    Array.isArray(
      data?.paramsResponse
    )
      ? data.paramsResponse[0]
      : null;

  if (!response?.body) {
    throw new Error(
      "CAIXA não retornou o conteúdo de params.txt."
    );
  }

  let params;

  try {
    params = JSON.parse(
      response.body
    );
  } catch {
    throw new Error(
      `params.txt da CAIXA não contém JSON válido: ${response.body.slice(
        0,
        500
      )}`
    );
  }

  const baseUrl =
    typeof params?.urlapiloterias ===
    "string"
      ? params.urlapiloterias
          .trim()
          .replace(/\/+$/, "")
      : "";

  if (!baseUrl) {
    throw new Error(
      "urlapiloterias não encontrada em params.txt."
    );
  }

  console.log(
    `[BROWSERQL] API da CAIXA: ${baseUrl}`
  );

  return baseUrl;
}

/**
 * Busca o último resultado usando a URL
 * dinâmica informada pela própria CAIXA.
 */
async function fetchLotteryResult(source) {
  const baseUrl =
    await resolveCaixaApiBaseUrl();

  const apiUrl =
    `${baseUrl}/api/${source.loteria}`;

  console.log(
    "[BROWSERQL] Buscando resultado..."
  );

  console.log(
    `[BROWSERQL] API: ${apiUrl}`
  );

  const mutation = `
    mutation CaixaResult {
      proxy(
        type: [document, xhr]
        country: BR
        sticky: true
      ) {
        time
      }

      apiPage: goto(
        url: "${apiUrl}"
        waitUntil: networkIdle
      ) {
        status
      }

      apiResponse: response(
        url: "*portaldeloterias/api/*"
      ) {
        url
        body
      }
    }
  `;

  const data =
    await executeBrowserQL(
      mutation
    );

  const status =
    data?.apiPage?.status;

  console.log(
    `[BROWSERQL] API HTTP ${status ?? "unknown"}`
  );

  if (
    typeof status === "number" &&
    (status < 200 || status >= 300)
  ) {
    throw new Error(
      `CAIXA retornou HTTP ${status}.`
    );
  }

  const responses =
    Array.isArray(
      data?.apiResponse
    )
      ? data.apiResponse
      : [];

  const apiResponse =
    responses.find(
      (item) =>
        typeof item?.body ===
          "string" &&
        item.body
          .trim()
          .startsWith("{")
    );

  if (!apiResponse) {
    throw new Error(
      "A API da CAIXA não retornou um JSON válido."
    );
  }

  try {
    return JSON.parse(
      apiResponse.body
    );
  } catch {
    throw new Error(
      `Resposta da CAIXA não é JSON válido: ${apiResponse.body.slice(
        0,
        500
      )}`
    );
  }
}

/**
 * Lê o arquivo oficial da loteria no R2,
 * atualiza ou insere o concurso e salva
 * novamente no R2 Calcula o tempo restante
 * ate o proximo concurso e aplica de cache.
 */
async function upsertContestInOfficialResults(
  objectKey,
  contest
) {
  const contests =
    await readR2JsonArray(
      objectKey
    );

  const contestNumber =
    toNumber(
      contest?.concurso,
      -1
    );

  if (contestNumber < 0) {
    throw new Error(
      `Concurso inválido para ${objectKey}.`
    );
  }

  const existingIndex =
    contests.findIndex(
      (item) =>
        toNumber(
          item?.concurso,
          -1
        ) === contestNumber
    );

  if (existingIndex >= 0) {
    contests[existingIndex] =
      contest;
  } else {
    contests.push(
      contest
    );
  }

  contests.sort(
    (a, b) =>
      toNumber(
        b?.concurso,
        -1
      ) -
      toNumber(
        a?.concurso,
        -1
      )
  );

  const cacheTTL = getCacheTTL();

  await writeR2Json(
    objectKey,
    contests,
    `public, max-age=${cacheTTL}`
  );

  return {
    action:
      existingIndex >= 0
        ? "updated"
        : "inserted",

    index:
      contests.findIndex(
        (item) =>
          toNumber(
            item?.concurso,
            -1
          ) === contestNumber
      ),

    objectKey,

    publicUrl:
      getR2PublicUrl(
        objectKey
      )
  };
}


async function updateLotteryMetadata(
  key,
  contestNumber,
  nextDrawDate
) {
  console.log(
    `[METADATA] INÍCIO | key=${key} | contestNumber=${contestNumber}`
  );
  const metadataKey = "metadata.json";

  const rawMetadata =
    await readR2Object(metadataKey);

  let metadata = {};

  if (rawMetadata) {
    metadata = JSON.parse(rawMetadata);
  }

  const now = new Date();

  const nextContest =
    contestNumber + 1;

  metadata[key] = {
    ...(metadata[key] ?? {}),
    id: key,
    drawTime:
      metadata[key]?.drawTime ??
      "21:00",
    lastDrawnContest:
      contestNumber,
    lastUpdated:
      new Intl.DateTimeFormat(
        "pt-BR",
        {
          timeZone:
            "America/Sao_Paulo",
          dateStyle: "long",
          timeStyle: "medium"
        }
      ).format(now),
    nextContest,
    // A Caixa informa a próxima data oficial no ServiceBus. Esse é o
    // mesmo valor persistido no arquivo da loteria e deve ser a fonte
    // de verdade do metadata, em vez de uma data calculada pelo calendário.
    nextDrawDate
  };

  console.log(
    `[METADATA] ESCREVENDO | key=${key}`,
    JSON.stringify(metadata[key], null, 2)
  );

  await writeR2Json(
    metadataKey,
    metadata
  );

  console.log(
    `[METADATA] ESCRITO | key=${key} | contest=${metadata[key].lastDrawnContest} | next=${metadata[key].nextContest}`
  );
  return metadata[key];
}

export async function scrapeAndSaveLottery(
  key,
  source
) {
  const raw =
    await fetchLotteryResult(
      source
    );

  const mapped =
    mapToResultsSchema(
      raw,
      source.loteria
    );

  const officialUpdate =
    await upsertContestInOfficialResults(
      source.outputFile,
      mapped
    );

  const metadataUpdate =
    await updateLotteryMetadata(
      key,
      mapped.concurso,
      mapped.dataProximoConcurso
    );

  return {
    key,

    pageUrl:
      source.pageUrl,

    concurso:
      mapped.concurso,

    data:
      mapped.data,

    officialObjectKey:
      source.outputFile,

    officialPublicUrl:
      getR2PublicUrl(
        source.outputFile
      ),

    officialUpdate
  };
}

async function scrapeLatestLottery(
  key,
  source
) {
  const raw =
    await fetchLotteryResult(
      source
    );

  const mapped =
    mapToResultsSchema(
      raw,
      source.loteria
    );

  return {
    key,

    pageUrl:
      source.pageUrl,

    concurso:
      mapped.concurso,

    data:
      mapped.data,

    contest:
      mapped
  };
}

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

export async function scrapeResultadosCaixa() {
  const metadata =
    await loadLotteryMetadata();

  const entries =
    Object.entries(LOTTERY_SOURCES)
      .filter(([key]) => {
        const info =
          metadata?.[key];

        if (!info) {
          console.warn(
            `[RESULTADOS] Metadata não encontrada para: ${key}`
          );

          return false;
        }

        const shouldCheck =
          shouldCheckLottery(info);

        console.log(
          `[RESULTADOS] ${key}: ${
            shouldCheck
              ? "VERIFICAR"
              : "IGNORAR"
          }`
        );

        return shouldCheck;
      });

  const sucesso = [];
  const erros = [];


  for (let index = 0; index < entries.length; index++) {
    const [key, source] = entries[index];

    try {
      console.log(
        `[RESULTADOS] Iniciando atualização: ${key}`
      );

      const result = await scrapeAndSaveLottery(
        key,
        source
      );

      sucesso.push(result);

      console.log(
        `[RESULTADOS] ${key} atualizado com sucesso.`
      );
    } catch (error) {
      console.error(
        `[RESULTADOS] Erro em ${key}:`,
        error?.message
      );

      erros.push({
        key,
        error:
          error?.message ??
          "Erro desconhecido"
      });
    }

    if (index < entries.length - 1) {
      console.log(
        "[RESULTADOS] Aguardando 5 segundos antes da próxima loteria..."
      );

      await sleep(5000);
    }
  }

  return {
    sucesso,
    erros
  };
}

export async function scrapeUltimoResultadoCaixa(
  key
) {
  const normalizedKey =
    typeof key === "string"
      ? key
          .trim()
          .toLowerCase()
      : "";

  const source =
    LOTTERY_SOURCES[
      normalizedKey
    ];

  if (!source) {
    throw new Error(
      `Loteria invalida: ${key}`
    );
  }

  return scrapeLatestLottery(
    normalizedKey,
    source
  );
}

if (
  process.argv[1] &&
  process.argv[1].endsWith(
    "resultsCaixa.js"
  )
) {
  scrapeResultadosCaixa()
    .then((result) => {
      console.log(
        JSON.stringify(
          result,
          null,
          2
        )
      );
    })
    .catch((error) => {
      console.error(
        "Falha ao executar scraping das loterias:",
        error.message
      );

      process.exitCode = 1;
    });
}
