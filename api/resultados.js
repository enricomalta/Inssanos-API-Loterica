import express from "express";

import {
  loadLotteryResultsWithHash
} from "../src/data/loadMegaResults.js";

const router = express.Router();

const SUPPORTED_LOTTERIES = new Set([
  "megasena",
  "quina",
  "lotofacil",
  "duplasena"
]);

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

/*
 * GET /api/resultados/latest?loteria=megasena
 */
router.get("/latest", async (req, res) => {
  const lotteryKey =
    parseLotteryKey(req.query.loteria);

  if (!lotteryKey) {
    return res.status(400).json({
      error: "Loteria invalida.",
      allowed: [...SUPPORTED_LOTTERIES]
    });
  }

  try {
    const { contests } =
      await loadLotteryResultsWithHash(
        lotteryKey
      );

    if (!contests || contests.length === 0) {
      return res.status(404).json({
        error:
          `Nenhum concurso encontrado para ${lotteryKey}.`
      });
    }

    res.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
    );

    return res.status(200).json(
      contests[0]
    );

  } catch (error) {
    console.error(
      "Erro ao buscar último concurso:",
      error
    );

    return res.status(500).json({
      error:
        "Falha ao obter último concurso.",
      detail:
        error?.message
    });
  }
});

/*
 * GET /api/resultados/concurso?loteria=megasena&concurso=3000
 */
router.get("/:loteria/:concurso", async (req, res) => {
  const lotteryKey =
    parseLotteryKey(req.params.loteria);

  const contestNumber =
    Number(req.params.concurso);

  if (!lotteryKey) {
    return res.status(400).json({
      error: "Loteria invalida.",
      allowed: [...SUPPORTED_LOTTERIES]
    });
  }

  if (
    !Number.isInteger(contestNumber) ||
    contestNumber <= 0
  ) {
    return res.status(400).json({
      error: "Concurso invalido."
    });
  }

  try {
    console.log(
      `[CONCURSO] Carregando ${lotteryKey}...`
    );

    const { contests } =
      await loadLotteryResultsWithHash(
        lotteryKey
      );

    console.log(
      `[CONCURSO] Concursos carregados: ${contests?.length ?? 0}`
    );

    const contest =
      contests?.find(
        (item) =>
          Number(item?.concurso) ===
          contestNumber
      );

    if (!contest) {
      return res.status(404).json({
        error:
          `Concurso ${contestNumber} não encontrado para ${lotteryKey}.`
      });
    }

    console.log(
      `[CONCURSO] Concurso ${contestNumber} encontrado.`
    );

    res.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
    );

    return res.status(200).json(
      contest
    );

  } catch (error) {
    console.error(
      "[CONCURSO] Erro:",
      error
    );

    return res.status(500).json({
      error:
        "Falha ao obter concurso.",
      detail:
        error?.message ??
        "Erro desconhecido."
    });
  }
});

export default router;