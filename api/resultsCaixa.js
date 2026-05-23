import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const URL_MEGA = "https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx";
const URL_LOTOFACIL = "https://loterias.caixa.gov.br/paginas/lotofacil.aspx";
const URL_QUINA = "https://loterias.caixa.gov.br/Paginas/Quina.aspx";
const URL_DUPLASENA = "https://loterias.caixa.gov.br/Paginas/Dupla-Sena.aspx";

const API_URL_MEGA = "https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena";
const API_URL_LOTOFACIL = "https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil";
const API_URL_QUINA = "https://servicebus2.caixa.gov.br/portaldeloterias/api/quina";
const API_URL_DUPLASENA = "https://servicebus2.caixa.gov.br/portaldeloterias/api/duplasena";

const LOTTERY_SOURCES = {
  mega: {
    loteria: "megasena",
    pageUrl: URL_MEGA,
    apiUrl: API_URL_MEGA,
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

async function fetchLotteryResult(apiUrl) {
  const response = await fetch(apiUrl, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Falha na consulta (${response.status}) em ${apiUrl}`);
  }

  return response.json();
}

async function scrapeAndSaveLottery(key, source) {
  const raw = await fetchLotteryResult(source.apiUrl);
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
  const raw = await fetchLotteryResult(source.apiUrl);
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