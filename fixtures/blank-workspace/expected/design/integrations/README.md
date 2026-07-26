# Tool integrations

Project-owned representation bindings live here as `<binding-id>.yaml`.

Bindings identify portable artifacts and their local or external views. They
record authority, provider object IDs, revisions, mapping profiles, fidelity,
and the last reconciled base. Never store credentials, access tokens, cookies,
private keys, or environment values in this directory.

The default synchronization policy is `notify`: inspect and report drift,
then recommend reconciliation. Applying a proposal is always a separate,
explicitly accepted and permission-checked action.
