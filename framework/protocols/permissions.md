# Permission Resolution Protocol

Permission policies are independent layers. A tool provider is selected by the
user profile; a repository can restrict use of that provider but cannot select
one for the user or increase its authority.

For each requested `(capability, action, path)` tuple, resolve the effective
decision across:

```text
framework default
∩ user ceiling
∩ organization restriction
∩ repository restriction
∩ skill request
```

`deny` is stricter than `ask`, which is stricter than `allow`. A missing rule
does not grant authority. The framework default applies until a narrower layer
is present; the skill request is a requested upper bound, not a grant.

Examples:

- A user allows browser inspection and the repository allows it, but the skill
  does not request it: no browser access is granted.
- A skill requests production writes and the user allows them, but the
  repository says `ask`: approval is required.
- A repository says `allow` for pushes but the user ceiling says `deny`: the
  push is denied.

Path restrictions are intersected as well. Relative paths are resolved from the
workspace root after normalization. A path outside the workspace never matches
a repository rule.

Credentials are outside this protocol. Providers obtain authentication through
their own configuration, environment references, or operating-system
credential storage.
