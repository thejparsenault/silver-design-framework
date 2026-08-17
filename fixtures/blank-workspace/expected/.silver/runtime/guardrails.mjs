export function indexGuardrails(registry) {
  const index = new Map();
  for (const guardrail of registry.guardrails) {
    if (index.has(guardrail.id)) {
      throw new Error(`Duplicate guardrail id: ${guardrail.id}`);
    }
    index.set(guardrail.id, guardrail);
  }
  return index;
}

export function resolveGuardrails({
  registry,
  required,
  relaxations = [],
}) {
  const index = indexGuardrails(registry);
  const requested = new Map(
    relaxations.map((relaxation) => [relaxation.id, relaxation]),
  );
  const evaluations = [];
  for (const id of required) {
    const guardrail = index.get(id);
    if (!guardrail) {
      throw new Error(`Unknown guardrail id: ${id}`);
    }
    const relaxation = requested.get(id);
    if (!relaxation) {
      evaluations.push({ id, status: "pass" });
      continue;
    }
    if (!guardrail.relaxable) {
      throw new Error(`Guardrail ${id} is non-relaxable.`);
    }
    if (
      !guardrail.relaxation.allowed_profiles.includes(relaxation.profile)
    ) {
      throw new Error(
        `Guardrail ${id} cannot be relaxed for profile ${relaxation.profile}.`,
      );
    }
    if (!relaxation.decision_reference) {
      throw new Error(
        `Guardrail ${id} relaxation requires a decision reference.`,
      );
    }
    evaluations.push({
      id,
      status: "relaxed",
      reason: relaxation.reason,
      decision_reference: relaxation.decision_reference,
    });
  }
  for (const relaxation of relaxations) {
    if (!required.includes(relaxation.id)) {
      throw new Error(
        `Cannot relax guardrail ${relaxation.id}; the skill did not declare it.`,
      );
    }
  }
  return evaluations;
}
