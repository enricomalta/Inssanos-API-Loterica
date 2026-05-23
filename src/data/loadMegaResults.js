import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { getLotteryConfig } from "../config/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadMegaResults() {
  const { contests } = await loadLotteryResultsWithHash("mega");
  return contests;
}

export async function loadMegaResultsWithHash() {
  const { contests, dataHash } = await loadLotteryResultsWithHash("mega");

  return {
    contests,
    dataHash
  };
}

export async function loadLotteryResultsWithHash(lotteryKey) {
  const config = getLotteryConfig(lotteryKey);
  const filePath = path.resolve(__dirname, config.jsonRelativePath);
  const raw = await fs.readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(`Formato invalido: ${lotteryKey}.json precisa ser um array de concursos.`);
  }

  const hash = createHash("sha256").update(raw).digest("hex");

  return {
    contests: parsed,
    dataHash: hash
  };
}
