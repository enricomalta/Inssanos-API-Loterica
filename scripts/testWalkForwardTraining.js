/**
 * 
 * node scripts/testWalkForwardTraining.js
 * 
 * ============================================================
 * WALK-FORWARD TRAINING ENGINE
 * ============================================================
 *
 * Simula o treinamento de um modelo desde o primeiro concurso
 * disponível até o último, SEM permitir vazamento do resultado
 * futuro.
 *
 * Para prever o concurso N:
 *
 *   histórico = concursos anteriores a N
 *   previsão   = feita usando somente histórico
 *   resultado  = revelado somente depois da previsão
 *   avaliação  = previsão x resultado real
 *   evolução   = parâmetros ajustados para o próximo concurso
 *
 * O resultado completo é salvo em JSON.
 * ============================================================
 */

const LOTTERY_TOTAL_NUMBERS = 60;
const PICK_COUNT = 6;

const INPUT_PATH = "./scripts/json/megasena.json";

const OUTPUT_DIR = "./scripts/output/walk-forward";

const MIN_HISTORY = 50;

// Quantos candidatos são mantidos em cada geração.
const POPULATION_SIZE = 20;

// Quantos candidatos sobrevivem diretamente.
const ELITE_SIZE = 5;

// Quantas estratégias novas são geradas.
const MUTATIONS_PER_GENERATION = 15;

// Seed fixa para tornar o treinamento reproduzível.
const RANDOM_SEED = 30482026;

// Por padrão testamos todos os concursos possíveis depois
// do histórico mínimo.
const MAX_CONTESTS = Infinity;


import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
const jsonPath = "./scripts/json/megasena.json";

const contests = JSON.parse(fs.readFileSync(jsonPath, "utf8"));


/**
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

function nowIso() {
  return new Date().toISOString();
}

function round(value, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hashObject(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * ============================================================
 * RANDOM DETERMINÍSTICO
 * ============================================================
 */

