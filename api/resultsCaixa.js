import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

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
  const token =
    process.env.BROWSERLESS_TOKEN;

  if (!token) {
    throw new Error(
      "BROWSERLESS_TOKEN não configurado."
    );
  }

  const browserlessUrl =
    process.env.BROWSERLESS_WS_URL ||
    `wss://production-sfo.browserless.io?token=${encodeURIComponent(
      token
    )}`;

  let browser;
  let page;

  try {
    console.log(
      "[BROWSERLESS] Conectando ao Chrome remoto..."
    );

    browser =
      await chromium.connectOverCDP(
        browserlessUrl
      );

    console.log(
      "[BROWSERLESS] Chrome conectado."
    );

    const context =
      browser.contexts()[0] ||
      await browser.newContext();

    page =
      await context.newPage();

    page.setDefaultTimeout(
      30000
    );

    /*
     * A CAIXA determina a URL real da API
     * através do params.txt e do próprio
     * JavaScript da página.
     *
     * Portanto não fazemos mais:
     *
     * page.goto(servicebus...)
     *
     * Apenas observamos a requisição
     * que a própria página realiza.
     */

    const apiResponsePromise =
      page.waitForResponse(
        (response) => {
          const url =
            response.url();

          return (
            url.includes(
              "/portaldeloterias/api/"
            ) &&
            response.request().method() ===
              "GET"
          );
        },
        {
          timeout: 60000
        }
      );

    console.log(
      "[BROWSERLESS] Abrindo página da CAIXA..."
    );

    console.log(
      `[BROWSERLESS] URL: ${source.pageUrl}`
    );

    const pageResponse =
      await page.goto(
        source.pageUrl,
        {
          waitUntil:
            "domcontentloaded",

          timeout: 60000
        }
      );

    console.log(
      `[BROWSERLESS] Página CAIXA HTTP ${
        pageResponse?.status() ??
        "unknown"
      }`
    );

    /*
     * Agora esperamos a própria página
     * realizar a chamada da API.
     */

    console.log(
      "[BROWSERLESS] Aguardando requisição da API da CAIXA..."
    );

    const apiResponse =
      await apiResponsePromise;

    const apiUrl =
      apiResponse.url();

    const status =
      apiResponse.status();

    const contentType =
      apiResponse.headers()[
        "content-type"
      ] || "";

    console.log(
      `[BROWSERLESS] API detectada: ${apiUrl}`
    );

    console.log(
      `[BROWSERLESS] HTTP: ${status}`
    );

    console.log(
      `[BROWSERLESS] Content-Type: ${contentType}`
    );

    const body =
      await apiResponse.text();

    console.log(
      `[BROWSERLESS] Resposta: ${body.slice(
        0,
        500
      )}`
    );

    if (
      status < 200 ||
      status >= 300
    ) {
      throw new Error(
        `CAIXA retornou HTTP ${status}: ${body.slice(
          0,
          500
        )}`
      );
    }

    let parsed;

    try {
      parsed =
        JSON.parse(body);
    } catch {
      throw new Error(
        `CAIXA não retornou JSON válido: ${body.slice(
          0,
          500
        )}`
      );
    }

    return parsed;

  } catch (error) {
    console.error(
      "[BROWSERLESS] Erro ao buscar resultado:",
      error?.message
    );

    throw error;

  } finally {
    if (page) {
      try {
        await page.close();
      } catch {}
    }

    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
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