/**
 * predictiveIntelligenceService.js
 *
 * Motor de inteligência preditiva do Inssanos.
 *
 * Responsabilidades:
 * - analisar o histórico de concursos;
 * - gerar scores para cada dezena possível;
 * - combinar diferentes estratégias/modelos;
 * - produzir uma predição;
 * - explicar por que cada número recebeu determinado score;
 * - gerar o "DNA" da predição para auditoria;
 * - permitir comparar versões/parâmetros futuramente;
 *
 * IMPORTANTE:
 * Este arquivo NÃO tenta afirmar que consegue prever o resultado
 * real de uma loteria. Ele produz uma classificação probabilística
 * baseada nos padrões existentes no histórico.
 */

const DEFAULT_CONFIG = {
  totalNumbers: 60,
  pickCount: 6,

  windows: {
    recent: 10,
    medium: 50,
    long: 100
  },

  weights: {
    frequencyRecent: 0.22,
    frequencyMedium: 0.16,
    frequencyLong: 0.10,

    recency: 0.16,
    historicalFrequency: 0.12,

    meanDistance: 0.10,
    overdue: 0.08,

    dispersion: 0.06
  },

  models: {
    frequency: true,
    recency: true,
    historical: true,
    distance: true,
    overdue: true,
    ensemble: true
  },

  temperature: 1,

  version: "predictive-mvp-1.0.0"
};

/**
 * Faz merge profundo simples das configurações.
 */
function mergeConfig(base, override = {}) {
  return {
    ...base,
    ...override,

    windows: {
      ...base.windows,
      ...(override.windows || {})
    },

    weights: {
      ...base.weights,
      ...(override.weights || {})
    },

    models: {
      ...base.models,
      ...(override.models || {})
    }
  };
}

/**
 * Garante número finito.
 */
function toNumber(value, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

/**
 * Limita valor entre mínimo e máximo.
 */
function clamp(value, min = 0, max = 1) {
  return Math.min(
    max,
    Math.max(min, value)
  );
}

/**
 * Arredonda para facilitar auditoria/API.
 */
function round(value, decimals = 4) {
  const factor = 10 ** decimals;

  return Math.round(
    value * factor
  ) / factor;
}

/**
 * Normalização min-max.
 */
function normalize(value, min, max) {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    max === min
  ) {
    return 0.5;
  }

  return clamp(
    (value - min) / (max - min)
  );
}

/**
 * Normaliza array de dezenas.
 */
function normalizeNumbers(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => {
      const number = Number(value);

      return Number.isFinite(number)
        ? number
        : null;
    })
    .filter(
      (value) =>
        value !== null
    )
    .map((value) =>
      Math.trunc(value)
    );
}

/**
 * Extrai as dezenas de um concurso.
 *
 * Compatível com o schema atual da API.
 */