function createRandom(seed) {
  let state = seed >>> 0;

  return function random() {
    state += 0x6d2b79f5;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);

    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * ============================================================
 * NORMALIZAÇÃO DOS CONCURSOS
 * ============================================================
 */

function normalizeContest(contest) {
  if (!contest || typeof contest !== "object") {
    throw new Error("Concurso inválido.");
  }

  const concurso = Number(contest.concurso);

  if (!Number.isInteger(concurso)) {
    throw new Error(`Concurso inválido: ${JSON.stringify(contest.concurso)}`);
  }

  const dezenas = Array.isArray(contest.dezenas)
    ? contest.dezenas.map(Number)
    : [];

  if (dezenas.length !== PICK_COUNT) {
    throw new Error(
      `Concurso ${concurso}: esperado ${PICK_COUNT} dezenas, recebido ${dezenas.length}.`,
    );
  }

  return {
    ...contest,
    concurso,
    dezenas: [...new Set(dezenas)].sort((a, b) => a - b),
  };
}

/**
 * ============================================================
 * CARREGAMENTO
 * ============================================================
 */

function loadContests() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Arquivo não encontrado: ${INPUT_PATH}`);
  }

  const raw = fs.readFileSync(INPUT_PATH, "utf8");

  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("megasena.json precisa conter um array de concursos.");
  }

  const contests = parsed
    .map(normalizeContest)
    .sort((a, b) => a.concurso - b.concurso);

  if (contests.length === 0) {
    throw new Error("Nenhum concurso encontrado.");
  }

  return contests;
}

/**
 * ============================================================
 * ESTRATÉGIA
 * ============================================================
 */

function createInitialStrategy() {
  return {
    windows: {
      frequency: 50,
      recent: 10,
      average: 100,
      distance: 100,
    },

    weights: {
      frequency: 0.3,
      recency: 0.2,
      average: 0.2,
      distance: 0.15,
      randomness: 0.15,
    },

    filters: {
      balanceOddEven: true,
      balanceLowHigh: true,
      avoidRepeatedCombination: true,
    },

    model: {
      statistical: true,
      xgboost: false,
      lightgbm: false,
    },
  };
}

/**
 * ============================================================
 * ESTATÍSTICAS
 * ============================================================
 */

function calculateFrequency(history, windowSize) {
  const contests = history.slice(-windowSize);

  const frequencies = new Map();

  for (let number = 1; number <= LOTTERY_TOTAL_NUMBERS; number++) {
    frequencies.set(number, 0);
  }

  for (const contest of contests) {
    for (const number of contest.dezenas) {
      frequencies.set(number, frequencies.get(number) + 1);
    }
  }

  return frequencies;
}

function calculateRecency(history) {
  const result = new Map();

  for (let number = 1; number <= LOTTERY_TOTAL_NUMBERS; number++) {
    result.set(number, 0);
  }

  for (let i = history.length - 1; i >= 0; i--) {
    const distance = history.length - 1 - i;

    for (const number of history[i].dezenas) {
      if (result.get(number) === 0) {
        result.set(number, distance + 1);
      }
    }
  }

  return result;
}

function calculateAverageDistance(history, number) {
  const positions = [];

  for (let i = 0; i < history.length; i++) {
    if (history[i].dezenas.includes(number)) {
      positions.push(i);
    }
  }

  if (positions.length < 2) {
    return history.length;
  }

  const distances = [];

  for (let i = 1; i < positions.length; i++) {
    distances.push(positions[i] - positions[i - 1]);
  }

  return distances.reduce((sum, value) => sum + value, 0) / distances.length;
}

function calculateHistoricalAverage(history) {
  if (history.length === 0) {
    return 30.5;
  }

  let total = 0;

  for (const contest of history) {
    total +=
      contest.dezenas.reduce((sum, number) => sum + number, 0) / PICK_COUNT;
  }

  return total / history.length;
}

/**
 * ============================================================
 * SCORE DOS NÚMEROS
 * ============================================================
 */

function scoreNumbers(history, strategy) {
  const frequencyWindow = Math.max(
    1,
    Math.min(strategy.windows.frequency, history.length),
  );

  const recentWindow = Math.max(
    1,
    Math.min(strategy.windows.recent, history.length),
  );

  const averageWindow = Math.max(
    1,
    Math.min(strategy.windows.average, history.length),
  );

  const distanceWindow = Math.max(
    1,
    Math.min(strategy.windows.distance, history.length),
  );

  const frequency = calculateFrequency(history, frequencyWindow);

  const recentFrequency = calculateFrequency(history, recentWindow);

  const recentHistory = history.slice(-averageWindow);

  const historicalAverage = calculateHistoricalAverage(recentHistory);

  const recency = calculateRecency(history);

  const scores = [];

  for (let number = 1; number <= LOTTERY_TOTAL_NUMBERS; number++) {
    const frequencyValue = frequency.get(number) / frequencyWindow;

    const recentValue = recentFrequency.get(number) / recentWindow;

    const lastSeen = recency.get(number);

    const recencyValue = 1 / Math.max(1, lastSeen);

    const numberDistance = calculateAverageDistance(
      history.slice(-distanceWindow),
      number,
    );

    const distanceValue =
      1 / Math.max(1, Math.abs(numberDistance - strategy.windows.recent));

    const averageDistance = Math.abs(number - historicalAverage);

    const averageValue = 1 / Math.max(1, averageDistance);

    const randomness = 0.5 + Math.random() * 0.5;

    const score =
      frequencyValue * strategy.weights.frequency +
      recentValue * strategy.weights.recency +
      averageValue * strategy.weights.average +
      distanceValue * strategy.weights.distance +
      randomness * strategy.weights.randomness;

    scores.push({
      number,
      score,

      components: {
        frequency: round(frequencyValue),
        recency: round(recentValue),
        average: round(averageValue),
        distance: round(distanceValue),
        randomness: round(randomness),
      },
    });
  }

  return scores.sort((a, b) => b.score - a.score);
}

/**
 * ============================================================
 * FILTROS
 * ============================================================
 */

function combinationKey(numbers) {
  return [...numbers].sort((a, b) => a - b).join("-");
}

function isBalanced(numbers, strategy) {
  if (numbers.length !== PICK_COUNT) {
    return false;
  }

  if (strategy.filters.balanceOddEven) {
    const odd = numbers.filter((n) => n % 2 !== 0).length;

    const even = PICK_COUNT - odd;

    if (odd < 2 || odd > 4 || even < 2 || even > 4) {
      return false;
    }
  }

  if (strategy.filters.balanceLowHigh) {
    const low = numbers.filter((n) => n <= 30).length;

    const high = PICK_COUNT - low;

    if (low < 2 || low > 4 || high < 2 || high > 4) {
      return false;
    }
  }

  return true;
}

/**
 * ============================================================
 * PREDIÇÃO
 * ============================================================
 */

function generatePrediction(history, strategy, rng) {
  const scored = scoreNumbers(history, strategy);

  let candidates = scored.slice();

  const selected = [];

  // Primeiro tenta construir uma combinação
  // equilibrada a partir dos melhores scores.
  for (const candidate of candidates) {
    if (selected.length >= PICK_COUNT) {
      break;
    }

    const attempt = [...selected, candidate.number];

    if (isBalanced(attempt, strategy) || selected.length >= 4) {
      selected.push(candidate.number);
    }
  }

  // Se o filtro impedir completar a combinação,
  // completamos pelos melhores scores.
  if (selected.length < PICK_COUNT) {
    for (const candidate of candidates) {
      if (selected.includes(candidate.number)) {
        continue;
      }

      selected.push(candidate.number);

      if (selected.length === PICK_COUNT) {
        break;
      }
    }
  }

  // Pequena exploração controlada.
  // Isso evita que o treinamento seja totalmente
  // determinístico e permite explorar alternativas.
  if (strategy.weights.randomness > 0 && rng() < strategy.weights.randomness) {
    const indexA = Math.floor(rng() * selected.length);

    const replacementPool = candidates.slice(
      PICK_COUNT,
      Math.min(PICK_COUNT + 10, candidates.length),
    );

    if (replacementPool.length > 0) {
      const replacement =
        replacementPool[Math.floor(rng() * replacementPool.length)].number;

      if (!selected.includes(replacement)) {
        selected[indexA] = replacement;
      }
    }
  }

  const prediction = [...new Set(selected)]
    .slice(0, PICK_COUNT)
    .sort((a, b) => a - b);

  const scoreMap = new Map(scored.map((item) => [item.number, item]));

  return {
    numbers: prediction,

    rankedNumbers: scored.slice(0, 20).map((item) => ({
      numero: item.number,
      score: round(item.score),
      components: item.components,
    })),

    explanation: prediction.map((number) => ({
      numero: number,
      score: round(scoreMap.get(number)?.score ?? 0),
      components: scoreMap.get(number)?.components ?? {},
    })),
  };
}

/**
 * ============================================================
 * AVALIAÇÃO
 * ============================================================
 */

function evaluatePrediction(prediction, actual) {
  const predicted = new Set(prediction);

  const actualSet = new Set(actual);

  const hits = prediction.filter((number) => actualSet.has(number));

  const falsePositives = prediction.filter((number) => !actualSet.has(number));

  return {
    hits: hits.length,

    hitNumbers: hits.sort((a, b) => a - b),

    misses: falsePositives.sort((a, b) => a - b),

    exact: hits.length === PICK_COUNT,
  };
}

/**
 * ============================================================
 * FITNESS
 * ============================================================
 */

function calculateFitness(evaluation, historyPerformance) {
  const currentHits = evaluation.hits;

  const recent = historyPerformance.slice(-20);

  const recentAverage =
    recent.length > 0
      ? recent.reduce((sum, item) => sum + item.hits, 0) / recent.length
      : 0;

  const hitScore = currentHits / PICK_COUNT;

  const stability = recentAverage / PICK_COUNT;

  // Fitness suavizado.
  //
  // O resultado atual tem peso importante,
  // mas não domina completamente a decisão.
  return round(hitScore * 0.55 + stability * 0.45);
}

/**
 * ============================================================
 * MUTATION
 * ============================================================
 */

function mutateStrategy(strategy, rng) {
  const child = clone(strategy);

  const mutations = [
    "windows.frequency",
    "windows.recent",
    "windows.average",
    "windows.distance",
    "weights.frequency",
    "weights.recency",
    "weights.average",
    "weights.distance",
    "weights.randomness",
  ];

  const parameter = mutations[Math.floor(rng() * mutations.length)];

  let oldValue;
  let newValue;

  if (parameter.startsWith("windows.")) {
    const key = parameter.split(".")[1];

    oldValue = child.windows[key];

    const ranges = {
      frequency: [10, 150],

      recent: [5, 30],

      average: [30, 200],

      distance: [30, 200],
    };

    const [min, max] = ranges[key];

    const delta = Math.round((rng() - 0.5) * (max - min) * 0.3);

    newValue = clamp(oldValue + delta, min, max);

    child.windows[key] = newValue;
  } else {
    const key = parameter.split(".")[1];

    oldValue = child.weights[key];

    const delta = (rng() - 0.5) * 0.15;

    newValue = clamp(oldValue + delta, 0.01, 0.6);

    child.weights[key] = newValue;

    // Normaliza pesos.
    const total = Object.values(child.weights).reduce(
      (sum, value) => sum + value,
      0,
    );

    for (const weightKey of Object.keys(child.weights)) {
      child.weights[weightKey] = round(child.weights[weightKey] / total, 6);
    }

    newValue = child.weights[key];
  }

  return {
    strategy: child,

    mutation: {
      parameter,
      oldValue: round(oldValue),
      newValue: round(newValue),
      delta: round(newValue - oldValue),
    },
  };
}

/**
 * ============================================================
 * STRATEGY ID
 * ============================================================
 */

function createStrategyId(strategy) {
  return hashObject(strategy).slice(0, 12);
}

/**
 * ============================================================
 * WALK-FORWARD TRAINER
 * ============================================================
 */

function runWalkForward(contests) {
  const rng = createRandom(RANDOM_SEED);

  let population = [];

  const initial = createInitialStrategy();

  population.push(initial);

  while (population.length < POPULATION_SIZE) {
    population.push(mutateStrategy(initial, rng).strategy);
  }

  const training = [];

  const strategyMemory = new Map();

  const performanceByStrategy = new Map();

  let generation = 0;

  const firstTargetIndex = MIN_HISTORY;

  const finalTargetIndex = Math.min(
    contests.length,
    firstTargetIndex + MAX_CONTESTS,
  );

  for (
    let targetIndex = firstTargetIndex;
    targetIndex < finalTargetIndex;
    targetIndex++
  ) {
    const target = contests[targetIndex];

    const history = contests.slice(0, targetIndex);

    const contestNumber = target.concurso;

    const candidates = [];

    /**
     * ========================================================
     * 1. FAZ PREVISÕES
     * ========================================================
     *
     * O resultado do target ainda NÃO é usado.
     */

    for (
      let strategyIndex = 0;
      strategyIndex < population.length;
      strategyIndex++
    ) {
      const strategy = population[strategyIndex];

      const strategyId = createStrategyId(strategy);

      const prediction = generatePrediction(history, strategy, rng);

      candidates.push({
        strategyId,

        strategy: clone(strategy),

        prediction,

        generation,

        targetContest: contestNumber,

        historyUntil: history[history.length - 1]?.concurso ?? null,
      });
    }

    /**
     * ========================================================
     * 2. AGORA O RESULTADO É REVELADO
     * ========================================================
     */

    for (const candidate of candidates) {
      const evaluation = evaluatePrediction(
        candidate.prediction.numbers,
        target.dezenas,
      );

      const strategyId = candidate.strategyId;

      if (!performanceByStrategy.has(strategyId)) {
        performanceByStrategy.set(strategyId, []);
      }

      const performance = performanceByStrategy.get(strategyId);

      const fitness = calculateFitness(evaluation, performance);

      const record = {
        timestamp: nowIso(),

        contest: {
          numero: contestNumber,

          data: target.data ?? null,
        },

        temporalIntegrity: {
          trainUntil: history[history.length - 1]?.concurso ?? null,

          target: contestNumber,

          futureLeakage: false,
        },

        generation,

        strategyId,

        strategy: clone(candidate.strategy),

        prediction: candidate.prediction,

        actualResult: {
          numbers: [...target.dezenas].sort((a, b) => a - b),
        },

        evaluation,

        fitness,

        metrics: {
          hits: evaluation.hits,

          hitRate: round(evaluation.hits / PICK_COUNT),
        },

        dna: {
          strategyHash: hashObject(candidate.strategy),

          parent: null,

          mutation: null,
        },
      };

      training.push(record);

      performance.push({
        contest: contestNumber,

        hits: evaluation.hits,

        fitness,
      });

      strategyMemory.set(strategyId, {
        strategy: clone(candidate.strategy),

        lastFitness: fitness,

        lastHits: evaluation.hits,

        totalTests: performance.length,

        totalHits: performance.reduce((sum, item) => sum + item.hits, 0),
      });
    }

    /**
     * ========================================================
     * 3. SELEÇÃO
     * ========================================================
     */

    const evaluated = candidates
      .map((candidate) => {
        const strategyId = candidate.strategyId;

        const performance = performanceByStrategy.get(strategyId) ?? [];

        const last = performance[performance.length - 1];

        return {
          ...candidate,

          fitness: last?.fitness ?? 0,

          hits: last?.hits ?? 0,
        };
      })
      .sort((a, b) => b.fitness - a.fitness || b.hits - a.hits);

    /**
     * ========================================================
     * 4. ELITE
     * ========================================================
     */

    const elite = evaluated
      .slice(0, ELITE_SIZE)
      .map((item) => clone(item.strategy));

    /**
     * ========================================================
     * 5. NOVA POPULAÇÃO
     * ========================================================
     */

    const nextPopulation = elite.map((strategy) => clone(strategy));

    while (nextPopulation.length < POPULATION_SIZE) {
      const parent = elite[Math.floor(rng() * elite.length)];

      const mutation = mutateStrategy(parent, rng);

      nextPopulation.push(mutation.strategy);
    }

    population = nextPopulation;

    generation++;

    /**
     * ========================================================
     * LOG RESUMIDO
     * ========================================================
     */

    const best = evaluated[0];

    const averageHits =
      evaluated.reduce((sum, item) => sum + item.hits, 0) / evaluated.length;

    console.log(
      `[${String(targetIndex - firstTargetIndex + 1).padStart(
        4,
        "0",
      )}] Concurso ${contestNumber} | ` +
        `melhor=${best.hits}/6 | ` +
        `média=${averageHits.toFixed(2)}/6 | ` +
        `fitness=${best.fitness.toFixed(4)} | ` +
        `geração=${generation}`,
    );
  }

  /**
   * ==========================================================
   * RESUMO
   * ==========================================================
   */

  const allRecords = training;

  const totalHits = allRecords.reduce(
    (sum, item) => sum + item.evaluation.hits,
    0,
  );

  const totalPredictions = allRecords.length;

  const averageHits = totalPredictions > 0 ? totalHits / totalPredictions : 0;

  const exactHits = allRecords.filter((item) => item.evaluation.exact).length;

  const bestRecord = [...allRecords].sort(
    (a, b) => b.fitness - a.fitness || b.evaluation.hits - a.evaluation.hits,
  )[0];

  return {
    metadata: {
      engine: "WalkForwardTrainingEngine",

      version: "1.0.0",

      createdAt: nowIso(),

      lottery: "Mega-Sena",

      totalNumbers: LOTTERY_TOTAL_NUMBERS,

      pickCount: PICK_COUNT,

      source: INPUT_PATH,

      contestsLoaded: contests.length,

      minHistory: MIN_HISTORY,

      populationSize: POPULATION_SIZE,

      eliteSize: ELITE_SIZE,

      mutationsPerGeneration: MUTATIONS_PER_GENERATION,

      randomSeed: RANDOM_SEED,

      futureLeakage: false,
    },

    summary: {
      contestsTested: new Set(allRecords.map((item) => item.contest.numero))
        .size,

      predictions: totalPredictions,

      totalHits,

      averageHits: round(averageHits),

      averageHitRate: round(averageHits / PICK_COUNT),

      exactPredictions: exactHits,

      bestFitness: bestRecord ? bestRecord.fitness : 0,

      bestContest: bestRecord?.contest?.numero ?? null,

      bestPrediction: bestRecord?.prediction?.numbers ?? null,

      bestActual: bestRecord?.actualResult?.numbers ?? null,
    },

    training: allRecords,

    finalPopulation: population.map((strategy) => ({
      strategyId: createStrategyId(strategy),

      strategyHash: hashObject(strategy),

      strategy,
    })),

    strategyMemory: Array.from(strategyMemory.entries()).map(
      ([strategyId, value]) => ({
        strategyId,
        ...value,
      }),
    ),
  };
}

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

async function main() {
  console.log("==============================================");

  console.log(" WALK-FORWARD TRAINING ENGINE");

  console.log("==============================================");

  console.log("");

  console.log("[1/4] Carregando concursos...");

  const contests = loadContests();

  console.log(`      ${contests.length} concursos carregados.`);

  console.log(`      Primeiro: ${contests[0].concurso}`);

  console.log(`      Último:   ${contests[contests.length - 1].concurso}`);

  console.log("");

  console.log("[2/4] Configurando treinamento...");

  console.log(`      Histórico mínimo: ${MIN_HISTORY}`);

  console.log(`      População: ${POPULATION_SIZE}`);

  console.log(`      Elite: ${ELITE_SIZE}`);

  console.log("");

  console.log("[3/4] Iniciando walk-forward...");

  console.log("      O resultado futuro NÃO será usado antes da previsão.");

  console.log("");

  const result = runWalkForward(contests);

  console.log("");

  console.log("[4/4] Salvando resultado...");

  fs.mkdirSync(OUTPUT_DIR, {
    recursive: true,
  });

  const timestamp = nowIso().replace(/[:.]/g, "-");

  // ============================================================
  // SALVAMENTO SEGURO DO WALK-FORWARD
  // ============================================================

  function compactStrategy(strategy) {
    if (!strategy) return null;

    return {
      windows: strategy.windows ?? null,
      weights: strategy.weights ?? null,
      filters: strategy.filters ?? null,
      model: strategy.model ?? null,
    };
  }

  function compactStep(step) {
    if (!step) return null;

    return {
      concurso: step.concurso ?? step.contestNumber ?? null,
      melhorAcertos: step.bestHits ?? step.melhorAcertos ?? null,
      mediaAcertos: step.averageHits ?? step.mediaAcertos ?? null,
      fitness: step.fitness ?? null,
      generation: step.generation ?? null,

      strategy: compactStrategy(
        step.strategy ?? step.bestStrategy ?? step.best?.strategy,
      ),

      strategyHash: step.strategyHash ?? step.best?.strategyHash ?? null,
    };
  }

  const compactTraining = (result.training ?? []).map((step) => ({
  concurso: step.concurso ?? step.contestNumber ?? step.contest ?? null,

  generation: step.generation ?? null,

  bestHits: step.bestHits ?? step.melhorAcertos ?? step.best?.hits ?? null,

  averageHits:
    step.averageHits ?? step.mediaAcertos ?? step.average?.hits ?? null,

  fitness:
    typeof step.fitness === "object"
      ? (step.fitness.score ?? null)
      : (step.fitness ?? null),

  strategyHash:
    step.strategyHash ??
    step.best?.strategyHash ??
    step.strategy?.strategyHash ??
    null,
  }));

  const compactResult = {
    metadata: {
      generatedAt: new Date().toISOString(),
      totalConcursos: contests.length,
      primeiroConcurso: contests[0]?.concurso ?? null,
      ultimoConcurso: contests.at(-1)?.concurso ?? null,
    },

    summary: {
      totalSteps: result.steps?.length ?? result.history?.length ?? 0,

      bestHits: result.bestHits ?? null,
      averageHits: result.averageHits ?? null,
      bestFitness: result.bestFitness ?? null,
      finalFitness: result.finalFitness ?? null,
    },

    history: (result.training ?? []).map(compactStep),

    finalStrategy: compactStrategy(
      result.finalStrategy ?? result.bestStrategy ?? result.best?.strategy,
    ),

    finalStrategyHash:
      result.finalStrategyHash ??
      result.bestStrategyHash ??
      result.best?.strategyHash ??
      null,
  };

  console.log("\nESTRUTURA DO RESULTADO:");
  console.log(Object.keys(result));
  
  for (const key of Object.keys(result)) {
    const value = result[key];
  
    console.log(
      `${key}:`,
      Array.isArray(value)
        ? `Array(${value.length})`
        : typeof value
    );
  }
  // ------------------------------------------------------------
  // SALVA O RESULTADO PRINCIPAL
  // ------------------------------------------------------------

  const outputPath = path.resolve(
    process.cwd(),
    "scripts",
    "output",
    "walk-forward-training.json",
  );

  fs.mkdirSync(path.dirname(outputPath), {
    recursive: true,
  });

  fs.writeFileSync(outputPath, JSON.stringify(compactResult, null, 2), "utf8");

  console.log("");
  console.log("==============================================");
  console.log(" WALK-FORWARD FINALIZADO");
  console.log("==============================================");
  console.log(`Arquivo salvo em:`);
  console.log(outputPath);
  console.log("");
  console.log(
    `Concursos processados: ${compactResult.metadata.totalConcursos}`,
  );
  console.log(`Primeiro: ${compactResult.metadata.primeiroConcurso}`);
  console.log(`Último: ${compactResult.metadata.ultimoConcurso}`);
  console.log(`Passos: ${compactResult.summary.totalSteps}`);
  console.log("==============================================");

  /**
   * Também salva um arquivo "latest".
   */
  const latestPath = path.join(OUTPUT_DIR, "latest.json");
  const latest = {
    metadata: result.metadata,
    summary: result.summary,
    finalPopulation: result.finalPopulation,
  };

  fs.writeFileSync(latestPath, JSON.stringify(latest, null, 2), "utf8");

  console.log("");

  console.log("==============================================");

  console.log(" TREINAMENTO CONCLUÍDO");

  console.log("==============================================");

  console.log("");

  console.log(`Concursos testados: ${result.summary.contestsTested}`);

  console.log(`Previsões realizadas: ${result.summary.predictions}`);

  console.log(`Média de acertos: ${result.summary.averageHits} / 6`);

  console.log(
    `Taxa média de acertos: ${(result.summary.averageHitRate * 100).toFixed(
      2,
    )}%`,
  );

  console.log(`Acertos de 6: ${result.summary.exactPredictions}`);

  console.log(`Melhor fitness: ${result.summary.bestFitness}`);

  console.log("");

  console.log(`Resultado completo: ${outputPath}`);

  console.log(`Último resultado:    ${latestPath}`);

  console.log("");

  console.log("==============================================");
}

main().catch((error) => {
  console.error("");

  console.error("==============================================");

  console.error(" ERRO NO WALK-FORWARD TRAINING");

  console.error("==============================================");

  console.error("");

  console.error(error?.stack ?? error);

  process.exit(1);
});
