import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DevTools, runBrowserSuite } from "../skills/design-check/scripts/run-browser.mjs";
import { setupWorkspace } from "../../installer/setup.mjs";

test("declared local release target passes real browser checks", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-browser-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({ root, name: "Browser fixture", id: "browser-fixture", date: "2026-07-24" });
  const result = await runBrowserSuite({ root });
  assert.equal(result.status, "pass", JSON.stringify(result, null, 2));
  assert.equal(result.browser.provider, "chrome-cdp");
  assert.match(result.browser.version, /Chrome/);
  assert.deepEqual(result.results.map(({ checker }) => checker), [
    "accessibility",
    "responsive-behavior",
    "critical-interactions",
  ]);
  assert.ok(result.results.every(({ status }) => status === "pass"));
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
