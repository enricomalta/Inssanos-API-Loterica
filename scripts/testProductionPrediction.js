/**
 * 
 * node scripts/testProductionPrediction.js
 * 
 * ============================================================================
 * PRODUCTION PREDICTION ENGINE
 * ============================================================================
 *
 * Objetivo:
 *
 *   Utilizar TODOS os concursos disponíveis como histórico conhecido e gerar
 *   uma previsão para o próximo concurso.
 *
 * Exemplo:
 *
 *   Histórico: concursos 1..3048
 *   Alvo:      concurso 3049
 *
 * IMPORTANTE:
 *
 *   O concurso futuro NÃO é enviado para o motor.
 *
 * Este script NÃO altera:
 *
 *   predictiveIntelligenceService.js
 *   predictiveBacktestService.js
 *   predictiveEvolutionService.js
 *   predictiveEvolutionEngineService.js
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import PredictiveIntelligenceService, {
  generatePredictiveIntelligence,
  predictNumbers,
  explainNumber,
  getPredictiveDefaultConfig
} from "../src/services/predictiveIntelligenceService.js";

import PredictiveBacktestService, {
  runPredictiveBacktest,
  runBacktestRange,
  getBacktestDefaultConfig
} from "../src/services/predictiveBacktestService.js";

import {
  createPredictiveEvolutionService
} from "../src/services/predictiveEvolutionService.js";

import PredictiveEvolutionEngineService from "../src/services/predictiveEvolutionEngineService.js";

/* ============================================================================
 * CAMINHOS
 * ========================================================================== */

const ROOT_DIR = process.cwd();

const DATA_PATH = path.join(
  ROOT_DIR,
  "scripts",
  "json",
  "megasena.json"
);

const OUTPUT_DIR = path.join(
  ROOT_DIR,
  "scripts",
  "output",
  "production-prediction"
);

/* ============================================================================
 * CONFIGURAÇÃO
 * ========================================================================== */

const CONFIG = {
  useFullHistory: true,

  populationSize: 100,

  eliteSize: 20,

  generations: 50,

  preventDuplicates: true,

  maxGenerationAttempts: 1000,

  windows: {
    frequency: 50,
    recent: 10,
    average: 100,
    distance: 100
  },

  weights: {
    frequency: 0.30,
    recency: 0.20,
    average: 0.20,
    distance: 0.15,
    randomness: 0.15
  },

  filters: {
    balanceOddEven: true,
    balanceLowHigh: true,
    avoidRepeatedCombination: true
  },

  model: {
    statistical: true,
    xgboost: false,
    lightgbm: false
  }
};

/* ============================================================================
 * UTILITÁRIOS
 * ========================================================================== */

function ensureOutputDirectory() {
  fs.mkdirSync(
    OUTPUT_DIR,
    {
      recursive: true
    }
  );
}

function readJson(filePath) {
  return JSON.parse(
    fs.readFileSync(
      filePath,
      "utf8"
    )
  );
}

function writeJson(filePath, data) {
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      data,
      null,
      2
    ),
    "utf8"
  );
}

function numeric(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function round(value, digits = 6) {
  const factor =
    10 ** digits;

  return Math.round(
    numeric(value) * factor
  ) / factor;
}

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return value;
  }

  return JSON.parse(
    JSON.stringify(value)
  );
}

function hashObject(value) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(value)
    )
    .digest("hex");
}

/* ============================================================================
 * NORMALIZAÇÃO DOS CONCURSOS
 * ========================================================================== */

function getContestNumber(contest) {
  return numeric(
    contest?.concurso ??
    contest?.numero ??
    contest?.contestNumber ??
    contest?.id
  );
}

function getContestNumbers(contest) {
  const source =
    contest?.dezenas ??
    contest?.numbers ??
    contest?.numeros ??
    contest?.resultado ??
    [];

  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((number) => {
      if (
        typeof number === "number"
      ) {
        return Math.trunc(number);
      }

      return numeric(
        String(number).replace(
          /\D/g,
          ""
        )
      );
    })
    .filter(
      (number) =>
        number >= 1 &&
        number <= 60
    );
}

