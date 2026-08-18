import { randomUUID } from "node:crypto";
import { readFile, readdir, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import StyleDictionary from "style-dictionary";
import { createWorkspaceMutator } from "./workspace-mutations.mjs";

const REFERENCE = /^\{([^}]+)\}$/;

async function collectTokenFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectTokenFiles(full)));
    else if (entry.name.endsWith(".tokens.json")) files.push(full);
  }
  return files;
}

/** Merges every `*.tokens.json` under `tokensDir` into one tree, keyed by each
 * file's own top-level namespace (`action.tokens.json` contributes `action`). */
export async function loadTokenTree(tokensDir) {
  const files = await collectTokenFiles(tokensDir);
  const tree = {};
  for (const file of files.sort()) {
    const document = JSON.parse(await readFile(file, "utf8"));
    for (const [key, value] of Object.entries(document)) {
      if (key in tree) {
        throw new Error(`Token namespace "${key}" is defined in more than one file (last: ${file}).`);
      }
      tree[key] = value;
    }
  }
  return tree;
}

function getByPath(tree, dottedPath) {
  let node = tree;
  for (const segment of dottedPath.split(".")) node = node?.[segment];
  return node;
}

/** Flattens `{reference}` aliases into their literal `$value`, in place on a
 * clone. `$type`/`$description` are untouched — only `$value` is resolved.
 * References may appear as a whole `$value` or nested inside a composite
 * field (typography's `fontFamily`, etc). */
export function resolveTokenTree(tree) {
  const resolved = structuredClone(tree);

  function resolveReference(refPath, trail) {
    if (trail.includes(refPath)) {
      throw new Error(`Token reference cycle: ${[...trail, refPath].join(" -> ")}`);
    }
    const node = getByPath(resolved, refPath);
    if (!node || typeof node !== "object" || !("$value" in node)) {
      throw new Error(`Token reference "{${refPath}}" does not resolve to a token.`);
    }
    resolveValue(node, [...trail, refPath]);
    return node.$value;
  }

  function resolveScalar(value, trail) {
    if (typeof value === "string") {
      const match = REFERENCE.exec(value);
      return match ? resolveReference(match[1], trail) : value;
    }
    if (Array.isArray(value)) return value.map((item) => resolveScalar(item, trail));
    if (value && typeof value === "object") {
      const out = {};
      for (const [key, sub] of Object.entries(value)) out[key] = resolveScalar(sub, trail);
      return out;
    }
    return value;
  }

  function resolveValue(node, trail) {
    if (!node || typeof node !== "object" || !("$value" in node)) return;
    node.$value = resolveScalar(node.$value, trail);
  }

  function walk(node) {
    if (!node || typeof node !== "object") return;
    if ("$value" in node) {
      resolveValue(node, []);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (!key.startsWith("$")) walk(value);
    }
  }

  walk(resolved);
  return resolved;
}

/** Writes the fully-resolved DTCG tree — the canonical, implementation-agnostic
 * index external tools and production consume. Never hand-edited: regenerated
 * from `tokensDir` any time it or its callers run. */
export async function writeResolvedTokenIndex({ root, tokensDir, outputPath }) {
  const tree = await loadTokenTree(tokensDir);
  const resolved = resolveTokenTree(tree);
  const content = `${JSON.stringify(resolved, null, 2)}\n`;
  if (root) {
    const mutator = await createWorkspaceMutator(root);
    await mutator.write(mutator.relative(outputPath), content);
  } else {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, "utf8");
  }
  return { tree: resolved, content };
}

let oklchGroupRegistered = false;

/** `css`'s own transform list (style-dictionary/lib/common/transformGroups.js)
 * with `color/css` (lossy: collapses to hex/rgb) swapped for `color/oklch`
 * (wide-gamut, no gamut mapping). Registered once per process. */
function registerOklchTransformGroup() {
  if (oklchGroupRegistered) return;
  StyleDictionary.registerTransformGroup({
    name: "css/oklch",
    transforms: [
      "attribute/cti",
      "name/kebab",
      "time/seconds",
      "html/icon",
      "size/rem",
      "color/oklch",
      "asset/url",
      "fontFamily/css",
      "cubicBezier/css",
      "strokeStyle/css/shorthand",
      "border/css/shorthand",
      "typography/css/shorthand",
      "transition/css/shorthand",
      "shadow/css/shorthand",
    ],
  });
  oklchGroupRegistered = true;
}

