/**
 * predictiveBacktestService.js
 *
 * Backtest temporal do motor preditivo.
 *
 * Objetivo:
 * - simular o algoritmo como se estivesse no passado;
 * - gerar uma previsão para um concurso futuro;
 * - comparar a previsão com o resultado real;
 * - registrar acertos e métricas;
 * - guardar o "DNA" da execução;
 * - permitir comparar diferentes configurações/modelos;
 *
 * REGRA FUNDAMENTAL:
 *
 * Para prever o concurso N:
 *
 *     treino = concursos < N
 *     alvo   = concurso N
 *
 * O concurso N NUNCA entra nas features utilizadas
 * para gerar sua própria previsão.
 */

import {
  generatePredictiveIntelligence
} from "./predictiveIntelligenceService.js";


/**
 * Configuração padrão do backtest.
 */
const DEFAULT_BACKTEST_CONFIG = {
  startFromContest: null,

  /**
   * Quantidade mínima de concursos históricos
   * necessários antes de iniciar o teste.
   */
  minHistory: 100,

  /**
   * Número máximo de concursos que serão testados.
   *
   * null = todos os possíveis.
   */
  maxTests: null,

  /**
   * Configuração enviada para o motor preditivo.
   */
  modelConfig: {},

  /**
   * Guarda o DNA completo de cada teste.
   */
  saveDNA: true,

  /**
   * Guarda o ranking completo das 60 dezenas.
   *
   * Pode gerar bastante informação.
   */
  saveFullRanking: false,

  /**
   * Número de previsões alternativas.
   */
  saveAlternatives: true
};


/**
 * Merge simples das configurações.
 */
function mergeConfig(
  base,
  override = {}
) {
  return {
    ...base,
    ...override,

    modelConfig: {
      ...base.modelConfig,
      ...(override.modelConfig || {})
    }
  };
}


/**
 * Converte para número.
 */
function toNumber(
  value,
  fallback = 0
) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}


/**
 * Limita valor.
 */
function clamp(
  value,
  min = 0,
  max = 1
) {
  return Math.min(
    max,
    Math.max(min, value)
  );
}


/**
 * Arredonda número.
 */
function round(
  value,
  decimals = 4
) {
  const factor =
    10 ** decimals;

  return (
    Math.round(
      value * factor
    ) / factor
  );
}


/**
 * Normaliza dezenas.
 */
function normalizeNumbers(
  values
) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map(
      (value) =>
        Number(value)
    )
    .filter(
      (value) =>
        Number.isFinite(value)
    )
    .map(
      (value) =>
        Math.trunc(value)
    );
}


/**
 * Extrai dezenas do concurso.
 */
function extractNumbers(
  contest
) {
  if (
    Array.isArray(
      contest?.dezenas
    )
  ) {
    return normalizeNumbers(
      contest.dezenas
    );
  }

  if (
    Array.isArray(
      contest?.dezenasOrdemSorteio
    )
  ) {
    return normalizeNumbers(
      contest.dezenasOrdemSorteio
    );
  }

  return [];
}


/**
 * Ordena os concursos.
 */
function sortContests(
  contests
) {
  return [...contests].sort(
    (a, b) =>
      toNumber(a?.concurso) -
      toNumber(b?.concurso)
  );
}


/**
 * Interseção entre duas listas.
 */
function intersection(
  first,
  second
) {
  const secondSet =
    new Set(second);

  return first.filter(
    (value) =>
      secondSet.has(value)
  );
}


/**
 * Calcula quantidade de acertos.
 */
function calculateHits(
  prediction,
  actual
) {
  return intersection(
    prediction,
    actual
  );
}


/**
 * Calcula percentual de acerto
 * das dezenas escolhidas.
 */
function calculateHitRate(
  hitCount,
  pickCount
) {
  if (!pickCount) {
    return 0;
  }

  return (
    hitCount /
    pickCount
  );
}


/**
 * Classifica desempenho.
 *
 * Para Mega-Sena:
 *
 * 0 acertos = falha
 * 1 acerto  = muito baixo
 * 2 acertos = baixo
 * 3 acertos = relevante
 * 4 acertos = excelente
 * 5 acertos = excepcional
 * 6 acertos = acerto completo
 *
 * Esses níveis são apenas métricas
 * do nosso sistema de análise.
 */
