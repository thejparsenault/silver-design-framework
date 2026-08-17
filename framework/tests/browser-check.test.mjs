import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BrowserExecutionError,
  DevTools,
  browserSuiteExitCode,
  runBrowserSuite,
} from "../skills/design-check/scripts/run-browser.mjs";
import { setupWorkspace } from "../../installer/setup.mjs";
import { validateSchema } from "../../installer/lib/schemas.mjs";

const passingReport = {
  accessibility: [],
  contrast: [],
  responsive: { viewport: { width: 1280, height: 800 }, documentWidth: 1280, overflow: false },
  interaction: { status: "pass", detail: "Test action" },
  title: "Browser fixture",
};

function fakeBrowser({ failMethod, report = passingReport, cleanup } = {}) {
  return {
    version: "Chrome/Fake",
    devtools: {
      async send(method) {
        if (method === failMethod) throw new Error(`${method} injected failure`);
        if (method === "Page.navigate") return {};
        if (method === "Runtime.evaluate") return { result: { value: report } };
        return {};
      },
      async waitFor() {},
    },
    async close() {
      return cleanup ?? { exit_code: 0, signal: null, forced: false, stderr: "" };
    },
  };
}

test("declared local release target passes real browser checks", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-browser-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({ root, name: "Browser fixture", id: "browser-fixture", date: "2026-07-24" });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await runBrowserSuite({ root });
    assert.equal(result.status, "pass", JSON.stringify(result, null, 2));
    assert.equal(result.browser.provider, "chrome-cdp");
    assert.match(result.browser.version, /Chrome/);
    assert.equal(result.browser.cleanup.forced, false);
    assert.deepEqual(result.results.map(({ checker }) => checker), [
      "accessibility",
      "responsive-behavior",
      "critical-interactions",
    ]);
    assert.ok(result.results.every(({ status }) => status === "pass"));
  }
});

test("browser mechanism errors are distinct from completed design findings", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-browser-outcomes-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({ root, name: "Browser outcomes", id: "browser-outcomes", date: "2026-07-24" });

  const failed = await runBrowserSuite({
    root,
    chromePath: process.execPath,
    browserFactory: async () => fakeBrowser({
      report: { ...passingReport, accessibility: ["h1"] },
    }),
  });
  assert.equal(failed.status, "fail");
  assert.equal(browserSuiteExitCode(failed), 1);
  assert.equal(failed.errors, undefined);
  assert.ok(failed.results.find(({ checker }) => checker === "accessibility").findings.length > 0);

  for (const [method, stage] of [
    ["Emulation.setDeviceMetricsOverride", "protocol"],
    ["Page.navigate", "navigation"],
    ["Runtime.evaluate", "inspection"],
  ]) {
    const errored = await runBrowserSuite({
      root,
      chromePath: process.execPath,
      browserFactory: async () => fakeBrowser({ failMethod: method }),
    });
    assert.equal(errored.status, "error");
    assert.equal(browserSuiteExitCode(errored), 3);
    assert.equal(errored.errors[0].stage, stage);
    assert.equal(errored.errors[0].method, method);
    assert.ok(errored.results.every(({ status }) => status === "error"));
    for (const result of errored.results) {
      assert.equal((await validateSchema("check-result.schema.json", result)).valid, true);
    }
  }
});

test("browser launch retries once, reports unavailable separately, and diagnoses cleanup escalation", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-browser-lifecycle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({ root, name: "Browser lifecycle", id: "browser-lifecycle", date: "2026-07-24" });

  let attempts = 0;
  const recovered = await runBrowserSuite({
    root,
    chromePath: process.execPath,
    browserFactory: async () => {
      attempts += 1;
      if (attempts === 1) throw new BrowserExecutionError("browser-readiness", "not ready");
      return fakeBrowser();
    },
  });
  assert.equal(attempts, 2);
  assert.equal(recovered.status, "pass");

  attempts = 0;
  const launchError = await runBrowserSuite({
    root,
    chromePath: process.execPath,
    browserFactory: async () => {
      attempts += 1;
      throw new BrowserExecutionError("browser-launch", "could not start", {
        process: { exit_code: 9, signal: null, forced: false, stderr: "launch failed" },
      });
    },
  });
  assert.equal(attempts, 2);
  assert.equal(launchError.status, "error");
  assert.equal(launchError.errors[0].stage, "browser-launch");
  assert.equal(launchError.errors[0].attempts, 2);
  assert.equal(launchError.errors[0].process.stderr, "launch failed");

  const unavailable = await runBrowserSuite({ root, chromePath: path.join(root, "missing-chrome") });
  assert.equal(unavailable.status, "not-run");
  assert.equal(browserSuiteExitCode(unavailable), 2);

  const cleanup = await runBrowserSuite({
    root,
    chromePath: process.execPath,
    browserFactory: async () => fakeBrowser({
      cleanup: { exit_code: null, signal: "SIGKILL", forced: true, stderr: "stuck" },
    }),
  });
  assert.equal(cleanup.status, "error");
  assert.equal(cleanup.errors[0].stage, "cleanup");
  assert.equal(cleanup.errors[0].process.forced, true);
});

class SilentSocket extends EventEmitter {
  send(message) {
    this.lastMessage = message;
  }

  terminate() {
    this.emit("close");
  }
}

class EventTargetSocket extends EventTarget {
  send(message) {
    this.lastMessage = message;
  }

  close() {
    this.dispatchEvent(new Event("close"));
  }
}

test("DevTools open and command waits are bounded", async () => {
  const neverOpens = new SilentSocket();
  const unopened = new DevTools("ws://unused", {
    socket: neverOpens,
    timeout: 20,
  });
  await assert.rejects(
    unopened.open(),
    /Timed out opening the Chrome DevTools WebSocket/,
  );

  const neverResponds = new SilentSocket();
  const connected = new DevTools("ws://unused", {
    socket: neverResponds,
    timeout: 20,
  });
  queueMicrotask(() => neverResponds.emit("open"));
  await connected.open();
  await assert.rejects(
    connected.send("Runtime.evaluate"),
    /Timed out waiting for Chrome DevTools response to Runtime\.evaluate/,
  );
  assert.match(neverResponds.lastMessage, /"method":"Runtime\.evaluate"/);
  connected.close();
});

test("DevTools supports the built-in EventTarget WebSocket fallback", async () => {
  const socket = new EventTargetSocket();
  const connected = new DevTools("ws://unused", { socket, timeout: 100 });
  queueMicrotask(() => socket.dispatchEvent(new Event("open")));
  await connected.open();
  const response = connected.send("Runtime.evaluate");
  const { id } = JSON.parse(socket.lastMessage);
  socket.dispatchEvent(new MessageEvent("message", {
    data: JSON.stringify({ id, result: { value: "ok" } }),
  }));
  assert.deepEqual(await response, { value: "ok" });
  connected.close();
});
