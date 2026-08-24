import crypto from "node:crypto";

/**
 * Predictive Evolution Engine
 *
 * Responsável por conectar:
 *
 *   Predictive Intelligence
 *          ↓
 *   Predictive Backtest
 *          ↓
 *   Predictive Evolution
 *          ↓
 *     Nova geração
 *
 * O engine não faz a análise estatística diretamente.
 * Ele apenas coordena o processo evolutivo.
 *
 * Objetivos:
 *
 * - gerar estratégias;
 * - executar inteligência preditiva;
 * - executar backtests históricos;
 * - calcular fitness;
 * - preservar estratégias;
 * - gerar mutações;
 * - evitar estratégias duplicadas;
 * - criar DNA auditável;
 * - manter histórico das gerações;
 * - permitir reprodução de uma evolução.
 */

/* -------------------------------------------------------------------------- */
/* CONSTANTES                                                                 */
/* -------------------------------------------------------------------------- */

const DEFAULT_CONFIG = {
  populationSize: 10,
  eliteSize: 3,
  mutationRate: 0.35,
  mutationStrength: 0.15,

  /**
   * Quantidade de concursos utilizados pelo backtest.
   */
  backtestContests: 100,

  /**
   * Quantidade de concursos ignorados no início
   * para que as janelas estatísticas tenham dados.
   */
  warmupContests: 100,

  /**
   * Quantidade de gerações.
   */
  generations: 10,

  /**
   * Mantém estratégias de gerações anteriores.
   */
  preserveHistory: true,

  /**
   * Impede que uma estratégia exatamente igual
   * seja executada novamente.
   */
  preventDuplicates: true,

  /**
   * Número máximo de tentativas para gerar
   * indivíduos diferentes.
   */
  maxGenerationAttempts: 500,

  /**
   * Semente opcional.
   *
   * Quando definida, facilita reprodução de experimentos.
   */
  seed: null,

  /**
   * Pesos do fitness.
   *
   * O objetivo é evitar que um único concurso
   * determine se uma estratégia é boa ou ruim.
   */
  fitnessWeights: {
    averageHits: 0.30,
    quadras: 0.20,
    quinas: 0.20,
    senas: 0.20,
    consistency: 0.10
  }
};

/* -------------------------------------------------------------------------- */
/* UTILITÁRIOS                                                                */
/* -------------------------------------------------------------------------- */

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function numeric(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Hash determinístico da estratégia.
 *
 * Isso é importante porque permite saber se uma configuração
 * já foi testada anteriormente.
 */
function strategyHash(strategy) {
  const normalized = JSON.stringify(
    sortObject(strategy)
  );

  return crypto
    .createHash("sha256")
    .update(normalized)
    .digest("hex");
}

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = sortObject(value[key]);
        return result;
      }, {});
  }

  return value;
}

/**
 * Randomizador controlado.
 *
 * Não é um PRNG criptográfico.
 * É utilizado somente para evolução/mutação.
 */
function random(min = 0, max = 1) {
  return min + Math.random() * (max - min);
}

function randomChoice(array) {
  if (!array.length) {
    return null;
  }

  return array[
    Math.floor(Math.random() * array.length)
  ];
}

/* -------------------------------------------------------------------------- */
/* NORMALIZAÇÃO DE CONFIGURAÇÃO                                               */
/* -------------------------------------------------------------------------- */

function normalizeConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config,

    fitnessWeights: {
      ...DEFAULT_CONFIG.fitnessWeights,
      ...(config.fitnessWeights || {})
    }
  };
}

/* -------------------------------------------------------------------------- */
/* DNA                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Cria o DNA completo de uma estratégia.
 *
 * O DNA é propositalmente rico em informações.
 *
 * A ideia é que futuramente a API consiga responder:
 *
 * "Por que o modelo escolheu esses números?"
 *
 * e também:
 *
 * "De onde essa estratégia veio?"
 */
