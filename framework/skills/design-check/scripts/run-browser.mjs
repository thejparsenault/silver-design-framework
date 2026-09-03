#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { checkResult, finding, loadManifest, parseArguments } from "./check-lib.mjs";

let attestation;
async function attestationRuntime() {
  if (attestation) return attestation;
  for (const specifier of [
    "silver-design-framework/framework/runtime/check-attestation.mjs",
    "../../../.silver/runtime/check-attestation.mjs",
    "../../../runtime/check-attestation.mjs",
  ]) {
    try {
      attestation = await import(specifier);
      return attestation;
    } catch {
      // Try the package, installed workspace, then source tree.
    }
  }
  throw new Error("The shared check-attestation runtime is unavailable.");
}

let WebSocketClient;
try {
  ({ default: WebSocketClient } = await import("ws"));
} catch {
  try {
    ({ default: WebSocketClient } = await import(
      "silver-design-framework/framework/runtime/websocket.mjs"
    ));
  } catch {
    WebSocketClient = globalThis.WebSocket;
  }
}

// The canonical list lives in the runtime so the browser transport's
// availability and this suite cannot disagree about whether Chrome is here.
// This script runs from an installed workspace where a bare specifier may not
// resolve, hence the ladder; `chrome path list stays in one place` in
// framework/tests fails the gate if the inline fallback ever drifts from it.
let chromeCandidates;
for (const specifier of [
  "silver-design-framework/framework/runtime/chrome.mjs",
  "../../../.silver/runtime/chrome.mjs",
  "../../../runtime/chrome.mjs",
]) {
  try {
    ({ CHROME_CANDIDATES: chromeCandidates } = await import(specifier));
    break;
  } catch {
    // Try the next resolution path.
  }
}
chromeCandidates ??= [
  process.env.SILVER_CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  // Windows has no conventional absolute path — Chrome lands under whichever
  // root its installer chose — so all three are probed. On a non-Windows host
  // these are undefined and drop out.
  process.env.PROGRAMFILES &&
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env["PROGRAMFILES(X86)"] &&
    `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env.LOCALAPPDATA &&
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].filter(Boolean);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const fetchLocal = (url) => fetch(url, { signal: AbortSignal.timeout(1000) });

export class BrowserExecutionError extends Error {
  constructor(stage, message, diagnostic = {}) {
    super(message);
    this.name = "BrowserExecutionError";
    this.stage = stage;
    this.diagnostic = { stage, message, ...diagnostic };
  }
}

function executionError(stage, error, diagnostic = {}) {
  if (error instanceof BrowserExecutionError) return error;
  return new BrowserExecutionError(stage, error.message ?? String(error), diagnostic);
}

async function atStage(stage, diagnostic, operation) {
  const started = Date.now();
  try {
    return await operation();
  } catch (error) {
    throw executionError(stage, error, {
      ...diagnostic,
      duration_ms: Date.now() - started,
    });
  }
}

async function firstAccessible(paths) {
  for (const candidate of paths) {
    try { await access(candidate); return candidate; } catch {}
  }
  return null;
}

const mediaTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

async function staticServer(root) {
  const workspace = path.resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      let file = path.resolve(workspace, pathname.replace(/^\/+/, ""));
      if (!file.startsWith(`${workspace}${path.sep}`)) throw new Error("Path escapes workspace.");
      if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
      response.writeHead(200, { "content-type": mediaTypes.get(path.extname(file)) ?? "application/octet-stream" });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function listenSocket(socket, event, listener, { once = false } = {}) {
  if (typeof socket.on === "function") {
    const add = once && typeof socket.once === "function" ? "once" : "on";
    socket[add](event, listener);
    return () => {
      if (typeof socket.off === "function") socket.off(event, listener);
      else socket.removeListener?.(event, listener);
    };
  }
  if (typeof socket.addEventListener === "function") {
    socket.addEventListener(event, listener, { once });
    return () => socket.removeEventListener(event, listener);
  }
  throw new Error("Chrome DevTools WebSocket has no supported event API.");
}

function socketError(value, fallback) {
  if (value instanceof Error) return value;
  if (value?.error instanceof Error) return value.error;
  return new Error(fallback);
}

function socketMessage(value) {
  const payload = value?.data ?? value;
  if (typeof payload === "string") return payload;
  if (payload instanceof ArrayBuffer) return Buffer.from(payload).toString("utf8");
  if (ArrayBuffer.isView(payload)) {
    return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength).toString("utf8");
  }
  return payload.toString();
}

export class DevTools {
  constructor(url, options = {}) {
    if (!WebSocketClient) {
      throw new Error("No local WebSocket client is available for Chrome DevTools.");
    }
    this.socket = options.socket ?? new WebSocketClient(url);
    this.timeout = options.timeout ?? 10000;
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      let removeOpen;
      let removeError;
      const cleanup = () => {
        clearTimeout(timer);
        removeOpen?.();
        removeError?.();
      };
      const opened = () => {
        cleanup();
        resolve();
      };
      const failed = (error) => {
        cleanup();
        reject(socketError(error, "Chrome DevTools WebSocket failed to open."));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out opening the Chrome DevTools WebSocket."));
      }, this.timeout);
      removeOpen = listenSocket(this.socket, "open", opened, { once: true });
      removeError = listenSocket(this.socket, "error", failed, { once: true });
    });
    const rejectPending = (error) => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
    };
    listenSocket(this.socket, "message", (data) => {
      let message;
      try {
        message = JSON.parse(socketMessage(data));
      } catch {
        rejectPending(new Error("Chrome DevTools WebSocket returned an invalid message."));
        return;
      }
      if (message.id) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(pending?.timer);
        if (message.error) pending?.reject(new Error(message.error.message));
        else pending?.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
    });
    listenSocket(this.socket, "error", (error) =>
      rejectPending(socketError(error, "Chrome DevTools WebSocket failed.")),
    );
    listenSocket(this.socket, "close", () =>
      rejectPending(new Error("Chrome DevTools WebSocket closed before responding.")),
    );
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for Chrome DevTools response to ${method}.`));
      }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  waitFor(method, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const listeners = this.listeners.get(method) ?? [];
      const timer = setTimeout(() => {
        this.listeners.set(method, listeners.filter((listener) => listener !== finish));
        reject(new Error(`Timed out waiting for ${method}.`));
      }, timeout);
      const finish = (params) => {
        clearTimeout(timer);
        this.listeners.set(method, listeners.filter((listener) => listener !== finish));
        resolve(params);
      };
      this.listeners.set(method, [...listeners, finish]);
    });
  }

  close() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Chrome DevTools connection closed."));
    }
    this.pending.clear();
    if (typeof this.socket.terminate === "function") this.socket.terminate();
    else this.socket.close?.();
  }
}

