import { mkdir } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";

/** Local MVP drive root (Docker volume or host path). Not S3. */
export function resolveDriveRoot(explicit?: string): string {
  const raw = explicit ?? process.env.DRIVE_ROOT ?? "data/drive";
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

export function buildUploadDriveKey(userId: string, resourceId: string, filename: string): string {
  const safeName = filename.replace(/[/\\]/g, "_").replace(/\0/g, "") || "upload.bin";
  return `${userId}/uploads/${resourceId}/${safeName}`;
}

export function absoluteDrivePath(driveRoot: string, driveKey: string): string {
  const full = join(driveRoot, driveKey);
  if (!full.startsWith(driveRoot)) {
    throw new Error("drive key escapes DRIVE_ROOT");
  }
  return full;
}

export function fileExtension(name: string): string | null {
  const ext = extname(name).replace(/^\./, "").toLowerCase();
  return ext || null;
}

export async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(join(filePath, ".."), { recursive: true });
}
