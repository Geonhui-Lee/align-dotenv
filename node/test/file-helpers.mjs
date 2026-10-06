import { promises as fs } from "node:fs";

export async function fingerprint(path) {
  const info = await fs.stat(path, { bigint: true });
  // Reads may change atime; do not treat that as a rewrite.
  return [info.dev, info.ino, info.mode, info.size, info.mtimeNs].join("/");
}
