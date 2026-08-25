import { loadLotteryResultsWithHash } from "../../src/data/loadMegaResults.js";

const LOTTERY_ALIASES = {
  megasena: "megasena",
  quina: "quina",
  lotofacil: "lotofacil",
  duplasena: "duplasena"
};

function parseLotteryKey(value) {
  if (typeof value !== "string") {
    return "megasena";
  }

  const normalized = value.trim().toLowerCase();

  return LOTTERY_ALIASES[normalized] ?? null;
}

export default async function handler(request, response) {
  if (request?.method && request.method !== "GET") {
    response.setHeader("Allow", "GET");

    return response.status(405).json({
      error: "Metodo nao permitido."
    });
  }

  const lotteryKey = parseLotteryKey(request?.query?.loteria);

  if (!lotteryKey) {
    return response.status(400).json({
      error: "Loteria invalida.",
      allowed: Object.keys(LOTTERY_ALIASES)
    });
  }

  try {
    const { contests } = await loadLotteryResultsWithHash(lotteryKey);

    if (!contests?.length) {
      return response.status(404).json({
        error: "Nenhum concurso encontrado."
      });
    }

    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
    );

    // SOMENTE o último concurso.
    return response.status(200).json(contests[0]);

  } catch (error) {
    console.error("Erro ao buscar último concurso:", error);

    return response.status(500).json({
      error: "Falha ao obter último concurso.",
      detail: error.message
    });
  }
}