function createStrategyDNA({
  strategy,
  generation,
  parent,
  mutation,
  prediction,
  intelligence,
  backtest,
  fitness,
  status,
  rank
}) {
  const hash = strategyHash(strategy);

  return {
    strategyId:
      `g${generation}-${hash.slice(0, 12)}`,

    strategyHash: hash,

    generation,

    parentStrategyId:
      parent?.strategyId || null,

    createdAt: nowIso(),

    status: status || "candidate",

    rank:
      Number.isFinite(rank)
        ? rank
        : null,

    strategy: deepClone(strategy),

    mutation:
      mutation
        ? deepClone(mutation)
        : null,

    prediction:
      prediction
        ? deepClone(prediction)
        : null,

    intelligence:
      intelligence
        ? deepClone(intelligence)
        : null,

    backtest:
      backtest
        ? deepClone(backtest)
        : null,

    fitness: {
      score: numeric(fitness?.score),
      components: {
        ...(fitness?.components || {})
      }
    },

    audit: {
      reason: buildDecisionReason({
        status,
        fitness,
        mutation
      })
    }
  };
}

function buildDecisionReason({
  status,
  fitness,
  mutation
}) {
  const score = round(
    numeric(fitness?.score),
    4
  );

  if (status === "elite") {
    return `Estratégia preservada como elite com fitness ${score}.`;
  }

  if (status === "survivor") {
    return `Estratégia sobreviveu à seleção com fitness ${score}.`;
  }

  if (status === "mutant") {
    return mutation
      ? `Nova estratégia criada por mutação de ${mutation.parameter}.`
      : "Nova estratégia criada por mutação.";
  }

  if (status === "discarded") {
    return `Estratégia descartada com fitness ${score}.`;
  }

  return "Estratégia candidata.";
}

/* -------------------------------------------------------------------------- */
/* FITNESS                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Extrai métricas do resultado do backtest.
 *
 * O método aceita vários nomes possíveis para facilitar
 * integração com o PredictiveBacktestService.
 */
function normalizeBacktestMetrics(backtest) {
  const metrics =
    backtest?.metrics ||
    backtest?.metricas ||
    backtest?.summary ||
    {};

  return {
    contests:
      numeric(
        metrics.contests ??
          metrics.totalContests ??
          backtest?.contests ??
          backtest?.totalContests
      ),

    averageHits:
      numeric(
        metrics.averageHits ??
          metrics.mediaAcertos ??
          metrics.averageMatch ??
          backtest?.averageHits
      ),

    quadras:
      numeric(
        metrics.quadras ??
          metrics.quadra ??
          metrics.totalQuadras ??
          backtest?.quadras
      ),

    quinas:
      numeric(
        metrics.quinas ??
          metrics.totalQuinas ??
          backtest?.quinas
      ),

    senas:
      numeric(
        metrics.senas ??
          metrics.totalSenas ??
          backtest?.senas
      ),

    consistency:
      numeric(
        metrics.consistency ??
          metrics.consistencia ??
          metrics.stability ??
          metrics.estabilidade ??
          backtest?.consistency
      )
  };
}

/**
 * Normaliza cada componente para uma escala comparável.
 */
function calculateFitness({
  backtest,
  weights
}) {
  const metrics =
    normalizeBacktestMetrics(backtest);

  /**
   * Os limites abaixo são deliberadamente conservadores.
   *
   * Eles não representam "probabilidade de ganhar".
   * São somente uma escala para comparar estratégias
   * dentro do nosso experimento.
   */

  const averageHitsScore =
    clamp(
      metrics.averageHits / 6,
      0,
      1
    );

  const quadrasScore =
    clamp(
      metrics.quadras /
        Math.max(
          metrics.contests * 5,
          1
        ),
      0,
      1
    );

  const quinasScore =
    clamp(
      metrics.quinas /
        Math.max(
          metrics.contests,
          1
        ),
      0,
      1
    );

  const senasScore =
    clamp(
      metrics.senas /
        Math.max(
          metrics.contests,
          1
        ),
      0,
      1
    );

  const consistencyScore =
    clamp(
      metrics.consistency > 1
        ? metrics.consistency / 100
        : metrics.consistency,
      0,
      1
    );

  const score =
    averageHitsScore *
      numeric(weights.averageHits) +

    quadrasScore *
      numeric(weights.quadras) +

    quinasScore *
      numeric(weights.quinas) +

    senasScore *
      numeric(weights.senas) +

    consistencyScore *
      numeric(weights.consistency);

  return {
    score: round(score, 8),

    components: {
      averageHits: round(
        averageHitsScore,
        6
      ),

      quadras: round(
        quadrasScore,
        6
      ),

      quinas: round(
        quinasScore,
        6
      ),

      senas: round(
        senasScore,
        6
      ),

      consistency: round(
        consistencyScore,
        6
      )
    },

    raw: metrics
  };
}

