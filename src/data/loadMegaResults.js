import { createHash } from "node:crypto";

import {
  readR2Object
} from "../services/r2StorageService.js";

import {
  getLotteryConfig
} from "../config/constants.js";

export async function loadMegaResults() {
  const { contests } =
    await loadLotteryResultsWithHash("megasena");

  return contests;
}

export async function loadMegaResultsWithHash() {
  const {
    contests,
    dataHash
  } =
    await loadLotteryResultsWithHash("megasena");

  return {
    contests,
    dataHash
  };
}

export async function loadLotteryResultsWithHash(
  lotteryKey
) {
  const config =
    getLotteryConfig(lotteryKey);

  const key =
    config.jsonFile;

  const raw =
    await readR2Object(key);

  if (raw === null) {
    throw new Error(
      `Arquivo de resultados não encontrado no R2: ${key}`
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `JSON inválido no R2: ${key}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `Formato invalido: ${lotteryKey}.json precisa ser um array de concursos.`
    );
  }

  const hash =
    createHash("sha256")
      .update(raw)
      .digest("hex");

  return {
    contests: parsed,
    dataHash: hash
  };
}