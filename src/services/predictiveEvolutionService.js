/**
 * predictiveEvolutionService.js
 *
 * Motor de evolução dos modelos preditivos.
 *
 * Responsabilidades:
 * - Criar gerações de modelos.
 * - Manter múltiplas árvores de evolução.
 * - Gerar variações de parâmetros.
 * - Preservar modelos que apresentam bom desempenho.
 * - Penalizar modelos que pioram.
 * - Evitar repetir combinações já testadas.
 * - Registrar o DNA de cada modelo.
 * - Permitir backtracking para um ponto anterior.
 * - Manter histórico completo da evolução.
 *
 * IMPORTANTE:
 * Este serviço NÃO decide sozinho quais números serão sorteados.
 * Ele trabalha sobre modelos/parâmetros e utiliza o backtest para
 * descobrir quais combinações apresentam melhor desempenho histórico.
 */

const DEFAULT_CONFIG = {
  populationSize: 10,

  /**
   * Quantidade de caminhos independentes de evolução.
   */
  treeCount: 10,

  /**
   * Quantidade máxima de gerações mantidas no histórico.
   */
  maxGenerations: 1000,

  /**
   * Quantidade de modelos filhos gerados a partir de cada modelo.
   */
  childrenPerModel: 10,

  /**
   * Quantidade de melhores modelos preservados diretamente.
   */
  eliteCount: 2,

  /**
   * Quantidade mínima de concursos utilizados para avaliar
   * uma evolução.
   */
  minimumBacktestContests: 10,

  /**
   * Permite aceitar ocasionalmente um modelo pior.
   *
   * Isso é importante para evitar que o algoritmo fique preso
   * em um máximo local.
   */
  explorationRate: 0.15,

  /**
   * Número máximo de tentativas para gerar uma configuração
   * ainda não utilizada.
   */
  maxMutationAttempts: 100,

  /**
   * Quanto uma mutação pode alterar os parâmetros.
   */
  mutationStrength: 0.15
};

/**
 * Clona objetos de forma segura.
 */
function clone(value) {
  if (value === undefined || value === null) {
    return value;
  }

  return JSON.parse(JSON.stringify(value));
}

/**
 * Garante número válido.
 */
