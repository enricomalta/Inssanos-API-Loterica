import {
  readR2Json,
  writeR2Json
} from "../services/r2StorageService.js";

const METADATA_OBJECT_KEY =
  "metadata.json";

export async function loadLotteryMetadata() {
  const metadata =
    await readR2Json(
      METADATA_OBJECT_KEY
    );

  if (!metadata) {
    throw new Error(
      "metadata.json não encontrado no R2."
    );
  }

  if (
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    throw new Error(
      "metadata.json precisa conter um objeto."
    );
  }

  return metadata;
}

export async function saveLotteryMetadata(
  metadata
) {
  return writeR2Json(
    METADATA_OBJECT_KEY,
    metadata
  );
}