function extractNumbers(contest) {
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
 * Ordena concursos pelo número.
 */
function sortContests(contests) {
  return [...contests].sort(
    (a, b) =>
      toNumber(a?.concurso) -
      toNumber(b?.concurso)
  );
}

/**
 * Retorna os últimos N concursos.
 */
function getWindow(
  contests,
  size
) {
  if (!Array.isArray(contests)) {
    return [];
  }

  return contests.slice(
    Math.max(
      0,
      contests.length - size
    )
  );
}

/**
 * Cria estrutura básica para cada dezena.
 */
function createNumberStats(
  totalNumbers
) {
  const stats = new Map();

  for (
    let number = 1;
    number <= totalNumbers;
    number += 1
  ) {
    stats.set(number, {
      number,

      totalHits: 0,

      recentHits: 0,
      mediumHits: 0,
      longHits: 0,

      lastSeenIndex: -1,

      contestsSinceLastHit: 0,

      historicalFrequency: 0,

      recentFrequency: 0,
      mediumFrequency: 0,
      longFrequency: 0,

      gapScore: 0,
      overdueScore: 0,

      frequencyScore: 0,
      recencyScore: 0,
      historicalScore: 0,
      distanceScore: 0,

      finalScore: 0,

      reasons: []
    });
  }

  return stats;
}

/**
 * Analisa frequência histórica.
 */
function calculateHistoricalFrequency(
  stats,
  contests
) {
  const totalContests =
    contests.length;

  if (!totalContests) {
    return;
  }

  stats.forEach(
    (item) => {
      item.historicalFrequency =
        item.totalHits /
        totalContests;
    }
  );
}

/**
 * Analisa frequência por janela.
 */
function calculateWindowFrequencies(
  stats,
  contests,
  config
) {
  const recentContests =
    getWindow(
      contests,
      config.windows.recent
    );

  const mediumContests =
    getWindow(
      contests,
      config.windows.medium
    );

  const longContests =
    getWindow(
      contests,
      config.windows.long
    );

  for (
    const contest of recentContests
  ) {
    for (
      const number of extractNumbers(
        contest
      )
    ) {
      const item =
        stats.get(number);

      if (item) {
        item.recentHits += 1;
      }
    }
  }

  for (
    const contest of mediumContests
  ) {
    for (
      const number of extractNumbers(
        contest
      )
    ) {
      const item =
        stats.get(number);

      if (item) {
        item.mediumHits += 1;
      }
    }
  }

  for (
    const contest of longContests
  ) {
    for (
      const number of extractNumbers(
        contest
      )
    ) {
      const item =
        stats.get(number);

      if (item) {
        item.longHits += 1;
      }
    }
  }

  if (recentContests.length) {
    stats.forEach(
      (item) => {
        item.recentFrequency =
          item.recentHits /
          recentContests.length;
      }
    );
  }

  if (mediumContests.length) {
    stats.forEach(
      (item) => {
        item.mediumFrequency =
          item.mediumHits /
          mediumContests.length;
      }
    );
  }

  if (longContests.length) {
    stats.forEach(
      (item) => {
        item.longFrequency =
          item.longHits /
          longContests.length;
      }
    );
  }
}

/**
 * Calcula recência.
 *
 * Quanto mais recentemente apareceu,
 * maior o score de recência.
 */
function calculateRecency(
  stats,
  contests
) {
  if (!contests.length) {
    return;
  }

  stats.forEach(
    (item) => {
      let distance =
        contests.length;

      for (
        let index =
          contests.length - 1;
        index >= 0;
        index -= 1
      ) {
        const numbers =
          extractNumbers(
            contests[index]
          );

        if (
          numbers.includes(
            item.number
          )
        ) {
          distance =
            contests.length -
            1 -
            index;

          item.lastSeenIndex =
            index;

          break;
        }
      }

      item.contestsSinceLastHit =
        distance;
    }
  );

  const maxDistance =
    Math.max(
      1,
      contests.length
    );

  stats.forEach(
    (item) => {
      item.recencyScore =
        1 -
        clamp(
          item.contestsSinceLastHit /
            maxDistance
        );
    }
  );
}

/**
 * Calcula o comportamento de "atraso".
 *
 * IMPORTANTE:
 * atraso não significa que um número
 * esteja matematicamente mais propenso
 * a sair. É apenas uma feature histórica.
 */
function calculateOverdue(
  stats,
  contests
) {
  if (!contests.length) {
    return;
  }

  const distances = [
    ...stats.values()
  ].map(
    (item) =>
      item.contestsSinceLastHit
  );

  const minDistance =
    Math.min(
      ...distances
    );

  const maxDistance =
    Math.max(
      ...distances
    );

  stats.forEach(
    (item) => {
      item.overdueScore =
        normalize(
          item.contestsSinceLastHit,
          minDistance,
          maxDistance
        );

      item.gapScore =
        item.overdueScore;
    }
  );
}

/**
 * Converte as estatísticas em features
 * padronizadas.
 */
function buildFeatures(
  stats,
  contests
) {
  calculateHistoricalFrequency(
    stats,
    contests
  );

  return [...stats.values()];
}

/**
 * Calcula score do modelo de frequência.
 */
function frequencyModelScore(
  item,
  allItems
) {
  const recentValues =
    allItems.map(
      (value) =>
        value.recentFrequency
    );

  const mediumValues =
    allItems.map(
      (value) =>
        value.mediumFrequency
    );

  const longValues =
    allItems.map(
      (value) =>
        value.longFrequency
    );

  const recentScore =
    normalize(
      item.recentFrequency,
      Math.min(...recentValues),
      Math.max(...recentValues)
    );

  const mediumScore =
    normalize(
      item.mediumFrequency,
      Math.min(...mediumValues),
      Math.max(...mediumValues)
    );

  const longScore =
    normalize(
      item.longFrequency,
      Math.min(...longValues),
      Math.max(...longValues)
    );

  return {
    score: clamp(
      recentScore * 0.5 +
        mediumScore * 0.3 +
        longScore * 0.2
    ),

    components: {
      recent: recentScore,
      medium: mediumScore,
      long: longScore
    }
  };
}

/**
 * Modelo de recência.
 */
function recencyModelScore(item) {
  return clamp(
    item.recencyScore
  );
}

/**
 * Modelo histórico.
 */
function historicalModelScore(
  item,
  allItems
) {
  const values =
    allItems.map(
      (value) =>
        value.historicalFrequency
    );

  return normalize(
    item.historicalFrequency,
    Math.min(...values),
    Math.max(...values)
  );
}

/**
 * Modelo de distância.
 *
 * Procura equilíbrio entre a distância
 * atual e o comportamento histórico.
 */
function distanceModelScore(
  item,
  allItems
) {
  const distances =
    allItems.map(
      (value) =>
        value.contestsSinceLastHit
    );

  const min =
    Math.min(...distances);

  const max =
    Math.max(...distances);

  return normalize(
    item.contestsSinceLastHit,
    min,
    max
  );
}

/**
 * Modelo de atraso.
 */
function overdueModelScore(item) {
  return clamp(
    item.overdueScore
  );
}

/**
 * Calcula média simples.
 */
function calculateAverage(
  values
) {
  if (!values.length) {
    return 0;
  }

  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / values.length
  );
}

