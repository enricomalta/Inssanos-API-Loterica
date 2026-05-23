export const LOTTERY_CONFIGS = {
	mega: {
		key: "mega",
		nome: "Mega-Sena",
		totalNumbers: 60,
		pickCount: 6,
		jsonRelativePath: "../../results/mega.json"
	},
	quina: {
		key: "quina",
		nome: "Quina",
		totalNumbers: 80,
		pickCount: 5,
		jsonRelativePath: "../../results/quina.json"
	},
	lotofacil: {
		key: "lotofacil",
		nome: "Lotofacil",
		totalNumbers: 25,
		pickCount: 15,
		jsonRelativePath: "../../results/lotofacil.json"
	},
	duplasena: {
		key: "duplasena",
		nome: "Dupla Sena",
		totalNumbers: 50,
		// O JSON atual contem as duas extracoes no mesmo array de dezenas (12 numeros).
		pickCount: 12,
		jsonRelativePath: "../../results/duplasena.json"
	}
};

export function getLotteryConfig(lotteryKey) {
	const config = LOTTERY_CONFIGS[lotteryKey];

	if (!config) {
		throw new Error(`Loteria nao suportada: ${lotteryKey}`);
	}

	return config;
}

// Compatibilidade com implementacoes antigas focadas em Mega.
export const TOTAL_DEZENAS_MEGA = LOTTERY_CONFIGS.mega.totalNumbers;
export const DEZENAS_POR_CONCURSO = LOTTERY_CONFIGS.mega.pickCount;
export const MEGA_JSON_RELATIVE_PATH = LOTTERY_CONFIGS.mega.jsonRelativePath;
