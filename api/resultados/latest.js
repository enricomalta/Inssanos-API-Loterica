import {
  readR2JsonArray,
  readR2Object
} from "../../src/services/r2StorageService.js";

import {
  shouldCheckLottery
} from "../../src/lottery/schedule.js";

import {
  scrapeAndSaveLottery,
  LOTTERY_SOURCES
} from "../../api/resultsCaixa.js";

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

  const normalized =
    value.trim().toLowerCase();

  return LOTTERY_ALIASES[normalized] ?? null;
}

export default async function handler(
  request,
  response
) {
  if (
    request?.method &&
    request.method !== "GET"
  ) {
    response.setHeader(
      "Allow",
      "GET"
    );

    return response.status(405).json({
      error: "Metodo nao permitido."
    });
  }

  const lotteryKey =
    parseLotteryKey(
      request?.query?.loteria
    );

  if (!lotteryKey) {
    return response.status(400).json({
      error: "Loteria invalida.",
      allowed:
        Object.keys(LOTTERY_ALIASES)
    });
  }

  try {
    /*
     * ============================================================
     * 1. Lê o metadata.json
     * ============================================================
     */

    const metadataRaw =
      await readR2Object(
        "metadata.json"
      );

    let metadata = {};

    if (metadataRaw) {
      try {
        metadata =
          JSON.parse(metadataRaw);
      } catch (error) {
        console.warn(
          "[LATEST] metadata.json invalido."
        );
      }
    }

    const lotteryMetadata =
      metadata[lotteryKey];

    /*
     * ============================================================
     * 2. Lê o arquivo atual da loteria
     * ============================================================
     */

    const source =
      LOTTERY_SOURCES[lotteryKey];

    if (!source) {
      return response.status(500).json({
        error:
          "Configuracao da loteria nao encontrada."
      });
    }

    let contests =
      await readR2JsonArray(
        source.outputFile
      );

    /*
     * ============================================================
     * 3. Verifica se existe possibilidade de novo resultado
     * ============================================================
     */

    const shouldCheck =
      shouldCheckLottery(
        lotteryMetadata
      );
    /*
     * ============================================================
     * 4. Compara o metadata com o arquivo atual
     *
     * Se o metadata diz que já existe o concurso 3000,
     * mas o arquivo ainda está no 2999, precisamos fazer
     * o scrape.
     * ============================================================
     */

    const latestContest =
      Number(
        contests?.[0]?.concurso ?? -1
      );

    const expectedContest =
      Number(
        lotteryMetadata?.lastDrawnContest ?? -1
      );

    const fileIsBehind =
      expectedContest > latestContest;

    console.log(
      "[LATEST] Metadata:",
      lotteryMetadata
    );

    console.log(
      "[LATEST] shouldCheck:",
      shouldCheck
    );

    console.log(
      "[LATEST] latestContest:",
      latestContest
    );

    console.log(
      "[LATEST] expectedContest:",
      expectedContest
    );

    console.log(
      "[LATEST] fileIsBehind:",
      fileIsBehind
    );
      

    if (
      shouldCheck ||
      fileIsBehind
    ) {
      console.log(
        `[LATEST] ${lotteryKey}: resultado possivelmente disponível.`
      );

      console.log(
        `[LATEST] Metadata: ${expectedContest} | Arquivo: ${latestContest}`
      );

      console.log(
        `[LATEST] ${lotteryKey}: iniciando SCRAPE...`
      );

      try {
        /*
         * Faz o scrape SOMENTE da loteria solicitada.
         *
         * A própria função:
         * - consulta a CAIXA
         * - normaliza o resultado
         * - atualiza o arquivo no R2
         */
        await scrapeAndSaveLottery(
          lotteryKey,
          source
        );

        /*
         * Depois do scrape, lê novamente o arquivo.
         *
         * Assim a mesma requisição já devolve o resultado
         * atualizado.
         */
        contests =
          await readR2JsonArray(
            source.outputFile
          );

        console.log(
          `[LATEST] ${lotteryKey}: arquivo atualizado.`
        );
      } catch (error) {
        /*
         * Se a CAIXA ainda não disponibilizou o resultado,
         * não vamos derrubar o endpoint.
         *
         * Retornamos o último resultado que já tínhamos.
         */
        console.error(
          `[LATEST] Falha ao atualizar ${lotteryKey}:`,
          error?.message
        );
      }
    }

    /*
     * ============================================================
     * 5. Nenhum resultado encontrado
     * ============================================================
     */

    if (!contests?.length) {
      return response.status(404).json({
        error:
          "Nenhum concurso encontrado."
      });
    }

    /*
     * ============================================================
     * 6. Cache da resposta da API
     * ============================================================
     */

    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
    );

    /*
     * ============================================================
     * 7. Retorna somente o último concurso
     * ============================================================
     */

    return response
      .status(200)
      .json(contests[0]);

  } catch (error) {
    console.error(
      "Erro ao buscar último concurso:",
      error
    );

    return response.status(500).json({
      error:
        "Falha ao obter último concurso.",
      detail:
        error?.message ??
        "Erro desconhecido."
    });
  }
}