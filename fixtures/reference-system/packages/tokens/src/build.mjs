import StyleDictionary from "style-dictionary";
import { fileURLToPath } from "node:url";

const referenceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fromReferenceRoot = (path) => `${referenceRoot}/${path}`;
const valueOf = (token) => token.$value ?? token.value;
const dimensionToCss = ({ value, unit }) => `${value}${unit}`;
const colorToCss = (value) => {
  if (!value || typeof value !== "object") return value;
  const components = value.components.join(" ");
  const alpha = value.alpha === undefined ? "" : ` / ${value.alpha}`;
  return `${value.colorSpace}(${components}${alpha})`;
};

// Style Dictionary 4.4 recognizes DTCG token types but its legacy size/time
// transforms still expect scalar values. DTCG 2025.10 dimensions and durations
// are structured objects, so normalize them explicitly before other transforms.
StyleDictionary.registerTransform({
  name: "dimension/css-dtcg",
  type: "value",
  filter: (token) => (token.$type ?? token.type) === "dimension",
  transform: (token) => {
    const value = valueOf(token);
    if (
      value &&
      typeof value === "object" &&
      typeof value.value === "number" &&
      typeof value.unit === "string"
    ) {
      const path = token.path.join(".");
      if (
        value.unit === "px" &&
        value.value !== 0 &&
        (path.startsWith("space.") || path.startsWith("font.size"))
      ) {
        return `${Number((value.value / 16).toFixed(4))}rem`;
      }
      return dimensionToCss(value);
    }
    return value;
  },
});

StyleDictionary.registerTransform({
  name: "duration/css-dtcg",
  type: "value",
  filter: (token) => (token.$type ?? token.type) === "duration",
  transform: (token) => {
    const value = valueOf(token);
    if (
      value &&
      typeof value === "object" &&
      typeof value.value === "number" &&
      typeof value.unit === "string"
    ) {
      return dimensionToCss(value);
    }
    return value;
  },
});

StyleDictionary.registerTransform({
  name: "attribute/color-fallback",
  type: "attribute",
  filter: (token) => (token.$type ?? token.type) === "color",
  transform: (token) => {
    const value = valueOf(token);
    return value && typeof value === "object" && value.hex
      ? { colorFallback: value.hex }
      : {};
  },
});

StyleDictionary.registerTransform({
  name: "color/css-dtcg",
  type: "value",
  filter: (token) => (token.$type ?? token.type) === "color",
  transform: (token) => colorToCss(valueOf(token)),
});

StyleDictionary.registerTransform({
  name: "shadow/css-dtcg",
  type: "value",
  filter: (token) => (token.$type ?? token.type) === "shadow",
  transform: (token) => {
    const shadows = Array.isArray(valueOf(token))
      ? valueOf(token)
      : [valueOf(token)];
    return shadows
      .map((shadow) =>
        [
          dimensionToCss(shadow.offsetX),
          dimensionToCss(shadow.offsetY),
          dimensionToCss(shadow.blur),
          dimensionToCss(shadow.spread),
          colorToCss(shadow.color),
        ].join(" "),
      )
      .join(", ");
  },
});

/**
 * Style Dictionary 4 build.
 *
 * Inputs:  reference-system/tokens/**\/*.tokens.json  (DTCG 2025.10 format)
 * Outputs:
 *   reference-system/packages/css/src/tokens.css          — CSS custom properties
 *   reference-system/packages/css/src/tailwind-theme.css  — Tailwind v4 @theme block
 *   reference-system/packages/tokens/dist/tokens.json     — resolved token tree
 */

// ─── Custom transform group: css + rem ───────────────────────────────────────
StyleDictionary.registerTransformGroup({
  name: "css/rem",
  transforms: [
    "attribute/cti",
    "attribute/color-fallback",
    "name/kebab",
    "duration/css-dtcg",
    "html/icon",
    "dimension/css-dtcg",
    "color/css-dtcg",
    "asset/url",
    "fontFamily/css",
    "cubicBezier/css",
    "strokeStyle/css/shorthand",
    "border/css/shorthand",
    "typography/css/shorthand",
    "transition/css/shorthand",
    "shadow/css-dtcg",
  ],
});

