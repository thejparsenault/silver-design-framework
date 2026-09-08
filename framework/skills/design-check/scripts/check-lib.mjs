import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      options.help = true;
      continue;
    }
    if (argument !== "--root") {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("--root requires a value.");
    }
    options.root = value;
    index += 1;
  }
  return options;
}

export function workspacePath(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join("/");
}

function scalar(value) {
  const trimmed = value.trim();
  if (trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "[]") return [];
  if (trimmed === "{}") return {};
  if (/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed);
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  if (/^[>|[{]/.test(trimmed)) {
    throw new Error(`Unsupported YAML value: ${trimmed}`);
  }
  return trimmed;
}

function mappingEntry(content) {
  const separator = content.indexOf(":");
  if (separator < 1) {
    throw new Error(`Expected a YAML mapping entry: ${content}`);
  }
  return [
    content.slice(0, separator).trim(),
    content.slice(separator + 1).trim(),
  ];
}

function parseMap(lines, start, indent, seed = {}) {
  const output = seed;
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new Error(`Unexpected indentation on line ${line.number}.`);
    }
    if (line.content.startsWith("-")) break;
    const [key, value] = mappingEntry(line.content);
    if (!value) {
      const next = lines[index + 1];
      if (!next || next.indent <= indent) {
        output[key] = null;
        index += 1;
      } else {
        const parsed = parseNode(lines, index + 1, next.indent);
        output[key] = parsed.value;
        index = parsed.index;
      }
    } else {
      output[key] = scalar(value);
      index += 1;
    }
  }
  return { value: output, index };
}

function parseArray(lines, start, indent) {
  const output = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) break;
    if (line.indent !== indent || !line.content.startsWith("-")) break;
    const item = line.content.slice(1).trim();
    if (!item) {
      const next = lines[index + 1];
      if (!next || next.indent <= indent) {
        output.push(null);
        index += 1;
      } else {
        const parsed = parseNode(lines, index + 1, next.indent);
        output.push(parsed.value);
        index = parsed.index;
      }
      continue;
    }
    if (!item.includes(":")) {
      output.push(scalar(item));
      index += 1;
      continue;
    }

    const object = {};
    const [key, value] = mappingEntry(item);
    index += 1;
    if (value) {
      object[key] = scalar(value);
    } else {
      const next = lines[index];
      if (!next || next.indent <= indent) {
        object[key] = null;
      } else {
        const parsed = parseNode(lines, index, next.indent);
        object[key] = parsed.value;
        index = parsed.index;
      }
    }
    if (
      index < lines.length &&
      lines[index].indent > indent &&
      !lines[index].content.startsWith("-")
    ) {
      const parsed = parseMap(lines, index, lines[index].indent, object);
      index = parsed.index;
    }
    output.push(object);
  }
  return { value: output, index };
}

function parseNode(lines, start, indent) {
  return lines[start].content.startsWith("-")
    ? parseArray(lines, start, indent)
    : parseMap(lines, start, indent);
}

export function parseYaml(content) {
  const lines = content
    .split(/\r?\n/)
    .map((raw, index) => {
      if (raw.includes("\t")) {
        throw new Error(`Tabs are not supported on line ${index + 1}.`);
      }
      return {
        indent: raw.length - raw.trimStart().length,
        content: raw.trim(),
        number: index + 1,
      };
    })
    .filter(({ content }) => content && !content.startsWith("#"));
  if (lines.length === 0) return {};
  if (lines[0].indent !== 0) {
    throw new Error("Top-level YAML must not be indented.");
  }
  const parsed = parseNode(lines, 0, 0);
  if (parsed.index !== lines.length) {
    throw new Error(`Could not parse YAML line ${lines[parsed.index].number}.`);
  }
  return parsed.value;
}

export function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);
  if (!match) throw new Error("YAML frontmatter is missing.");
  return parseYaml(match[1]);
}

export async function readYaml(filePath) {
  return parseYaml(await readFile(filePath, "utf8"));
}

// Installed dependencies, build output, and tool caches are not project-authored
// design source. A checker that walks into them reports the third-party world's
// raw colors and dimensions as this workspace's violations.
export const IGNORED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".parcel-cache",
  ".svelte-kit",
  ".turbo",
  ".vite",
  "__pycache__",
  "bower_components",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

export function isIgnoredDirectory(name) {
  return IGNORED_DIRECTORIES.has(name);
}