function classifyPerformance(
  hitCount,
  pickCount
) {
  if (
    hitCount >= pickCount
  ) {
    return "jackpot";
  }

  if (hitCount >= 5) {
    return "exceptional";
  }

  if (hitCount >= 4) {
    return "excellent";
  }

  if (hitCount >= 3) {
    return "relevant";
  }

  if (hitCount >= 2) {
    return "low";
  }

  if (hitCount >= 1) {
    return "very_low";
  }

  return "miss";
}


/**
 * Calcula a distância entre a previsão
 * e o resultado real.
 *
 * Quanto menor, melhor.
 *
 * Exemplo:
 *
 * previsão:
 * [5, 10, 20, 30, 40, 50]
 *
 * resultado:
 * [5, 11, 21, 31, 41, 51]
 *
 * O erro médio será calculado
 * pela menor distância de cada número.
 */
function calculatePredictionDistance(
  prediction,
  actual
) {
  if (
    !prediction.length ||
    !actual.length
  ) {
    return 0;
  }

  const distances =
    prediction.map(
      (predicted) => {
        const nearest =
          Math.min(
            ...actual.map(
              (real) =>
                Math.abs(
                  predicted -
                    real
                )
            )
          );

        return nearest;
      }
    );

  const average =
    distances.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    distances.length;

  return round(
    average,
    4
  );
}


/**
 * Calcula similaridade estatística
 * simples entre previsão e resultado.
 *
 * Não representa probabilidade.
 */
function calculateSimilarity(
  prediction,
  actual,
  totalNumbers = 60
) {
  const hits =
    intersection(
      prediction,
      actual
    ).length;

  const pickCount =
    prediction.length;

  if (
    !pickCount ||
    !actual.length
  ) {
    return 0;
  }

  const directHitRate =
    hits /
    pickCount;

  /**
   * Penalização pela distância média.
   */
  const distance =
    calculatePredictionDistance(
      prediction,
      actual
    );

  const distanceScore =
    1 -
    clamp(
      distance /
        Math.max(
          1,
          totalNumbers
        )
    );

  return round(
    directHitRate * 0.8 +
      distanceScore * 0.2
  );
}


/**
 * Cria resumo estatístico
 * dos resultados do backtest.
 */
function calculateSummary(
  tests,
  pickCount
) {
  if (!tests.length) {
    return {
      tests: 0,
      averageHits: 0,
      hitRate: 0,
      zeroHits: 0,
      oneHit: 0,
      twoHits: 0,
      threeHits: 0,
      fourHits: 0,
      fiveHits: 0,
      sixHits: 0,
      bestHits: 0,
      averageDistance: 0,
      averageSimilarity: 0
    };
  }

  const hitCounts =
    tests.map(
      (test) =>
        test.metrics.hitCount
    );

  const distances =
    tests.map(
      (test) =>
        test.metrics.predictionDistance
    );

  const similarities =
    tests.map(
      (test) =>
        test.metrics.similarity
    );

  const totalHits =
    hitCounts.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  const averageHits =
    totalHits /
    tests.length;

  const countHits =
    (value) =>
      hitCounts.filter(
        (item) =>
          item === value
      ).length;

  const exact =
    hitCounts.filter(
      (value) =>
        value >= pickCount
    ).length;

  return {
    tests:
      tests.length,

    averageHits:
      round(
        averageHits,
        4
      ),

    hitRate:
      round(
        averageHits /
          Math.max(
            1,
            pickCount
          ),
        4
      ),

    zeroHits:
      countHits(0),

    oneHit:
      countHits(1),

    twoHits:
      countHits(2),

    threeHits:
      countHits(3),

    fourHits:
      countHits(4),

    fiveHits:
      countHits(5),

    sixHits:
      countHits(6),

    exactPredictions:
      exact,

    bestHits:
      Math.max(
        ...hitCounts
      ),

    averageDistance:
      round(
        distances.reduce(
          (sum, value) =>
            sum + value,
          0
        ) /
          distances.length,
        4
      ),

    averageSimilarity:
      round(
        similarities.reduce(
          (sum, value) =>
            sum + value,
          0
        ) /
          similarities.length,
        4
      )
  };
}


