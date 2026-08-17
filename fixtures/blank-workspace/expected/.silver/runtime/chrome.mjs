// Where a local Chrome lives.
//
// Shared because two things need the same answer and must not drift: the
// deterministic browser check suite, which launches Chrome over CDP, and the
// `silver-browser-local` transport's availability, which reports whether that
// suite could run at all.
import { access } from "node:fs/promises";

export const CHROME_CANDIDATES = [
  process.env.SILVER_CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

export async function firstAccessible(paths = CHROME_CANDIDATES) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Not installed at this path is the normal case, not an error.
    }
  }
  return null;
}

export async function findChrome() {
  return firstAccessible(CHROME_CANDIDATES);
}