function processDiagnostic(processHandle, stderr, forced = false) {
  const diagnostic = {
    exit_code: processHandle.exitCode,
    signal: processHandle.signalCode,
    forced,
    stderr,
  };
  // Chrome descendants can inherit the launcher's stderr pipe. Keeping that
  // readable stream open after the owned process exits can keep a Node test
  // worker alive even though the browser check itself finished.
  processHandle.stderr?.destroy();
  processHandle.unref?.();
  return diagnostic;
}

async function stopProcess(processHandle, stderr) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
    return processDiagnostic(processHandle, stderr);
  }
  const exited = new Promise((resolve) => processHandle.once("exit", resolve));
  processHandle.kill("SIGTERM");
  const result = await Promise.race([
    exited.then(() => "exited"),
    delay(2000).then(() => "timeout"),
  ]);
  let forced = false;
  if (result === "timeout" && processHandle.exitCode === null && processHandle.signalCode === null) {
    forced = true;
    processHandle.kill("SIGKILL");
    await Promise.race([exited, delay(2000)]);
  }
  return processDiagnostic(processHandle, stderr, forced);
}

async function launchChrome(executable) {
  const started = Date.now();
  const profile = await mkdtemp(path.join(os.tmpdir(), "silver-chrome-"));
  const processHandle = spawn(executable, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  let spawnError;
  processHandle.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-8000);
  });
  processHandle.once("error", (error) => { spawnError = error; });
  let port;
  const activePortPath = path.join(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (spawnError || processHandle.exitCode !== null || processHandle.signalCode !== null) break;
    try {
      const [line] = (await readFile(activePortPath, "utf8")).trim().split(/\r?\n/);
      if (/^[1-9][0-9]*$/.test(line)) { port = Number(line); break; }
    } catch {}
    await delay(100);
  }
  if (!port) {
    const process = await stopProcess(processHandle, stderr);
    await rm(profile, { recursive: true, force: true });
    const stage = spawnError || process.exit_code !== null || process.signal
      ? "browser-launch"
      : "browser-readiness";
    throw new BrowserExecutionError(
      stage,
      spawnError?.message ?? "Local Chrome did not publish its DevToolsActivePort endpoint.",
      { duration_ms: Date.now() - started, process },
    );
  }
  let version;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (processHandle.exitCode !== null || processHandle.signalCode !== null) break;
    try {
      const response = await fetchLocal(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) { version = await response.json(); break; }
    } catch {}
    await delay(100);
  }
  if (!version) {
    const process = await stopProcess(processHandle, stderr);
    await rm(profile, { recursive: true, force: true });
    throw new BrowserExecutionError(
      "browser-readiness",
      "Local Chrome published a debugging port but did not expose a DevTools endpoint.",
      { duration_ms: Date.now() - started, process },
    );
  }
  let pages;
  try {
    pages = await (await fetchLocal(`http://127.0.0.1:${port}/json/list`)).json();
  } catch (error) {
    const process = await stopProcess(processHandle, stderr);
    await rm(profile, { recursive: true, force: true });
    throw new BrowserExecutionError("browser-readiness", error.message, {
      duration_ms: Date.now() - started,
      process,
    });
  }
  const page = pages.find(({ type }) => type === "page");
  if (!page) {
    const process = await stopProcess(processHandle, stderr);
    await rm(profile, { recursive: true, force: true });
    throw new BrowserExecutionError("browser-readiness", "Local Chrome did not create a page target.", {
      duration_ms: Date.now() - started,
      process,
    });
  }
  let devtools;
  try {
    devtools = new DevTools(page.webSocketDebuggerUrl);
    await devtools.open();
    await devtools.send("Page.enable");
    await devtools.send("Runtime.enable");
  } catch (error) {
    devtools?.close();
    const process = await stopProcess(processHandle, stderr);
    await rm(profile, { recursive: true, force: true });
    throw new BrowserExecutionError("browser-readiness", error.message, {
      duration_ms: Date.now() - started,
      process,
    });
  }
  return {
    devtools,
    version: version.Browser,
    close: async () => {
      devtools.close();
      const process = await stopProcess(processHandle, stderr);
      try {
        await rm(profile, { recursive: true, force: true });
      } catch (error) {
        throw new BrowserExecutionError("cleanup", error.message, { process });
      }
      return process;
    },
  };
}