/**
 * Gera explicação textual.
 */
function generateReasons(
  item,
  scores
) {
  const reasons = [];

  if (
    scores.frequency >= 0.75
  ) {
    reasons.push({
      tipo: "frequencia",
      peso: round(
        scores.frequency
      ),
      descricao:
        `Alta frequência recente: ${item.recentHits} ocorrência(s) na janela recente.`
    });
  } else if (
    scores.frequency >= 0.5
  ) {
    reasons.push({
      tipo: "frequencia",
      peso: round(
        scores.frequency
      ),
      descricao:
        `Frequência recente acima da média do conjunto analisado.`
    });
  }

  if (
    scores.historical >= 0.75
  ) {
    reasons.push({
      tipo: "historico",
      peso: round(
        scores.historical
      ),
      descricao:
        `Frequência histórica elevada em relação às demais dezenas.`
    });
  }

  if (
    scores.recency >= 0.75
  ) {
    reasons.push({
      tipo: "recencia",
      peso: round(
        scores.recency
      ),
      descricao:
        `A dezena apareceu recentemente no histórico.`
    });
  }

  if (
    scores.distance >= 0.75
  ) {
    reasons.push({
      tipo: "distancia",
      peso: round(
        scores.distance
      ),
      descricao:
        `A dezena apresenta uma distância elevada desde sua última ocorrência.`
    });
  }

  if (
    scores.overdue >= 0.75
  ) {
    reasons.push({
      tipo: "atraso",
      peso: round(
        scores.overdue
      ),
      descricao:
        `A dezena está entre as mais atrasadas do histórico analisado.`
    });
  }

  if (!reasons.length) {
    reasons.push({
      tipo: "ensemble",
      peso: round(
        calculateAverage(
          Object.values(scores)
        )
      ),
      descricao:
        "Score obtido pela combinação das características históricas analisadas."
    });
  }

  return reasons;
}

/**
 * Calcula o score final de uma dezena.
 */
function calculateFinalScore(
  item,
  allItems,
  config
) {
  const models =
    config.models;

  const weights =
    config.weights;

  const frequency =
    models.frequency
      ? frequencyModelScore(
          item,
          allItems
        ).score
      : 0;

  const recency =
    models.recency
      ? recencyModelScore(
          item
        )
      : 0;

  const historical =
    models.historical
      ? historicalModelScore(
          item,
          allItems
        )
      : 0;

  const distance =
    models.distance
      ? distanceModelScore(
          item,
          allItems
        )
      : 0;

  const overdue =
    models.overdue
      ? overdueModelScore(
          item
        )
      : 0;

  const activeWeights = [];

  if (models.frequency) {
    activeWeights.push({
      value: frequency,
      weight:
        weights.frequencyRecent +
        weights.frequencyMedium +
        weights.frequencyLong
    });
  }

  if (models.recency) {
    activeWeights.push({
      value: recency,
      weight:
        weights.recency
    });
  }

  if (models.historical) {
    activeWeights.push({
      value: historical,
      weight:
        weights.historicalFrequency
    });
  }

  if (models.distance) {
    activeWeights.push({
      value: distance,
      weight:
        weights.meanDistance
    });
  }

  if (models.overdue) {
    activeWeights.push({
      value: overdue,
      weight:
        weights.overdue
    });
  }

  const totalWeight =
    activeWeights.reduce(
      (sum, item) =>
        sum + item.weight,
      0
    );

  const score =
    totalWeight > 0
      ? activeWeights.reduce(
          (sum, item) =>
            sum +
            item.value *
              item.weight,
          0
        ) / totalWeight
      : 0;

  const modelScores = {
    frequency,
    recency,
    historical,
    distance,
    overdue
  };

  return {
    score: clamp(score),
    modelScores,
    reasons:
      generateReasons(
        item,
        modelScores
      )
  };
}

