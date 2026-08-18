# Declared tools

Transports this project has told Silver about live in `transports/` as
`<server-name>.yaml`. Silver ships adapters for a few tools and knows the rest
only because you described them here.

A declaration is metadata: what the tool is, where it came from, what it is good
at, and how the agent reaches it. There are no scripts. The agent calls the
server's tools directly; Silver's job is to resolve the right transport for an
activity and stay out of the way.

Start one with `silver tools --declare <server>`. It scaffolds a file from a
server your agent host already has, and refuses to be read until every `TODO` is
replaced — a transport Silver knows nothing about is one it should not be
choosing for you.

A declared transport may not claim capabilities that need an adapter Silver
ships, such as writing canonical artifacts or production source. Those need code
somebody reviewed, not a name and an address.

Never store credentials, tokens, or environment values here.
