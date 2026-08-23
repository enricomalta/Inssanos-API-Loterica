import { loadLotteryResultsWithHash } from "../data/loadMegaResults.js";
import { getLotteryConfig } from "../config/constants.js";
import { extractAllDraws } from "./megaMapper.js";
import {
  calculateFrequency,
  calculatePerContestAverages,
  getMostFrequentNumbers,
  summarizeContests
} from "./statisticsService.js";
import { predictBySeededRandomness, predictByWeightedFrequency } from "./predictionService.js";
import { runAcumulouClassification } from "./mlAcumulouService.js";
import { parsePositiveInt } from "../utils/query.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const endpointCache = new Map();

function buildNextDrawSeedAt(nextDrawDate) {
  if (typeof nextDrawDate !== "string") {
    return new Date().toISOString();
  }

  const parts = nextDrawDate.trim().split("/");

  if (parts.length !== 3) {
    return new Date().toISOString();
  }

  const [day, month, year] = parts;

  if (!day || !month || !year) {
    return new Date().toISOString();
  }

  // Horario padrao do sorteio no Brasil (BRT).
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T20:00:00-03:00`;
}

function buildCacheKey(lotteryKey, dataHash, params) {
  return `${lotteryKey}:${dataHash}:${params.top}:${params.ultimos}:${params.medias}:${params.seedMode}:${params.seedAt}`;
}

function getCachedPayload(cacheKey) {
  const cached = endpointCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (Date.now() > cached.expiresAt) {
    endpointCache.delete(cacheKey);
    return null;
  }

  return cached.payload;
}

function setCachedPayload(cacheKey, payload) {
  if (endpointCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = endpointCache.keys().next().value;

    if (oldestKey) {
      endpointCache.delete(oldestKey);
    }
  }

  endpointCache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

export function applyResponseCacheHeaders(response, cacheStatus) {
  if (typeof response?.setHeader !== "function") {
    return;
  }

  response.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
  response.setHeader("X-Cache", cacheStatus);
  response.setHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
}

export async function analyzeLottery(lotteryKey, query = {}) {
  const config = getLotteryConfig(lotteryKey);
  const { contests, dataHash } = await loadLotteryResultsWithHash(lotteryKey);
  const allDraws = extractAllDraws(contests);

  const top = parsePositiveInt(query?.top, config.pickCount, {
    min: 1,
    max: config.totalNumbers
  });

  const maxUltimos = Math.max(allDraws.length, 1);
  const ultimos = parsePositiveInt(query?.ultimos, allDraws.length, {
    min: 1,
    max: maxUltimos
  });

  const medias = parsePositiveInt(query?.medias, 10, { min: 1, max: 50 });
  const customSeedAt = typeof query?.seedAt === "string" && query.seedAt.trim()
    ? query.seedAt.trim()
    : "";

  const requestedSeedMode = typeof query?.seedMode === "string"
    ? query.seedMode.trim().toLowerCase()
    : "";

  let seedMode = requestedSeedMode;
  let seedAt = customSeedAt;

  if (requestedSeedMode === "now") {
    seedAt = new Date().toISOString();
  } else if (requestedSeedMode === "nextdraw") {
    seedAt = buildNextDrawSeedAt(contests[0]?.dataProximoConcurso);
  } else {
    seedMode = "custom";
    if (!seedAt) {
      seedAt = buildNextDrawSeedAt(contests[0]?.dataProximoConcurso ?? contests[0]?.data);
    }
  }

  const params = { top, ultimos, medias, seedMode, seedAt };
  const cacheKey = buildCacheKey(lotteryKey, dataHash, params);
  const cachedPayload = getCachedPayload(cacheKey);

  if (cachedPayload) {
    return {
      payload: cachedPayload,
      cacheStatus: "HIT"
    };
  }

  const draws = allDraws.slice(0, ultimos);
  const frequency = calculateFrequency(draws, config.totalNumbers);

  const payload = {
    updatedAt: new Date().toISOString(),
    loteria: {
      key: config.key,
      nome: config.nome,
      totalNumbers: config.totalNumbers,
      pickCount: config.pickCount
    },
    dataHash,
    params,
    summary: summarizeContests(draws),
    topFrequent: getMostFrequentNumbers(frequency, top),
    prediction: predictByWeightedFrequency(draws, frequency, {
      totalNumbers: config.totalNumbers,
      pickCount: config.pickCount
    }),
    predictionSeeded: predictBySeededRandomness(draws, frequency, {
      totalNumbers: config.totalNumbers,
      pickCount: config.pickCount,
      seedAt,
      seedSalt: `${lotteryKey}:${dataHash}`
    }),
    recentContestAverages: calculatePerContestAverages(draws).slice(0, medias),
    acumulouMl: runAcumulouClassification(draws, {
      expectedDezenas: config.pickCount
    })
  };

  setCachedPayload(cacheKey, payload);

  return {
    payload,
    cacheStatus: "MISS"
  };
}
