import PredictiveEvolutionEngineService
    from "../src/services/predictiveEvolutionEngineService.js";

async function main() {
    console.log("==============================================");
    console.log(" TESTE DO PREDICTIVE EVOLUTION ENGINE");
    console.log("==============================================");

    const engine = new PredictiveEvolutionEngineService();

    const resultado = await engine.run({
        loteria: "mega",

        concursos: {
            inicio: 3000,
            fim: 3047
        },

        populationSize: 3,

        generations: 2,

        eliteSize: 1,

        mutationRate: 0.20,

        seed: 123456
    });

    console.log("\n==============================================");
    console.log(" RESULTADO");
    console.log("==============================================");

    console.dir(resultado, {
        depth: null,
        colors: true
    });
}

main().catch((error) => {
    console.error("\n==============================================");
    console.error(" ERRO NO TESTE");
    console.error("==============================================");

    console.error(error);

    process.exit(1);
});