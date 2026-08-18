import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { checkResult, findFiles, finding, parseYaml, workspacePath } from "./check-lib.mjs";

let runtime;
async function representationRuntime() {
  if (runtime) return runtime;
  try {
    runtime = await import("silver-design-framework/framework/runtime/representations.mjs");
  } catch {
    try {
      runtime = await import("../../../.silver/runtime/representations.mjs");
    } catch {
      runtime = await import("../../../runtime/representations.mjs");
    }
  }
  return runtime;
}

const sha = (content) =>
  `sha256:${createHash("sha256").update(content).digest("hex")}`;

async function files(root, relative, extension) {
  return findFiles(path.join(root, relative), (file) => file.endsWith(extension));
}

function issue(checker, message, file, rule = checker) {
  return finding({ checker, rule: `${checker}.${rule}`, message, file });
}

async function bindings(root) {
  const output = [];
  for (const absolute of await files(root, "design/integrations", ".yaml")) {
    output.push({
      absolute,
      relative: workspacePath(root, absolute),
      content: await readFile(absolute, "utf8"),
    });
  }
  return output;
}

async function reconciliationJson(root, kind) {
  const relative = `.silver/results/reconciliation/${kind}`;
  return Promise.all(
    (await files(root, relative, ".json")).map(async (absolute) => ({
      absolute,
      relative: workspacePath(root, absolute),
      content: await readFile(absolute, "utf8"),
    })),
  );
}

