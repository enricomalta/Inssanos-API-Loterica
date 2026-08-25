/**
 * node scripts/testPredictiveEvolution.js
 * PREDICTIVE EVOLUTION ENGINE
 *
 * Testa o motor evolutivo responsável por criar, mutar,
 * avaliar e selecionar estratégias preditivas.
 *
 * O motor trabalha com uma população de estratégias.
 * Cada estratégia possui seus próprios parâmetros, pesos,
 * filtros e configurações de modelo.
 *
 * Durante a evolução:
 * - cria estratégias;
 * - aplica mutações;
 * - calcula o desempenho de cada estratégia;
 * - preserva as melhores;
 * - elimina ou substitui estratégias ruins;
 * - registra o DNA e a linhagem de cada estratégia;
 * - evita repetir estratégias/parâmetros já considerados
 *   ineficientes, quando essa memória estiver disponível.
 *
 * Objetivo:
 * validar isoladamente a capacidade do motor de evolução
 * antes de conectá-lo ao treinamento walk-forward e à
 * previsão de produção.
 *
 * Este script NÃO representa o treinamento histórico completo
 * e NÃO deve ser usado diretamente para gerar a previsão real.
 */


import predictiveIntelligenceService
    from "../src/services/predictiveIntelligenceService.js";

import predictiveBacktestService
    from "../src/services/predictiveBacktestService.js";

import PredictiveEvolutionService
    from "../src/services/predictiveEvolutionService.js";

import PredictiveEvolutionEngineService
    from "../src/services/predictiveEvolutionEngineService.js";


import fs from "node:fs";
const jsonPath = "./scripts/json/megasena.json";

const contests = JSON.parse(
    fs.readFileSync(jsonPath, "utf8")
);
console.log(`Concursos carregados: ${contests.length}`);
console.log(`Primeiro registro: ${contests[0].concurso}`);
console.log(`Último registro: ${contests[contests.length - 1].concurso}`);




async function main() {

    console.log("==============================================");
    console.log(" TESTE DO PREDICTIVE EVOLUTION ENGINE");
    console.log("==============================================");


    console.log("\n[1/4] Carregando Predictive Intelligence...");

    const intelligenceService =
        predictiveIntelligenceService;


    console.log("[2/4] Carregando Predictive Backtest...");

    const backtestService =
        predictiveBacktestService;


    console.log("[3/4] Inicializando Predictive Evolution...");

    const evolutionService =
        new PredictiveEvolutionService();


    console.log("[4/4] Inicializando Evolution Engine...");

    const engine =
        new PredictiveEvolutionEngineService({
            intelligenceService,
            backtestService,
            evolutionService
        });


    console.log("\n==============================================");
    console.log(" ENGINE INICIALIZADO COM SUCESSO");
    console.log("==============================================");


    console.log("\nExecutando evolução...");


    const resultado = await engine.run({

        contests,

        populationSize: 3,

        generations: 2,

        eliteSize: 1,

        mutationRate: 0.20,

        seed: 123456

    });

    const outputPath = "./scripts/output/predictive-evolution-result.json";

    fs.mkdirSync("./scripts/output", { recursive: true });

    fs.writeFileSync(
        outputPath,
        JSON.stringify(resultado, null, 2),
        "utf8"
    );

    console.log("");
    console.log("==============================================");
    console.log(" RESULTADO SALVO");
    console.log("==============================================");
    console.log(`Arquivo: ${outputPath}`);
    console.log("");

    console.log("\n==============================================");
    console.log(" RESULTADO DA EVOLUÇÃO");
    console.log("==============================================");


    // console.dir(resultado, {

    //     depth: null,

    //     colors: true

    // });

}

main().catch((error) => {

    console.error("\n==============================================");
    console.error(" ERRO NO TESTE");
    console.error("==============================================");

    console.error(error);

    process.exit(1);

});