async function launchChromeWithRetry(executable, factory = launchChrome) {
  let latest;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await factory(executable, { attempt });
    } catch (error) {
      latest = executionError("browser-launch", error);
      latest.diagnostic.attempts = attempt;
      if (attempt < 2 && ["browser-launch", "browser-readiness"].includes(latest.stage)) {
        await delay(100);
        continue;
      }
      throw latest;
    }
  }
  throw latest;
}

function targetPath(manifest, target) {
  const profileRoot = manifest.implementation_profiles?.[target.profile]?.root ?? target.root ?? "";
  return path.posix.join(profileRoot, String(target.path).replace(/^\/+/, ""));
}

const inspectionExpression = `(() => {
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const parseColor = (value) => {
    const match = value.match(/rgba?\\((?:\\s*)(\\d+)[, ]+(\\d+)[, ]+(\\d+)(?:[, /]+([\\d.]+))?\\)/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])] : null;
  };
  const background = (element) => {
    let current = element;
    while (current) {
      const color = parseColor(getComputedStyle(current).backgroundColor);
      if (color && color[3] > 0.95) return color;
      current = current.parentElement;
    }
    return [255, 255, 255, 1];
  };
  const luminance = ([r, g, b]) => {
    const values = [r, g, b].map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
  };
  const ratio = (left, right) => {
    const a = luminance(left);
    const b = luminance(right);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const accessibility = [];
  if (!document.documentElement.lang) accessibility.push("document-language");
  if (!document.querySelector("main")) accessibility.push("main-landmark");
  if (!document.querySelector("h1")) accessibility.push("h1");
  for (const button of document.querySelectorAll("button")) {
    if (visible(button) && !(button.getAttribute("aria-label") || button.textContent.trim())) accessibility.push("button-name");
  }
  for (const input of document.querySelectorAll("input")) {
    if (visible(input) && input.labels.length === 0 && !input.getAttribute("aria-label")) accessibility.push("input-label");
  }
  const contrast = [];
  for (const element of document.querySelectorAll("h1,h2,h3,p,a,button,label,li")) {
    if (!visible(element) || !element.textContent.trim()) continue;
    const foreground = parseColor(getComputedStyle(element).color);
    if (!foreground) continue;
    const score = ratio(foreground, background(element));
    const style = getComputedStyle(element);
    const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
    if (score < (large ? 3 : 4.5)) contrast.push({ tag: element.tagName.toLowerCase(), text: element.textContent.trim().slice(0, 60), ratio: Number(score.toFixed(2)) });
  }
  const responsive = {
    viewport: { width: innerWidth, height: innerHeight },
    documentWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > innerWidth + 1
  };
  let interaction = { status: "not-applicable", detail: "No declared local critical action." };
  const transition = document.querySelector("[data-target]");
  const completion = document.querySelector("[data-action='complete']");
  const dark = [...document.querySelectorAll("button")].find((button) => button.getAttribute("onclick")?.includes("'dark'"));
  if (transition) {
    transition.click();
    const destination = document.querySelector('[data-node="' + CSS.escape(transition.dataset.target) + '"]');
    interaction = { status: destination && !destination.hidden ? "pass" : "fail", detail: "Prototype transition" };
  } else if (completion) {
    completion.click();
    const status = document.querySelector("[role='status'],[aria-live]");
    interaction = { status: status?.textContent.trim() ? "pass" : "fail", detail: "Production completion action" };
  } else if (dark) {
    dark.click();
    interaction = { status: document.body.dataset.scheme === "dark" ? "pass" : "fail", detail: "Reference scheme switch" };
  }
  return { accessibility, contrast, responsive, interaction, title: document.title };
})()`;

