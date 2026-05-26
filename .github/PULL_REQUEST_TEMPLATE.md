<!--
Thanks for contributing! Please fill out every section.
Pull requests that don't follow this template may be closed without review.
-->

## Summary

<!-- One or two sentences. What does this PR do and why? -->

## Type of change

<!-- Check all that apply. -->

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ Feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that changes existing behavior)
- [ ] 📘 Documentation only
- [ ] 🔧 Build / CI / tooling
- [ ] 🧹 Refactor (no functional change)

## Related issues

<!-- e.g. Closes #123, Fixes #456, Relates to #789 -->

## What changed

<!--
Bullet the concrete changes. Mention any new files, removed files,
new dependencies, or DB migrations. Keep it tight.
-->

-
-

## Screenshots / recordings

<!-- For UI changes, attach before/after images or a short screen recording. Delete this section if not applicable. -->

## How to test

<!--
Describe how a reviewer can verify this works. Be specific:
"connect to a Postgres DB, open table X, click Y, expect Z."
-->

1.
2.

## Checklist

<!-- All items must be checked before review. If something doesn't apply, write "N/A — <reason>". -->

- [ ] I read [CONTRIBUTING.md](../CONTRIBUTING.md) and this PR follows the guidelines.
- [ ] The PR is focused on a single concern (no drive-by refactors mixed in).
- [ ] I updated `PROJECT.md` if this changes scope, adds a feature, or modifies a key constraint.
- [ ] I updated the roadmap checkbox in `PROJECT.md §11` if a feature moved state (`[ ] → [~] → [x]`).
- [ ] Frontend: `npx tsc --noEmit` passes.
- [ ] Backend: `cargo check` passes in `src-tauri/`.
- [ ] I tested the change locally with `npm run tauri dev`.
- [ ] No new outbound network calls (except to user-configured DB servers / LLM providers).
- [ ] No plaintext credentials are stored, logged, or shipped over IPC.
- [ ] SQL containing user input uses parameter binding, not string interpolation.

## Notes for reviewers

<!-- Anything tricky? Trade-offs you made? Areas you want extra scrutiny on? -->
