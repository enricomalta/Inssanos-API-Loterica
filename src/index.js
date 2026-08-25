import express from "express";

import megaRoute from "../api/megasena.js";
import quinaRoute from "../api/quina.js";
import lotofacilRoute from "../api/lotofacil.js";
import duplaSenaRoute from "../api/duplasena.js";

import resultadoRoute from "../api/resultado.js";
import resultadosRoute from "../api/resultados.js";
import scrapeResultadoRoute from "../api/scrape-resultado.js";
import atualizarResultadosRoute from "../api/atualizar-resultados.js";

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

app.use("/api/megasena", megaRoute);
app.use("/api/quina", quinaRoute);
app.use("/api/lotofacil", lotofacilRoute);
app.use("/api/duplasena", duplaSenaRoute);


app.use("/api/resultado", resultadoRoute);
app.use("/api/resultados", resultadosRoute);
app.use("/api/scrape-resultado", scrapeResultadoRoute);
app.use("/api/atualizar-resultados", atualizarResultadosRoute);

app.get("/", (req, res) => {
  res.json({
    status: "Inssanos API Online DEV: @Enrico Malta"
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Servidor rodando em http://${HOST}:${PORT}`);
});