function notRunResults(reason) {
  return ["accessibility", "responsive-behavior", "critical-interactions"].map((checker) =>
    checkResult({ checker, suite: "browser", requested: ["declared-render-target"], completed: [], findings: [], reason }),
  );
}

function browserResults({ requested, completed, findings, error }) {
  return ["accessibility", "responsive-behavior", "critical-interactions"].map((checker) =>
    checkResult({
      checker,
      suite: "browser",
      requested,
      completed,
      findings: findings[checker],
      ...(error ? { executionError: error.diagnostic } : {}),
    }),
  );
}

export function browserSuiteExitCode(result) {
  return result.status === "pass" ? 0 : result.status === "fail" ? 1 : result.status === "not-run" ? 2 : 3;
}

export async function runBrowserSuite(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const {
    attestCheckResults,
    unstableCheckResults,
    workspaceCheckStateDigest,
  } = await attestationRuntime();
  const stateBefore = await workspaceCheckStateDigest(root);
  const finalize = async (suite) => {
    const stateAfter = await workspaceCheckStateDigest(root);
    const completedAt = (options.now instanceof Date ? options.now : new Date(options.now ?? Date.now())).toISOString();
    const results = stateBefore === stateAfter
      ? attestCheckResults(suite.results, stateAfter, completedAt)
      : unstableCheckResults(suite.results, completedAt);
    const status = results.some(({ status }) => status === "error")
      ? "error"
      : results.some(({ status }) => status === "fail")
        ? "fail"
        : results.some(({ status }) => status === "not-run")
          ? "not-run"
          : "pass";
    return { ...suite, status, results };
  };
  let manifest;
  try { ({ value: manifest } = await loadManifest(root)); }
  catch (error) {
    const results = notRunResults(`Cannot discover render targets: ${error.message}`);
    return finalize({ schema: "silver/check-suite-result/v1", suite: "browser", status: "not-run", browser: { provider: "unavailable" }, results });
  }
  const targets = manifest.checks?.render_targets ?? [];
  if (!targets.length) {
    const results = notRunResults("No render targets are declared.");
    return finalize({ schema: "silver/check-suite-result/v1", suite: "browser", status: "not-run", browser: { provider: "unavailable" }, results });
  }
  const executable = options.chromePath
    ? await firstAccessible([options.chromePath])
    : await firstAccessible(chromeCandidates);
  if (!executable) {
    const results = notRunResults("No compatible local Chrome executable is available.");
    return finalize({ schema: "silver/check-suite-result/v1", suite: "browser", status: "not-run", browser: { provider: "unavailable" }, results });
  }

  const requested = [];
  const completed = [];
  const findings = { "accessibility": [], "responsive-behavior": [], "critical-interactions": [] };
  let server;
  let browser;
  let failure;
  let cleanup;
  try {
    server = await atStage("browser-readiness", {}, () =>
      (options.serverFactory ?? staticServer)(root));
    browser = await launchChromeWithRetry(executable, options.browserFactory ?? launchChrome);
    for (const target of targets) {
      const viewports = target.viewports?.length ? target.viewports : [{ width: 1280, height: 800 }];
      for (const viewport of viewports) {
        const key = `${target.id}@${viewport.width}x${viewport.height}`;
        requested.push(key);
        const diagnostic = { target: target.id, viewport };
        await atStage("protocol", { ...diagnostic, method: "Emulation.setDeviceMetricsOverride" }, () =>
          browser.devtools.send("Emulation.setDeviceMetricsOverride", {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: 1,
            mobile: viewport.width < 600,
          }));
        await atStage("navigation", { ...diagnostic, method: "Page.navigate" }, async () => {
          const loaded = browser.devtools.waitFor("Page.loadEventFired");
          try {
            const navigation = await browser.devtools.send("Page.navigate", {
              url: `${server.origin}/${targetPath(manifest, target)}`,
            });
            if (navigation.errorText) throw new Error(navigation.errorText);
            await loaded;
          } catch (error) {
            loaded.catch(() => {});
            throw error;
          }
        });
        const evaluation = await atStage("inspection", { ...diagnostic, method: "Runtime.evaluate" }, () =>
          browser.devtools.send("Runtime.evaluate", {
            expression: inspectionExpression,
            returnByValue: true,
            awaitPromise: true,
          }));
        if (evaluation.exceptionDetails) {
          throw new BrowserExecutionError(
            "inspection",
            evaluation.exceptionDetails.text ?? "Browser inspection failed.",
            diagnostic,
          );
        }
        if (!evaluation.result?.value) {
          throw new BrowserExecutionError("inspection", "Browser inspection returned no report.", diagnostic);
        }
        const report = evaluation.result.value;
        completed.push(key);
        for (const rule of report.accessibility) {
          findings.accessibility.push(finding({ checker: "accessibility", rule: `browser.${rule}`, file: targetPath(manifest, target), message: `${report.title}: ${rule} failed at ${viewport.width}x${viewport.height}.` }));
        }
        for (const contrast of report.contrast) {
          findings.accessibility.push(finding({ checker: "accessibility", rule: "browser.contrast", file: targetPath(manifest, target), message: `${contrast.tag} text contrast is ${contrast.ratio}:1 at ${viewport.width}x${viewport.height}.`, observedValue: contrast.text }));
        }
        if (report.responsive.overflow) {
          findings["responsive-behavior"].push(finding({ checker: "responsive-behavior", rule: "browser.horizontal-overflow", file: targetPath(manifest, target), message: `Document width ${report.responsive.documentWidth}px exceeds ${viewport.width}px viewport.` }));
        }
        if (report.interaction.status === "fail") {
          findings["critical-interactions"].push(finding({ checker: "critical-interactions", rule: "browser.interaction-failed", file: targetPath(manifest, target), message: `${report.interaction.detail} did not reach its observable state.` }));
        }
      }
    }
  } catch (error) {
    failure = executionError("browser-launch", error);
  }
  try {
    cleanup = await browser?.close();
    if (cleanup?.forced && !failure) {
      failure = new BrowserExecutionError(
        "cleanup",
        "Chrome required forced termination after the browser checks completed.",
        { process: cleanup },
      );
    }
  } catch (error) {
    failure ??= executionError("cleanup", error);
  }
  try {
    await server?.close();
  } catch (error) {
    failure ??= executionError("cleanup", error);
  }
  const results = browserResults({ requested, completed, findings, error: failure });
  const status = failure
    ? "error"
    : results.some(({ status: resultStatus }) => resultStatus === "fail")
      ? "fail"
      : "pass";
  return finalize({
    schema: "silver/check-suite-result/v1",
    suite: "browser",
    status,
    browser: {
      provider: "chrome-cdp",
      ...(browser?.version ? { version: browser.version } : {}),
      ...(cleanup ? { cleanup } : {}),
    },
    results,
    ...(failure ? { errors: [failure.diagnostic] } : {}),
  });
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = await runBrowserSuite(options);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = browserSuiteExitCode(result);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 3;
  }
}
if (import.meta.main ?? (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)))) void main();
