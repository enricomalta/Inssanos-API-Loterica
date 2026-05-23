import { createHash } from "node:crypto";
import { average } from "../utils/numbers.js";

export function predictByWeightedFrequency(draws, frequencyMap, options = {}) {
  const totalNumbers = options.totalNumbers;
  const pickCount = options.pickCount;

  if (!Number.isInteger(totalNumbers) || totalNumbers <= 0) {
    throw new Error("Parametro totalNumbers invalido para predictByWeightedFrequency.");
  }

  if (!Number.isInteger(pickCount) || pickCount <= 0) {
    throw new Error("Parametro pickCount invalido para predictByWeightedFrequency.");
  }

  const allNumbers = draws.flatMap((draw) => draw.dezenas);
  const targetAverage = average(allNumbers);

  const scored = [];

  for (let number = 1; number <= totalNumbers; number += 1) {
    const frequency = frequencyMap.get(number) ?? 0;
    const distanceFromAverage = Math.abs(number - targetAverage);

    // Score favorece frequencia alta e proximidade da media historica.
    const score = frequency * 100 - distanceFromAverage;

    scored.push({ number, frequency, score });
  }

  return scored
    .sort((a, b) => {
      if (b.score === a.score) {
        return a.number - b.number;
      }

      return b.score - a.score;
    })
    .slice(0, pickCount)
    .map((item) => item.number)
    .sort((a, b) => a - b);
}

function makeMulberry32(seed) {
  let t = seed >>> 0;

  return function random() {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSeed(seedAt, salt = "") {
  const raw = `${seedAt}:${salt}`;
  const hash = createHash("sha256").update(raw).digest("hex");

  return Number.parseInt(hash.slice(0, 8), 16);
}

export function predictBySeededRandomness(draws, frequencyMap, options = {}) {
  const totalNumbers = options.totalNumbers;
  const pickCount = options.pickCount;
  const seedAt = options.seedAt ?? "seed-default";
  const seedSalt = options.seedSalt ?? "";

  if (!Number.isInteger(totalNumbers) || totalNumbers <= 0) {
    throw new Error("Parametro totalNumbers invalido para predictBySeededRandomness.");
  }

  if (!Number.isInteger(pickCount) || pickCount <= 0) {
    throw new Error("Parametro pickCount invalido para predictBySeededRandomness.");
  }

  const seed = buildSeed(seedAt, seedSalt);
  const random = makeMulberry32(seed);

  const frequencies = Array.from({ length: totalNumbers }, (_, index) => {
    const number = index + 1;
    return frequencyMap.get(number) ?? 0;
  });

  const maxFrequency = Math.max(...frequencies, 1);
  const probabilityPerNumber = pickCount / totalNumbers;
  const scored = [];

  for (let number = 1; number <= totalNumbers; number += 1) {
    const historicalFrequency = frequencyMap.get(number) ?? 0;
    const normalizedFrequency = historicalFrequency / maxFrequency;
    const randomFactor = random();

    // Hibrido: peso historico + componente aleatoria seedada por horario.
    const score = normalizedFrequency * 0.65 + randomFactor * 0.35;

    scored.push({
      number,
      score,
      historicalFrequency,
      randomFactor,
      probabilityPerNumber
    });
  }

  const numbers = scored
    .sort((a, b) => {
      if (b.score === a.score) {
        return a.number - b.number;
      }

      return b.score - a.score;
    })
    .slice(0, pickCount)
    .map((item) => item.number)
    .sort((a, b) => a - b);

  return {
    seedAt,
    seed,
    probabilityPerNumber,
    numbers
  };
}
