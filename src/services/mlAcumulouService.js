import { average, round } from "../utils/numbers.js";

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function dot(a, b) {
  let total = 0;

  for (let index = 0; index < a.length; index += 1) {
    total += a[index] * b[index];
  }

  return total;
}

function minMaxNormalize(matrix) {
  const featureCount = matrix[0]?.length ?? 0;
  const mins = new Array(featureCount).fill(Infinity);
  const maxs = new Array(featureCount).fill(-Infinity);

  matrix.forEach((row) => {
    row.forEach((value, index) => {
      if (value < mins[index]) {
        mins[index] = value;
      }

      if (value > maxs[index]) {
        maxs[index] = value;
      }
    });
  });

  const normalized = matrix.map((row) =>
    row.map((value, index) => {
      const min = mins[index];
      const max = maxs[index];

      if (max === min) {
        return 0;
      }

      return (value - min) / (max - min);
    })
  );

  return { normalized, mins, maxs };
}

function normalizeRow(row, mins, maxs) {
  return row.map((value, index) => {
    const min = mins[index];
    const max = maxs[index];

    if (max === min) {
      return 0;
    }

    return (value - min) / (max - min);
  });
}

function splitTrainTest(X, y, testRatio = 0.2) {
  const total = X.length;
  const testSize = Math.max(1, Math.floor(total * testRatio));
  const trainSize = total - testSize;

  return {
    XTrain: X.slice(0, trainSize),
    yTrain: y.slice(0, trainSize),
    XTest: X.slice(trainSize),
    yTest: y.slice(trainSize)
  };
}

function trainLogisticRegression(X, y, { epochs = 2000, learningRate = 0.25 } = {}) {
  const featureCount = X[0]?.length ?? 0;
  const weights = new Array(featureCount).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradW = new Array(featureCount).fill(0);
    let gradB = 0;

    for (let index = 0; index < X.length; index += 1) {
      const prediction = sigmoid(dot(weights, X[index]) + bias);
      const error = prediction - y[index];

      for (let feature = 0; feature < featureCount; feature += 1) {
        gradW[feature] += error * X[index][feature];
      }

      gradB += error;
    }

    const sampleCount = X.length;

    for (let feature = 0; feature < featureCount; feature += 1) {
      weights[feature] -= (learningRate * gradW[feature]) / sampleCount;
    }

    bias -= (learningRate * gradB) / sampleCount;
  }

  return { weights, bias };
}

function predictProbability(model, row) {
  return sigmoid(dot(model.weights, row) + model.bias);
}

function accuracyScore(expected, predicted) {
  if (expected.length === 0) {
    return 0;
  }

  let correct = 0;

  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] === predicted[index]) {
      correct += 1;
    }
  }

  return correct / expected.length;
}

function buildFeatures(draw) {
  const dezenas = draw.dezenas;
  const sorted = [...dezenas].sort((a, b) => a - b);

  return [
    ...sorted,
    average(sorted),
    sorted[sorted.length - 1] - sorted[0]
  ];
}

export function runAcumulouClassification(draws, options = {}) {
  const expectedDezenas = Number.isInteger(options.expectedDezenas) && options.expectedDezenas > 0
    ? options.expectedDezenas
    : 6;

  if (!Array.isArray(draws) || draws.length < 50) {
    return {
      available: false,
      message: "Dados insuficientes para treinar o classificador (minimo: 50 concursos)."
    };
  }

  const validDraws = draws.filter((draw) => draw.dezenas.length === expectedDezenas);

  if (validDraws.length < 50) {
    return {
      available: false,
      message: "Dados validos insuficientes para treinar o classificador."
    };
  }

  const XRaw = validDraws.map(buildFeatures);
  const y = validDraws.map((draw) => (draw.acumulou ? 1 : 0));

  const { normalized, mins, maxs } = minMaxNormalize(XRaw);
  const { XTrain, yTrain, XTest, yTest } = splitTrainTest(normalized, y, 0.2);

  const model = trainLogisticRegression(XTrain, yTrain);

  const probabilities = XTest.map((row) => predictProbability(model, row));
  const predicted = probabilities.map((value) => (value >= 0.5 ? 1 : 0));

  const accuracy = accuracyScore(yTest, predicted);

  const nextReference = buildFeatures(validDraws[0]);
  const normalizedReference = normalizeRow(nextReference, mins, maxs);
  const nextAccumulationProbability = predictProbability(model, normalizedReference);

  return {
    available: true,
    dataset: {
      total: validDraws.length,
      treino: XTrain.length,
      teste: XTest.length
    },
    metricas: {
      acuracia: round(accuracy * 100, 2)
    },
    inferencia: {
      probabilidadeAcumularProximoConcurso: round(nextAccumulationProbability * 100, 2)
    }
  };
}
