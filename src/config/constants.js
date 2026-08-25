export const LOTTERY_CONFIGS = {
  megasena: {
    key: "megasena",
    nome: "Mega-Sena",
    totalNumbers: 60,
    pickCount: 6,
    jsonFile: "megasena.json"
  },

  quina: {
    key: "quina",
    nome: "Quina",
    totalNumbers: 80,
    pickCount: 5,
    jsonFile: "quina.json"
  },

  lotofacil: {
    key: "lotofacil",
    nome: "Lotofacil",
    totalNumbers: 25,
    pickCount: 15,
    jsonFile: "lotofacil.json"
  },

  duplasena: {
    key: "duplasena",
    nome: "Dupla Sena",

    totalNumbers: 50,

    // O JSON atual contém as duas extrações
    // no mesmo array de dezenas (12 números).
    pickCount: 12,

    jsonFile: "duplasena.json"
  }
};

export function getLotteryConfig(lotteryKey) {
  const config =
    LOTTERY_CONFIGS[lotteryKey];

  if (!config) {
    throw new Error(
      `Loteria nao suportada: ${lotteryKey}`
    );
  }

  return config;
}

// Compatibilidade com implementacoes antigas
// focadas em Mega.
export const TOTAL_DEZENAS_MEGA =
  LOTTERY_CONFIGS.megasena.totalNumbers;

export const DEZENAS_POR_CONCURSO =
  LOTTERY_CONFIGS.megasena.pickCount;

export const MEGA_JSON_RELATIVE_PATH =
  LOTTERY_CONFIGS.megasena.jsonFile;