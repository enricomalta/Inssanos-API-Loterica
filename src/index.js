import { loadMegaResults } from "./data/loadMegaResults.js";
import { getLotteryConfig } from "./config/constants.js";
import { extractAllDraws } from "./services/megaMapper.js";
import {
  calculateFrequency,
  calculatePerContestAverages,
  getMostFrequentNumbers,
  summarizeContests
} from "./services/statisticsService.js";
import { predictByWeightedFrequency } from "./services/predictionService.js";
import { runAcumulouClassification } from "./services/mlAcumulouService.js";

async function main() {
  const config = getLotteryConfig("mega");
  const contests = await loadMegaResults();
  const draws = extractAllDraws(contests);
  const ultimos = 300;
  const top = config.pickCount;
  const medias = 5;
  const filteredDraws = draws.slice(0, ultimos);

  const frequency = calculateFrequency(filteredDraws, config.totalNumbers);
  const frequentTop6 = getMostFrequentNumbers(frequency, top);
  const contestAverages = calculatePerContestAverages(filteredDraws);
  const summary = summarizeContests(filteredDraws);
  const prediction = predictByWeightedFrequency(filteredDraws, frequency, {
    totalNumbers: config.totalNumbers,
    pickCount: config.pickCount
  });
  const acumulouMl = runAcumulouClassification(filteredDraws, {
    expectedDezenas: config.pickCount
  });

  console.log("=== Estudo Mega-Sena (Node) ===");
  console.log("Parametros:", { ultimos, top, medias });
  console.log("Resumo:", summary);
  console.log("Top frequentes:", frequentTop6);
  console.log("Previsao (heuristica de frequencia + media):", prediction);
  console.log("Classificador acumulou:", acumulouMl);
  console.log(
    "Media dos concursos mais recentes:",
    contestAverages.slice(0, medias)
  );
}

main().catch((error) => {
  console.error("Erro ao processar mega.json:", error.message);
  process.exit(1);
});
