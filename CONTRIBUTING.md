# Contributing to Sequelit

Thanks for taking the time to contribute! This guide covers how to set up the project, the workflow for issues and pull requests, and the conventions the codebase uses.

---

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Getting set up](#getting-set-up)
- [Project layout](#project-layout)
- [Reporting bugs](#reporting-bugs)
- [Requesting features](#requesting-features)
- [Submitting a pull request](#submitting-a-pull-request)
- [Coding standards](#coding-standards)
- [Commit messages](#commit-messages)
- [Release process](#release-process)
- [License of contributions](#license-of-contributions)

---

## Code of conduct

Be respectful and constructive. Treat issues and PRs as collaboration, not transactions. Personal attacks, harassment, or discriminatory language will not be tolerated.

## Getting set up

### Prerequisites

- **Rust** (stable, install via [rustup](https://rustup.rs/))
- **Node 20+** and **npm**
- **System dependencies for Tauri 2** — see the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) for your OS
  - On Ubuntu: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `libsoup-3.0-dev`
  - On Windows: WebView2 (already on Win11; auto-installed otherwise)
  - On macOS: Xcode Command Line Tools

### Run the dev build

```bash
git clone https://github.com/lokendrasoni/sequelit.git
cd sequelit
npm install
npm run tauri dev
```

The first build takes a few minutes (Rust dependencies). Subsequent builds are incremental.

### Production build

```bash
npm run tauri build
```

Bundle output: `src-tauri/target/release/bundle/`.

## Project layout

```
src/                  # React frontend (TypeScript)
  components/         # Reusable UI components
  features/           # Feature modules (editor, browser, erd, …)
  stores/             # Zustand state stores
  hooks/              # Custom React hooks
  lib/                # Utilities

src-tauri/            # Rust backend
  src/
    commands/         # Tauri invoke handlers
    db/               # DB driver wrappers per engine
    crypto/           # AES-256-GCM encryption
    config/           # Local SQLite config store
    session/          # Session timeout management

PROJECT.md            # Feature spec + roadmap (source of truth)
CLAUDE.md             # AI-assistant instructions (irrelevant for human contributors)
```

The single source of truth for what the app does is **`PROJECT.md`**. Anything you propose should fit into that spec — or update the spec as part of the PR.

## Reporting bugs

1. **Search [existing issues](../../issues)** before opening a new one.
2. Use the **🐛 Bug report** template.
3. Include:
   - What you expected vs. what happened
   - Steps to reproduce (minimal, deterministic)
   - Your OS + Sequelit version (Settings → About, or check `src-tauri/tauri.conf.json`)
   - The database you connected to (engine + major version)
   - Console / log output if available

Bugs without reproduction steps will be labeled `needs-repro` and closed if no further info is provided within 14 days.

## Requesting features

1. Search [existing issues](../../issues) and [discussions](../../discussions) first.
2. Use the **✨ Feature request** template.
3. Explain the **use case** before the implementation. A request like *"add support for tracking lock waits per query"* is much more useful than *"add column X to dashboard"*.
4. If the feature is large, open a [Discussion](../../discussions) first to align on scope before any implementation work.

## Submitting a pull request

### Branch naming

Use a short, descriptive branch off `master`:

```
feat/inline-cell-edit
fix/uuid-decode-error
docs/contributing-guide
chore/bump-tauri-2-1
```

### Workflow

1. **Fork** the repo, then clone your fork.
2. Create a feature branch: `git checkout -b feat/your-feature`.
3. Make focused commits (see [Commit messages](#commit-messages)).
4. **Test locally** — both the dev build (`npm run tauri dev`) and at minimum `cargo check` for backend changes.
5. Push and open a PR against `master`.
6. Fill out the PR template completely.
7. Address review feedback by pushing new commits (don't force-push during review — squash on merge instead).

### What a good PR looks like

- **Small and focused.** One feature or bugfix per PR. If you found unrelated cleanup along the way, save it for a separate PR.
- **Updates `PROJECT.md`** if it changes scope, adds a feature, or alters a key constraint.
- **Updates the roadmap checkbox** in `PROJECT.md §11` if a feature moves from `[ ]` → `[~]` → `[x]`.
- **Doesn't break the constraints** in the spec — local-first, encrypted credentials, no telemetry, AGPL-3.0 compatible licensing, no paywalls.
- **Type-checks and compiles.** Run `npx tsc --noEmit` (frontend) and `cargo check` (in `src-tauri/`) before pushing.

### Reviewing

PRs need at least one approving review from a maintainer before merge. Reviews focus on:
- Correctness and edge cases
- Alignment with `PROJECT.md`
- Security (especially around SQL building, file paths, IPC)
- UX consistency

## Coding standards

### TypeScript / React

- Functional components with hooks. No class components.
- State management: **Zustand** for app-level state, local `useState` otherwise.
- UI components: **shadcn/ui + Tailwind**. Don't introduce alternative UI libraries.
- SQL editor: **CodeMirror 6**.
- Charts: **Recharts**.
- Keep file size sane — split modules around 300–400 lines.
- No `any` unless interfacing with an untyped API; even then, narrow at the boundary.

### Rust

- Errors propagate via `Result<T, String>` at the Tauri command boundary (matches the existing pattern). Use `anyhow` or `thiserror` internally if helpful.
- Database queries that take user input **must use parameter binding**. Never interpolate user values into SQL strings.
- Pool/mutex guards must be dropped before `.await`. The pattern `let pool = { let g = state.db_pools.lock().unwrap(); g.get(...).clone() };` is standard.
- New commands go in `src-tauri/src/commands/` and are registered in `src-tauri/src/lib.rs`.

### Security

- Credentials are encrypted at rest (AES-256-GCM via `ring`). Never log them. Never write them to plaintext files.
- Session timeout default is 1 hour. Don't add code paths that bypass `is_expired()`.
- No outbound HTTP calls except to user-configured DB servers and LLM providers.
- AI features remain **opt-in**.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(editor): add multi-line autocomplete for joins
fix(data-browser): restore real types for casted PG columns
chore: bump tauri to 2.10
docs(readme): document mac quarantine workaround
```

Common scopes: `editor`, `data-browser`, `schema`, `erd`, `dashboard`, `roles`, `config`, `crypto`, `release`, `docs`.

- Keep the subject line under 72 chars.
- Use imperative mood (*"add"*, not *"added"*).
- Reference issues in the body: `Closes #123`.

## Release process

Releases are cut by maintainers via a manual GitHub Actions workflow:

1. Go to **Actions → Release → Run workflow**.
2. Pick a bump type:
   - `patch` — bug fixes only (0.2.0 → 0.2.1)
   - `minor` — backwards-compatible features (0.2.0 → 0.3.0)
   - `major` — breaking changes (0.2.0 → 1.0.0)
   - `no-bump` — rebuild and replace assets on the existing tag (no version change)
3. The workflow updates `tauri.conf.json` + `Cargo.toml`, commits, tags, builds for macOS / Linux / Windows in parallel, and publishes a GitHub Release with the bundled installers attached.

Contributors don't need to bump versions in PRs — that happens at release time.

## License of contributions

By submitting a contribution, you agree that it will be licensed under the [GNU AGPL-3.0](LICENSE), the same as the rest of the project.

---

Questions? Open a [Discussion](../../discussions) — they're better than ad-hoc DMs for anything other contributors might also benefit from.
