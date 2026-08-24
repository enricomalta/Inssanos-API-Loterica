import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOTTERY_SOURCES = {
  mega: {
    loteria: "megasena",

    pageUrl:
      "https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx",

    outputFile: "mega.json"
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
  const localSorteio = sanitizeText(
    raw?.localSorteio
  );

  const municipioUf = sanitizeText(
    raw?.nomeMunicipioUFSorteio
  );

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
    descricao: sanitizeText(
      item?.descricaoFaixa
    ),

    faixa: toNumber(
      item?.faixa
    ),

    ganhadores: toNumber(
      item?.numeroDeGanhadores
    ),

    valorPremio: toNumber(
      item?.valorPremio
    )
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
      ? raw.listaDezenas
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

function mapToResultsSchema(
  raw,
  loteria
) {
  return {
    loteria,

    concurso: toNumber(
      raw?.numero
    ),

    data: sanitizeText(
      raw?.dataApuracao
    ),

    local: buildLocal(raw),

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

    dezenas: mapDezenas(
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

    observacao: sanitizeText(
      raw?.observacao
    ),

    acumulou: Boolean(
      raw?.acumulado
    ),

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

async function fetchLotteryResult(source) {
  const token = process.env.BROWSERLESS_TOKEN;

  if (!token) {
    throw new Error(
      "BROWSERLESS_TOKEN não configurado."
    );
  }

  const browserQLUrl =
    "https://production-sfo.browserless.io/chromium/bql";

  const mutation = `
    mutation CaixaRequests {
      proxy(
        type: [document, xhr]
        country: BR
        sticky: true
      ) {
        time
      }

      goto(
        url: "${source.pageUrl}"
        waitUntil: networkIdle
      ) {
        status
      }

      response(
        url: "*"
        type: xhr
      ) {
        url
        body
      }
    }
  `;

  console.log(
    "[BROWSERQL] Abrindo página da CAIXA..."
  );

  console.log(
    `[BROWSERQL] URL: ${source.pageUrl}`
  );

  const response = await fetch(
    `${browserQLUrl}?token=${encodeURIComponent(token)}`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
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

  if (result.errors?.length) {
    throw new Error(
      `BrowserQL: ${result.errors
        .map(
          (error) =>
            error?.message ||
            "Erro desconhecido"
        )
        .join("; ")}`
    );
  }

  const data =
    result?.data;

  if (!data) {
    throw new Error(
      "BrowserQL não retornou data."
    );
  }

  console.log(
    "[BROWSERQL] Navegação concluída."
  );

  console.log(
    "[BROWSERQL] Status da página:",
    data.goto?.status
  );

  const responses =
    Array.isArray(data.response)
      ? data.response
      : [];

  console.log(
    `[BROWSERQL] XHRs capturados: ${responses.length}`
  );

  for (const item of responses) {
    console.log(
      `[BROWSERQL] XHR: ${item.url}`
    );
  }

  /*
   * Procuramos a resposta da API
   * da própria CAIXA.
   */

  const apiResponse =
    responses.find(
      (item) =>
        typeof item?.url === "string" &&
        item.url.includes(
          "/portaldeloterias/api/"
        ) &&
        typeof item?.body === "string" &&
        item.body.trim().startsWith("{")
    );

  if (!apiResponse) {
    throw new Error(
      "A página da CAIXA foi carregada, mas nenhuma resposta JSON da API de loteria foi encontrada."
    );
  }

  console.log(
    "[BROWSERQL] API encontrada:"
  );

  console.log(
    apiResponse.url
  );

  console.log(
    "[BROWSERQL] Resposta:",
    apiResponse.body.slice(
      0,
      500
    )
  );

  try {
    return JSON.parse(
      apiResponse.body
    );
  } catch {
    throw new Error(
      `A resposta da CAIXA não é JSON válido: ${apiResponse.body.slice(
        0,
        500
      )}`
    );
  }
}

async function readJsonArray(
  filePath
) {
  try {
    const raw =
      await fs.readFile(
        filePath,
        "utf-8"
      );

    const parsed =
      JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
      : [];

  } catch (error) {
    if (
      error?.code ===
      "ENOENT"
    ) {
      return [];
    }

    throw error;
  }
}

async function upsertContestInOfficialResults(
  filePath,
  contest
) {
  const contests =
    await readJsonArray(
      filePath
    );

  const existingIndex =
    contests.findIndex(
      (item) =>
        toNumber(
          item?.concurso,
          -1
        ) ===
        toNumber(
          contest?.concurso,
          -1
        )
    );

  if (
    existingIndex >= 0
  ) {
    contests[
      existingIndex
    ] = contest;

    await fs.writeFile(
      filePath,
      JSON.stringify(
        contests,
        null,
        2
      ),
      "utf-8"
    );

    return {
      action: "updated",
      index: existingIndex
    };
  }

  contests.unshift(
    contest
  );

  contests.sort(
    (a, b) =>
      toNumber(
        b?.concurso
      ) -
      toNumber(
        a?.concurso
      )
  );

  await fs.writeFile(
    filePath,
    JSON.stringify(
      contests,
      null,
      2
    ),
    "utf-8"
  );

  return {
    action: "inserted",
    index: 0
  };
}

async function scrapeAndSaveLottery(
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

  const previewOutputDir =
    path.resolve(
      __dirname,
      "../results/scraped"
    );

  const previewOutputPath =
    path.join(
      previewOutputDir,
      source.outputFile
    );

  const officialOutputPath =
    path.resolve(
      __dirname,
      "../results",
      source.outputFile
    );

  await fs.mkdir(
    previewOutputDir,
    {
      recursive: true
    }
  );

  await fs.writeFile(
    previewOutputPath,
    JSON.stringify(
      [mapped],
      null,
      2
    ),
    "utf-8"
  );

  const officialUpdate =
    await upsertContestInOfficialResults(
      officialOutputPath,
      mapped
    );

  return {
    key,

    pageUrl:
      source.pageUrl,

    previewOutputPath,

    officialOutputPath,

    officialUpdate,

    concurso:
      mapped.concurso,

    data:
      mapped.data
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

  const contest =
    mapToResultsSchema(
      raw,
      source.loteria
    );

  return {
    key,

    pageUrl:
      source.pageUrl,

    concurso:
      contest.concurso,

    data:
      contest.data,

    contest
  };
}

export async function scrapeResultadosCaixa() {
  const entries =
    Object.entries(
      LOTTERY_SOURCES
    );

  const settled =
    await Promise.allSettled(
      entries.map(
        ([key, source]) =>
          scrapeAndSaveLottery(
            key,
            source
          )
      )
    );

  const sucesso = [];
  const erros = [];

  settled.forEach(
    (result, index) => {
      const [key] =
        entries[index];

      if (
        result.status ===
        "fulfilled"
      ) {
        sucesso.push(
          result.value
        );

        return;
      }

      erros.push({
        key,

        error:
          result.reason?.message ??
          "Erro desconhecido"
      });
    }
  );

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
      ? key.trim().toLowerCase()
      : "";

  const source =
    LOTTERY_SOURCES[
      normalizedKey
    ];

  if (!source) {
    throw new Error(
      `Loteria inválida: ${key}`
    );
  }

  return scrapeLatestLottery(
    normalizedKey,
    source
  );
}

if (
  process.argv[1] ===
  __filename
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