/* -------------------------------------------------------------------------- */
/* ESTRATÉGIA INICIAL                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Estratégia padrão.
 *
 * Essa função não conhece os detalhes internos
 * do PredictiveIntelligenceService.
 *
 * Ela apenas fornece os parâmetros que serão
 * consumidos pelo serviço.
 */
function createDefaultStrategy() {
  return {
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
}

/* -------------------------------------------------------------------------- */
/* MUTAÇÃO                                                                      */
/* -------------------------------------------------------------------------- */

const MUTATION_PARAMETERS = [
  {
    path: [
      "windows",
      "frequency"
    ],
    min: 10,
    max: 300,
    integer: true
  },

  {
    path: [
      "windows",
      "recent"
    ],
    min: 5,
    max: 100,
    integer: true
  },

  {
    path: [
      "windows",
      "average"
    ],
    min: 20,
    max: 500,
    integer: true
  },

  {
    path: [
      "windows",
      "distance"
    ],
    min: 20,
    max: 500,
    integer: true
  },

  {
    path: [
      "weights",
      "frequency"
    ],
    min: 0,
    max: 1
  },

  {
    path: [
      "weights",
      "recency"
    ],
    min: 0,
    max: 1
  },

  {
    path: [
      "weights",
      "average"
    ],
    min: 0,
    max: 1
  },

  {
    path: [
      "weights",
      "distance"
    ],
    min: 0,
    max: 1
  },

  {
    path: [
      "weights",
      "randomness"
    ],
    min: 0,
    max: 1
  }
];

function getPathValue(
  object,
  path
) {
  return path.reduce(
    (current, key) =>
      current?.[key],
    object
  );
}

function setPathValue(
  object,
  path,
  value
) {
  let current = object;

  for (
    let index = 0;
    index < path.length - 1;
    index += 1
  ) {
    current =
      current[path[index]];
  }

  current[
    path[path.length - 1]
  ] = value;
}

function mutateStrategy(
  parent,
  config
) {
  const strategy =
    deepClone(parent.strategy);

  const parameter =
    randomChoice(
      MUTATION_PARAMETERS
    );

  if (!parameter) {
    return {
      strategy,
      mutation: null
    };
  }

  const oldValue =
    getPathValue(
      strategy,
      parameter.path
    );

  let newValue;

  if (parameter.integer) {
    const range =
      parameter.max -
      parameter.min;

    const delta =
      Math.max(
        1,
        Math.round(
          range *
            config.mutationStrength
        )
      );

    newValue = clamp(
      numeric(oldValue) +
        Math.round(
          random(
            -delta,
            delta
          )
        ),
      parameter.min,
      parameter.max
    );
  } else {
    const delta =
      config.mutationStrength *
      random(0.25, 1);

    newValue = clamp(
      numeric(oldValue) +
        random(
          -delta,
          delta
        ),
      parameter.min,
      parameter.max
    );

    newValue =
      round(
        newValue,
        6
      );
  }

  setPathValue(
    strategy,
    parameter.path,
    newValue
  );

  /**
   * Normalização dos pesos.
   *
   * Isso evita que as mutações façam
   * a soma dos pesos explodir.
   */
  if (
    parameter.path[0] ===
    "weights"
  ) {
    normalizeWeights(
      strategy.weights
    );
  }

  return {
    strategy,
    mutation: {
      parameter:
        parameter.path.join("."),

      oldValue,

      newValue,

      delta:
        round(
          numeric(newValue) -
            numeric(oldValue),
          6
        )
    }
  };
}

function normalizeWeights(
  weights
) {
  const keys = [
    "frequency",
    "recency",
    "average",
    "distance",
    "randomness"
  ];

  const total =
    keys.reduce(
      (sum, key) =>
        sum +
        Math.max(
          0,
          numeric(weights[key])
        ),
      0
    );

  if (total <= 0) {
    const value =
      1 / keys.length;

    keys.forEach(
      key => {
        weights[key] = value;
      }
    );

    return;
  }

  keys.forEach(
    key => {
      weights[key] =
        round(
          Math.max(
            0,
            numeric(
              weights[key]
            )
          ) / total,
          6
        );
    }
  );
}

/* -------------------------------------------------------------------------- */
/* ENGINE                                                                       */
/* -------------------------------------------------------------------------- */

export class PredictiveEvolutionEngineService {
  constructor({
    intelligenceService,
    backtestService,
    evolutionService,
    logger = console
  } = {}) {
    if (!intelligenceService) {
      throw new Error(
        "PredictiveEvolutionEngineService: intelligenceService é obrigatório."
      );
    }

    if (!backtestService) {
      throw new Error(
        "PredictiveEvolutionEngineService: backtestService é obrigatório."
      );
    }

    if (!evolutionService) {
      throw new Error(
        "PredictiveEvolutionEngineService: evolutionService é obrigatório."
      );
    }

    this.intelligenceService =
      intelligenceService;

    this.backtestService =
      backtestService;

    this.evolutionService =
      evolutionService;

    this.logger =
      logger;
  }

  /* ---------------------------------------------------------------------- */
  /* INTELLIGENCE                                                            */
  /* ---------------------------------------------------------------------- */

  async generatePrediction({
    strategy,
    contests,
    context = {}
  }) {
    /**
     * Compatibilidade com diferentes formatos
     * de implementação do Intelligence Service.
     */

    if (
      typeof this
        .intelligenceService
        .predict === "function"
    ) {
      return this
        .intelligenceService
        .predict({
          strategy,
          contests,
          context
        });
    }

    if (
      typeof this
        .intelligenceService
        .generatePrediction ===
      "function"
    ) {
      return this
        .intelligenceService
        .generatePrediction({
          strategy,
          contests,
          context
        });
    }

    if (
      typeof this
        .intelligenceService
        .analyze === "function"
    ) {
      return this
        .intelligenceService
        .analyze({
          strategy,
          contests,
          context
        });
    }

    throw new Error(
      "PredictiveIntelligenceService não possui predict(), generatePrediction() ou analyze()."
    );
  }

  /* ---------------------------------------------------------------------- */
  /* BACKTEST                                                                */
  /* ---------------------------------------------------------------------- */

  async executeBacktest({
    strategy,
    contests,
    context = {}
  }) {
    if (
      typeof this
        .backtestService
        .run === "function"
    ) {
      return this
        .backtestService
        .run({
          strategy,
          contests,
          context
        });
    }

    if (
      typeof this
        .backtestService
        .backtest ===
      "function"
    ) {
      return this
        .backtestService
        .backtest({
          strategy,
          contests,
          context
        });
    }

    if (
      typeof this
        .backtestService
        .runBacktest ===
      "function"
    ) {
      return this
        .backtestService
        .runBacktest({
          strategy,
          contests,
          context
        });
    }

    throw new Error(
      "PredictiveBacktestService não possui run(), backtest() ou runBacktest()."
    );
  }

  /* ---------------------------------------------------------------------- */
  /* EVOLUTION                                                               */
  /* ---------------------------------------------------------------------- */

  async evolvePopulation({
    population,
    generation,
    config
  }) {
    if (
      typeof this
        .evolutionService
        .evolve === "function"
    ) {
      return this
        .evolutionService
        .evolve({
          population,
          generation,
          config
        });
    }

    /**
     * Fallback interno.
     *
     * O PredictiveEvolutionService continua sendo
     * a autoridade quando possui evolve().
     *
     * Caso contrário, o engine consegue operar
     * sozinho para o MVP.
     */

    const sorted =
      [...population].sort(
        (a, b) =>
          numeric(
            b.fitness?.score
          ) -
          numeric(
            a.fitness?.score
          )
      );

    const elite =
      sorted.slice(
        0,
        config.eliteSize
      );

    const nextPopulation = [];

    elite.forEach(
      individual => {
        nextPopulation.push({
          ...deepClone(
            individual
          ),
          status: "elite"
        });
      }
    );

    while (
      nextPopulation.length <
      config.populationSize
    ) {
      const parent =
        randomChoice(elite);

      if (!parent) {
        break;
      }

      const mutated =
        mutateStrategy(
          parent,
          config
        );

      nextPopulation.push({
        strategy:
          mutated.strategy,

        parent,

        mutation:
          mutated.mutation,

        status: "mutant",

        generation:
          generation + 1
      });
    }

    return nextPopulation;
  }

  /* ---------------------------------------------------------------------- */
  /* AVALIA UMA ESTRATÉGIA                                                   */
  /* ---------------------------------------------------------------------- */

  async evaluateStrategy({
    strategy,
    contests,
    generation,
    parent = null,
    mutation = null,
    config,
    context = {}
  }) {
    const startedAt =
      Date.now();

    const hash =
      strategyHash(strategy);

    let prediction;
    let intelligence;
    let backtest;
    let fitness;

    try {
      /**
       * Primeiro a inteligência produz
       * a interpretação da estratégia.
       */
      intelligence =
        await this.generatePrediction({
          strategy,
          contests,
          context
        });

      /**
       * Depois o backtest mede o comportamento
       * contra dados históricos.
       */
      backtest =
        await this.executeBacktest({
          strategy,
          contests,
          context: {
            ...context,
            intelligence
          }
        });

      /**
       * Finalmente transformamos o resultado
       * em uma métrica comparável.
       */
      fitness =
        calculateFitness({
          backtest,
          weights:
            config.fitnessWeights
        });

      return {
        strategy:
          deepClone(strategy),

        strategyHash:
          hash,

        generation,

        parent,

        mutation,

        prediction,

        intelligence,

        backtest,

        fitness,

        durationMs:
          Date.now() -
          startedAt,

        status:
          "evaluated"
      };
    } catch (error) {
      return {
        strategy:
          deepClone(strategy),

        strategyHash:
          hash,

        generation,

        parent,

        mutation,

        prediction:
          prediction || null,

        intelligence:
          intelligence || null,

        backtest:
          backtest || null,

        fitness: {
          score: 0,

          components: {},

          error:
            error?.message ||
            "Erro desconhecido"
        },

        durationMs:
          Date.now() -
          startedAt,

        status:
          "error",

        error:
          error?.message ||
          "Erro desconhecido"
      };
    }
  }

  /* ---------------------------------------------------------------------- */
  /* GERA POPULAÇÃO INICIAL                                                  */
  /* ---------------------------------------------------------------------- */

  createInitialPopulation({
    config
  }) {
    const population = [];

    const hashes =
      new Set();

    let attempts = 0;

    while (
      population.length <
        config.populationSize &&
      attempts <
        config.maxGenerationAttempts
    ) {
      attempts += 1;

      const strategy =
        createDefaultStrategy();

      /**
       * Pequena variação inicial.
       *
       * Não queremos começar com 10 cópias
       * exatamente iguais.
       */
      const mutated =
        mutateStrategy(
          {
            strategy
          },
          {
            ...config,
            mutationStrength:
              0.35
          }
        );

      const candidate =
        mutated.strategy;

      const hash =
        strategyHash(candidate);

      if (
        config.preventDuplicates &&
        hashes.has(hash)
      ) {
        continue;
      }

      hashes.add(hash);

      population.push({
        strategy:
          candidate,

        parent: null,

        mutation:
          mutated.mutation,

        status:
          "candidate",

        generation: 0
      });
    }

    return population;
  }

  /* ---------------------------------------------------------------------- */
  /* UMA GERAÇÃO                                                              */
  /* ---------------------------------------------------------------------- */

  async runGeneration({
    population,
    generation,
    contests,
    config,
    context = {},
    testedHashes
  }) {
    const evaluated = [];

    for (
      const individual of population
    ) {
      const hash =
        strategyHash(
          individual.strategy
        );

      if (
        config.preventDuplicates &&
        testedHashes.has(hash)
      ) {
        continue;
      }

      testedHashes.add(hash);

      const result =
        await this.evaluateStrategy({
          strategy:
            individual.strategy,

          contests,

          generation,

          parent:
            individual.parent,

          mutation:
            individual.mutation,

          config,

          context
        });

      evaluated.push(
        result
      );
    }

    /**
     * Ordenação pelo fitness.
     */
    evaluated.sort(
      (a, b) =>
        numeric(
          b.fitness?.score
        ) -
        numeric(
          a.fitness?.score
        )
    );

    /**
     * Classificação.
     */
    evaluated.forEach(
      (item, index) => {
        item.rank =
          index + 1;

        if (
          index <
          config.eliteSize
        ) {
          item.status =
            "elite";
        } else {
          item.status =
            "survivor";
        }
      }
    );

    /**
     * DNA auditável.
     */
    const dna =
      evaluated.map(
        item =>
          createStrategyDNA({
            strategy:
              item.strategy,

            generation,

            parent:
              item.parent,

            mutation:
              item.mutation,

            prediction:
              item.prediction,

            intelligence:
              item.intelligence,

            backtest:
              item.backtest,

            fitness:
              item.fitness,

            status:
              item.status,

            rank:
              item.rank
          })
      );

    return {
      generation,

      evaluated,

      dna,

      best:
        evaluated[0] ||
        null,

      populationSize:
        evaluated.length,

      completedAt:
        nowIso()
    };
  }

  /* ---------------------------------------------------------------------- */
  /* EVOLUÇÃO COMPLETA                                                        */
  /* ---------------------------------------------------------------------- */

  async run({
    contests,
    config: customConfig = {},
    initialPopulation = null,
    context = {},
    onGeneration = null
  } = {}) {
    const config =
      normalizeConfig(
        customConfig
      );

    if (
      !Array.isArray(contests) ||
      contests.length === 0
    ) {
      throw new Error(
        "PredictiveEvolutionEngineService.run(): contests deve ser um array com dados históricos."
      );
    }

    /**
     * Banco em memória das estratégias já testadas.
     *
     * Se posteriormente persistirmos isso no R2,
     * o mesmo conceito continuará funcionando.
     */
    const testedHashes =
      new Set();

    const history = [];

    let population =
      initialPopulation
        ? deepClone(
            initialPopulation
          )
        : this.createInitialPopulation({
            config
          });

    let globalBest = null;

    const startedAt =
      Date.now();

    for (
      let generation = 0;
      generation <
      config.generations;
      generation += 1
    ) {
      this.logger.log?.(
        `[PREDICTIVE EVOLUTION] Geração ${generation + 1}/${config.generations}`
      );

      /**
       * Selecionamos a janela de dados
       * utilizada nessa geração.
       */
      const generationContests =
        this.prepareBacktestData({
          contests,
          config
        });

      const result =
        await this.runGeneration({
          population,

          generation,

          contests:
            generationContests,

          config,

          context,

          testedHashes
        });

      history.push(
        result
      );

      /**
       * Atualiza melhor estratégia global.
       */
      if (
        result.best &&
        (
          !globalBest ||
          numeric(
            result.best.fitness?.score
          ) >
            numeric(
              globalBest.fitness?.score
            )
        )
      ) {
        globalBest =
          deepClone(
            result.best
          );
      }

      if (
        typeof onGeneration ===
        "function"
      ) {
        await onGeneration({
          generation,
          result,
          globalBest,
          history
        });
      }

      /**
       * Última geração não precisa
       * criar outra população.
       */
      if (
        generation ===
        config.generations - 1
      ) {
        break;
      }

      /**
       * Evolui a população.
       */
      let nextPopulation =
        await this.evolvePopulation({
          population:
            result.evaluated,

          generation,

          config
        });

      /**
       * Normaliza o resultado do
       * PredictiveEvolutionService.
       */
      nextPopulation =
        this.normalizeNextPopulation(
          nextPopulation,
          generation + 1
        );

      /**
       * Remove duplicados.
       */
      nextPopulation =
        this.removeDuplicatePopulation(
          nextPopulation,
          testedHashes,
          config
        );

      /**
       * Caso o EvolutionService tenha produzido
       * menos indivíduos que o necessário,
       * completamos com mutações.
       */
      nextPopulation =
        this.fillPopulation({
          population:
            nextPopulation,

          source:
            result.evaluated,

          generation:
            generation + 1,

          config,

          testedHashes
        });

      population =
        nextPopulation;
    }

    const elapsedMs =
      Date.now() -
      startedAt;

    return {
      engine: {
        version: "1.0.0",
        startedAt:
          new Date(
            Date.now() -
              elapsedMs
          ).toISOString(),
        completedAt:
          nowIso(),
        durationMs:
          elapsedMs
      },

      config,

      summary: {
        generations:
          history.length,

        strategiesTested:
          testedHashes.size,

        bestFitness:
          globalBest
            ? round(
                numeric(
                  globalBest
                    .fitness
                    ?.score
                ),
                8
              )
            : 0,

        bestStrategyId:
          globalBest
            ? strategyHash(
                globalBest.strategy
              )
            : null
      },

      best:
        globalBest,

      generations:
        history.map(
          generation => ({
            generation:
              generation.generation,

            populationSize:
              generation.populationSize,

            bestFitness:
              generation.best
                ? round(
                    numeric(
                      generation
                        .best
                        .fitness
                        ?.score
                    ),
                    8
                  )
                : 0,

            bestStrategyHash:
              generation.best
                ?.strategyHash ||
              null,

            completedAt:
              generation.completedAt
          })
        ),

      dna:
        history.flatMap(
          generation =>
            generation.dna
        ),

      history
    };
  }

  /* ---------------------------------------------------------------------- */
  /* PREPARAÇÃO DOS DADOS                                                     */
  /* ---------------------------------------------------------------------- */

  prepareBacktestData({
    contests,
    config
  }) {
    const sorted =
      [...contests].sort(
        (a, b) =>
          numeric(
            a?.concurso
          ) -
          numeric(
            b?.concurso
          )
      );

    const warmup =
      Math.max(
        0,
        config.warmupContests
      );

    /**
     * Para backtest, não queremos simplesmente
     * entregar o último concurso.
     *
     * O serviço de backtest deve conseguir caminhar
     * historicamente.
     */
    if (
      sorted.length <= warmup
    ) {
      return sorted;
    }

    return sorted;
  }

  /* ---------------------------------------------------------------------- */
  /* NORMALIZA POPULAÇÃO                                                      */
  /* ---------------------------------------------------------------------- */

  normalizeNextPopulation(
    population,
    generation
  ) {
    if (
      !Array.isArray(population)
    ) {
      return [];
    }

    return population
      .filter(
        item =>
          item &&
          item.strategy
      )
      .map(
        item => ({
          ...item,

          generation,

          strategy:
            deepClone(
              item.strategy
            )
        })
      );
  }

  /* ---------------------------------------------------------------------- */
  /* DUPLICADOS                                                               */
  /* ---------------------------------------------------------------------- */

  removeDuplicatePopulation(
    population,
    testedHashes,
    config
  ) {
    if (
      !config.preventDuplicates
    ) {
      return population;
    }

    const seen =
      new Set();

    return population.filter(
      individual => {
        const hash =
          strategyHash(
            individual.strategy
          );

        if (
          seen.has(hash) ||
          testedHashes.has(hash)
        ) {
          return false;
        }

        seen.add(hash);

        return true;
      }
    );
  }

  /* ---------------------------------------------------------------------- */
  /* COMPLETA POPULAÇÃO                                                       */
  /* ---------------------------------------------------------------------- */

  fillPopulation({
    population,
    source,
    generation,
    config,
    testedHashes
  }) {
    const result =
      [...population];

    const candidates =
      [...source].sort(
        (a, b) =>
          numeric(
            b.fitness?.score
          ) -
          numeric(
            a.fitness?.score
          )
      );

    let attempts = 0;

    while (
      result.length <
        config.populationSize &&
      attempts <
        config.maxGenerationAttempts
    ) {
      attempts += 1;

      const parent =
        randomChoice(
          candidates
        );

      if (!parent) {
        break;
      }

      const mutated =
        mutateStrategy(
          parent,
          config
        );

      const hash =
        strategyHash(
          mutated.strategy
        );

      if (
        testedHashes.has(hash)
      ) {
        continue;
      }

      if (
        result.some(
          individual =>
            strategyHash(
              individual.strategy
            ) === hash
        )
      ) {
        continue;
      }

      result.push({
        strategy:
          mutated.strategy,

        parent,

        mutation:
          mutated.mutation,

        status:
          "mutant",

        generation
      });
    }

    /**
     * Último recurso.
     *
     * Se não conseguirmos gerar indivíduos
     * diferentes, mantemos os melhores.
     *
     * Isso evita que o engine quebre simplesmente
     * porque o espaço de busca ficou saturado.
     */
    if (
      result.length === 0 &&
      candidates.length > 0
    ) {
      result.push(
        deepClone(
          candidates[0]
        )
      );
    }

    return result.slice(
      0,
      config.populationSize
    );
  }
}

/* -------------------------------------------------------------------------- */
/* FACTORY                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Factory para facilitar utilização na API.
 */
export function createPredictiveEvolutionEngine({
  intelligenceService,
  backtestService,
  evolutionService,
  logger = console
}) {
  return new PredictiveEvolutionEngineService({
    intelligenceService,
    backtestService,
    evolutionService,
    logger
  });
}

/* -------------------------------------------------------------------------- */
/* EXPORTS AUXILIARES                                                          */
/* -------------------------------------------------------------------------- */

export {
  calculateFitness,
  createDefaultStrategy,
  createStrategyDNA,
  mutateStrategy,
  strategyHash
};

export default PredictiveEvolutionEngineService;