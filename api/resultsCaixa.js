import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const URL_MEGA = "https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx";
const URL_LOTOFACIL = "https://loterias.caixa.gov.br/paginas/lotofacil.aspx";
const URL_QUINA = "https://loterias.caixa.gov.br/Paginas/Quina.aspx";
const URL_DUPLASENA = "https://loterias.caixa.gov.br/Paginas/Dupla-Sena.aspx";
const URL_PARAMS_CAIXA = "https://loterias.caixa.gov.br/Style%20Library/json/params.txt";

const API_URL_MEGA = "https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena";
const API_URL_LOTOFACIL = "https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil";
const API_URL_QUINA = "https://servicebus2.caixa.gov.br/portaldeloterias/api/quina";
const API_URL_DUPLASENA = "https://servicebus2.caixa.gov.br/portaldeloterias/api/duplasena";

let caixaApiBaseCache = "";
let caixaApiBaseCacheAt = 0;

const LOTTERY_SOURCES = {
  mega: {
    loteria: "megasena",
    pageUrl: URL_MEGA,
    apiUrl: API_URL_MEGA,
    apiUrlAliases: ["https://servicebus2.caixa.gov.br/portaldeloterias/api/megaSena"],
    outputFile: "mega.json"
  },
  lotofacil: {
    loteria: "lotofacil",
    pageUrl: URL_LOTOFACIL,
    apiUrl: API_URL_LOTOFACIL,
    outputFile: "lotofacil.json"
  },
  quina: {
    loteria: "quina",
    pageUrl: URL_QUINA,
    apiUrl: API_URL_QUINA,
    outputFile: "quina.json"
  },
  duplasena: {
    loteria: "duplasena",
    pageUrl: URL_DUPLASENA,
    apiUrl: API_URL_DUPLASENA,
    apiUrlAliases: ["https://servicebus2.caixa.gov.br/portaldeloterias/api/duplaSena"],
    outputFile: "duplasena.json"
  }
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
  const localSorteio = sanitizeText(raw?.localSorteio);
  const municipioUf = sanitizeText(raw?.nomeMunicipioUFSorteio);

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
    descricao: sanitizeText(item?.descricaoFaixa),
    faixa: toNumber(item?.faixa),
    ganhadores: toNumber(item?.numeroDeGanhadores),
    valorPremio: toNumber(item?.valorPremio)
  }));
}

function normalizeDezenas(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => String(value).trim())
    .filter(Boolean)
    .sort((a, b) => toNumber(a) - toNumber(b))
    .map((value) => value.padStart(2, "0"));
}

function mapDezenas(raw, loteria) {
  if (loteria !== "duplasena") {
    return Array.isArray(raw?.listaDezenas) ? raw.listaDezenas : [];
  }

  const primeiroSorteio = normalizeDezenas(raw?.listaDezenas);
  const segundoSorteio = normalizeDezenas(raw?.listaDezenasSegundoSorteio);

  return [...primeiroSorteio, ...segundoSorteio];
}

function mapToResultsSchema(raw, loteria) {
  return {
    loteria,
    concurso: toNumber(raw?.numero),
    data: sanitizeText(raw?.dataApuracao),
    local: buildLocal(raw),
    concursoEspecial: toNumber(raw?.indicadorConcursoEspecial) > 1,
    dezenasOrdemSorteio: Array.isArray(raw?.dezenasSorteadasOrdemSorteio)
      ? raw.dezenasSorteadasOrdemSorteio
      : [],
    dezenas: mapDezenas(raw, loteria),
    trevos: [],
    timeCoracao: null,
    mesSorte: null,
    premiacoes: mapPremiacoes(raw?.listaRateioPremio),
    estadosPremiados: [],
    observacao: sanitizeText(raw?.observacao),
    acumulou: Boolean(raw?.acumulado),
    proximoConcurso: toNumber(raw?.numeroConcursoProximo),
    dataProximoConcurso: sanitizeText(raw?.dataProximoConcurso),
    localGanhadores: Array.isArray(raw?.listaMunicipioUFGanhadores)
      ? raw.listaMunicipioUFGanhadores
      : [],
    valorArrecadado: toNumber(raw?.valorArrecadado),
    valorAcumuladoConcurso_0_5: toNumber(raw?.valorAcumuladoConcurso_0_5),
    valorAcumuladoConcursoEspecial: toNumber(raw?.valorAcumuladoConcursoEspecial),
    valorAcumuladoProximoConcurso: toNumber(raw?.valorAcumuladoProximoConcurso),
    valorEstimadoProximoConcurso: toNumber(raw?.valorEstimadoProximoConcurso)
  };
}

