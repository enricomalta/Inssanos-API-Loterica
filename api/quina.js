import { analyzeLottery, applyResponseCacheHeaders } from "../src/services/lotteryAnalysisService.js";

export default async function handler(request, response) {
  try {
    const { payload, cacheStatus } = await analyzeLottery("quina", request?.query);
    applyResponseCacheHeaders(response, cacheStatus);

    response.status(200).json(payload);
  } catch (error) {
    response.status(500).json({
      error: "Falha ao processar os dados da Quina.",
      detail: error.message
    });
  }
}
