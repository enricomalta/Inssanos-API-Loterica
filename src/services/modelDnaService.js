import crypto from "node:crypto";

/**
 * Serviço responsável pelo DNA dos modelos preditivos.
 *
 * O DNA define a "configuração genética" de um modelo:
 * - algoritmo utilizado;
 * - família;
 * - janelas históricas;
 * - pesos das features;
 * - seed;
 * - parâmetros específicos do algoritmo;
 * - modelo pai;
 * - geração.
 *
 * IMPORTANTE:
 * Este serviço NÃO treina modelos.
 * Ele apenas cria e gerencia a identidade/configuração
 * dos experimentos.
 */

const DNA_VERSION = 1;

const ALGORITHMS = [
  "statistical",
  "xgboost",
  "lightgbm",
  "temporal",
  "hybrid"
];

const FAMILIES = [
  "frequency",
  "recency",
  "delay",
  "statistical",
  "temporal",
  "hybrid"
];

const DEFAULT_DNA = {
  window: 50,

  windows: {
    short: 10,
    medium: 50,
    long: 100,
    historical: 500
  },

  weights: {
    frequency: 0.25,
    recency: 0.20,
    delay: 0.15,
    meanDistance: 0.15,
    distribution: 0.10,
    parity: 0.05,
    accumulation: 0.10
  },

  algorithmParams: {}
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function clamp(value, min = 0, max = 1) {
  const number = toNumber(value, min);

  return Math.min(
    max,
    Math.max(min, number)
  );
}

function normalizeInteger(
  value,
  fallback,
  min,
  max
) {
  const parsed = Math.round(
    toNumber(value, fallback)
  );

  return Math.min(
    max,
    Math.max(min, parsed)
  );
}

function normalizeWeights(weights = {}) {
  const result = {
    ...DEFAULT_DNA.weights,
    ...weights
  };

  const normalized = {
    frequency: clamp(result.frequency),
    recency: clamp(result.recency),
    delay: clamp(result.delay),
    meanDistance: clamp(result.meanDistance),
    distribution: clamp(result.distribution),
    parity: clamp(result.parity),
    accumulation: clamp(result.accumulation)
  };

  const total = Object.values(
    normalized
  ).reduce(
    (sum, value) => sum + value,
    0
  );

  if (total <= 0) {
    return {
      ...DEFAULT_DNA.weights
    };
  }

  return Object.fromEntries(
    Object.entries(normalized).map(
      ([key, value]) => [
        key,
        Number(
          (value / total).toFixed(8)
        )
      ]
    )
  );
}

function normalizeWindows(
  windows = {}
) {
  return {
    short: normalizeInteger(
      windows.short,
      DEFAULT_DNA.windows.short,
      5,
      100
    ),

    medium: normalizeInteger(
      windows.medium,
      DEFAULT_DNA.windows.medium,
      10,
      500
    ),

    long: normalizeInteger(
      windows.long,
      DEFAULT_DNA.windows.long,
      50,
      2000
    ),

    historical: normalizeInteger(
      windows.historical,
      DEFAULT_DNA.windows.historical,
      100,
      10000
    )
  };
}

function stableSerialize(value) {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value
      .map(stableSerialize)
      .join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(
          key
        )}:${stableSerialize(
          value[key]
        )}`
    )
    .join(",")}}`;
}

function generateDnaHash(dna) {
  return crypto
    .createHash("sha256")
    .update(
      stableSerialize(dna)
    )
    .digest("hex");
}

function generateModelId({
  family,
  generation,
  dnaHash
}) {
  const familyName =
    String(family || "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-");

  const generationNumber =
    normalizeInteger(
      generation,
      1,
      1,
      999999
    );

  return `${familyName}-g${generationNumber}-${dnaHash.slice(
    0,
    12
  )}`;
}

/**
 * Cria um DNA de modelo.
 */