function buildApiCandidates(source) {
  const aliases = Array.isArray(source?.apiUrlAliases) ? source.apiUrlAliases : [];
  return [source?.apiUrl, ...aliases].filter((value, index, list) => typeof value === "string" && value && list.indexOf(value) === index);
}

async function resolveCaixaApiBaseUrl() {
  const now = Date.now();
  const isCacheValid = caixaApiBaseCache && now - caixaApiBaseCacheAt < 30 * 60 * 1000;

  if (isCacheValid) {
    return caixaApiBaseCache;
  }

  try {
    const response = await fetch(URL_PARAMS_CAIXA, {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
        referer: "https://loterias.caixa.gov.br/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      return "";
    }

    const body = await response.text();
    const parsed = JSON.parse(body);
    const baseUrl = typeof parsed?.urlapiloterias === "string" ? parsed.urlapiloterias.trim() : "";

    if (baseUrl) {
      caixaApiBaseCache = baseUrl;
      caixaApiBaseCacheAt = now;
    }

    return baseUrl;
  } catch {
    return "";
  }
}

function expandApiCandidates(candidates, preferredBaseUrl) {
  const expanded = new Set();

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) {
      continue;
    }

    expanded.add(candidate);

    if (candidate.includes("servicebus2.caixa.gov.br")) {
      expanded.add(candidate.replace("servicebus2.caixa.gov.br", "servicebus3.caixa.gov.br"));
    }

    if (preferredBaseUrl) {
      try {
        const parsed = new URL(candidate);
        const marker = "/portaldeloterias";
        const markerIndex = parsed.pathname.indexOf(marker);

        if (markerIndex >= 0) {
          const suffix = parsed.pathname.slice(markerIndex + marker.length);
          const preferred = new URL(preferredBaseUrl.replace(/\/+$/, "") + suffix).toString();
          expanded.add(preferred);
        }
      } catch {
        // Ignora URL invalida e segue para os outros candidatos.
      }
    }
  }

  const expandedList = Array.from(expanded);

  if (!preferredBaseUrl) {
    return expandedList;
  }

  return expandedList.sort((a, b) => {
    const aPreferred = a.startsWith(preferredBaseUrl);
    const bPreferred = b.startsWith(preferredBaseUrl);

    if (aPreferred === bPreferred) {
      return 0;
    }

    return aPreferred ? -1 : 1;
  });
}

