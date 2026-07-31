// A stable subpath so copied workspace scripts can reach the YAML parser this
// package bundles. A file under `.skills/` cannot resolve a bare `yaml`
// specifier — Node walks ancestor node_modules from the importing file and
// never descends into a sibling package's private tree — but it can resolve
// `silver-design-framework/framework/runtime/yaml.mjs`, and from in here the
// bare specifier resolves normally.
export { parse, stringify } from "yaml";