export function createModelDna({
  family = "hybrid",
  algorithm = "statistical",
  generation = 1,
  parentModelId = null,
  seed = null,
  window = DEFAULT_DNA.window,
  windows = DEFAULT_DNA.windows,
  weights = DEFAULT_DNA.weights,
  algorithmParams = {},
  metadata = {}
} = {}) {
  const normalizedFamily =
    FAMILIES.includes(family)
      ? family
      : "hybrid";

  const normalizedAlgorithm =
    ALGORITHMS.includes(algorithm)
      ? algorithm
      : "statistical";

  const normalizedWindows =
    normalizeWindows(windows);

  const normalizedWeights =
    normalizeWeights(weights);

  const normalizedWindow =
    normalizeInteger(
      window,
      normalizedWindows.medium,
      5,
      10000
    );

  const normalizedGeneration =
    normalizeInteger(
      generation,
      1,
      1,
      999999
    );

  const normalizedSeed =
    seed === null ||
    seed === undefined
      ? crypto.randomInt(
          0,
          2147483647
        )
      : normalizeInteger(
          seed,
          0,
          0,
          2147483647
        );

  const dna = {
    version: DNA_VERSION,

    family: normalizedFamily,

    algorithm:
      normalizedAlgorithm,

    generation:
      normalizedGeneration,

    parentModelId:
      parentModelId || null,

    seed: normalizedSeed,

    window: normalizedWindow,

    windows:
      normalizedWindows,

    weights:
      normalizedWeights,

    algorithmParams:
      algorithmParams &&
      typeof algorithmParams ===
        "object"
        ? algorithmParams
        : {},

    metadata:
      metadata &&
      typeof metadata ===
        "object"
        ? metadata
        : {}
  };

  const dnaHash =
    generateDnaHash(dna);

  const modelId =
    generateModelId({
      family:
        normalizedFamily,
      generation:
        normalizedGeneration,
      dnaHash
    });

  return {
    modelId,
    dnaHash,
    dna
  };
}

/**
 * Cria um modelo inicial usando
 * configurações padrão.
 */
export function createInitialModel({
  family = "hybrid",
  algorithm = "statistical",
  generation = 1,
  metadata = {}
} = {}) {
  return createModelDna({
    family,
    algorithm,
    generation,
    metadata
  });
}

/**
 * Cria um novo DNA derivado de outro modelo.
 *
 * Não altera o modelo original.
 */
export function createChildModel(
  parentModel,
  {
    family,
    algorithm,
    generation,
    seed,
    mutations = {},
    metadata = {}
  } = {}
) {
  if (
    !parentModel ||
    typeof parentModel !==
      "object"
  ) {
    throw new Error(
      "parentModel é obrigatório."
    );
  }

  const parentDna =
    parentModel.dna ||
    parentModel;

  const nextGeneration =
    generation ??
    normalizeInteger(
      parentDna.generation,
      1,
      1,
      999999
    ) + 1;

  const childWeights = {
    ...parentDna.weights,
    ...(mutations.weights || {})
  };

  const childWindows = {
    ...parentDna.windows,
    ...(mutations.windows || {})
  };

  const childAlgorithmParams = {
    ...(parentDna.algorithmParams ||
      {}),
    ...(mutations.algorithmParams ||
      {})
  };

  return createModelDna({
    family:
      family ??
      parentDna.family,

    algorithm:
      algorithm ??
      parentDna.algorithm,

    generation:
      nextGeneration,

    parentModelId:
      parentModel.modelId ||
      null,

    seed:
      seed ??
      null,

    window:
      mutations.window ??
      parentDna.window,

    windows:
      childWindows,

    weights:
      childWeights,

    algorithmParams:
      childAlgorithmParams,

    metadata: {
      ...(parentDna.metadata ||
        {}),
      ...metadata,
      evolution: {
        type: "mutation",
        parentModelId:
          parentModel.modelId ||
          null
      }
    }
  });
}

/**
 * Gera mutações pequenas no DNA.
 *
 * A intenção é explorar novas possibilidades
 * sem destruir completamente a estratégia
 * do modelo pai.
 */