export async function findFiles(root, predicate) {
  const output = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (isIgnoredDirectory(entry.name)) continue;
        await visit(absolute);
      } else if (entry.isFile() && predicate(absolute)) {
        output.push(absolute);
      }
    }
  }
  await visit(root);
  return output;
}

export function finding({
  checker,
  rule,
  message,
  policyProfile = "prototype",
  file,
  line,
  column,
  observedValue,
  suggestedCorrection,
  severity = "error",
  status = "fail",
}) {
  return {
    schema: "silver/finding/v1",
    checker,
    rule,
    severity,
    policy_profile: policyProfile,
    ...(file ? { file } : {}),
    ...(line
      ? { location: { line, ...(column ? { column } : {}) } }
      : {}),
    message,
    ...(observedValue === undefined
      ? {}
      : { observed_value: observedValue }),
    ...(suggestedCorrection ? { suggested_correction: suggestedCorrection } : {}),
    status,
  };
}

// Advisories are durable, visible observations that do not make a completed
// check fail. They live in the v1 result's namespaced extension point so older
// readers continue to validate the result while newer CLIs can render them
// separately from blocking findings.
export function advisory({ checker, rule, message, file, observedValue, suggestedCorrection }) {
  return {
    checker,
    rule,
    severity: "warning",
    ...(file ? { file } : {}),
    message,
    ...(observedValue === undefined ? {} : { observed_value: observedValue }),
    ...(suggestedCorrection ? { suggested_correction: suggestedCorrection } : {}),
  };
}

export function checkResult({
  checker,
  suite = "fast",
  policyProfile = "prototype",
  requested,
  completed,
  findings,
  advisories = [],
  reason,
  executionError,
}) {
  const status =
    executionError
      ? "error"
      : reason && completed.length < requested.length
      ? "not-run"
      : findings.length > 0
        ? "fail"
        : "pass";
  return {
    schema: "silver/check-result/v1",
    checker,
    suite,
    policy_profile: policyProfile,
    status,
    coverage: {
      requested,
      completed,
      ...(["not-run", "error"].includes(status) ? { reason: reason ?? executionError.message } : {}),
    },
    findings,
    ...(advisories.length > 0
      ? { extensions: { "silver.check-advisories": advisories } }
      : {}),
    ...(executionError ? { execution_error: executionError } : {}),
  };
}

export function exitCode(result) {
  if (result.status === "pass") return 0;
  if (result.status === "fail") return 1;
  if (result.status === "not-run") return 2;
  return 3;
}

export async function loadManifest(root) {
  const pathToManifest = path.join(root, "design", "manifest.yaml");
  return {
    path: pathToManifest,
    value: await readYaml(pathToManifest),
  };
}

// A workspace mid-adoption has no manifest opinion yet, or none at all — the
// default profile stays "prototype" rather than making a checker fail closed
// on a missing file it wasn't asked to require.
export async function resolvePolicyProfile(root) {
  try {
    const manifest = await loadManifest(root);
    return manifest.value?.checks?.policy_profile ?? "prototype";
  } catch (error) {
    if (error.code === "ENOENT") return "prototype";
    throw error;
  }
}

// Findings from the "adoption" profile are real observations, not defects to
// fix before the next commit — a primitive-only system that was just adopted
// has not had a chance to grow a semantic layer yet. The status still can't
// read "pass" (a finding.schema.json status is fail|not-run, never pass, and
// checkResult() requires zero findings for "pass"); only the severity and the
// stated reason change.
export function conformanceFinding({ policyProfile, message, ...rest }) {
  if (policyProfile !== "adoption") {
    return finding({ ...rest, message, policyProfile });
  }
  return finding({
    ...rest,
    policyProfile,
    severity: "info",
    message: `${message} Informational under the "adoption" policy profile — semantic conformance is not required until this system's layer is mapped.`,
  });
}

const ARTIFACT_SKILL_PREFIXES = [
  ["prototypes/", "prototype"],
  ["design/maps/", "map"],
  ["design/structures/", "structure"],
  ["design/work/visualizations/", "visualize"],
  ["design/work/sketches/", "visualize"], // deprecated kind, same owning skill
  ["presentations/", "pitch"],
  ["production/", "implement"],
];

// Maps an artifact's workspace-relative path to the skill that owns
// re-invoking it. Returns null for design/system/** and anything else with
// no single owning skill — callers fall back to generic behavior on null.
export function skillForArtifactPath(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  for (const [prefix, skill] of ARTIFACT_SKILL_PREFIXES) {
    if (normalized.startsWith(prefix)) return skill;
  }
  return null;
}
