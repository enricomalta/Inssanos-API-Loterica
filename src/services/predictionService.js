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