export function mutateModelDna(
  parentModel,
  {
    mutationRate = 0.15,
    mutationStrength = 0.10,
    seed = null
  } = {}
) {
  if (
    !parentModel ||
    typeof parentModel !==
      "object"
  ) {
    throw new Error(
      "parentModel é obrigatório."
    );
  }

  const parentDna =
    parentModel.dna ||
    parentModel;

  const rate = clamp(
    mutationRate,
    0,
    1
  );

  const strength = clamp(
    mutationStrength,
    0,
    1
  );

  const randomSeed =
    seed === null ||
    seed === undefined
      ? crypto.randomInt(
          0,
          2147483647
        )
      : seed;

  let state =
    Number(randomSeed) || 1;

  function random() {
    state =
      (state * 1664525 + 1013904223) %
      4294967296;

    return (
      state / 4294967296
    );
  }

  const mutatedWeights = {
    ...(parentDna.weights || {})
  };

  Object.keys(
    mutatedWeights
  ).forEach((key) => {
    if (random() <= rate) {
      const current =
        toNumber(
          mutatedWeights[key]
        );

      const variation =
        (random() * 2 - 1) *
        strength;

      mutatedWeights[key] =
        clamp(
          current + variation
        );
    }
  });

  const mutatedWindows = {
    ...(parentDna.windows || {})
  };

  Object.keys(
    mutatedWindows
  ).forEach((key) => {
    if (random() <= rate) {
      const current =
        toNumber(
          mutatedWindows[key]
        );

      const variation =
        Math.round(
          (random() * 2 - 1) *
            Math.max(
              1,
              current * strength
            )
        );

      mutatedWindows[key] =
        normalizeInteger(
          current + variation,
          current,
          5,
          10000
        );
    }
  });

  return createChildModel(
    parentModel,
    {
      seed: randomSeed,
      mutations: {
        weights:
          mutatedWeights,
        windows:
          mutatedWindows
      }
    }
  );
}

/**
 * Compara dois DNAs.
 *
 * Retorna as diferenças entre eles.
 */
export function compareModelDna(
  firstModel,
  secondModel
) {
  const first =
    firstModel?.dna ||
    firstModel;

  const second =
    secondModel?.dna ||
    secondModel;

  if (!first || !second) {
    throw new Error(
      "Os dois modelos são obrigatórios."
    );
  }

  const differences = [];

  const compareValue = (
    field,
    firstValue,
    secondValue
  ) => {
    if (
      stableSerialize(
        firstValue
      ) !==
      stableSerialize(
        secondValue
      )
    ) {
      differences.push({
        field,
        first: firstValue,
        second: secondValue
      });
    }
  };

  compareValue(
    "family",
    first.family,
    second.family
  );

  compareValue(
    "algorithm",
    first.algorithm,
    second.algorithm
  );

  compareValue(
    "window",
    first.window,
    second.window
  );

  compareValue(
    "windows",
    first.windows,
    second.windows
  );

  compareValue(
    "weights",
    first.weights,
    second.weights
  );

  compareValue(
    "algorithmParams",
    first.algorithmParams,
    second.algorithmParams
  );

  return {
    identical:
      differences.length === 0,
    differences
  };
}

/**
 * Valida um DNA antes de armazená-lo.
 */
export function validateModelDna(
  model
) {
  const dna =
    model?.dna || model;

  const errors = [];

  if (!dna) {
    errors.push(
      "DNA não informado."
    );

    return {
      valid: false,
      errors
    };
  }

  if (
    !ALGORITHMS.includes(
      dna.algorithm
    )
  ) {
    errors.push(
      `Algoritmo inválido: ${dna.algorithm}`
    );
  }

  if (
    !FAMILIES.includes(
      dna.family
    )
  ) {
    errors.push(
      `Família inválida: ${dna.family}`
    );
  }

  if (
    !Number.isInteger(
      dna.generation
    ) ||
    dna.generation < 1
  ) {
    errors.push(
      "generation deve ser um inteiro maior ou igual a 1."
    );
  }

  if (
    !Number.isInteger(
      dna.seed
    ) ||
    dna.seed < 0
  ) {
    errors.push(
      "seed deve ser um inteiro não negativo."
    );
  }

  if (
    !dna.weights ||
    typeof dna.weights !==
      "object"
  ) {
    errors.push(
      "weights é obrigatório."
    );
  }

  if (
    !dna.windows ||
    typeof dna.windows !==
      "object"
  ) {
    errors.push(
      "windows é obrigatório."
    );
  }

  return {
    valid:
      errors.length === 0,
    errors
  };
}

/**
 * Retorna informações básicas
 * sobre o modelo para logs/API.
 */
export function summarizeModel(
  model
) {
  const dna =
    model?.dna ||
    model;

  return {
    modelId:
      model?.modelId ||
      null,

    dnaHash:
      model?.dnaHash ||
      generateDnaHash(dna),

    family:
      dna?.family ||
      null,

    algorithm:
      dna?.algorithm ||
      null,

    generation:
      dna?.generation ||
      null,

    parentModelId:
      dna?.parentModelId ||
      null,

    seed:
      dna?.seed ??
      null,

    window:
      dna?.window ??
      null
  };
}

export {
  DNA_VERSION,
  ALGORITHMS,
  FAMILIES,
  DEFAULT_DNA
};