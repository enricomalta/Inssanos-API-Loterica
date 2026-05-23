import { scrapeUltimoResultadoCaixa } from "./resultsCaixa.js";

const SUPPORTED_LOTTERIES = new Set(["mega", "quina", "lotofacil", "duplasena"]);

function parseLotteryKey(value) {
  if (typeof value !== "string") {
    return "mega";
  }

  const normalized = value.trim().toLowerCase();
  return SUPPORTED_LOTTERIES.has(normalized) ? normalized : null;
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
    const scraped = await scrapeUltimoResultadoCaixa(lotteryKey);

    response.status(200).json({
      updatedAt: new Date().toISOString(),
      loteria: lotteryKey,
      concurso: scraped.concurso,
      data: scraped.data,
      contest: scraped.contest
    });
  } catch (error) {
    response.status(500).json({
      error: "Falha ao buscar ultimo resultado na Caixa.",
      detail: error.message
    });
  }
}