/**
 * Cria o DNA completo de uma dezena.
 *
 * Esse objeto é extremamente importante
 * para auditoria futura.
 */
function buildNumberDNA(
  item,
  result
) {
  return {
    numero: item.number,

    score: round(
      result.score
    ),

    features: {
      totalHits:
        item.totalHits,

      recentHits:
        item.recentHits,

      mediumHits:
        item.mediumHits,

      longHits:
        item.longHits,

      historicalFrequency:
        round(
          item.historicalFrequency
        ),

      recentFrequency:
        round(
          item.recentFrequency
        ),

      mediumFrequency:
        round(
          item.mediumFrequency
        ),

      longFrequency:
        round(
          item.longFrequency
        ),

      contestsSinceLastHit:
        item.contestsSinceLastHit
    },

    models: {
      frequency:
        round(
          result.modelScores.frequency
        ),

      recency:
        round(
          result.modelScores.recency
        ),

      historical:
        round(
          result.modelScores.historical
        ),

      distance:
        round(
          result.modelScores.distance
        ),

      overdue:
        round(
          result.modelScores.overdue
        )
    },

    reasons:
      result.reasons
  };
}

/**
 * Gera a previsão principal.
 */
function generatePrediction(
  ranked,
  pickCount
) {
  return ranked
    .slice(
      0,
      pickCount
    )
    .map(
      (item) =>
        item.numero
    )
    .sort(
      (a, b) =>
        a - b
    );
}

/**
 * Cria uma segunda estratégia:
 *
 * em vez de simplesmente pegar os maiores
 * scores, tenta manter diversidade.
 *
 * Isso será útil futuramente para termos
 * múltiplas "famílias" de modelos.
 */
function generateDiversityPrediction(
  ranked,
  pickCount,
  totalNumbers
) {
  const selected = [];

  const groups = 6;

  const groupSize =
    Math.ceil(
      totalNumbers / groups
    );

  for (
    let group = 0;
    group < groups;
    group += 1
  ) {
    const start =
      group *
        groupSize +
      1;

    const end =
      Math.min(
        totalNumbers,
        start +
          groupSize -
          1
      );

    const candidate =
      ranked.find(
        (item) =>
          item.numero >= start &&
          item.numero <= end &&
          !selected.includes(
            item.numero
          )
      );

    if (candidate) {
      selected.push(
        candidate.numero
      );
    }

    if (
      selected.length >=
      pickCount
    ) {
      break;
    }
  }

  if (
    selected.length <
    pickCount
  ) {
    for (
      const item of ranked
    ) {
      if (
        !selected.includes(
          item.numero
        )
      ) {
        selected.push(
          item.numero
        );
      }

      if (
        selected.length >=
        pickCount
      ) {
        break;
      }
    }
  }

  return selected.sort(
    (a, b) =>
      a - b
  );
}

/**
 * Calcula média das dezenas dos últimos
 * concursos.
 */
function calculateRecentAverages(
  contests,
  size
) {
  return getWindow(
    contests,
    size
  )
    .slice()
    .reverse()
    .map(
      (contest) => {
        const numbers =
          extractNumbers(
            contest
          );

        return {
          concurso:
            toNumber(
              contest?.concurso
            ),

          media:
            round(
              calculateAverage(
                numbers
              ),
              2
            )
        };
      }
    );
}

/**
 * Gera hash determinístico simples para
 * identificar a configuração.
 *
 * Não é hash criptográfico.
 */