function normalizeContests(raw) {
  if (!Array.isArray(raw)) {
    throw new Error(
      "megasena.json deve conter um array de concursos."
    );
  }

  return raw
    .map((contest) => ({
      ...contest,

      concurso:
        getContestNumber(
          contest
        ),

      dezenas:
        getContestNumbers(
          contest
        )
    }))
    .filter(
      (contest) =>
        contest.concurso > 0 &&
        contest.dezenas.length > 0
    )
    .sort(
      (a, b) =>
        a.concurso -
        b.concurso
    );
}

/* ============================================================================
 * ESTRATÉGIA
 * ========================================================================== */

function createProductionStrategy() {
  return {
    windows: {
      ...CONFIG.windows
    },

    weights: {
      ...CONFIG.weights
    },

    filters: {
      ...CONFIG.filters
    },

    model: {
      ...CONFIG.model
    }
  };
}

/* ============================================================================
 * CONFIGURAÇÃO DO ENGINE
 * ========================================================================== */

function createEngineConfig() {
  return {
    populationSize:
      CONFIG.populationSize,

    eliteSize:
      CONFIG.eliteSize,

    generations:
      CONFIG.generations,

    preventDuplicates:
      CONFIG.preventDuplicates,

    maxGenerationAttempts:
      CONFIG.maxGenerationAttempts,

    mutationStrength:
      0.35,

    windows: {
      ...CONFIG.windows
    },

    weights: {
      ...CONFIG.weights
    },

    filters: {
      ...CONFIG.filters
    },

    model: {
      ...CONFIG.model
    }
  };
}

/* ============================================================================
 * LOGGER
 * ========================================================================== */

const logger = {
  log(message) {
    console.log(message);
  },

  warn(message) {
    console.warn(message);
  },

  error(message) {
    console.error(message);
  }
};

/* ============================================================================
 * ADAPTER DE INTELLIGENCE
 *
 * IMPORTANTE:
 *
 * O Engine chama:
 *
 *   predict({
 *     strategy,
 *     contests,
 *     context
 *   })
 *
 * Mas predictNumbers() trabalha com o histórico como argumento principal.
 *
 * Portanto fazemos a tradução aqui.
 * ========================================================================== */

function createIntelligenceAdapter() {
  return {
    async predict({
      strategy,
      contests,
      context = {}
    } = {}) {
      if (!Array.isArray(contests)) {
        throw new Error(
          "IntelligenceAdapter: contests deve ser um array."
        );
      }

      const mergedContext = {
        ...context,
        strategy,
        contests,
        history: contests,
        historicalContests: contests,
        lottery: "megasena"
      };

      /*
       * PRIMEIRA TENTATIVA:
       *
       * A função exportada normalmente trabalha com:
       *
       *   predictNumbers(contests, config)
       *
       * e não:
       *
       *   predictNumbers({ contests })
       */
      try {
        return await predictNumbers(
          contests,
          strategy
        );
      } catch (firstError) {
        logger.warn?.(
          `[INTELLIGENCE] predictNumbers(contests, strategy) falhou: ${firstError?.message || firstError}`
        );
      }

      /*
       * SEGUNDA TENTATIVA:
       *
       * Alguns adapters podem utilizar:
       *
       *   predictNumbers(contests)
       */
      try {
        return await predictNumbers(
          contests
        );
      } catch (secondError) {
        logger.warn?.(
          `[INTELLIGENCE] predictNumbers(contests) falhou: ${secondError?.message || secondError}`
        );
      }

      /*
       * TERCEIRA TENTATIVA:
       *
       * Mantém compatibilidade com implementações que aceitem objeto.
       */
      try {
        return await predictNumbers(
          mergedContext
        );
      } catch (thirdError) {
        throw new Error(
          `Predictive Intelligence não conseguiu gerar previsão. ` +
          `Tentativas falharam: ` +
          `${thirdError?.message || thirdError}`
        );
      }
    },

    async generatePrediction(args = {}) {
      return this.predict(
        args
      );
    },

    async analyze({
      strategy,
      contests,
      context = {}
    } = {}) {
      if (!Array.isArray(contests)) {
        throw new Error(
          "IntelligenceAdapter: contests deve ser um array."
        );
      }

      try {
        return await generatePredictiveIntelligence(
          contests,
          strategy
        );
      } catch (firstError) {
        logger.warn?.(
          `[INTELLIGENCE] generatePredictiveIntelligence(contests, strategy) falhou: ${firstError?.message || firstError}`
        );
      }

      try {
        return await generatePredictiveIntelligence(
          contests
        );
      } catch (secondError) {
        logger.warn?.(
          `[INTELLIGENCE] generatePredictiveIntelligence(contests) falhou: ${secondError?.message || secondError}`
        );
      }

      return generatePredictiveIntelligence({
        ...context,
        strategy,
        contests,
        history: contests,
        historicalContests: contests,
        lottery: "megasena"
      });
    },

    generatePredictiveIntelligence,

    predictNumbers,

    explainNumber
  };
}

