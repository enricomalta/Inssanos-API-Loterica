import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// node scripts/identificarConcursosFaltantes.js

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(
  __dirname,
  "json",
  "megasena.json"
);

const OUTPUT_FILE = path.join(
  __dirname,
  "output",
  "concursosRestantes.json"
);

async function main() {
  console.log("Lendo:", INPUT_FILE);

  const content =
    await fs.readFile(
      INPUT_FILE,
      "utf-8"
    );

  const data =
    JSON.parse(content);

  if (!Array.isArray(data)) {
    throw new Error(
      "megasena.json precisa conter um array."
    );
  }

  const concursos = data
    .map((item) => Number(item?.concurso))
    .filter((numero) =>
      Number.isInteger(numero) &&
      numero > 0
    );

  if (concursos.length === 0) {
    throw new Error(
      "Nenhum concurso válido encontrado no megasena.json."
    );
  }

  const concursosUnicos =
    [...new Set(concursos)];

  const maiorConcurso =
    Math.max(...concursosUnicos);

  const menorConcurso =
    Math.min(...concursosUnicos);

  const concursosExistentes =
    new Set(concursosUnicos);

  const concursosRestantes = [];

  for (
    let concurso = menorConcurso;
    concurso <= maiorConcurso;
    concurso++
  ) {
    if (
      !concursosExistentes.has(
        concurso
      )
    ) {
      concursosRestantes.push(
        concurso
      );
    }
  }

  await fs.mkdir(
    path.dirname(OUTPUT_FILE),
    {
      recursive: true
    }
  );

  await fs.writeFile(
    OUTPUT_FILE,
    concursosRestantes.join(","),
    "utf-8"
  );

  console.log("");
  console.log(
    "===== ANÁLISE CONCLUÍDA ====="
  );
  console.log(
    `Menor concurso: ${menorConcurso}`
  );
  console.log(
    `Maior concurso: ${maiorConcurso}`
  );
  console.log(
    `Concursos existentes: ${concursosUnicos.length}`
  );
  console.log(
    `Concursos faltantes: ${concursosRestantes.length}`
  );
  console.log(
    `Arquivo: ${OUTPUT_FILE}`
  );

  if (
    concursosRestantes.length > 0
  ) {
    console.log("");
    console.log(
      "Faltantes:"
    );
    console.log(
      concursosRestantes.join(",")
    );
  } else {
    console.log("");
    console.log(
      "Nenhum concurso faltando dentro do intervalo."
    );
  }
}

main().catch((error) => {
  console.error(
    "Erro:",
    error.message
  );

  process.exitCode = 1;
});