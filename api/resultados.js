import express from "express";

import { loadLotteryResultsWithHash } from "../src/data/loadMegaResults.js";
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
 * OUTRA ROTA EXISTENTE
 * GET /api/resultados?loteria=megasena&ultimos=1
 *
 * mantém seu código atual aqui...
 */


export default router;