/* ============================================================================
 * ADAPTER DE BACKTEST
 *
 * O problema observado foi:
 *
 *   runPredictiveBacktest(object) falhou:
 *   contests is not iterable
 *
 * Isso prova que o objeto do Engine estava sendo entregue diretamente
 * para uma função que espera o array de concursos.
 * ========================================================================== */

function createBacktestAdapter() {
  return {
    async run({
      strategy,
      contests,
      context = {}
    } = {}) {
      if (!Array.isArray(contests)) {
        throw new Error(
          "BacktestAdapter: contests deve ser um array."
        );
      }

      /*
       * Formato principal esperado pelo serviço.
       */
      try {
        return await runPredictiveBacktest(
          contests,
          strategy,
          context
        );
      } catch (firstError) {
        logger.warn?.(
          `[BACKTEST] runPredictiveBacktest(contests, strategy, context) falhou: ${firstError?.message || firstError}`
        );
      }

      /*
       * Compatibilidade com implementações que usam:
       *
       * runPredictiveBacktest(contests, options)
       */
      try {
        return await runPredictiveBacktest(
          contests,
          {
            ...context,
            strategy
          }
        );
      } catch (secondError) {
        logger.warn?.(
          `[BACKTEST] runPredictiveBacktest(contests, options) falhou: ${secondError?.message || secondError}`
        );
      }

      /*
       * Último fallback.
       */
      try {
        return await runPredictiveBacktest(
          contests
        );
      } catch (thirdError) {
        throw new Error(
          `Predictive Backtest não conseguiu executar. ` +
          `Histórico recebido: ${contests.length} concursos. ` +
          `Erro: ${thirdError?.message || thirdError}`
        );
      }
    },

    async backtest(args = {}) {
      return this.run(
        args
      );
    },

    async runBacktest(args = {}) {
      return this.run(
        args
      );
    },

    async runBacktestRange({
      contests,
      strategy,
      context = {}
    } = {}) {
      if (!Array.isArray(contests)) {
        throw new Error(
          "BacktestAdapter: contests deve ser um array."
        );
      }

      try {
        return await runBacktestRange(
          contests,
          strategy,
          context
        );
      } catch {
        try {
          return await runBacktestRange(
            contests,
            {
              ...context,
              strategy
            }
          );
        } catch {
          return runBacktestRange(
            contests
          );
        }
      }
    }
  };
}

/* ============================================================================
 * INICIALIZAÇÃO DOS SERVIÇOS
 * ========================================================================== */

function initializeServices() {
  /*
   * Intelligence:
   *
   * Usamos propositalmente o adapter.
   *
   * Não passamos diretamente uma instância cuja assinatura possa
   * ser incompatível com o Engine.
   */
  const intelligenceService =
    createIntelligenceAdapter();

  /*
   * Backtest:
   *
   * Também usamos adapter para converter:
   *
   * { contests, strategy, context }
   *
   * em:
   *
   * contests, strategy, context
   */
  const backtestService =
    createBacktestAdapter();

  /*
   * Evolution permanece sendo o serviço original.
   */
  const evolutionService =
    createPredictiveEvolutionService({
      populationSize:
        CONFIG.populationSize,

      eliteSize:
        CONFIG.eliteSize
    });

  const engine =
    new PredictiveEvolutionEngineService({
      intelligenceService,
      backtestService,
      evolutionService,
      logger
    });

  return {
    intelligenceService,
    backtestService,
    evolutionService,
    engine
  };
}

