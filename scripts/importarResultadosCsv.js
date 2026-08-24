import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// node scripts/importarResultadosCsv.js


const INPUT_JSON = path.join(
  __dirname,
  "json",
  "mega.json"
);

const INPUT_CSV = path.join(
  __dirname,
  "resultados.csv"
);

const OUTPUT_JSON = path.join(
  __dirname,
  "output",
  "mega-atualizado.json"
);

function toNumber(value, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function toBoolean(value) {
  return String(value)
    .trim()
    .toLowerCase() === "true";
}

function normalizeDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).trim();
  }

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(
    date.getUTCMonth() + 1
  ).padStart(2, "0");
  const year = date.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

function normalizeDezenas(value) {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) =>
      item.padStart(2, "0")
    );
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (
        insideQuotes &&
        line[i + 1] === '"'
      ) {
        current += '"';
        i++;
        continue;
      }

      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());

  return values;
}

function parsePremiacao(value) {
  if (!value) {
    return [];
  }

  const partes = String(value)
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);

  return partes.map((item) => {
    const match = item.match(
      /^([^:]+):\s*(\d+)\s+ganhadores,\s*R\$\s*([\d.,]+)\s+no total$/i
    );

    if (!match) {
      return {
        descricao: item,
        faixa: 0,
        ganhadores: 0,
        valorPremio: 0
      };
    }

    const descricao =
      match[1].trim();

    const ganhadores =
      toNumber(match[2]);

    const valorPremio =
      toNumber(
        match[3].replace(/,/g, "")
      );

    let faixa = 0;

    if (
      descricao.toLowerCase() ===
      "sena"
    ) {
      faixa = 1;
    } else if (
      descricao.toLowerCase() ===
      "quina"
    ) {
      faixa = 2;
    } else if (
      descricao.toLowerCase() ===
      "quadra"
    ) {
      faixa = 3;
    }

    return {
      descricao,
      faixa,
      ganhadores,
      valorPremio
    };
  });
}

function csvRowToResult(row) {
  const [
    concurso,
    data,
    local,
    rateioProcessamento,
    acumulou,
    valorAcumulado,
    dezenas,
    premiacao
  ] = row;

  const numeroConcurso =
    toNumber(concurso);

  return {
    loteria: "megasena",

    concurso: numeroConcurso,

    data: normalizeDate(data),

    local: local || "",

    concursoEspecial: false,

    dezenasOrdemSorteio:
      normalizeDezenas(dezenas),

    dezenas:
      normalizeDezenas(dezenas),

    trevos: [],

    timeCoracao: null,

    mesSorte: null,

    premiacoes:
      parsePremiacao(premiacao),

    estadosPremiados: [],

    observacao: "",

    acumulou:
      toBoolean(acumulou),

    proximoConcurso:
      numeroConcurso + 1,

    dataProximoConcurso: "",

    localGanhadores: [],

    valorArrecadado: 0,

    valorAcumuladoConcurso_0_5:
      0,

    valorAcumuladoConcursoEspecial:
      0,

    valorAcumuladoProximoConcurso:
      toNumber(valorAcumulado),

    valorEstimadoProximoConcurso:
      0
  };
}

async function readCsv() {
  const content =
    await fs.readFile(
      INPUT_CSV,
      "utf-8"
    );

  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error(
      "O CSV não possui dados."
    );
  }

  return lines
    .slice(1)
    .map(parseCsvLine)
    .filter(
      (row) =>
        row.length >= 8 &&
        Number.isFinite(
          Number(row[0])
        )
    );
}

async function main() {
  console.log(
    "Lendo JSON:",
    INPUT_JSON
  );

  const jsonContent =
    await fs.readFile(
      INPUT_JSON,
      "utf-8"
    );

  const existingResults =
    JSON.parse(jsonContent);

  if (!Array.isArray(existingResults)) {
    throw new Error(
      "mega.json precisa conter um array."
    );
  }

  console.log(
    "Lendo CSV:",
    INPUT_CSV
  );

  const csvRows =
    await readCsv();

  console.log(
    `Resultados encontrados no CSV: ${csvRows.length}`
  );

  const csvResults =
    csvRows.map(csvRowToResult);

  const resultsByContest =
    new Map();

  // Primeiro preserva os resultados
  // que já existem no mega.json.
  for (const result of existingResults) {
    const concurso =
      toNumber(
        result?.concurso,
        -1
      );

    if (concurso >= 0) {
      resultsByContest.set(
        concurso,
        result
      );
    }
  }

  let inserted = 0;
  let updated = 0;

  for (const result of csvResults) {
    const concurso =
      result.concurso;

    if (
      resultsByContest.has(
        concurso
      )
    ) {
      updated++;

      // O CSV será usado para
      // atualizar o resultado
      // desse concurso.
      resultsByContest.set(
        concurso,
        result
      );
    } else {
      inserted++;

      resultsByContest.set(
        concurso,
        result
      );
    }
  }

  const finalResults =
    [...resultsByContest.values()]
      .sort(
        (a, b) =>
          toNumber(b.concurso) -
          toNumber(a.concurso)
      );

  await fs.mkdir(
    path.dirname(OUTPUT_JSON),
    {
      recursive: true
    }
  );

  await fs.writeFile(
    OUTPUT_JSON,
    JSON.stringify(
      finalResults,
      null,
      2
    ),
    "utf-8"
  );

  console.log("");
  console.log(
    "===== IMPORTAÇÃO CONCLUÍDA ====="
  );

  console.log(
    `Resultados originais: ${existingResults.length}`
  );

  console.log(
    `Resultados no CSV: ${csvResults.length}`
  );

  console.log(
    `Novos concursos inseridos: ${inserted}`
  );

  console.log(
    `Concursos existentes atualizados: ${updated}`
  );

  console.log(
    `Total final: ${finalResults.length}`
  );

  console.log(
    `Arquivo gerado: ${OUTPUT_JSON}`
  );

  console.log("");

  console.log(
    `Primeiro concurso: ${finalResults[0]?.concurso}`
  );

  console.log(
    `Último concurso: ${finalResults.at(-1)?.concurso}`
  );
}

main().catch((error) => {
  console.error(
    "Erro:",
    error.message
  );

  process.exitCode = 1;
});