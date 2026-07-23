#!/usr/bin/env python3
"""Validate v1 schemas and their first blank-workspace fixtures."""

from __future__ import annotations

import copy
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

import jsonschema
from referencing import Registry, Resource
import yaml


ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = ROOT / "framework" / "schemas" / "v1"
WORKSPACE = ROOT / "fixtures" / "blank-workspace" / "expected"


class StringDateSafeLoader(yaml.SafeLoader):
    """SafeLoader variant that leaves ISO dates as strings for JSON Schema."""


for first_char, resolvers in copy.deepcopy(
    StringDateSafeLoader.yaml_implicit_resolvers
).items():
    StringDateSafeLoader.yaml_implicit_resolvers[first_char] = [
        resolver
        for resolver in resolvers
        if resolver[0] != "tag:yaml.org,2002:timestamp"
    ]


def load_yaml(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return yaml.load(handle, Loader=StringDateSafeLoader)


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_frontmatter(path: Path) -> dict[str, Any]:
    content = path.read_text(encoding="utf-8")
    match = re.match(r"\A---\s*\n(.*?)\n---(?:\s*\n|\Z)", content, re.DOTALL)
    if not match:
        raise ValueError(f"{path.relative_to(ROOT)} has no YAML frontmatter")
    data = yaml.load(match.group(1), Loader=StringDateSafeLoader)
    if not isinstance(data, dict):
        raise ValueError(f"{path.relative_to(ROOT)} frontmatter is not an object")
    return data


def integrity(path: Path) -> str:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return f"sha256:{digest}"


def main() -> int:
    schema_paths = sorted(SCHEMA_DIR.glob("*.schema.json"))
    schemas = {path.name: load_json(path) for path in schema_paths}

    registry = Registry()
    for schema in schemas.values():
        jsonschema.Draft202012Validator.check_schema(schema)
        registry = registry.with_resource(
            schema["$id"], Resource.from_contents(schema)
        )

    def validate(instance: Any, schema_name: str, label: str) -> None:
        validator = jsonschema.Draft202012Validator(
            schemas[schema_name],
            registry=registry,
            format_checker=jsonschema.Draft202012Validator.FORMAT_CHECKER,
        )
        errors = sorted(validator.iter_errors(instance), key=lambda error: list(error.path))
        if errors:
            details = "\n".join(
                f"  - {'/'.join(map(str, error.path)) or '<root>'}: {error.message}"
                for error in errors
            )
            raise ValueError(f"{label} failed {schema_name}:\n{details}")

    manifest_path = WORKSPACE / "design" / "manifest.yaml"
    manifest = load_yaml(manifest_path)
    validate(manifest, "manifest.schema.json", str(manifest_path.relative_to(ROOT)))

    artifact_by_id = {}
    for mapping in manifest["artifacts"]:
        artifact_path = WORKSPACE / mapping["path"]
        if not artifact_path.is_file():
            raise ValueError(f"Mapped artifact does not exist: {mapping['path']}")
        if mapping["kind"] == "permission-policy":
            continue
        metadata = load_frontmatter(artifact_path)
        validate(
            metadata,
            "artifact.schema.json",
            str(artifact_path.relative_to(ROOT)),
        )
        for field in ("id", "kind", "scope", "status"):
            if metadata[field] != mapping[field]:
                raise ValueError(
                    f"{mapping['path']} {field} disagrees with design/manifest.yaml"
                )
        if mapping["id"] in artifact_by_id:
            raise ValueError(f"Duplicate artifact id: {mapping['id']}")
        artifact_by_id[mapping["id"]] = mapping

    permission_path = WORKSPACE / manifest["permission_policy"]
    validate(
        load_yaml(permission_path),
        "permission-policy.schema.json",
        str(permission_path.relative_to(ROOT)),
    )

    lock_path = WORKSPACE / ".design-framework" / "lock.yaml"
    lock = load_yaml(lock_path)
    validate(lock, "lock.schema.json", str(lock_path.relative_to(ROOT)))
    for managed in lock["managed_files"]:
        managed_path = WORKSPACE / managed["path"]
        if not managed_path.is_file():
            raise ValueError(f"Managed file does not exist: {managed['path']}")
        expected = managed.get("base_integrity")
        if expected and integrity(managed_path) != expected:
            raise ValueError(f"Managed-file integrity is stale: {managed['path']}")

    validate(
        load_yaml(ROOT / "fixtures" / "contracts" / "valid" / "skill-brand.yaml"),
        "skill.schema.json",
        "fixtures/contracts/valid/skill-brand.yaml",
    )
    check_result = load_json(
        ROOT
        / "fixtures"
        / "contracts"
        / "valid"
        / "check-result-not-run.json"
    )
    validate(
        check_result,
        "check-result.schema.json",
        "fixtures/contracts/valid/check-result-not-run.json",
    )
    if any(
        finding["status"] != check_result["status"]
        for finding in check_result["findings"]
    ):
        raise ValueError("Check-result status disagrees with one or more findings")

    negative_cases = [
        (
            load_yaml(
                ROOT
                / "fixtures"
                / "contracts"
                / "invalid"
                / "manifest-unknown-field.yaml"
            ),
            "manifest.schema.json",
        ),
        (
            load_json(
                ROOT
                / "fixtures"
                / "contracts"
                / "invalid"
                / "check-result-pass-with-finding.json"
            ),
            "check-result.schema.json",
        ),
        (
            load_yaml(
                ROOT
                / "fixtures"
                / "contracts"
                / "invalid"
                / "permission-invalid-action.yaml"
            ),
            "permission-policy.schema.json",
        ),
    ]
    for instance, schema_name in negative_cases:
        validator = jsonschema.Draft202012Validator(
            schemas[schema_name], registry=registry
        )
        if validator.is_valid(instance):
            raise ValueError(f"Negative fixture unexpectedly passed {schema_name}")

    print(
        "Validated "
        f"{len(schemas)} schemas, "
        f"{len(manifest['artifacts'])} mapped artifacts, "
        "2 valid contract examples, and "
        f"{len(negative_cases)} negative fixtures."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, jsonschema.SchemaError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