/* ============================================================================
 * EXTRAÇÃO ROBUSTA DA PREVISÃO
 * ========================================================================== */

function extractPredictionNumbers(
  prediction
) {
  if (!prediction) {
    return [];
  }

  /*
   * Formatos conhecidos.
   */
  const candidates = [
    prediction.numbers,

    prediction.dezenas,

    prediction.prediction,

    prediction.recommendations,

    prediction.selectedNumbers,

    prediction.selected,

    prediction.primaryPrediction,

    prediction.diversityPrediction
  ];

  for (
    const candidate of candidates
  ) {
    if (
      !Array.isArray(candidate)
    ) {
      continue;
    }

    const numbers =
      candidate
        .map((item) => {
          if (
            typeof item ===
            "number"
          ) {
            return Math.trunc(
              item
            );
          }

          if (
            typeof item ===
            "string"
          ) {
            return numeric(
              item.replace(
                /\D/g,
                ""
              )
            );
          }

          return numeric(
            item?.number ??
            item?.numero ??
            item?.dezena
          );
        })
        .filter(
          (number) =>
            number >= 1 &&
            number <= 60
        );

    if (
      numbers.length > 0
    ) {
      return [
        ...new Set(
          numbers
        )
      ].sort(
        (a, b) =>
          a - b
      );
    }
  }

  /*
   * Alguns resultados podem devolver:
   *
   * {
   *   prediction: {
   *     numbers: [...]
   *   }
   * }
   */
  const nested =
    prediction.prediction;

  if (
    nested &&
    typeof nested ===
      "object"
  ) {
    const nestedNumbers =
      extractPredictionNumbers(
        nested
      );

    if (
      nestedNumbers.length >
      0
    ) {
      return nestedNumbers;
    }
  }

  return [];
}

/* ============================================================================
 * EXTRAÇÃO DAS RANKINGS
 * ========================================================================== */

function buildNumberExplanations(
  prediction
) {
  if (!prediction) {
    return [];
  }

  const source =
    prediction.numberScores ??
    prediction.scores ??
    prediction.rankings ??
    prediction.recommendations;

  if (
    !Array.isArray(source)
  ) {
    return [];
  }

  return source.map(
    (item) => ({
      number:
        numeric(
          item?.number ??
          item?.numero ??
          item?.dezena
        ),

      score:
        round(
          numeric(
            item?.score ??
            item?.finalScore ??
            item?.probability
          ),
          6
        ),

      frequency:
        item?.frequency ??
        null,

      recency:
        item?.recency ??
        item?.recentFrequency ??
        null,

      averageDistance:
        item?.averageDistance ??
        item?.distanceFromAverage ??
        null,

      explanation:
        item?.explanation ??
        item?.reason ??
        null
    })
  );
}

/* ============================================================================
 * RESUMO DAS GERAÇÕES
 * ========================================================================== */

function summarizeGenerations(
  generations
) {
  if (
    !Array.isArray(
      generations
    )
  ) {
    return [];
  }

  return generations.map(
    (generation) => ({
      generation:
        generation.generation,

      populationSize:
        generation.populationSize,

      bestFitness:
        round(
          numeric(
            generation.bestFitness
          ),
          8
        ),

      bestStrategyHash:
        generation.bestStrategyHash ??
        null
    })
  );
}

/* ============================================================================
 * DNA DA ESTRATÉGIA
 * ========================================================================== */

function buildStrategyDNA(
  best
) {
  if (!best) {
    return null;
  }

  const strategy =
    best.strategy ??
    null;

  return {
    strategyHash:
      best.strategyHash ??
      (
        strategy
          ? hashObject(
              strategy
            )
          : null
      ),

    generation:
      best.generation ??
      null,

    parent:
      best.parent
        ? {
            strategyHash:
              best.parent
                .strategyHash ??
              null,

            generation:
              best.parent
                .generation ??
              null
          }
        : null,

    strategy:
      clone(
        strategy
      ),

    mutation:
      clone(
        best.mutation ??
        null
      ),

    fitness:
      clone(
        best.fitness ??
        null
      ),

    prediction:
      clone(
        best.prediction ??
        null
      ),

    intelligence:
      clone(
        best.intelligence ??
        null
      ),

    backtest:
      clone(
        best.backtest ??
        null
      )
  };
}

