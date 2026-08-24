import {
  scrapeResultadosCaixa
} from "./resultsCaixa.js";

function extractToken(request) {
  const authHeader =
    request?.headers?.authorization;

  if (
    typeof authHeader === "string" &&
    authHeader.startsWith("Bearer ")
  ) {
    return authHeader
      .slice("Bearer ".length)
      .trim();
  }

  const queryToken =
    request?.query?.token;

  if (
    typeof queryToken === "string" &&
    queryToken.trim()
  ) {
    return queryToken.trim();
  }

  const headerToken =
    request?.headers?.["x-update-token"];

  if (
    typeof headerToken === "string" &&
    headerToken.trim()
  ) {
    return headerToken.trim();
  }

  return "";
}

export default async function handler(
  request,
  response
) {
  if (
    request?.method &&
    request.method !== "POST"
  ) {
    response.setHeader(
      "Allow",
      "POST"
    );

    response.status(405).json({
      error: "Metodo nao permitido."
    });

    return;
  }

  const expectedToken =
    process.env.UPDATE_RESULTS_TOKEN;

  if (!expectedToken) {
    response.status(500).json({
      error:
        "Token de atualizacao nao configurado.",
      detail:
        "Defina a env UPDATE_RESULTS_TOKEN na Vercel/projeto local."
    });

    return;
  }

  const providedToken =
    extractToken(request);

  if (
    !providedToken ||
    providedToken !== expectedToken
  ) {
    response.status(401).json({
      error: "Nao autorizado."
    });

    return;
  }

  try {
    const result =
      await scrapeResultadosCaixa();

    const hasErrors =
      Array.isArray(result?.erros) &&
      result.erros.length > 0;

    response
      .status(
        hasErrors
          ? 207
          : 200
      )
      .json({
        ok: !hasErrors,

        updatedAt:
          new Date().toISOString(),

        storage: "cloudflare-r2",

        ...result
      });
  } catch (error) {
    response.status(500).json({
      error:
        "Falha ao atualizar resultados.",

      detail:
        error?.message ??
        "Erro desconhecido."
    });
  }
}