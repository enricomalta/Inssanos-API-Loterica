import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

const endpoint = process.env.R2_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;

if (!endpoint) {
  throw new Error("R2_ENDPOINT não configurado.");
}

if (!accessKeyId) {
  throw new Error("R2_ACCESS_KEY_ID não configurado.");
}

if (!secretAccessKey) {
  throw new Error("R2_SECRET_ACCESS_KEY não configurado.");
}

if (!bucket) {
  throw new Error("R2_BUCKET não configurado.");
}

const r2Client = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
});

function normalizeKey(key) {
  return String(key ?? "")
    .replace(/^\/+/, "")
    .trim();
}

async function bodyToString(body) {
  if (!body) {
    return "";
  }

  if (typeof body.transformToString === "function") {
    return body.transformToString();
  }

  const chunks = [];

  for await (const chunk of body) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks).toString("utf-8");
}

export async function readR2Object(key) {
  const normalizedKey = normalizeKey(key);

  if (!normalizedKey) {
    throw new Error("Chave R2 não informada.");
  }

  try {
    const result = await r2Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: normalizedKey
      })
    );

    return bodyToString(result.Body);
  } catch (error) {
    if (
      error?.name === "NoSuchKey" ||
      error?.Code === "NoSuchKey" ||
      error?.$metadata?.httpStatusCode === 404
    ) {
      return null;
    }

    throw error;
  }
}

export async function readR2JsonArray(key) {
  const raw = await readR2Object(key);

  if (raw === null) {
    return [];
  }

  if (!raw.trim()) {
    return [];
  }

  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(
      `O arquivo R2 ${key} precisa conter um array JSON.`
    );
  }

  return parsed;
}

export async function readR2Json(key) {
  const raw = await readR2Object(key);

  if (raw === null) {
    return null;
  }

  if (!raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `O arquivo R2 ${key} não contém JSON válido.`
    );
  }
}

export async function writeR2Object(
  key,
  content,
  contentType = "application/json",
  cacheControl = "public, max-age=300"
) {
  const normalizedKey = normalizeKey(key);

  if (!normalizedKey) {
    throw new Error("Chave R2 não informada.");
  }

  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
      Body: content,
      ContentType: contentType,
      CacheControl: cacheControl
    })
  );

  return {
    key: normalizedKey
  };
}

export async function writeR2Json(
  key,
  value,
  cacheControl = "public, max-age=300"
) {
  const content = JSON.stringify(
    value,
    null,
    2
  );

  return writeR2Object(
    key,
    content,
    "application/json; charset=utf-8",
    cacheControl
  );
}

export function getR2PublicUrl(key) {
  const baseUrl =
    process.env.R2_PUBLIC_URL;

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl.replace(/\/+$/, "")}/${normalizeKey(key)}`;
}