/* ============================================================================
 * PREVISÃO FINAL
 *
 * MUITO IMPORTANTE:
 *
 * Aqui também passamos o ARRAY diretamente para o adapter.
 *
 * Não usamos:
 *
 *   predictNumbers({ contests })
 *
 * ========================================================================== */

async function generateFinalPrediction({
  intelligenceService,
  strategy,
  contests
}) {
  if (!strategy) {
    throw new Error(
      "Não existe melhor estratégia para gerar a previsão final."
    );
  }

  if (
    !Array.isArray(contests) ||
    contests.length === 0
  ) {
    throw new Error(
      "Histórico de concursos vazio."
    );
  }

  console.log(
    `      Inteligência recebendo ${contests.length} concursos.`
  );

  console.log(
    `      Histórico: ${contests[0].concurso}..${contests[contests.length - 1].concurso}`
  );

  const prediction =
    await intelligenceService.predict({
      strategy,

      contests,

      context: {
        strategy,
        contests,
        history: contests,
        historicalContests: contests,
        lottery: "megasena"
      }
    });

  if (!prediction) {
    throw new Error(
      "Intelligence Service retornou previsão vazia."
    );
  }

  const numbers =
    extractPredictionNumbers(
      prediction
    );

  return {
    raw:
      clone(
        prediction
      ),

    numbers,

    dezenas:
      numbers,

    explanations:
      buildNumberExplanations(
        prediction
      )
  };
}

/* ============================================================================
 * MAIN
 * ========================================================================== */

