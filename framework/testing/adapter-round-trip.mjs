import assert from "node:assert/strict";

// A shared fixture-only harness any adapter's round-trip test can
// parameterize. Two properties every adapter that claims
// `round_trip: "lossless"` must actually have: pulling and pushing an
// unedited value is identity (an alias stays an alias), and a deliberate
// structural edit (an alias becoming a literal) is distinguishable from an
// ordinary value edit in what gets written. Neither property needs a live
// call to the external tool — both are true or false of the adapter's own
// pull/push functions against synthetic input.
//
// `items`: the pulled state, normalized to the one shape every adapter can
// produce — `{ id, value, is_alias }[]`.
// `push(items)`: how the adapter would write `items` back, returning
// `{ id, kind: "alias" | "literal" }[]`.
export async function assertRoundTripLossless({ items, push }) {
  if (items.length === 0) {
    throw new Error("assertRoundTripLossless needs at least one pulled item.");
  }

  const noop = await push(items);
  for (const original of items) {
    const written = noop.find((entry) => entry.id === original.id);
    assert.ok(written, `No write was produced for ${original.id}.`);
    const expectedKind = original.is_alias ? "alias" : "literal";
    assert.equal(
      written.kind,
      expectedKind,
      `A no-op push must reconstruct ${original.id} as it was pulled (${expectedKind}), not rewrite it as ${written.kind}.`,
    );
  }

  const aliasItem = items.find((item) => item.is_alias);
  if (aliasItem) {
    const structurallyEdited = items.map((item) =>
      item.id === aliasItem.id
        ? { ...item, value: "structural-edit-literal-override", is_alias: false }
        : item,
    );
    const afterEdit = await push(structurallyEdited);
    const writtenEdit = afterEdit.find((entry) => entry.id === aliasItem.id);
    assert.equal(
      writtenEdit.kind,
      "literal",
      `Hardcoding ${aliasItem.id} must write it as a literal, distinct from the alias it was.`,
    );
    const others = items.filter((item) => item.id !== aliasItem.id);
    for (const other of others) {
      const writtenOther = afterEdit.find((entry) => entry.id === other.id);
      assert.equal(
        writtenOther.kind,
        other.is_alias ? "alias" : "literal",
        `Editing ${aliasItem.id} structurally must not change how ${other.id} is written.`,
      );
    }
  }

  return { noop };
}