function createConfigFingerprint(
  config
) {
  const raw =
    JSON.stringify(
      config
    );

  let hash = 2166136261;

  for (
    let index = 0;
    index < raw.length;
    index += 1
  ) {
    hash ^= raw.charCodeAt(
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
 * Função principal.
 *
 * Retorna toda a estrutura necessária
 * para a API e para a futura auditoria.
 */
export function generatePredictiveIntelligence(
  contests,
  customConfig = {}
) {
  const config =
    mergeConfig(
      DEFAULT_CONFIG,
      customConfig
    );

  if (
    !Array.isArray(contests) ||
    contests.length === 0
  ) {
    throw new Error(
      "Histórico de concursos vazio."
    );
  }

  const ordered =
    sortContests(
      contests
    );

  const stats =
    createNumberStats(
      config.totalNumbers
    );

  for (
    const contest of ordered
  ) {
    const numbers =
      extractNumbers(
        contest
      );

    for (
      const number of numbers
    ) {
      const item =
        stats.get(number);

      if (!item) {
        continue;
      }

      item.totalHits += 1;
    }
  }

  calculateWindowFrequencies(
    stats,
    ordered,
    config
  );

  calculateRecency(
    stats,
    ordered
  );

  calculateOverdue(
    stats,
    ordered
  );

  const features =
    buildFeatures(
      stats,
      ordered
    );

  const scored =
    features.map(
      (item) => {
        const result =
          calculateFinalScore(
            item,
            features,
            config
          );

        return buildNumberDNA(
          item,
          result
        );
      }
    );

  const ranked =
    scored
      .slice()
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  const prediction =
    generatePrediction(
      ranked,
      config.pickCount
    );

  const diversityPrediction =
    generateDiversityPrediction(
      ranked,
      config.pickCount,
      config.totalNumbers
    );

  const lastContest =
    ordered[
      ordered.length - 1
    ];

  const fingerprint =
    createConfigFingerprint(
      config
    );

  const selectedDNA =
    prediction.map(
      (number) =>
        ranked.find(
          (item) =>
            item.numero ===
            number
        )
    );

  return {
    version:
      config.version,

    generatedAt:
      new Date().toISOString(),

    model: {
      name:
        "Inssanos Predictive Intelligence",

      type:
        "ensemble-statistical-mvp",

      version:
        config.version,

      configFingerprint:
        fingerprint
    },

    dataset: {
      contestsCount:
        ordered.length,

      firstContest:
        toNumber(
          ordered[0]?.concurso
        ),

      lastContest:
        toNumber(
          lastContest?.concurso
        )
    },

    params: {
      totalNumbers:
        config.totalNumbers,

      pickCount:
        config.pickCount,

      windows:
        config.windows,

      weights:
        config.weights,

      models:
        config.models
    },

    prediction,

    alternatives: {
      diversity:
        diversityPrediction
    },

    rankedNumbers:
      ranked,

    predictionDNA:
      selectedDNA,

    recentContestAverages:
      calculateRecentAverages(
        ordered,
        config.windows.recent
      ),

    audit: {
      algorithm:
        "ensemble",

      methodology: [
        "frequência recente",
        "frequência de médio prazo",
        "frequência histórica",
        "recência",
        "distância desde última ocorrência",
        "atraso histórico"
      ],

      configFingerprint:
        fingerprint,

      reproducible:
        true,

      note:
        "Os scores representam classificação baseada no histórico. Não representam probabilidade matemática real de uma dezena ser sorteada."
    }
  };
}

/**
 * Atalho para gerar apenas a previsão.
 */
export function predictNumbers(
  contests,
  customConfig = {}
) {
  const result =
    generatePredictiveIntelligence(
      contests,
      customConfig
    );

  return result.prediction;
}

/**
 * Atalho para obter o DNA de um número.
 */
export function explainNumber(
  contests,
  number,
  customConfig = {}
) {
  const result =
    generatePredictiveIntelligence(
      contests,
      customConfig
    );

  return (
    result.rankedNumbers.find(
      (item) =>
        item.numero ===
        Number(number)
    ) || null
  );
}

/**
 * Retorna a configuração padrão.
 *
 * Útil para a API expor os parâmetros
 * utilizados pelo motor.
 */
export function getPredictiveDefaultConfig() {
  return JSON.parse(
    JSON.stringify(
      DEFAULT_CONFIG
    )
  );
}

export default {
  generatePredictiveIntelligence,
  predictNumbers,
  explainNumber,
  getPredictiveDefaultConfig
};