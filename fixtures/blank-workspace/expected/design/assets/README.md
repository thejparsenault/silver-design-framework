# Project assets

Register reusable assets in `catalog.json` before using them. Store project-wide
source renditions under `shared/`. Prototype-only experiments belong inside the
prototype that owns them; production projections belong under `production/`.

Moving an asset between those scopes is an explicit promotion. Record the new
catalog entry, provenance, license, restrictions, and integrity rather than
silently copying a prototype-local file into production.
