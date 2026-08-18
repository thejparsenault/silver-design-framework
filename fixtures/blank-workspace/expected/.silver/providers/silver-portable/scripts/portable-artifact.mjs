import { readFile } from "node:fs/promises";

export async function inspectPortableArtifact({ path }) {
  const content = await readFile(path, "utf8");
  return { bytes: Buffer.byteLength(content), content };
}