function toNumber(value, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

/**
 * Limita um número a determinado intervalo.
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Arredondamento.
 */
function round(value, decimals = 6) {
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
}

/**
 * Gera um ID simples para modelos.
 */
function generateId(prefix = "model") {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/**
 * Serializa parâmetros para criar uma assinatura.
 *
 * Essa assinatura é extremamente importante:
 *
 * Se uma combinação de parâmetros já foi testada,
 * ela não deverá ser testada novamente.
 */
function createParameterSignature(parameters) {
  return JSON.stringify(sortObject(parameters));
}

/**
 * Ordena recursivamente um objeto.
 */
function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (
    value &&
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
 * Cria um score global para um resultado de backtest.
 *
 * O score NÃO precisa representar "chance real de acertar".
 * Ele serve como métrica interna para comparar modelos.
 */
function calculateModelScore(metrics = {}) {
  const acertos = toNumber(
    metrics.acertos,
    metrics.hits ?? 0
  );

  const mediaAcertos = toNumber(
    metrics.mediaAcertos,
    metrics.averageHits ?? 0
  );

  const precisao = toNumber(
    metrics.precisao,
    metrics.precision ?? 0
  );

  const cobertura = toNumber(
    metrics.cobertura,
    metrics.coverage ?? 0
  );

  const acumulacao = toNumber(
    metrics.acumulacaoAccuracy,
    metrics.accuracy ?? 0
  );

  /**
   * Normalização simples.
   *
   * Caso o valor venha como percentual:
   * 78.5 -> 0.785
   *
   * Caso já venha normalizado:
   * 0.785 -> 0.785
   */
  const normalize = (value) => {
    if (value > 1) {
      return value / 100;
    }

    return value;
  };

  const normalizedPrecisao = clamp(
    normalize(precisao),
    0,
    1
  );

  const normalizedCobertura = clamp(
    normalize(cobertura),
    0,
    1
  );

  const normalizedAcumulacao = clamp(
    normalize(acumulacao),
    0,
    1
  );

  /**
   * O número de acertos médios é particularmente útil
   * para loterias porque acertar 2, 3, 4 etc. pode ser
   * utilizado para medir aproximação.
   *
   * Para Mega-Sena, 6 é o máximo.
   */
  const normalizedMediaAcertos = clamp(
    mediaAcertos / 6,
    0,
    1
  );

  const normalizedAcertos = clamp(
    acertos > 1
      ? acertos / 6
      : acertos,
    0,
    1
  );

  const score =
    normalizedMediaAcertos * 0.35 +
    normalizedPrecisao * 0.25 +
    normalizedCobertura * 0.10 +
    normalizedAcumulacao * 0.10 +
    normalizedAcertos * 0.20;

  return round(score);
}

/**
 * Cria o DNA inicial de um modelo.
 */
function createModelDNA({
  parameters,
  generation = 0,
  parentId = null,
  treeId = null,
  reason = "initial"
}) {
  return {
    id: generateId("model"),

    treeId,

    generation,

    parentId,

    createdAt: new Date().toISOString(),

    reason,

    parameters: clone(parameters),

    parameterSignature:
      createParameterSignature(parameters),

    mutation: null,

    metrics: null,

    score: null,

    status: "created",

    evolution: {
      accepted: false,
      rejected: false,
      backtracked: false
    }
  };
}

/**
 * Gera um número aleatório dentro de um intervalo.
 */
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Mutação numérica.
 */
function mutateNumber(
  value,
  strength = 0.15
) {
  const numeric = toNumber(value);

  if (!Number.isFinite(numeric)) {
    return value;
  }

  const variation =
    randomBetween(
      -strength,
      strength
    );

  const mutated =
    numeric * (1 + variation);

  return round(mutated);
}

/**
 * Mutação recursiva de parâmetros.
 *
 * Algumas propriedades são preservadas exatamente.
 */
function mutateParameters(
  parameters,
  options = {}
) {
  const strength =
    options.mutationStrength ??
    DEFAULT_CONFIG.mutationStrength;

  const result = clone(parameters);

  const protectedKeys = new Set([
    "model",
    "algorithm",
    "seed",
    "version"
  ]);

  function mutateObject(target) {
    if (!target || typeof target !== "object") {
      return target;
    }

    if (Array.isArray(target)) {
      return target.map((item) => {
        if (
          typeof item === "number"
        ) {
          return mutateNumber(
            item,
            strength
          );
        }

        return mutateObject(item);
      });
    }

    Object.keys(target).forEach(
      (key) => {
        if (protectedKeys.has(key)) {
          return;
        }

        const value = target[key];

        if (
          typeof value === "number"
        ) {
          target[key] =
            mutateNumber(
              value,
              strength
            );

          return;
        }

        if (
          value &&
          typeof value === "object"
        ) {
          target[key] =
            mutateObject(value);
        }
      }
    );

    return target;
  }

  return mutateObject(result);
}

/**
 * Estado de uma árvore.
 */
function createEvolutionTree({
  treeId,
  initialParameters
}) {
  const model = createModelDNA({
    parameters: initialParameters,
    generation: 0,
    parentId: null,
    treeId,
    reason: "initial"
  });

  return {
    treeId,

    createdAt:
      new Date().toISOString(),

    currentModelId: model.id,

    bestModelId: model.id,

    currentScore: null,

    bestScore: null,

    generation: 0,

    status: "active",

    models: [model],

    rejectedSignatures: [],

    testedSignatures: [
      model.parameterSignature
    ],

    checkpoints: [
      {
        generation: 0,
        modelId: model.id,
        score: null,
        createdAt:
          new Date().toISOString()
      }
    ]
  };
}

/**
 * Classe principal.
 */
export class PredictiveEvolutionService {
  constructor(config = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config
    };

    this.trees = new Map();

    this.globalHistory = [];

    this.testedParameterSignatures =
      new Set();

    this.generation = 0;
  }

  /**
   * Cria as árvores iniciais.
   *
   * Exemplo:
   *
   * 10 árvores
   * 10 estratégias diferentes
   */
  initialize({
    initialParameters,
    treeCount =
      this.config.treeCount
  }) {
    this.trees.clear();

    this.globalHistory = [];

    this.testedParameterSignatures.clear();

    for (
      let index = 0;
      index < treeCount;
      index++
    ) {
      const treeId =
        `tree_${index + 1}`;

      let parameters =
        clone(initialParameters);

      /**
       * A partir da segunda árvore,
       * criamos uma variação inicial.
       */
      if (index > 0) {
        parameters =
          mutateParameters(
            parameters,
            this.config
          );
      }

      const tree =
        createEvolutionTree({
          treeId,
          initialParameters:
            parameters
        });

      this.trees.set(
        treeId,
        tree
      );

      this.registerModel(
        tree.models[0]
      );
    }

    return this.getState();
  }

  /**
   * Registra um modelo no histórico global.
   */
  registerModel(model) {
    this.globalHistory.push(
      clone(model)
    );

    this.testedParameterSignatures.add(
      model.parameterSignature
    );
  }

  /**
   * Obtém um modelo pelo ID.
   */
  findModel(modelId) {
    for (const tree of this.trees.values()) {
      const model =
        tree.models.find(
          (item) =>
            item.id === modelId
        );

      if (model) {
        return model;
      }
    }

    return null;
  }

  /**
   * Encontra a árvore de um modelo.
   */
  findTreeByModel(modelId) {
    for (const tree of this.trees.values()) {
      if (
        tree.models.some(
          (item) =>
            item.id === modelId
        )
      ) {
        return tree;
      }
    }

    return null;
  }

  /**
   * Registra o resultado de um backtest.
   */
  evaluateModel({
    modelId,
    metrics,
    backtest
  }) {
    const model =
      this.findModel(modelId);

    if (!model) {
      throw new Error(
        `Modelo não encontrado: ${modelId}`
      );
    }

    const tree =
      this.findTreeByModel(
        modelId
      );

    const score =
      calculateModelScore(
        metrics
      );

    model.metrics =
      clone(metrics);

    model.backtest =
      clone(backtest);

    model.score = score;

    model.status = "evaluated";

    const previousModel =
      model.parentId
        ? this.findModel(
            model.parentId
          )
        : null;

    const previousScore =
      previousModel?.score;

    if (
      previousScore === null ||
      previousScore === undefined
    ) {
      model.evolution.accepted =
        true;

      tree.currentModelId =
        model.id;

      tree.currentScore =
        score;

      tree.bestModelId =
        model.id;

      tree.bestScore =
        score;
    } else if (
      score >= previousScore
    ) {
      /**
       * Melhorou:
       * segue nesse caminho.
       */
      model.evolution.accepted =
        true;

      tree.currentModelId =
        model.id;

      tree.currentScore =
        score;

      if (
        tree.bestScore === null ||
        score > tree.bestScore
      ) {
        tree.bestScore =
          score;

        tree.bestModelId =
          model.id;
      }
    } else {
      /**
       * Piorou:
       * não destruímos o modelo.
       *
       * Ele permanece registrado no histórico,
       * mas a árvore pode voltar para o pai.
       */
      model.evolution.rejected =
        true;

      model.status = "rejected";

      tree.rejectedSignatures.push(
        model.parameterSignature
      );

      /**
       * Mantemos o melhor caminho.
       */
      if (previousModel) {
        tree.currentModelId =
          previousModel.id;

        tree.currentScore =
          previousScore;
      }
    }

    this.globalHistory.push(
      clone({
        type: "evaluation",
        modelId,
        treeId: tree.treeId,
        score,
        metrics: clone(metrics),
        accepted:
          model.evolution.accepted,
        rejected:
          model.evolution.rejected,
        timestamp:
          new Date().toISOString()
      })
    );

    return {
      model: clone(model),
      tree: clone(tree)
    };
  }

  /**
   * Gera um novo modelo filho.
   *
   * O algoritmo procura uma combinação
   * que nunca tenha sido testada.
   */
  generateChild(treeId) {
    const tree =
      this.trees.get(treeId);

    if (!tree) {
      throw new Error(
        `Árvore não encontrada: ${treeId}`
      );
    }

    const parent =
      this.findModel(
        tree.currentModelId
      );

    if (!parent) {
      throw new Error(
        `Modelo atual não encontrado na árvore ${treeId}`
      );
    }

    for (
      let attempt = 0;
      attempt <
      this.config.maxMutationAttempts;
      attempt++
    ) {
      const parameters =
        mutateParameters(
          parent.parameters,
          this.config
        );

      const signature =
        createParameterSignature(
          parameters
        );

      if (
        this.testedParameterSignatures.has(
          signature
        )
      ) {
        continue;
      }

      const child =
        createModelDNA({
          parameters,
          generation:
            tree.generation + 1,
          parentId:
            parent.id,
          treeId,
          reason: "mutation"
        });

      child.mutation = {
        type: "parameter",
        strength:
          this.config.mutationStrength,
        parentSignature:
          parent.parameterSignature,
        generatedAt:
          new Date().toISOString()
      };

      tree.models.push(child);

      tree.generation++;

      this.registerModel(child);

      return clone(child);
    }

    throw new Error(
      "Não foi possível gerar uma nova combinação de parâmetros."
    );
  }

  /**
   * Gera vários filhos.
   */
  generateChildren(
    treeId,
    count =
      this.config.childrenPerModel
  ) {
    const children = [];

    for (
      let index = 0;
      index < count;
      index++
    ) {
      try {
        const child =
          this.generateChild(
            treeId
          );

        children.push(child);
      } catch {
        break;
      }
    }

    return children;
  }

  /**
   * Evolui todas as árvores.
   */
  generatePopulation() {
    const population = [];

    for (const tree of this.trees.values()) {
      const children =
        this.generateChildren(
          tree.treeId,
          this.config.childrenPerModel
        );

      population.push({
        treeId: tree.treeId,
        children
      });
    }

    return population;
  }

  /**
   * Compara todas as árvores.
   */
  rankTrees() {
    return [...this.trees.values()]
      .map((tree) => ({
        treeId: tree.treeId,

        generation:
          tree.generation,

        currentModelId:
          tree.currentModelId,

        bestModelId:
          tree.bestModelId,

        currentScore:
          tree.currentScore,

        bestScore:
          tree.bestScore,

        modelsEvaluated:
          tree.models.filter(
            (model) =>
              model.status ===
              "evaluated"
          ).length,

        rejectedModels:
          tree.models.filter(
            (model) =>
              model.status ===
              "rejected"
          ).length
      }))
      .sort(
        (a, b) =>
          toNumber(b.bestScore) -
          toNumber(a.bestScore)
      );
  }

  /**
   * Retorna o melhor modelo global.
   */
  getBestModel() {
    let best = null;

    for (const tree of this.trees.values()) {
      const model =
        tree.bestModelId
          ? this.findModel(
              tree.bestModelId
            )
          : null;

      if (!model) {
        continue;
      }

      if (
        !best ||
        toNumber(model.score) >
          toNumber(best.score)
      ) {
        best = model;
      }
    }

    return best
      ? clone(best)
      : null;
  }

  /**
   * Faz backtracking explícito.
   *
   * Em vez de apagar o caminho ruim,
   * simplesmente voltamos para o checkpoint.
   */
  backtrack(
    treeId,
    targetModelId = null
  ) {
    const tree =
      this.trees.get(treeId);

    if (!tree) {
      throw new Error(
        `Árvore não encontrada: ${treeId}`
      );
    }

    let target;

    if (targetModelId) {
      target =
        this.findModel(
          targetModelId
        );
    } else {
      target =
        this.findModel(
          tree.bestModelId
        );
    }

    if (!target) {
      throw new Error(
        "Checkpoint de backtracking não encontrado."
      );
    }

    target.evolution.backtracked =
      true;

    tree.currentModelId =
      target.id;

    tree.currentScore =
      target.score;

    tree.status = "active";

    this.globalHistory.push({
      type: "backtrack",

      treeId,

      fromModel:
        tree.currentModelId,

      toModel:
        target.id,

      score:
        target.score,

      timestamp:
        new Date().toISOString()
    });

    return clone(target);
  }

  /**
   * Seleciona os melhores modelos da população.
   *
   * É aqui que conseguimos fazer algo parecido
   * com seleção evolucionária/genética.
   */
  selectBestModels(limit = 10) {
    const evaluated =
      this.globalHistory
        .filter(
          (item) =>
            item &&
            item.type ===
              undefined &&
            item.status ===
              "evaluated"
        )
        .sort(
          (a, b) =>
            toNumber(b.score) -
            toNumber(a.score)
        );

    return evaluated
      .slice(0, limit)
      .map(clone);
  }

  /**
   * Executa uma geração evolucionária.
   *
   * O callback evaluateModel deve executar
   * o predictiveBacktestService.
   */
  async runGeneration({
    evaluate,
    childrenPerTree =
      this.config.childrenPerModel
  }) {
    if (
      typeof evaluate !==
      "function"
    ) {
      throw new Error(
        "runGeneration exige uma função evaluate(model)."
      );
    }

    this.generation++;

    const results = [];

    for (const tree of this.trees.values()) {
      const children =
        [];

      for (
        let index = 0;
        index <
        childrenPerTree;
        index++
      ) {
        let child;

        try {
          child =
            this.generateChild(
              tree.treeId
            );
        } catch {
          break;
        }

        const evaluation =
          await evaluate(
            clone(child)
          );

        const result =
          this.evaluateModel({
            modelId:
              child.id,
            metrics:
              evaluation?.metrics ??
              evaluation,
            backtest:
              evaluation?.backtest
          });

        children.push(
          result
        );
      }

      results.push({
        treeId:
          tree.treeId,
        children
      });
    }

    return {
      generation:
        this.generation,

      results,

      ranking:
        this.rankTrees(),

      bestModel:
        this.getBestModel()
    };
  }

  /**
   * Retorna um snapshot completo.
   *
   * Esse objeto pode ser salvo no R2.
   */
  getState() {
    return {
      version: 1,

      updatedAt:
        new Date().toISOString(),

      generation:
        this.generation,

      config:
        clone(this.config),

      trees:
        [...this.trees.values()].map(
          clone
        ),

      bestModel:
        this.getBestModel(),

      ranking:
        this.rankTrees(),

      testedParameterCount:
        this.testedParameterSignatures
          .size,

      history:
        clone(this.globalHistory)
    };
  }

  /**
   * Exporta somente o DNA resumido.
   *
   * Útil para auditoria/API.
   */
  getAuditDNA() {
    return [...this.trees.values()]
      .map((tree) => ({
        treeId:
          tree.treeId,

        generation:
          tree.generation,

        currentModelId:
          tree.currentModelId,

        bestModelId:
          tree.bestModelId,

        bestScore:
          tree.bestScore,

        path:
          tree.models.map(
            (model) => ({
              id:
                model.id,

              generation:
                model.generation,

              parentId:
                model.parentId,

              score:
                model.score,

              status:
                model.status,

              parameters:
                clone(
                  model.parameters
                ),

              mutation:
                clone(
                  model.mutation
                ),

              accepted:
                model.evolution
                  .accepted,

              rejected:
                model.evolution
                  .rejected
            })
          )
      }));
  }

  /**
   * Restaura uma evolução previamente salva.
   *
   * Isso permite continuar o aprendizado depois
   * de reiniciar a aplicação.
   */
  restore(state) {
    if (!state) {
      throw new Error(
        "Estado de evolução inválido."
      );
    }

    this.generation =
      toNumber(
        state.generation,
        0
      );

    this.trees.clear();

    this.globalHistory =
      clone(
        state.history ?? []
      );

    this.testedParameterSignatures.clear();

    const trees =
      Array.isArray(state.trees)
        ? state.trees
        : [];

    for (const tree of trees) {
      this.trees.set(
        tree.treeId,
        clone(tree)
      );

      for (
        const model of tree.models ??
        []
      ) {
        if (
          model.parameterSignature
        ) {
          this.testedParameterSignatures.add(
            model.parameterSignature
          );
        }
      }
    }

    return this.getState();
  }
}

/**
 * Factory.
 *
 * Permite importar assim:
 *
 * const evolution =
 *   createPredictiveEvolutionService();
 */
export function createPredictiveEvolutionService(
  config = {}
) {
  return new PredictiveEvolutionService(
    config
  );
}

export {
  calculateModelScore,
  createParameterSignature,
  mutateParameters
};

export default PredictiveEvolutionService;