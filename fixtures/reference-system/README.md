# Reference System

This is the framework's editable demonstration design system and validation
fixture. It is not the framework itself and is not intended to be a universal
starting identity.

It demonstrates:

- DTCG token sources with primitive, semantic, and component layers;
- generated CSS custom properties and an optional Tailwind v4 adapter;
- HTML/CSS component contracts;
- scheme and semantic-mode behavior;
- a static, renderable example.

The compiled CSS and token outputs are included, so the static example works
immediately after workspace setup:

```sh
python3 -m http.server 4173 --directory reference-system
```

Then open
`http://localhost:4173/examples/static-html/login-form.html`.

When token sources change, rebuild from the reference-system directory:

```sh
cd reference-system
npm install
npm run build
```

The system is project-owned when installed into a blank workspace. Brand and
theme work may deliberately edit or extend it, and meaningful canonical changes
should be recorded in the workspace decision log.
