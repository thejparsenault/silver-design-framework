import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { advisory, checkResult, findFiles, finding, parseYaml, workspacePath } from "./check-lib.mjs";

let runtime;
async function representationRuntime(injected) {
  if (injected) return injected;
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

let renderRuntime;
async function renderProvenanceRuntime(injected) {
  if (injected) return injected;
  if (renderRuntime) return renderRuntime;
  for (const specifier of [
    "silver-design-framework/framework/runtime/render-provenance.mjs",
    "../../../.silver/runtime/render-provenance.mjs",
    "../../../runtime/render-provenance.mjs",
  ]) {
    try {
      renderRuntime = await import(specifier);
      return renderRuntime;
    } catch {
      // Try the next source/package/installed-workspace location.
    }
  }
  throw new Error("The shared render-provenance contract is unavailable.");
}

const sha = (content) =>
  `sha256:${createHash("sha256").update(content).digest("hex")}`;

async function files(root, relative, extension) {
  return findFiles(path.join(root, relative), (file) => file.endsWith(extension));
}

function issue(checker, message, file, rule = checker) {
  return finding({ checker, rule: `${checker}.${rule}`, message, file });
}

function issueAdvisory(checker, message, file, rule = checker) {
  return advisory({ checker, rule: `${checker}.${rule}`, message, file });
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

async function bindingMap(root) {
  return new Map((await bindings(root)).map((item) => {
    const value = parseYaml(item.content);
    return [value.id, { ...item, value }];
  }));
}

async function sourceRegistry(root) {
  try {
    return parseYaml(await readFile(path.join(root, "design/sources/sources.yaml"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { sources: [] };
    throw error;
  }
}

function safeWorkspacePath(root, relativePath) {
  const workspace = path.resolve(root);
  const absolute = path.resolve(workspace, relativePath);
  if (absolute !== workspace && !absolute.startsWith(`${workspace}${path.sep}`)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }
  return absolute;
}

async function observedIdentity(absolute) {
  try {
    return { state: "present", integrity: sha(await readFile(absolute)) };
  } catch (error) {
    if (error.code === "ENOENT") return { state: "missing" };
    throw error;
  }
}

async function compareIdentity({ expected, absolute, operationId, item, checker, findings, label }) {
  const observed = await observedIdentity(absolute);
  const stale = expected?.state !== observed.state || (
    expected?.state === "present" && expected.integrity !== observed.integrity
  );
  if (stale) {
    findings.push(issue(checker, `${label} for operation ${operationId} changed after inspection.`, item.relative));
  }
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
  async "binding-integrity"(root, checker, completed, findings, runtime) {
    const items = await bindings(root);
    if (items.length === 0) return;
    const { validateBinding } = await representationRuntime(runtime?.representations);
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
    const registry = await sourceRegistry(root);
    for (const item of await bindings(root)) {
      completed.push(item.relative);
      try {
        const value = parseYaml(item.content);
        let missing = false;
        if (value.schema === "silver/representation-binding/v2") {
          missing = !value.artifact?.revision;
          if (value.counterpart?.type === "provider") missing ||= !value.counterpart.revision;
          if (value.counterpart?.type === "linked-source" && value.base?.state === "uninitialized") {
            const source = registry.sources?.find(({ id }) => id === value.counterpart.source_id);
            missing ||= !source?.source?.revision || !source?.source?.integrity;
          }
          if (value.base?.state === "initialized") {
            for (const identity of [value.base.local, value.base.external]) {
              if (identity?.state === "present") missing ||= !identity.revision || !identity.integrity;
            }
          }
        } else {
          missing = [
            value.provider?.revision,
            value.artifact?.revision,
            value.last_reconciled?.portable_revision,
            value.last_reconciled?.external_revision,
          ].some((pin) => !pin);
        }
        if (missing) {
          findings.push(issue(checker, "Binding is missing a portable or provider revision pin.", item.relative));
        }
      } catch (error) {
        findings.push(issue(checker, error.message, item.relative));
      }
    }
  },
  async "render-provenance"(root, checker, completed, findings, runtime, advisories) {
    const { inspectRenderProvenance } = await renderProvenanceRuntime(runtime?.renderProvenance);
    const roots = ["design/flows", "design/work/sketches", "design/work/visualizations", "design/system", "prototypes", "presentations"];
    const html = (await Promise.all(roots.map((relative) => files(root, relative, ".html")))).flat();
    const expectedRenders = new Map();
    for (const artifactPath of await files(root, "design/work/visualizations", ".json")) {
      try {
        const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
        if (artifact.schema !== "silver/working-artifact/v2" || artifact.kind !== "visualization") continue;
        const renders = artifact.payload?.renders ?? (
          artifact.payload?.view_path
            ? [{ medium: "local", format: "html", path: artifact.payload.view_path }]
            : []
        );
        for (const render of renders) {
          if (render.medium !== "local" || render.format !== "html" || !render.path) continue;
          const absolute = safeWorkspacePath(root, render.path);
          expectedRenders.set(absolute, {
            target: "visualization",
            id: artifact.id,
            revision: artifact.revision,
            status: artifact.status,
          });
        }
      } catch (error) {
        findings.push(issue(checker, error.message, workspacePath(root, artifactPath), "invalid-visualization"));
      }
    }
    for (const [absolute, expected] of expectedRenders) {
      if (!html.includes(absolute)) {
        // A draft visualization can declare a render before the file exists — that is
        // work in progress, not a defect; once it is active or accepted, someone can be
        // sent to review it, and a missing render there is worth a real finding.
        const message = "Declared local visualization HTML is unavailable.";
        const relative = workspacePath(root, absolute);
        if (expected.status === "draft") {
          advisories.push(issueAdvisory(checker, message, relative, "missing-render"));
        } else {
          findings.push(issue(checker, message, relative, "missing-render"));
        }
      }
    }
    for (const absolute of new Set([...html, ...expectedRenders.keys()])) {
      let content;
      try {
        content = await readFile(absolute, "utf8");
      } catch {
        continue;
      }
      const expected = expectedRenders.get(absolute);
      if (!expected && !content.includes("data-silver-target=")) continue;
      const relative = workspacePath(root, absolute);
      completed.push(relative);
      for (const message of inspectRenderProvenance(content, expected)) {
        findings.push(issue(checker, message, relative, "missing-pin"));
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
        const states = new Set(
          value.schema === "silver/reconciliation-result/v2"
            ? ["uninitialized", "current", "local-changed", "external-changed", "diverged", "conflict", "unmapped", "unverified"]
            : ["current", "view-stale", "external-changed", "diverged", "unmapped", "unverified", "conflict"],
        );
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
        const v2 = value.schema === "silver/change-set/v2";
        for (const change of (v2 ? value.operations : value.changes) ?? []) {
          const operation = v2 ? change.type : change.operation;
          if (
            (v2 ? ["unmapped", "conflict"] : ["unknown-style", "unknown-component", "unmapped"]).includes(change.classification) &&
            (operation !== "finding" || change.unresolved.length === 0)
          ) {
            findings.push(issue(checker, `Unmapped change ${change.id} must remain a finding with unresolved detail.`, item.relative));
          }
          if (
            !(v2 ? ["unmapped", "conflict"] : ["unknown-style", "unknown-component", "unmapped"]).includes(change.classification) &&
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
    const knownBindings = await bindingMap(root);
    const registry = await sourceRegistry(root);
    for (const item of await reconciliationJson(root, "results")) {
      completed.push(item.relative);
      try {
        const value = JSON.parse(item.content);
        const v2 = value.schema === "silver/reconciliation-result/v2";
        const proposalPath = v2 ? value.proposal_path : value.change_set_path;
        const proposalIntegrity = v2 ? value.proposal_integrity : value.change_set_integrity;
        const changeContent = await readFile(safeWorkspacePath(root, proposalPath), "utf8");
        if (sha(changeContent) !== proposalIntegrity) {
          findings.push(issue(checker, "Reconciliation result pins a stale change set.", item.relative));
          continue;
        }
        if (!v2 && value.status === "accepted") {
          const changeSet = JSON.parse(changeContent);
          for (const change of changeSet.changes.filter(({ id }) => value.accepted_operations.includes(id))) {
            const target = await readFile(path.join(root, change.proposal.target_path), "utf8");
            if (sha(target) !== change.proposal.expected_integrity) {
              findings.push(issue(checker, `Accepted operation ${change.id} has stale target integrity.`, item.relative));
            }
          }
        } else if (v2 && !["applied", "failed"].includes(value.status)) {
          const proposal = JSON.parse(changeContent);
          const bindingRecord = knownBindings.get(value.binding_id);
          if (!bindingRecord || bindingRecord.value.schema !== "silver/representation-binding/v2") {
            findings.push(issue(checker, "V2 reconciliation result has no live v2 binding.", item.relative));
            continue;
          }
          const binding = bindingRecord.value;
          const selected = value.status === "external-action-required"
            ? new Set(value.selected_operations)
            : null;
          const operations = (proposal.operations ?? []).filter(({ id, type }) =>
            !["finding", "no-op"].includes(type) && (!selected || selected.has(id))
          );
          for (const operation of operations) {
            if (proposal.direction === "external-to-local") {
              await compareIdentity({
                expected: operation.target_identity,
                absolute: safeWorkspacePath(root, operation.target_path),
                operationId: operation.id,
                item,
                checker,
                findings,
                label: "Local target",
              });
            } else {
              await compareIdentity({
                expected: operation.source_identity,
                absolute: safeWorkspacePath(root, operation.source_path),
                operationId: operation.id,
                item,
                checker,
                findings,
                label: "Local source",
              });
              if (binding.counterpart.type === "linked-source") {
                const source = registry.sources?.find(({ id }) => id === binding.counterpart.source_id);
                if (!source) {
                  findings.push(issue(checker, `Binding source ${binding.counterpart.source_id} is missing.`, item.relative));
                  continue;
                }
                const externalRoot = path.isAbsolute(source.source.reference)
                  ? source.source.reference
                  : path.resolve(root, source.source.reference);
                await compareIdentity({
                  expected: operation.target_identity,
                  absolute: path.resolve(externalRoot, binding.counterpart.path),
                  operationId: operation.id,
                  item,
                  checker,
                  findings,
                  label: "Linked-source target",
                });
              }
            }
          }
        }
      } catch (error) {
        findings.push(issue(checker, error.message, item.relative));
      }
    }
  },
  async authority(root, checker, completed, findings) {
    const registry = await sourceRegistry(root);
    for (const item of await bindings(root)) {
      completed.push(item.relative);
      try {
        const value = parseYaml(item.content);
        if (value.schema === "silver/representation-binding/v2" && value.counterpart?.type === "linked-source") {
          const source = registry.sources?.find(({ id }) => id === value.counterpart.source_id);
          if (!source) {
            findings.push(issue(checker, "Linked-source binding names a missing source.", item.relative));
          } else if (source.authority !== value.authority) {
            findings.push(issue(checker, "Binding authority does not match its linked source.", item.relative));
          }
        } else if (value.authority === "external" && value.authority_provider !== value.provider?.id) {
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
  async "secret-free-configuration"(root, checker, completed, findings, runtime) {
    const items = await bindings(root);
    if (items.length === 0) return;
    const { assertNoSecrets } = await representationRuntime(runtime?.representations);
    for (const item of items) {
      completed.push(item.relative);
      try {
        assertNoSecrets(parseYaml(item.content));
      } catch (error) {
        if (/secret|credential|token|cookie|key/i.test(error.message)) {
          findings.push(issue(checker, error.message, item.relative));
        }
      }
    }
  },
};

export async function checkRepresentationRule({ root = process.cwd(), checker, runtime }) {
  const workspace = path.resolve(root);
  const completed = [];
  const findings = [];
  const advisories = [];
  const handler = ruleHandlers[checker];
  if (!handler) throw new Error(`Unknown representation checker: ${checker}`);
  await handler(workspace, checker, completed, findings, runtime, advisories);
  return checkResult({
    checker,
    requested: [checker],
    completed,
    findings,
    advisories,
  });
}
