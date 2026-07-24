# Flows

Portable flows live in one folder per flow:

```text
design/flows/<flow-id>/
  flow.json
  flow.mmd
```

Edit `flow.json`; `flow.mmd` is a generated view. Meaningful changes increment
the source revision so prototypes and component contracts can report when their
input is stale.
