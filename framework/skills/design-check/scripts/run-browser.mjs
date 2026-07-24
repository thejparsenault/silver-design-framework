#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { checkResult, finding, loadManifest, parseArguments } from "./check-lib.mjs";

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

const chromeCandidates = [
  process.env.SILVER_CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function firstAccessible(paths) {
  for (const candidate of paths) {
    try { await access(candidate); return candidate; } catch {}
  }
  return null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
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

class DevTools {
  constructor(url) {
    if (!WebSocketClient) {
      throw new Error("No local WebSocket client is available for Chrome DevTools.");
    }
    this.socket = new WebSocketClient(url);
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    this.socket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.id) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending?.reject(new Error(message.error.message));
        else pending?.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
    });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
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
    this.socket.terminate();
  }
}

async function stopProcess(processHandle) {
  if (processHandle.exitCode !== null) return;
  const exited = new Promise((resolve) => processHandle.once("exit", resolve));
  processHandle.kill("SIGTERM");
  const result = await Promise.race([
    exited.then(() => "exited"),
    delay(2000).then(() => "timeout"),
  ]);
  if (result === "timeout" && processHandle.exitCode === null) {
    processHandle.kill("SIGKILL");
    await Promise.race([exited, delay(2000)]);
  }
}

async function launchChrome(executable) {
  const port = await freePort();
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
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore" });
  let version;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (processHandle.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) { version = await response.json(); break; }
    } catch {}
    await delay(100);
  }
  if (!version) {
    await stopProcess(processHandle);
    await rm(profile, { recursive: true, force: true });
    throw new Error("Local Chrome did not expose a DevTools endpoint.");
  }
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = pages.find(({ type }) => type === "page");
  if (!page) {
    await stopProcess(processHandle);
    await rm(profile, { recursive: true, force: true });
    throw new Error("Local Chrome did not create a page target.");
  }
  const devtools = new DevTools(page.webSocketDebuggerUrl);
  await devtools.open();
  await devtools.send("Page.enable");
  await devtools.send("Runtime.enable");
  return {
    devtools,
    version: version.Browser,
    close: async () => {
      devtools.close();
      await stopProcess(processHandle);
      await rm(profile, { recursive: true, force: true });
    },
  };
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
    checkResult({ checker, requested: ["declared-render-target"], completed: [], findings: [], reason }),
  );
}

export async function runBrowserSuite(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  let manifest;
  try { ({ value: manifest } = await loadManifest(root)); }
  catch (error) {
    const results = notRunResults(`Cannot discover render targets: ${error.message}`);
    return { schema: "silver/check-suite-result/v1", suite: "browser", status: "not-run", browser: { provider: "unavailable" }, results };
  }
  const targets = manifest.checks?.render_targets ?? [];
  if (!targets.length) {
    const results = notRunResults("No render targets are declared.");
    return { schema: "silver/check-suite-result/v1", suite: "browser", status: "not-run", browser: { provider: "unavailable" }, results };
  }
  const executable = options.chromePath ?? await firstAccessible(chromeCandidates);
  if (!executable) {
    const results = notRunResults("No compatible local Chrome executable is available.");
    return { schema: "silver/check-suite-result/v1", suite: "browser", status: "not-run", browser: { provider: "unavailable" }, results };
  }

  const server = await staticServer(root);
  let browser;
  try {
    browser = await launchChrome(executable);
    const requested = [];
    const completed = [];
    const findings = { "accessibility": [], "responsive-behavior": [], "critical-interactions": [] };
    for (const target of targets) {
      const viewports = target.viewports?.length ? target.viewports : [{ width: 1280, height: 800 }];
      for (const viewport of viewports) {
        const key = `${target.id}@${viewport.width}x${viewport.height}`;
        requested.push(key);
        await browser.devtools.send("Emulation.setDeviceMetricsOverride", {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          mobile: viewport.width < 600,
        });
        const loaded = browser.devtools.waitFor("Page.loadEventFired");
        await browser.devtools.send("Page.navigate", { url: `${server.origin}/${targetPath(manifest, target)}` });
        await loaded;
        const evaluation = await browser.devtools.send("Runtime.evaluate", {
          expression: inspectionExpression,
          returnByValue: true,
          awaitPromise: true,
        });
        if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.text ?? "Browser inspection failed.");
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
    const results = Object.entries(findings).map(([checker, checkerFindings]) =>
      checkResult({ checker, requested, completed, findings: checkerFindings }),
    );
    return {
      schema: "silver/check-suite-result/v1",
      suite: "browser",
      status: results.some(({ status }) => status === "fail") ? "fail" : "pass",
      browser: { provider: "chrome-cdp", version: browser.version },
      results,
    };
  } catch (error) {
    const results = notRunResults(`Browser execution failed: ${error.message}`);
    return { schema: "silver/check-suite-result/v1", suite: "browser", status: "not-run", browser: { provider: "chrome-cdp" }, results };
  } finally {
    await browser?.close();
    await server.close();
  }
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = await runBrowserSuite(options);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === "pass" ? 0 : result.status === "fail" ? 1 : 2;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 3;
  }
}
if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) await main();
