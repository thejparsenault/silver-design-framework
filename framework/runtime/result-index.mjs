import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

function outputKey(reference) {
  return [reference.id, reference.kind, reference.revision, reference.path].join("\0");
}

async function resultFiles(root) {
  const base = path.join(path.resolve(root), ".silver", "results", "skills");
  const found = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && entry.name.endsWith(".json")) found.push(absolute);
    }
  }
  await visit(base);
  return found;
}

function newestFirst(left, right) {
  return String(right.result?.completed_at ?? "").localeCompare(
    String(left.result?.completed_at ?? ""),
  ) || String(right.result?.invocation_id ?? "").localeCompare(
    String(left.result?.invocation_id ?? ""),
  );
}

export async function loadSkillResultIndex(root) {
  const workspace = path.resolve(root);
  const records = [];
  for (const absolute of await resultFiles(workspace)) {
    try {
      const result = JSON.parse(await readFile(absolute, "utf8"));
      records.push({
        path: path.relative(workspace, absolute).split(path.sep).join("/"),
        result,
      });
    } catch (error) {
      records.push({
        path: path.relative(workspace, absolute).split(path.sep).join("/"),
        result: null,
        parse_error: error.message,
      });
    }
  }
  const byOutput = new Map();
  for (const record of records) {
    if (record.result?.schema !== "silver/skill-result/v2") continue;
    for (const output of record.result.outputs ?? []) {
      const key = outputKey(output);
      const matches = byOutput.get(key) ?? [];
      matches.push(record);
      byOutput.set(key, matches);
    }
  }
  for (const matches of byOutput.values()) matches.sort(newestFirst);
  return { records: records.sort(newestFirst), byOutput };
}

export function joinResult(index, reference) {
  const matches = index.byOutput.get(outputKey(reference)) ?? [];
  return {
    record: matches[0] ?? null,
    matches,
    consistency_findings: matches.length > 1
      ? [`${matches.length} skill results claim the same output ${reference.id}@${reference.revision}; ${matches[0].result.invocation_id} is newest.`]
      : [],
  };
}

export function currentResultRecords(index) {
  return index.records.filter((record) => {
    if (record.result?.schema !== "silver/skill-result/v2") return false;
    const outputs = record.result.outputs ?? [];
    if (outputs.length === 0) return true;
    return outputs.some(
      (output) => index.byOutput.get(outputKey(output))?.[0] === record,
    );
  });
}

export async function joinArtifactResult(root, reference) {
  return joinResult(await loadSkillResultIndex(root), reference);
}