function extractCookieHeader(response) {
  const directSetCookie = typeof response?.headers?.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const fallbackSetCookie = response?.headers?.get?.("set-cookie");
  const rawCookies = directSetCookie.length > 0
    ? directSetCookie
    : typeof fallbackSetCookie === "string" && fallbackSetCookie
      ? fallbackSetCookie.split(/,(?=\s*[^;=\s]+=[^;]+)/)
      : [];

  return rawCookies
    .map((cookie) => String(cookie).split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function warmupLotterySession(source) {
  const pageUrl = source?.pageUrl;
  if (!pageUrl) {
    return "";
  }

  const response = await fetch(pageUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      "cache-control": "no-cache",
      pragma: "no-cache",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    return "";
  }

  return extractCookieHeader(response);
}

async function fetchLotteryResult(source) {
  const token = process.env.BROWSERLESS_TOKEN;

  if (!token) {
    throw new Error("BROWSERLESS_TOKEN não configurado.");
  }

  const browserlessUrl =
    process.env.BROWSERLESS_WS_URL ||
    `wss://production-sfo.browserless.io?token=${encodeURIComponent(token)}`;

  let browser;

  try {
    console.log("[BROWSERLESS] Conectando ao Chrome remoto...");

    browser = await chromium.connectOverCDP(browserlessUrl);

    console.log("[BROWSERLESS] Chrome conectado.");

    const context =
      browser.contexts()[0] ||
      await browser.newContext();

    const ipPage = await context.newPage();

    try {
      await ipPage.goto("https://ipinfo.io/json", {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });

      const ipInfo = await ipPage.locator("body").innerText();

      console.log("[BROWSERLESS] IP DE SAÍDA:");
      console.log(ipInfo);
    } catch (error) {
      console.error("[BROWSERLESS] Erro ao consultar IP:", error.message);
    } finally {
      await ipPage.close();
    }

    page.setDefaultTimeout(30000);
    const page = await context.newPage();

    page.setDefaultTimeout(30000);

    console.log("[BROWSERLESS] Abrindo página da CAIXA...");
    console.log(`[BROWSERLESS] URL: ${source.pageUrl}`);

    const pageResponse = await page.goto(source.pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    console.log(
      `[BROWSERLESS] Página CAIXA HTTP ${pageResponse?.status() ?? "unknown"}`
    );

    // Pequena espera para permitir que a sessão/cookies da CAIXA
    // sejam estabelecidos.
    await page.waitForTimeout(1000);

    console.log("[BROWSERLESS] Navegando diretamente para API CAIXA...");
    console.log(`[BROWSERLESS] API URL: ${source.apiUrl}`);

    const apiResponse = await page.goto(source.apiUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    if (!apiResponse) {
      throw new Error("CAIXA não retornou resposta.");
    }

    const status = apiResponse.status();
    const headers = apiResponse.headers();
    const contentType = headers["content-type"] || "";
    const body = await apiResponse.text();

    console.log(`[BROWSERLESS] API CAIXA HTTP ${status}`);
    console.log(`[BROWSERLESS] Content-Type: ${contentType}`);
    console.log(`[BROWSERLESS] Resposta: ${body.slice(0, 500)}`);

    if (status < 200 || status >= 300) {
      throw new Error(
        `CAIXA retornou HTTP ${status}: ${body.slice(0, 500)}`
      );
    }

    let parsed;

    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error(
        `CAIXA não retornou JSON válido: ${body.slice(0, 500)}`
      );
    }

    return parsed;

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

async function scrapeAndSaveLottery(key, source) {
  const raw = await fetchLotteryResult(source);
  const mapped = mapToResultsSchema(raw, source.loteria);
  const previewOutputDir = path.resolve(__dirname, "../results/scraped");
  const previewOutputPath = path.join(previewOutputDir, source.outputFile);
  const officialOutputPath = path.resolve(__dirname, "../results", source.outputFile);

  await fs.mkdir(previewOutputDir, { recursive: true });
  await fs.writeFile(previewOutputPath, JSON.stringify([mapped], null, 2), "utf-8");

  const officialUpdate = await upsertContestInOfficialResults(officialOutputPath, mapped);

  return {
    key,
    pageUrl: source.pageUrl,
    apiUrl: source.apiUrl,
    previewOutputPath,
    officialOutputPath,
    officialUpdate,
    concurso: mapped.concurso,
    data: mapped.data
  };
}

async function scrapeLatestLottery(key, source) {
  const raw = await fetchLotteryResult(source);
  const mapped = mapToResultsSchema(raw, source.loteria);

  return {
    key,
    pageUrl: source.pageUrl,
    apiUrl: source.apiUrl,
    concurso: mapped.concurso,
    data: mapped.data,
    contest: mapped
  };
}

async function readJsonArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function upsertContestInOfficialResults(filePath, contest) {
  const contests = await readJsonArray(filePath);
  const existingIndex = contests.findIndex((item) => toNumber(item?.concurso, -1) === toNumber(contest?.concurso, -1));

  if (existingIndex >= 0) {
    contests[existingIndex] = contest;

    await fs.writeFile(filePath, JSON.stringify(contests, null, 2), "utf-8");

    return {
      action: "updated",
      index: existingIndex
    };
  }

  contests.unshift(contest);
  contests.sort((a, b) => toNumber(b?.concurso) - toNumber(a?.concurso));

  await fs.writeFile(filePath, JSON.stringify(contests, null, 2), "utf-8");

  return {
    action: "inserted",
    index: 0
  };
}

export async function scrapeResultadosCaixa() {
  const entries = Object.entries(LOTTERY_SOURCES);
  const settled = await Promise.allSettled(entries.map(([key, source]) => scrapeAndSaveLottery(key, source)));

  const sucesso = [];
  const erros = [];

  settled.forEach((result, index) => {
    const [key] = entries[index];

    if (result.status === "fulfilled") {
      sucesso.push(result.value);
      return;
    }

    erros.push({
      key,
      error: result.reason?.message ?? "Erro desconhecido"
    });
  });

  return { sucesso, erros };
}

export async function scrapeUltimoResultadoCaixa(key) {
  const normalizedKey = typeof key === "string" ? key.trim().toLowerCase() : "";
  const source = LOTTERY_SOURCES[normalizedKey];

  if (!source) {
    throw new Error(`Loteria invalida: ${key}`);
  }

  return scrapeLatestLottery(normalizedKey, source);
}

if (process.argv[1] === __filename) {
  scrapeResultadosCaixa()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error("Falha ao executar scraping das loterias:", error.message);
      process.exitCode = 1;
    });
}