#!/usr/bin/env node
let runtime;
try {
  runtime = await import("silver-design-framework/framework/runtime/invoke-skill.mjs");
} catch {
  try {
    runtime = await import("../../../.silver/runtime/invoke-skill.mjs");
  } catch {
    runtime = await import("../../../runtime/invoke-skill.mjs");
  }
}
runtime.runSkillCli({ skillDirectory: new URL("..", import.meta.url), args: process.argv.slice(2) }).then((code) => { process.exitCode = code; });
