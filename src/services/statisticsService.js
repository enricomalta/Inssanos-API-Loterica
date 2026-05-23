import { average, round } from "../utils/numbers.js";

export function calculateFrequency(draws, totalNumbers) {
  if (!Number.isInteger(totalNumbers) || totalNumbers <= 0) {
    throw new Error("Parametro totalNumbers invalido para calculateFrequency.");
  }

  const frequency = new Map();

  for (let number = 1; number <= totalNumbers; number += 1) {
    frequency.set(number, 0);
  }

  draws.forEach((draw) => {
    draw.dezenas.forEach((number) => {
      frequency.set(number, (frequency.get(number) ?? 0) + 1);
    });
  });

  return frequency;
}

export function getMostFrequentNumbers(frequencyMap, limit = 6) {
  return [...frequencyMap.entries()]
    .sort((a, b) => {
      if (b[1] === a[1]) {
        return a[0] - b[0];
      }

      return b[1] - a[1];
    })
    .slice(0, limit)
    .map(([numero, frequencia]) => ({ numero, frequencia }));
}

export function calculatePerContestAverages(draws) {
  return draws.map((draw) => ({
    concurso: draw.concurso,
    media: round(average(draw.dezenas), 2)
  }));
}

export function summarizeContests(draws) {
  const contestsCount = draws.length;
  const flattened = draws.flatMap((draw) => draw.dezenas);
  const overallAverage = round(average(flattened), 2);

  const acumulouCount = draws.filter((draw) => draw.acumulou).length;
  const acumulouRate = contestsCount === 0 ? 0 : round((acumulouCount / contestsCount) * 100, 2);

  return {
    contestsCount,
    overallAverage,
    acumulouRate
  };
}
