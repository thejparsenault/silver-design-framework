import { readFile } from "node:fs/promises";

import { payloadPath } from "./payload.mjs";

const DARK_TERMINAL_SILVER = {
  rgb: [199, 203, 209],
  ansi256: 251,
  ansi16: 97,
};
const LIGHT_TERMINAL_SILVER = {
  rgb: [91, 96, 104],
  ansi256: 59,
  ansi16: 90,
};
const UNKNOWN_TERMINAL_SILVER = {
  // #74777B clears 4.5:1 against both pure black and pure white.
  rgb: [116, 119, 123],
  ansi256: 243,
  ansi16: 90,
};
const RESET = "\u001B[0m";
const markPath = payloadPath("docs/brand/ag-mark.txt", import.meta.url);

export function terminalGround(env = process.env) {
  const colorFgbg = env.COLORFGBG?.trim();
  if (colorFgbg) {
    const background = Number(colorFgbg.split(/[;:]/).at(-1));
    if (Number.isInteger(background) && background >= 0 && background <= 15) {
      if ([0, 1, 2, 4, 5, 6, 8].includes(background)) return "dark";
      return "light";
    }
  }

  const declaredTheme = [
    env.SILVER_TERMINAL_GROUND,
    env.TERM_BACKGROUND,
    env.COLOR_THEME,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (declaredTheme.includes("dark")) return "dark";
  if (declaredTheme.includes("light")) return "light";
  return "unknown";
}

function supportsColor({ terminal, env }) {
  if (env.NO_COLOR !== undefined) return false;
  if (env.FORCE_COLOR === "0") return false;
  return Boolean(terminal?.isTTY || env.FORCE_COLOR);
}

function colorDepth(terminal, env) {
  if (env.FORCE_COLOR === "3") return 24;
  if (env.FORCE_COLOR === "2") return 8;
  if (env.FORCE_COLOR === "1") return 4;
  return terminal?.colorDepth ?? 0;
}

export function silverEscape({
  terminal = {},
  env = process.env,
} = {}) {
  if (!supportsColor({ terminal, env })) return "";
  const tone =
    terminalGround(env) === "dark"
      ? DARK_TERMINAL_SILVER
      : terminalGround(env) === "light"
        ? LIGHT_TERMINAL_SILVER
        : UNKNOWN_TERMINAL_SILVER;
  const depth = colorDepth(terminal, env);
  if (depth >= 24) {
    return `\u001B[38;2;${tone.rgb.join(";")}m`;
  }
  if (depth >= 8) {
    return `\u001B[38;5;${tone.ansi256}m`;
  }
  return `\u001B[${tone.ansi16}m`;
}

export async function renderBrandMark(options = {}) {
  const mark = (await readFile(markPath, "utf8")).trimEnd();
  const color = silverEscape(options);
  return color ? `${color}${mark}${RESET}` : mark;
}
