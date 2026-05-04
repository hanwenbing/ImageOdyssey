import { mkdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getServiceRoleClient } from "./supabase";

const serverRoot = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(serverRoot, "..");
const cacheRoot = resolve(webRoot, "tmp", "codex-source-images");
const maxExtensionLength = 12;

function getSafeExtension(storagePath: string): string {
  const extension = extname(storagePath).toLowerCase();
  if (
    extension.length === 0 ||
    extension.length > maxExtensionLength ||
    !/^\.[a-z0-9]+$/.test(extension)
  ) {
    return ".bin";
  }

  return extension;
}

function getCachedImagePath(storagePath: string): string {
  const digest = createHash("sha256").update(storagePath).digest("hex");
  return resolve(cacheRoot, `${digest}${getSafeExtension(storagePath)}`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile() && fileStat.size > 0;
  } catch {
    return false;
  }
}

async function blobToBuffer(blob: Blob): Promise<Buffer> {
  return Buffer.from(await blob.arrayBuffer());
}

export async function resolveSourceImagePath(storagePath: string): Promise<string> {
  if (storagePath.trim().length === 0) {
    throw new Error("source image storage path is required");
  }

  await mkdir(cacheRoot, { recursive: true });
  const cachedImagePath = getCachedImagePath(storagePath);
  if (await fileExists(cachedImagePath)) {
    return cachedImagePath;
  }

  const client = getServiceRoleClient();
  const { data, error } = await client.storage
    .from("experiment-images")
    .download(storagePath);

  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Source image download failed: ${message}`);
  }

  if (!data) {
    throw new Error("Source image download returned no data");
  }

  const buffer = await blobToBuffer(data);
  if (buffer.length === 0) {
    throw new Error("Source image download returned an empty file");
  }

  await writeFile(cachedImagePath, buffer);
  return cachedImagePath;
}
