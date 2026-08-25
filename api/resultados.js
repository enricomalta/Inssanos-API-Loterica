import express from "express";

import { loadLotteryResultsWithHash } from "../src/data/loadMegaResults.js";
import { readR2JsonArray } from "../src/services/r2StorageService.js";
import { getLotteryConfig } from "../src/config/constants.js";
import latestHandler from "./resultados/latest.js";

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

  const normalized = value.trim().toLowerCase();

  return LOTTERY_ALIASES[normalized] ?? null;
}


/*
 * GET /api/resultados/latest?loteria=megasena
 */
router.get("/latest", async (req, res) => {
  return latestHandler(req, res);
});


/*
 * 
 * GET /api/resultados?loteria=megasena&concurso=1
 */

/*
 * GET /api/resultados/concurso?loteria=duplasena&concurso=2999
 */
router.get("/concurso", async (req, res) => {
  const lotteryKey =
    parseLotteryKey(req.query.loteria);

  const contestNumber =
    Number(req.query.concurso);

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
      error: "Número do concurso inválido."
    });
  }

  const files = {
    megasena: "megasena.json",
    quina: "quina.json",
    lotofacil: "lotofacil.json",
    duplasena: "duplasena.json"
  };

  try {
    console.log(
      `[CONCURSO] Buscando ${lotteryKey} concurso ${contestNumber}`
    );

    const contests =
      await readR2JsonArray(
        files[lotteryKey]
      );

    const contest =
      contests.find(
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

    res.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
    );

    return res.status(200).json(contest);

  } catch (error) {
    console.error(
      "[CONCURSO] Erro ao buscar concurso:",
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