/** Emits CSS custom properties from the authored tree with alias chains
 * preserved as `var()` references (not flattened to literals) — one property
 * per node per layer, so `--ds-button-primary-bg: var(--ds-action-primary-bg)`
 * still reads as what it is. This is what a rendered prototype actually links;
 * `tokens.json` is a separate, fully-resolved artifact for non-CSS consumers.
 *
 * Colors get two blocks: a `:root` baseline in hex (the DTCG source's own
 * `hex` field is a sRGB-gamut-mapped *approximation* — the token authors say
 * so explicitly), and an `@supports (color: oklch(0 0 0))` override in true
 * oklch for browsers that render it. The two aren't colorimetrically
 * identical; skipping the override measurably changes rendered contrast. */
export async function buildTokenCss({ root, tokensDir, outputPath, prefix = "ds" }) {
  registerOklchTransformGroup();
  const mutator = root ? await createWorkspaceMutator(root) : null;
  if (mutator) {
    await mutator.assertSafe(mutator.relative(tokensDir));
    await mutator.assertSafe(mutator.relative(outputPath));
  }
  const source = [`${tokensDir.replace(/\\/g, "/")}/**/*.tokens.json`];
  const temporaryRelative = `.silver/results/token-build/${randomUUID()}`;
  const temporaryRoot = mutator
    ? (await mutator.ensureDirectory(temporaryRelative), mutator.absolute(temporaryRelative))
    : path.dirname(outputPath);
  const buildPath = `${temporaryRoot.replace(/\\/g, "/")}/`;
  const baseline = new StyleDictionary({
    source,
    log: { verbosity: "silent" },
    platforms: {
      css: {
        transformGroup: "css",
        prefix,
        buildPath,
        files: [
          {
            destination: "tokens.hex.css",
            format: "css/variables",
            options: { outputReferences: true, selector: ":root" },
          },
        ],
      },
    },
  });
  const wideGamut = new StyleDictionary({
    source,
    log: { verbosity: "silent" },
    platforms: {
      css: {
        transformGroup: "css/oklch",
        prefix,
        buildPath,
        files: [
          {
            destination: "tokens.oklch.css",
            format: "css/variables",
            filter: (token) => (token.$type ?? token.type) === "color",
            options: { outputReferences: true, selector: ":root" },
          },
        ],
      },
    },
  });
  if (!mutator) await mkdir(path.dirname(outputPath), { recursive: true });
  await baseline.cleanAllPlatforms();
  await baseline.buildAllPlatforms();
  await wideGamut.cleanAllPlatforms();
  await wideGamut.buildAllPlatforms();
  const hexPath = path.join(temporaryRoot, "tokens.hex.css");
  const oklchPath = path.join(temporaryRoot, "tokens.oklch.css");
  const hexCss = await readFile(hexPath, "utf8");
  const oklchCss = await readFile(oklchPath, "utf8");
  const indented = oklchCss
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");
  const content = `${hexCss}\n/* Wide-gamut color override — oklch values on supporting browsers. */\n@supports (color: oklch(0 0 0)) {\n${indented}}\n`;
  if (mutator) {
    await mutator.write(mutator.relative(outputPath), content);
    await mutator.remove(temporaryRelative, { recursive: true });
  } else {
    await writeFile(outputPath, content, "utf8");
    await rm(hexPath, { force: true });
    await rm(oklchPath, { force: true });
  }
}

/** The whole build: authored `tokens/**` -> resolved `tokens.json` + var()-chained
 * `tokens.css`. Called by `silver setup` (so a fresh workspace is styled with no
 * separate build step) and by `theme` (so an edit regenerates both immediately). */
export async function buildDesignSystemTokens({
  root,
  tokensDir = path.join(root, "design/system/tokens"),
  jsonOutput = path.join(root, "design/system/tokens.json"),
  cssOutput = path.join(root, "design/system/expressions/html/styles/tokens.css"),
  prefix = "ds",
}) {
  const { content: jsonContent } = await writeResolvedTokenIndex({ root, tokensDir, outputPath: jsonOutput });
  await buildTokenCss({ root, tokensDir, outputPath: cssOutput, prefix });
  return { jsonOutput, cssOutput, jsonContent };
}
