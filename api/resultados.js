import { loadLotteryResultsWithHash } from "../src/data/loadMegaResults.js";
import { getLotteryConfig } from "../src/config/constants.js";
import { parsePositiveInt } from "../src/utils/query.js";

const SUPPORTED_LOTTERIES = new Set(["mega", "quina", "lotofacil", "duplasena"]);

function parseLotteryKey(value) {
  if (typeof value !== "string") {
    return "mega";
  }

  const normalized = value.trim().toLowerCase();
  return SUPPORTED_LOTTERIES.has(normalized) ? normalized : null;
}

function applyResultCacheHeaders(response) {
  if (typeof response?.setHeader !== "function") {
    return;
  }

  response.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
}

export default async function handler(request, response) {
  if (request?.method && request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Metodo nao permitido." });
    return;
  }

  const lotteryKey = parseLotteryKey(request?.query?.loteria);

  if (!lotteryKey) {
    response.status(400).json({
      error: "Loteria invalida.",
      allowed: [...SUPPORTED_LOTTERIES]
    });
    return;
  }

  try {
    const config = getLotteryConfig(lotteryKey);
    const { contests, dataHash } = await loadLotteryResultsWithHash(lotteryKey);

    const ultimos = parsePositiveInt(request?.query?.ultimos, contests.length, {
      min: 1,
      max: Math.max(contests.length, 1)
    });

    const payload = {
      updatedAt: new Date().toISOString(),
      loteria: {
        key: config.key,
        nome: config.nome
      },
      dataHash,
      total: contests.length,
      retornados: ultimos,
      contests: contests.slice(0, ultimos)
    };

    applyResultCacheHeaders(response);
    response.status(200).json(payload);
  } catch (error) {
    response.status(500).json({
      error: "Falha ao obter resultados brutos.",
      detail: error.message
    });
  }
}
