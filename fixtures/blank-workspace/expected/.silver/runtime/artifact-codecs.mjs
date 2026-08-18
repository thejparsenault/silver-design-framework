import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse, stringify } from "yaml";

import { assertV2 } from "./contracts.mjs";

function frontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);
  if (!match) throw new Error("Silver Markdown requires YAML frontmatter.");
  const metadata = parse(match[1]);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Silver Markdown frontmatter must be an object.");
  }
  for (const key of ["schema", "id", "kind", "authority"]) {
    if (metadata[key] === undefined) {
      throw new Error(`Silver Markdown frontmatter is missing ${key}.`);
    }
  }
  return {
    metadata,
    body: content.slice(match[0].length),
  };
}

export function decodePortable(content, format) {
  if (format === "markdown-frontmatter") return frontmatter(content);
  if (format === "json" || format === "dtcg-json") return JSON.parse(content);
  if (format === "yaml") return parse(content);
  throw new Error(`Unsupported portable format: ${format}`);
}

export function encodePortable(value, format) {
  if (format === "markdown-frontmatter") {
    if (!value?.metadata || typeof value.body !== "string") {
      throw new Error("Markdown encoding requires { metadata, body }.");
    }
    return `---\n${stringify(value.metadata).trimEnd()}\n---\n\n${value.body.replace(/^\n+/, "")}`;
  }
  if (format === "json" || format === "dtcg-json") {
    return `${JSON.stringify(value, null, 2)}\n`;
  }
  if (format === "yaml") return stringify(value);
  throw new Error(`Unsupported portable format: ${format}`);
}

export async function discoverArtifactCodecs(providers, options = {}) {
  const codecs = [];
  for (const provider of providers) {
    for (const relative of provider.codecs ?? []) {
      const contract = parse(await readFile(path.join(provider.packageRoot, relative), "utf8"));
      await assertV2("artifact-codec.schema.json", contract, options);
      for (const script of Object.values(contract.scripts)) {
        const absolute = path.resolve(provider.packageRoot, script);
        if (!absolute.startsWith(`${provider.packageRoot}${path.sep}`)) {
          throw new Error(`Codec ${contract.id} script escapes provider package.`);
        }
      }
      codecs.push({ ...contract, provider: provider.id, packageRoot: provider.packageRoot });
    }
  }
  return codecs;
}

export function codecForArtifact(codecs, kind) {
  const matches = codecs.filter((codec) => codec.artifact_kinds.includes(kind));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one canonical codec for ${kind}; found ${matches.length}.`);
  }
  return matches[0];
}