async function main() {
  console.log(
    "=============================================="
  );

  console.log(
    " PRODUCTION PREDICTION ENGINE"
  );

  console.log(
    "=============================================="
  );

  const startedAt =
    Date.now();

  ensureOutputDirectory();

  /* ---------------------------------------------------------------------- */
  /* 1. HISTÓRICO                                                           */
  /* ---------------------------------------------------------------------- */

  console.log(
    "\n[1/5] Carregando histórico..."
  );

  if (
    !fs.existsSync(
      DATA_PATH
    )
  ) {
    throw new Error(
      `Arquivo não encontrado: ${DATA_PATH}`
    );
  }

  const raw =
    readJson(
      DATA_PATH
    );

  const contests =
    normalizeContests(
      raw
    );

  if (
    contests.length === 0
  ) {
    throw new Error(
      "Nenhum concurso válido encontrado."
    );
  }

  const lastContest =
    contests[
      contests.length - 1
    ];

  const lastContestNumber =
    getContestNumber(
      lastContest
    );

  const targetContestNumber =
    lastContestNumber + 1;

  console.log(
    `      ${contests.length} concursos carregados.`
  );

  console.log(
    `      Primeiro: ${getContestNumber(contests[0])}`
  );

  console.log(
    `      Último:   ${lastContestNumber}`
  );

  console.log(
    `      Próximo:  ${targetContestNumber}`
  );

  console.log(
    `      Histórico utilizado: ${contests.length}`
  );

  /* ---------------------------------------------------------------------- */
  /* 2. SERVIÇOS                                                            */
  /* ---------------------------------------------------------------------- */

  console.log(
    "\n[2/5] Inicializando motor evolutivo..."
  );

  const {
    intelligenceService,
    backtestService,
    evolutionService,
    engine
  } =
    initializeServices();

  /*
   * Mantemos referências para evitar otimizações/acessos inesperados.
   */
  void intelligenceService;
  void backtestService;
  void evolutionService;

  console.log(
    "      Serviços inicializados com sucesso."
  );

  /* ---------------------------------------------------------------------- */
  /* 3. EVOLUÇÃO                                                            */
  /* ---------------------------------------------------------------------- */

  console.log(
    "\n[3/5] Evoluindo estratégias..."
  );

  console.log(
    `      População: ${CONFIG.populationSize}`
  );

  console.log(
    `      Elite:     ${CONFIG.eliteSize}`
  );

  console.log(
    `      Gerações:  ${CONFIG.generations}`
  );

  console.log(
    ""
  );

  console.log(
    `      IMPORTANTE:`
  );

  console.log(
    `      O concurso ${targetContestNumber} NÃO participa do treinamento.`
  );

  console.log(
    `      O motor recebe somente concursos ${contests[0].concurso}..${lastContestNumber}.`
  );

  /*
   * Contexto explícito.
   */
  const context = {
    lottery:
      "megasena",

    targetContestNumber,

    historicalContestCount:
      contests.length,

    lastKnownContest:
      lastContestNumber
  };

  const engineConfig =
    createEngineConfig();

  /*
   * Estratégia inicial opcional.
   */
  const initialStrategy =
    createProductionStrategy();

  /*
   * IMPORTANTE:
   *
   * O Engine recebe o array puro.
   *
   * O adapter é responsável por traduzir a chamada para os serviços.
   */
    const evolutionResult =
    await engine.run({
        contests,

        config:
        engineConfig,

        context,

        initialPopulation: [
        {
            strategy:
            initialStrategy,

            parent:
            null,

            mutation:
            null,

            status:
            "candidate",

            generation:
            0
        }
        ],

        onProgress: ({
        generation,
        generations,
        progress,
        completed,
        total,
        elapsedSeconds
        }) => {
        const elapsed =
            Number(
            elapsedSeconds
            ).toFixed(1);

        process.stdout.write(
            `\r[PREDICTIVE EVOLUTION] ` +
            `Geração ${generation}/${generations} | ` +
            `${progress}% | ` +
            `${completed}/${total} | ` +
            `${elapsed}s`
        );

        if (
            progress >= 100
        ) {
            process.stdout.write(
            "\n"
            );
        }
        }
    });

    if (!evolutionResult) {
    throw new Error(
        "O Evolution Engine não retornou resultado."
    );
    }

    const best =
    evolutionResult.best ??
    null;

    console.log("");

    console.log(
    `      Evolução concluída.`
    );

    console.log(
    `      Estratégias testadas: ${
        evolutionResult.summary?.strategiesTested ??
        "N/A"
    }`
    );

    console.log(
    `      Melhor fitness: ${
        evolutionResult.summary?.bestFitness ??
        0
    }`
    );

    if (!best) {
    throw new Error(
        "O Evolution Engine não retornou uma melhor estratégia."
    );
    }

  /* ---------------------------------------------------------------------- */
  /* 4. PREVISÃO FINAL                                                      */
  /* ---------------------------------------------------------------------- */

  console.log(
    "\n[4/5] Construindo previsão final..."
  );

  console.log(
    `      Histórico: ${contests[0].concurso}..${lastContestNumber}`
  );

  console.log(
    `      Alvo:      ${targetContestNumber}`
  );

  console.log(
    "      Resultado futuro NÃO utilizado."
  );

  /*
   * Novamente:
   *
   * somente contests é enviado como histórico.
   *
   * O concurso alvo é apenas metadado.
   */
  const finalPrediction =
    await generateFinalPrediction({
      intelligenceService:
        createIntelligenceAdapter(),

      strategy:
        best.strategy,

      contests
    });

  const numbers =
    finalPrediction.numbers;

  if (
    !Array.isArray(numbers) ||
    numbers.length === 0
  ) {
    console.warn(
      "      AVISO: nenhuma dezena reconhecida automaticamente."
    );

    console.warn(
      "      Consulte prediction.raw no JSON."
    );
  } else {
    console.log(
      `      Dezenas previstas: ${numbers
        .map(
          (number) =>
            String(number).padStart(
              2,
              "0"
            )
        )
        .join(" - ")}`
    );
  }

  /* ---------------------------------------------------------------------- */
  /* 5. SALVAMENTO                                                          */
  /* ---------------------------------------------------------------------- */

  console.log(
    "\n[5/5] Salvando resultado..."
  );

  const completedAt =
    nowIso();

  const durationMs =
    Date.now() -
    startedAt;

  const dna =
    buildStrategyDNA(
      best
    );

  const output = {
    engine: {
      name:
        "Inssanos Production Prediction Engine",

      version:
        "1.0.0",

      generatedAt:
        completedAt,

      durationMs,

      historicalRange: {
        first:
          contests[0].concurso,

        last:
          lastContestNumber
      },

      targetContest:
        targetContestNumber
    },

    config:
      clone(
        CONFIG
      ),

    summary: {
      historicalContests:
        contests.length,

      firstContest:
        contests[0].concurso,

      lastContest:
        lastContestNumber,

      targetContest:
        targetContestNumber,

      generations:
        evolutionResult.summary
          ?.generations ??
        0,

      strategiesTested:
        evolutionResult.summary
          ?.strategiesTested ??
        0,

      bestFitness:
        round(
          numeric(
            evolutionResult.summary
              ?.bestFitness
          ),
          8
        ),

      bestStrategyId:
        evolutionResult.summary
          ?.bestStrategyId ??
        null
    },

    prediction: {
      targetContest:
        targetContestNumber,

      generatedFromContest:
        lastContestNumber,

      numbers,

      dezenas:
        numbers,

      count:
        numbers.length,

      raw:
        finalPrediction.raw,

      explanations:
        finalPrediction.explanations
    },

    best:
      clone(
        best
      ),

    dna,

    generations:
      summarizeGenerations(
        evolutionResult.generations
      )
  };

  const latestPath =
    path.join(
      OUTPUT_DIR,
      "latest.json"
    );

  const predictionPath =
    path.join(
      OUTPUT_DIR,
      `prediction-${targetContestNumber}.json`
    );

  const dnaPath =
    path.join(
      OUTPUT_DIR,
      `dna-${targetContestNumber}.json`
    );

  writeJson(
    latestPath,
    output
  );

  writeJson(
    predictionPath,
    output
  );

  writeJson(
    dnaPath,
    dna
  );

  /* ---------------------------------------------------------------------- */
  /* FINAL                                                                    */
  /* ---------------------------------------------------------------------- */

  console.log(
    ""
  );

  console.log(
    "=============================================="
  );

  console.log(
    " PRODUÇÃO FINALIZADA"
  );

  console.log(
    "=============================================="
  );

  console.log(
    `Histórico utilizado: ${contests.length} concursos`
  );

  console.log(
    `Último concurso conhecido: ${lastContestNumber}`
  );

  console.log(
    `Concurso alvo: ${targetContestNumber}`
  );

  console.log(
    `Gerações: ${
      evolutionResult.summary
        ?.generations ??
      CONFIG.generations
    }`
  );

  console.log(
    `Estratégias testadas: ${
      evolutionResult.summary
        ?.strategiesTested ??
      0
    }`
  );

  console.log(
    `Melhor fitness: ${
      evolutionResult.summary
        ?.bestFitness ??
      0
    }`
  );

  console.log(
    `Strategy hash: ${
      evolutionResult.summary
        ?.bestStrategyId ??
      "N/A"
    }`
  );

  console.log(
    ""
  );

  console.log(
    "PREVISÃO:"
  );

  if (
    numbers.length > 0
  ) {
    console.log(
      `      ${numbers
        .map(
          (number) =>
            String(number).padStart(
              2,
              "0"
            )
        )
        .join(" - ")}`
    );
  } else {
    console.log(
      "      O motor não retornou dezenas em formato reconhecido."
    );

    console.log(
      "      Consulte prediction.raw no JSON."
    );
  }

  console.log(
    ""
  );

  console.log(
    "Arquivos:"
  );

  console.log(
    `      ${latestPath}`
  );

  console.log(
    `      ${predictionPath}`
  );

  console.log(
    `      ${dnaPath}`
  );

  return output;
}

/* ============================================================================
 * EXECUÇÃO
 * ========================================================================== */

main().catch(
  (error) => {
    console.error(
      ""
    );

    console.error(
      "=============================================="
    );

    console.error(
      " ERRO NA PREVISÃO DE PRODUÇÃO"
    );

    console.error(
      "=============================================="
    );

    console.error(
      error
    );

    process.exitCode =
      1;
  }
);