const ruleHandlers = {
  async "binding-integrity"(root, checker, completed, findings) {
    const items = await bindings(root);
    if (items.length === 0) return;
    const { validateBinding } = await representationRuntime();
    for (const item of items) {
      completed.push(item.relative);
      try {
        const value = parseYaml(item.content);
        await validateBinding(value);
        if (path.basename(item.relative, ".yaml") !== value.id) {
          findings.push(issue(checker, "Binding filename must match its stable ID.", item.relative));
        }
      } catch (error) {
        findings.push(issue(checker, error.message, item.relative));
      }
    }
  },
  async "provider-revision-pins"(root, checker, completed, findings) {
    for (const item of await bindings(root)) {
      completed.push(item.relative);
      try {
        const value = parseYaml(item.content);
        const pins = [
          value.provider?.revision,
          value.artifact?.revision,
          value.last_reconciled?.portable_revision,
          value.last_reconciled?.external_revision,
        ];
        if (pins.some((pin) => !pin)) {
          findings.push(issue(checker, "Binding is missing a portable or provider revision pin.", item.relative));
        }
      } catch (error) {
        findings.push(issue(checker, error.message, item.relative));
      }
    }
  },
  async "view-provenance"(root, checker, completed, findings) {
    const roots = ["design/flows", "design/work/sketches", "design/work/visualizations", "design/system", "prototypes", "presentations"];
    const html = (await Promise.all(roots.map((relative) => files(root, relative, ".html")))).flat();
    for (const absolute of html) {
      const content = await readFile(absolute, "utf8");
      if (!content.includes("data-silver-target=")) continue;
      const relative = workspacePath(root, absolute);
      completed.push(relative);
      for (const attribute of [
        "data-source-id",
        "data-source-revision",
        "data-renderer-version",
        "data-assets-revision",
        "data-design-system-revision",
      ]) {
        if (!new RegExp(`${attribute}="[^"]+"`).test(content)) {
          findings.push(issue(checker, `Generated view is missing ${attribute}.`, relative, "missing-pin"));
        }
      }
      if (/https?:\/\//.test(content)) {
        findings.push(issue(checker, "Portable local view depends on a hosted resource.", relative, "hosted-dependency"));
      }
    }
  },
  async "synchronization-status"(root, checker, completed, findings) {
    for (const item of await reconciliationJson(root, "results")) {
      completed.push(item.relative);
      try {
        const value = JSON.parse(item.content);
        const states = new Set(["current", "view-stale", "external-changed", "diverged", "unmapped", "unverified", "conflict"]);
        if (!states.has(value.state)) findings.push(issue(checker, "Unknown synchronization state.", item.relative));
        if (["unverified", "unmapped", "conflict"].includes(value.state) && value.status === "applied") {
          findings.push(issue(checker, "An unsafe synchronization state cannot be applied.", item.relative));
        }
      } catch (error) {
        findings.push(issue(checker, error.message, item.relative));
      }
    }
  },
  async "semantic-mapping"(root, checker, completed, findings) {
    for (const item of await reconciliationJson(root, "change-sets")) {
      completed.push(item.relative);
      try {
        const value = JSON.parse(item.content);
        for (const change of value.changes ?? []) {
          if (
            ["unknown-style", "unknown-component", "unmapped"].includes(change.classification) &&
            (change.operation !== "finding" || change.unresolved.length === 0)
          ) {
            findings.push(issue(checker, `Unmapped change ${change.id} must remain a finding with unresolved detail.`, item.relative));
          }
          if (
            !["unknown-style", "unknown-component", "unmapped"].includes(change.classification) &&
            change.mapping_fidelity === "unmapped"
          ) {
            findings.push(issue(checker, `Mapped change ${change.id} reports unmapped fidelity.`, item.relative));
          }
        }
      } catch (error) {
        findings.push(issue(checker, error.message, item.relative));
      }
    }
  },
  async "stale-proposals"(root, checker, completed, findings) {
    for (const item of await reconciliationJson(root, "results")) {
      completed.push(item.relative);
      try {
        const value = JSON.parse(item.content);
        const changeAbsolute = path.join(root, value.change_set_path);
        const changeContent = await readFile(changeAbsolute, "utf8");
        if (sha(changeContent) !== value.change_set_integrity) {
          findings.push(issue(checker, "Reconciliation result pins a stale change set.", item.relative));
          continue;
        }
        if (value.status === "accepted") {
          const changeSet = JSON.parse(changeContent);
          for (const change of changeSet.changes.filter(({ id }) => value.accepted_operations.includes(id))) {
            const target = await readFile(path.join(root, change.proposal.target_path), "utf8");
            if (sha(target) !== change.proposal.expected_integrity) {
              findings.push(issue(checker, `Accepted operation ${change.id} has stale target integrity.`, item.relative));
            }
          }
        }
      } catch (error) {
        findings.push(issue(checker, error.message, item.relative));
      }
    }
  },
  async authority(root, checker, completed, findings) {
    for (const item of await bindings(root)) {
      completed.push(item.relative);
      try {
        const value = parseYaml(item.content);
        if (value.authority === "external" && value.authority_provider !== value.provider?.id) {
          findings.push(issue(checker, "Externally authoritative binding must name its provider.", item.relative));
        }
        if (value.authority === "local" && value.authority_provider) {
          findings.push(issue(checker, "Local authority cannot name an external authority provider.", item.relative));
        }
      } catch (error) {
        findings.push(issue(checker, error.message, item.relative));
      }
    }
  },
  async "secret-free-configuration"(root, checker, completed, findings) {
    const items = await bindings(root);
    if (items.length === 0) return;
    const { validateBinding } = await representationRuntime();
    for (const item of items) {
      completed.push(item.relative);
      try {
        await validateBinding(parseYaml(item.content));
      } catch (error) {
        if (/secret|credential|token|cookie|key/i.test(error.message)) {
          findings.push(issue(checker, error.message, item.relative));
        }
      }
    }
  },
};

export async function checkRepresentationRule({ root = process.cwd(), checker }) {
  const workspace = path.resolve(root);
  const completed = [];
  const findings = [];
  const handler = ruleHandlers[checker];
  if (!handler) throw new Error(`Unknown representation checker: ${checker}`);
  await handler(workspace, checker, completed, findings);
  return checkResult({
    checker,
    requested: [checker],
    completed,
    findings,
  });
}
