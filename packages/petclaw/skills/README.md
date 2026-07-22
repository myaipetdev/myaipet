# Bundled manifest examples

This directory contains selected, reviewed examples from the live registry. It
is not the full 18-skill catalog and files here are not auto-installed merely by
being present in the npm package.

The server is the capability source of truth:

```bash
petclaw-sdk skills
curl https://app.myaipet.ai/api/petclaw/skills
```

Autonomous posting and arbitrary server-side page fetching are not bundled as
launch skills. Community publishing is also disabled until provenance, review,
permission and sandbox contracts ship.