// ─── Custom format: CSS custom properties with sRGB + oklch gamut fallback ───
// Color tokens emit two blocks:
//   1. :root { --token: #hex; }          — sRGB fallback, always applies
//   2. @supports (color: oklch(0 0 0)) { :root { --token: oklch(...); } }
// Non-color tokens are emitted once in block 1 at their transformed value.
StyleDictionary.registerFormat({
  name: "css/color-gamut",
  format: ({ dictionary, options }) => {
    const selector = options?.selector ?? ":root";

    const isColor = (t) => (t.$type ?? t.type) === "color";

    const colorTokens = dictionary.allTokens.filter(isColor);
    const otherTokens = dictionary.allTokens.filter((t) => !isColor(t));
    const tokensByPath = new Map(
      dictionary.allTokens.map((token) => [token.path.join("."), token]),
    );

    // attribute/color-fallback captures the resolved sRGB value before the
    // token is transformed to its wide-gamut CSS representation.
    const hexOf = (token) => {
      if (token.attributes?.colorFallback) {
        return token.attributes.colorFallback;
      }
      const original = token.original?.$value ?? token.original?.value;
      if (original && typeof original === "object" && original.hex) {
        return original.hex;
      }
      if (typeof original === "string") {
        const reference = original.match(/^\{(.+)\}$/)?.[1];
        const referencedToken = reference && tokensByPath.get(reference);
        if (referencedToken) return hexOf(referencedToken);
      }
      // If the resolved value looks like a hex string use it directly
      const v = String(valueOf(token) ?? "");
      if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
      return valueOf(token); // last resort: use whatever SD resolved
    };

    const lines = [
      "/* Generated by Style Dictionary — do not edit */",
      `${selector} {`,
      ...otherTokens.map((t) => `  --${t.name}: ${valueOf(t)};`),
      ...colorTokens.map((t) => `  --${t.name}: ${hexOf(t)};`),
      "}",
      "",
      "/* Wide-gamut color override — oklch values on supporting browsers */",
      "@supports (color: oklch(0 0 0)) {",
      `  ${selector} {`,
      ...colorTokens.map((t) => `    --${t.name}: ${valueOf(t)};`),
      "  }",
      "}",
    ];

    return lines.join("\n") + "\n";
  },
});

StyleDictionary.registerFormat({
  name: "tailwind/semantic-theme",
  format: ({ dictionary }) => {
    const semanticColorGroups = new Set([
      "action",
      "border",
      "feedback",
      "focus",
      "surface",
      "text",
    ]);
    const entries = dictionary.allTokens.flatMap((token) => {
      const [group, subgroup] = token.path;
      const name = token.name.replace(/^ds-/, "");

      if (
        (token.$type ?? token.type) === "color" &&
        semanticColorGroups.has(group)
      ) {
        return [`  --color-${name}: var(--ds-${name});`];
      }
      if (group === "space") {
        return [`  --spacing-${subgroup}: var(--ds-${name});`];
      }
      if (group === "radius") {
        return [`  --radius-${subgroup}: var(--ds-${name});`];
      }
      if (group === "font" && subgroup === "size") {
        return [`  --text-${token.path.at(-1)}: var(--ds-${name});`];
      }
      if (group === "shadow") {
        return [`  --shadow-${subgroup}: var(--ds-${name});`];
      }
      return [];
    });

    return [
      "/* Generated adapter: semantic colors and approved structural scales only */",
      "@theme {",
      ...entries,
      "}",
      "",
    ].join("\n");
  },
});

// ─── Build config ─────────────────────────────────────────────────────────────

const sd = new StyleDictionary({
  log: { verbosity: "verbose" },

  source: [fromReferenceRoot("tokens/**/*.tokens.json")],

  usesDtcg: true,

  platforms: {
    css: {
      transformGroup: "css/rem",
      prefix: "ds",
      buildPath: fromReferenceRoot("packages/css/src/"),
      files: [
        {
          destination: "tokens.css",
          format: "css/color-gamut",
          options: {
            selector: ":root",
            outputReferences: false,
          },
        },
      ],
    },

    tailwind: {
      transformGroup: "css/rem",
      prefix: "ds",
      buildPath: fromReferenceRoot("packages/css/src/"),
      files: [
        {
          destination: "tailwind-theme.css",
          format: "tailwind/semantic-theme",
        },
      ],
    },

    json: {
      transformGroup: "js",
      buildPath: fromReferenceRoot("packages/tokens/dist/"),
      files: [
        {
          destination: "tokens.json",
          format: "json/nested",
        },
      ],
    },
  },
});

await sd.cleanAllPlatforms();
await sd.buildAllPlatforms();

console.log("\n✓ Token build complete");
console.log("  reference-system/packages/css/src/tokens.css");
console.log("  reference-system/packages/css/src/tailwind-theme.css");
console.log("  reference-system/packages/tokens/dist/tokens.json");