/**
 * Calcula desempenho por dezena.
 *
 * Isso vai ser MUITO útil posteriormente
 * para o nosso sistema evolutivo.
 */
function calculateNumberPerformance(
  tests,
  totalNumbers
) {
  const stats =
    new Map();

  for (
    let number = 1;
    number <= totalNumbers;
    number += 1
  ) {
    stats.set(
      number,
      {
        numero: number,

        vezesPrevisto: 0,

        vezesSorteado: 0,

        acertos: 0,

        precisao: 0,

        recall: 0
      }
    );
  }

  for (
    const test of tests
  ) {
    const prediction =
      test.prediction;

    const actual =
      test.actual;

    const predictedSet =
      new Set(
        prediction
      );

    const actualSet =
      new Set(
        actual
      );

    for (
      const number of prediction
    ) {
      const item =
        stats.get(number);

      if (!item) {
        continue;
      }

      item.vezesPrevisto += 1;

      if (
        actualSet.has(number)
      ) {
        item.acertos += 1;
      }
    }

    for (
      const number of actual
    ) {
      const item =
        stats.get(number);

      if (!item) {
        continue;
      }

      item.vezesSorteado += 1;
    }
  }

  for (
    const item of stats.values()
  ) {
    if (
      item.vezesPrevisto
    ) {
      item.precisao =
        round(
          item.acertos /
            item.vezesPrevisto,
          4
        );
    }

    if (
      item.vezesSorteado
    ) {
      item.recall =
        round(
          item.acertos /
            item.vezesSorteado,
          4
        );
    }
  }

  return [...stats.values()];
}


/**
 * Encontra melhor e pior execução.
 */
function findExtremes(
  tests
) {
  if (!tests.length) {
    return {
      best: null,
      worst: null
    };
  }

  const ordered =
    [...tests].sort(
      (a, b) =>
        b.metrics.hitCount -
        a.metrics.hitCount
    );

  return {
    best:
      ordered[0],

    worst:
      ordered[
        ordered.length - 1
      ]
  };
}


/**
 * Gera uma assinatura simples da configuração.
 *
 * Isso permite identificar uma árvore
 * de evolução futuramente.
 */
