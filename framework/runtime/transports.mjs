// Choosing a transport for an activity.
//
// One order and two filters:
//
//   ORDER    personal -> project -> team -> framework. The first source that
//            binds an activity wins outright. Sources are not merged, because a
//            half-merged preference is one nobody wrote.
//
//   FILTER   veto, then availability. A veto comes from a project, team,
//            organization, or machine policy and cannot be waived by preferring
//            something. Availability is whether the transport is actually there.
//
// Then one question. The chain is an *offer list*, not an auto-fallback list:
// when the preferred transport is gone, Silver reports why and asks rather than
// quietly using the next one. Every transport that was removed is named, with
// its reason and who can fix it, because a silently narrowed set of options is
// indistinguishable from a broken tool — and the designer's agency is the point.
import { providersForActivity } from "./activities.mjs";

export const PREFERENCE_SOURCES = ["personal", "project", "team", "framework"];

// Prefer what is already configured, then what needs no local build. This is
// deliberately thin: there is no vetted source of tool rankings, and a heuristic
// that cannot be defended is worse than none. It gets stronger from real use.
function localBuildSteps(provider) {
  return (provider.setup ?? []).filter(
    (step) => step.kind === "terminal" || step.kind === "background-process",
  ).length;
}

export function frameworkOrder(providers, activity) {
  return providersForActivity(providers, activity)
    .slice()
    .sort((left, right) => {
      if (left.available !== right.available) return left.available ? -1 : 1;
      const build = localBuildSteps(left) - localBuildSteps(right);
      if (build !== 0) return build;
      return left.id.localeCompare(right.id);
    })
    .map((provider) => provider.id);
}

// Why this transport and not another. A resolver with an order and two filters
// is undebuggable without an answer, and "alphabetical" is an answer a designer
// deserves to be told rather than left to infer.
export function explainSelection({ provider, orderedBy, decision }) {
  if (!provider) return null;
  const reasons = [];
  if (orderedBy === "framework") {
    if (provider.available) reasons.push("it is configured");
    if (localBuildSteps(provider) === 0) reasons.push("it needs no local build");
    // Say the quiet part. A tie broken by name is not a judgement about quality,
    // and letting a designer believe otherwise is the whole problem with an
    // unexplained default.
    if (reasons.length === 0) {
      reasons.push("nothing distinguished the candidates, so they were ordered by name");
    }
  } else {
    reasons.push(`the ${orderedBy} preference asked for it`);
  }
  return {
    ordered_by: orderedBy,
    because: reasons,
    ...(decision === "fallback" ? { note: "This is a fallback, not the first choice." } : {}),
    ...(provider.guidance?.prefer_when ? { prefer_when: provider.guidance.prefer_when } : {}),
  };
}

function bindingFor(sources, activityId) {
  for (const { source, preferences } of sources) {
    const binding = preferences?.activities?.[activityId];
    if (binding) return { source, ...binding };
  }
  return null;
}

function vetoesFor(sources) {
  const vetoes = new Map();
  for (const { source, preferences } of sources) {
    for (const entry of preferences?.forbid ?? []) {
      // First source to forbid a transport owns the explanation. Ordering runs
      // most-local first, so a project reason beats a team one for the same
      // transport, which is the more actionable of the two.
      if (!vetoes.has(entry.transport)) {
        vetoes.set(entry.transport, {
          source,
          reason: entry.reason,
          fixable_by: entry.fixable_by ?? "policy-owner",
        });
      }
    }
  }
  return vetoes;
}

// Availability said the transport is not usable; the ladder says where it
// stopped. Report a rung Silver actually checked in preference to one it merely
// could not rule out — "the server is not declared in your host" is actionable,
// "the plugin might not be running" is a guess.
function firstFailingStep(provider) {
  const steps = provider.setup ?? [];
  const silverVerified = steps.find((step) => step.verify?.by === "silver");
  if (silverVerified && provider.availability_level === "absent") {
    return silverVerified.id;
  }
  const agentVerified = steps.find((step) => step.verify?.by === "agent");
  return (agentVerified ?? silverVerified ?? steps[steps.length - 1])?.id;
}

// Resolve one activity. Returns what was chosen, what was removed and why, and
// whether a question has to be put to the designer before anything runs.
export function resolveActivityTransport({
  activity,
  providers,
  sources = [],
  interactive = true,
}) {
  const binding = bindingFor(sources, activity.id);
  const chain = binding ? binding.use : frameworkOrder(providers, activity);
  const orderedBy = binding ? binding.source : "framework";
  const onUnavailable = binding?.on_unavailable ?? "ask";
  const vetoes = vetoesFor(sources);
  const byId = new Map(providers.map((provider) => [provider.id, provider]));

  const removed = [];
  const surviving = [];

  for (const id of chain) {
    const provider = byId.get(id);
    if (!provider) {
      removed.push({
        transport: id,
        reason: "unknown",
        detail: "No provider package with this id is installed.",
        fixable_by: "designer",
      });
      continue;
    }
    const veto = vetoes.get(id);
    if (veto) {
      removed.push({
        transport: id,
        reason: "vetoed",
        source: veto.source,
        detail: veto.reason,
        fixable_by: veto.fixable_by,
      });
      continue;
    }
    if (!providersForActivity([provider], activity).length) {
      removed.push({
        transport: id,
        reason: "unsupported",
        detail: `${id} does not support ${activity.title.toLowerCase()}.`,
        fixable_by: "designer",
      });
      continue;
    }
    if (!provider.available) {
      removed.push({
        transport: id,
        // "Unavailable" would overstate what Silver knows about a transport it
        // cannot see at all — an agent's built-in browser has no server to look
        // for. Reporting that as missing is the same mistake as reporting a veto
        // as a breakage: the designer cannot tell what to do about it.
        reason: provider.availability_level === "unknown" ? "undetermined" : "unavailable",
        detail: provider.availability_reason,
        failing_step: firstFailingStep(provider),
        // Every rung of a setup ladder is the designer's: Silver writes host
        // config with approval and never installs, launches, or authorizes.
        fixable_by: "designer",
      });
      continue;
    }
    surviving.push(id);
  }

  const base = {
    activity: activity.id,
    title: activity.title,
    ordered_by: orderedBy,
    chain,
    removed,
    on_unavailable: onUnavailable,
  };

  if (surviving.length === 0) {
    // Nothing to offer. `candidates` names shipped transports that could serve
    // this activity if they were set up, so the answer is "here is what would
    // work" rather than a bare absence.
    return {
      ...base,
      selected: null,
      decision: "none",
      candidates: providersForActivity(providers, activity).map(({ id }) => id),
    };
  }

  const preferred = surviving[0] === chain[0];
  if (preferred) return { ...base, selected: surviving[0], decision: "selected" };

  // The preferred transport is gone but something below it survives. This is the
  // moment that must not be silent.
  if (onUnavailable === "use_next") {
    return { ...base, selected: surviving[0], decision: "fallback" };
  }
  if (onUnavailable === "stop" || !interactive) {
    return {
      ...base,
      selected: null,
      decision: "stop",
      would_select: surviving[0],
      ...(interactive
        ? {}
        : { reason: "No one can be asked in a non-interactive run." }),
    };
  }
  return { ...base, selected: null, decision: "ask", options: surviving };
}
