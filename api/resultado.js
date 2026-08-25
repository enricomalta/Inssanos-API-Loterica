import express from "express";

import {
  readR2JsonArray
} from "../src/services/r2StorageService.js";

const router = express.Router();

const LOTTERY_FILES = {
  megasena: "megasena.json",
  quina: "quina.json",
  lotofacil: "lotofacil.json",
  duplasena: "duplasena.json"
};

router.get(
  "/:loteria/:concurso",
  async (req, res) => {
    const loteria =
      req.params.loteria
        ?.trim()
        .toLowerCase();

    const concurso =
      Number(req.params.concurso);

    console.log(
      "[RESULTADO] Rota chamada:",
      req.params
    );

    if (!LOTTERY_FILES[loteria]) {
      return res.status(400).json({
        error: "Loteria invalida.",
        allowed:
          Object.keys(LOTTERY_FILES)
      });
    }

    if (
      !Number.isInteger(concurso) ||
      concurso <= 0
    ) {
      return res.status(400).json({
        error: "Concurso invalido."
      });
    }

    try {
      console.log(
        `[RESULTADO] Lendo ${LOTTERY_FILES[loteria]} do R2...`
      );

      const contests =
        await readR2JsonArray(
          LOTTERY_FILES[loteria]
        );

      const resultado =
        contests.find(
          (item) =>
            Number(item?.concurso) ===
            concurso
        );

      if (!resultado) {
        return res.status(404).json({
          error:
            `Concurso ${concurso} não encontrado para ${loteria}.`
        });
      }

      console.log(
        `[RESULTADO] Concurso ${concurso} encontrado.`
      );

      res.setHeader(
        "Cache-Control",
        "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
      );

      return res.status(200).json(resultado);

    } catch (error) {
      console.error(
        "[RESULTADO] Erro ao buscar concurso:",
        error
      );

      return res.status(500).json({
        error:
          "Falha ao buscar resultado.",
        detail:
          error?.message ??
          "Erro desconhecido."
      });
    }
  }
);

export default router;