function createConfigFingerprint(
  config
) {
  const raw =
    JSON.stringify(
      config
    );

  let hash =
    2166136261;

  for (
    let index = 0;
    index < raw.length;
    index += 1
  ) {
    hash ^=
      raw.charCodeAt(
        index
      );

    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return (
    hash >>> 0
  ).toString(16);
}


/**
 * Executa um único teste.
 *
 * Exemplo:
 *
 * histórico:
 * 1 ... 3047
 *
 * alvo:
 * 3048
 *
 * O motor recebe somente:
 * 1 ... 3047
 */
export function runPredictiveBacktestStep(
  contests,
  targetIndex,
  customConfig = {}
) {
  const config =
    mergeConfig(
      DEFAULT_BACKTEST_CONFIG,
      customConfig
    );

  const ordered =
    sortContests(
      contests
    );

  if (
    targetIndex < 0 ||
    targetIndex >=
      ordered.length
  ) {
    throw new Error(
      `Índice de alvo inválido: ${targetIndex}`
    );
  }

  const target =
    ordered[targetIndex];

  const history =
    ordered.slice(
      0,
      targetIndex
    );

  if (
    history.length <
    config.minHistory
  ) {
    return null;
  }

  const intelligence =
    generatePredictiveIntelligence(
      history,
      config.modelConfig
    );

  const prediction =
    intelligence.prediction;

  const actual =
    extractNumbers(
      target
    );

  const hits =
    calculateHits(
      prediction,
      actual
    );

  const hitCount =
    hits.length;

  const pickCount =
    prediction.length;

  const metrics = {
    hitCount,

    hitRate:
      round(
        calculateHitRate(
          hitCount,
          pickCount
        ),
        4
      ),

    performance:
      classifyPerformance(
        hitCount,
        pickCount
      ),

    predictionDistance:
      calculatePredictionDistance(
        prediction,
        actual
      ),

    similarity:
      calculateSimilarity(
        prediction,
        actual,
        config.modelConfig
          ?.totalNumbers ||
          60
      )
  };

  const test = {
    targetContest:
      toNumber(
        target?.concurso
      ),

    targetDate:
      target?.data ||
      null,

    historyUntil:
      toNumber(
        history[
          history.length - 1
        ]?.concurso
      ),

    prediction,

    actual,

    hits,

    metrics
  };

  /**
   * DNA da previsão.
   *
   * Isso permite descobrir depois
   * POR QUE o modelo escolheu
   * determinada dezena.
   */
  if (config.saveDNA) {
    test.predictionDNA =
      intelligence.predictionDNA;
  }

  /**
   * Alternativa gerada pelo motor.
   */
  if (
    config.saveAlternatives
  ) {
    test.alternatives =
      intelligence.alternatives;
  }

  /**
   * Ranking completo opcional.
   */
  if (
    config.saveFullRanking
  ) {
    test.rankedNumbers =
      intelligence.rankedNumbers;
  }

  return test;
}


/**
 * Executa o backtest completo.
 *
 * Exemplo:
 *
 * concurso 3000:
 * usa 1...2999
 *
 * concurso 3001:
 * usa 1...3000
 *
 * concurso 3002:
 * usa 1...3001
 *
 * ...
 */
export function runPredictiveBacktest(
  contests,
  customConfig = {}
) {
  const config =
    mergeConfig(
      DEFAULT_BACKTEST_CONFIG,
      customConfig
    );

  const ordered =
    sortContests(
      contests
    );

  if (
    !ordered.length
  ) {
    throw new Error(
      "Histórico vazio para executar backtest."
    );
  }

  let startIndex =
    config.minHistory;

  /**
   * Permite iniciar a partir
   * de um concurso específico.
   */
  if (
    config.startFromContest !==
      null &&
    config.startFromContest !==
      undefined
  ) {
    const requested =
      toNumber(
        config.startFromContest,
        -1
      );

    const foundIndex =
      ordered.findIndex(
        (contest) =>
          toNumber(
            contest?.concurso
          ) === requested
      );

    if (
      foundIndex >= 0
    ) {
      startIndex =
        Math.max(
          config.minHistory,
          foundIndex
        );
    }
  }

  const tests = [];

  for (
    let index = startIndex;
    index < ordered.length;
    index += 1
  ) {
    if (
      config.maxTests !==
        null &&
      tests.length >=
        config.maxTests
    ) {
      break;
    }

    const result =
      runPredictiveBacktestStep(
        ordered,
        index,
        config
      );

    if (result) {
      tests.push(
        result
      );
    }
  }

  const totalNumbers =
    config.modelConfig
      ?.totalNumbers ||
    60;

  const pickCount =
    config.modelConfig
      ?.pickCount ||
    6;

  const summary =
    calculateSummary(
      tests,
      pickCount
    );

  const numberPerformance =
    calculateNumberPerformance(
      tests,
      totalNumbers
    );

  const extremes =
    findExtremes(
      tests
    );

  return {
    version:
      "predictive-backtest-1.0.0",

    generatedAt:
      new Date().toISOString(),

    model: {
      name:
        "Inssanos Predictive Intelligence",

      type:
        "temporal-backtest",

      configFingerprint:
        createConfigFingerprint(
          config
        )
    },

    dataset: {
      totalContests:
        ordered.length,

      firstContest:
        toNumber(
          ordered[0]?.concurso
        ),

      lastContest:
        toNumber(
          ordered[
            ordered.length - 1
          ]?.concurso
        ),

      testedFrom:
        tests.length
          ? tests[0]
              .targetContest
          : null,

      testedUntil:
        tests.length
          ? tests[
              tests.length - 1
            ].targetContest
          : null
    },

    config,

    summary,

    numberPerformance,

    extremes,

    tests
  };
}


/**
 * Executa backtest somente em um intervalo
 * de concursos.
 */
export function runBacktestRange(
  contests,
  startContest,
  endContest,
  customConfig = {}
) {
  const ordered =
    sortContests(
      contests
    );

  const start =
    toNumber(
      startContest,
      -1
    );

  const end =
    toNumber(
      endContest,
      -1
    );

  const startIndex =
    ordered.findIndex(
      (contest) =>
        toNumber(
          contest?.concurso
        ) === start
    );

  const endIndex =
    ordered.findIndex(
      (contest) =>
        toNumber(
          contest?.concurso
        ) === end
    );

  if (
    startIndex < 0
  ) {
    throw new Error(
      `Concurso inicial não encontrado: ${startContest}`
    );
  }

  if (
    endIndex < 0
  ) {
    throw new Error(
      `Concurso final não encontrado: ${endContest}`
    );
  }

  const sliced =
    ordered.slice(
      0,
      endIndex + 1
    );

  return runPredictiveBacktest(
    sliced,
    {
      ...customConfig,

      startFromContest:
        start
    }
  );
}


/**
 * Compara duas configurações.
 *
 * Isso será utilizado futuramente
 * para a árvore de evolução.
 */
export function compareBacktestResults(
  first,
  second
) {
  const firstSummary =
    first?.summary || {};

  const secondSummary =
    second?.summary || {};

  const firstScore =
    calculateModelScore(
      firstSummary
    );

  const secondScore =
    calculateModelScore(
      secondSummary
    );

  let winner =
    "tie";

  if (
    firstScore >
    secondScore
  ) {
    winner = "first";
  } else if (
    secondScore >
    firstScore
  ) {
    winner = "second";
  }

  return {
    winner,

    first: {
      score:
        round(
          firstScore
        ),

      summary:
        firstSummary,

      fingerprint:
        first?.model
          ?.configFingerprint ||
        null
    },

    second: {
      score:
        round(
          secondScore
        ),

      summary:
        secondSummary,

      fingerprint:
        second?.model
          ?.configFingerprint ||
        null
    },

    delta:
      round(
        secondScore -
          firstScore
      )
  };
}


/**
 * Score interno para comparação
 * entre versões.
 *
 * Não é "acurácia da loteria".
 *
 * É apenas uma função objetiva
 * para o algoritmo evolutivo escolher
 * configurações candidatas.
 */
function calculateModelScore(
  summary
) {
  if (!summary) {
    return 0;
  }

  const averageHits =
    toNumber(
      summary.averageHits
    );

  const similarity =
    toNumber(
      summary.averageSimilarity
    );

  const exact =
    toNumber(
      summary.exactPredictions
    );

  const averageDistance =
    toNumber(
      summary.averageDistance
    );

  const distanceScore =
    1 -
    clamp(
      averageDistance /
        60
    );

  /**
   * A função de avaliação mistura:
   *
   * - quantidade média de acertos;
   * - similaridade;
   * - previsões muito boas;
   * - distância.
   */
  return (
    averageHits * 0.45 +
    similarity * 0.25 +
    exact * 0.20 +
    distanceScore * 0.10
  );
}


/**
 * Cria um registro compacto da evolução.
 *
 * Esse formato será útil para a futura
 * "árvore de famílias".
 */
export function createEvolutionSnapshot(
  backtestResult,
  metadata = {}
) {
  const summary =
    backtestResult?.summary ||
    {};

  return {
    id:
      metadata.id ||
      null,

    parentId:
      metadata.parentId ||
      null,

    generation:
      toNumber(
        metadata.generation,
        0
      ),

    branch:
      metadata.branch ||
      null,

    createdAt:
      new Date().toISOString(),

    modelVersion:
      backtestResult?.model
        ?.configFingerprint ||
      null,

    score:
      round(
        calculateModelScore(
          summary
        )
      ),

    metrics: {
      averageHits:
        summary.averageHits ||
        0,

      hitRate:
        summary.hitRate ||
        0,

      bestHits:
        summary.bestHits ||
        0,

      averageDistance:
        summary.averageDistance ||
        0,

      averageSimilarity:
        summary.averageSimilarity ||
        0,

      exactPredictions:
        summary.exactPredictions ||
        0
    },

    status:
      metadata.status ||
      "evaluated"
  };
}


/**
 * Retorna configuração padrão.
 */
export function getBacktestDefaultConfig() {
  return JSON.parse(
    JSON.stringify(
      DEFAULT_BACKTEST_CONFIG
    )
  );
}


export default {
  runPredictiveBacktest,

  runPredictiveBacktestStep,

  runBacktestRange,

  compareBacktestResults,

  createEvolutionSnapshot,

  getBacktestDefaultConfig
};