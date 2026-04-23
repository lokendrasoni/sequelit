# Sequelit — Claude Instructions

## Project Reference

**Always read `PROJECT.md` at the start of every session before doing any work.**

`PROJECT.md` is the single source of truth for this project. It contains:
- Full architecture decisions
- Complete feature specification (all 20 sections)
- Database support matrix
- UI/UX principles
- Development roadmap (Phase 1–4)

Do not implement, design, or suggest anything that contradicts `PROJECT.md` without first flagging the conflict and getting user approval to update the doc.

---

## Roadmap Tracking Rules

The roadmap in `PROJECT.md` under **Section 11 — Development Roadmap** uses checkboxes:
- `[ ]` — not started
- `[~]` — in progress
- `[x]` — completed

### When starting work on a feature:
1. Mark it `[~]` in `PROJECT.md` before writing any code.

### When a feature is fully implemented and verified:
1. Mark it `[x]` in `PROJECT.md`.
2. Do not mark complete unless the feature is actually working — not just scaffolded.

### When a feature is partially done:
- Leave it as `[~]` and add a brief inline note, e.g.:
  ```
  - [~] SQL Editor — core done, autocomplete pending
  ```

---

## New Requirements

When the user describes a new feature, change, or constraint:
1. Implement or plan it.
2. **Update `PROJECT.md`** to reflect the new requirement — add it to the relevant section and/or roadmap.
3. Never let `PROJECT.md` fall out of sync with what is actually being built.

---

## Incomplete Sections

Some sections in `PROJECT.md` may be marked with `<!-- TODO -->` or described at a high level without implementation detail. When working in an area that touches an incomplete section:
1. Flesh out the section with concrete detail before or during implementation.
2. Remove the `<!-- TODO -->` marker once the section is complete.

---

## Key Constraints (never violate without explicit user approval)

- **No server process** — everything runs locally via Tauri. No HTTP server, no daemon.
- **Credentials encrypted at rest** — AES-256-GCM. Never store plaintext passwords.
- **Session timeout = 1 hour** of inactivity (user-configurable, can be disabled).
- **All features are free and unlimited** — no paywalls, no usage caps, no tiers.
- **No telemetry, no analytics, no outbound calls** except to user-configured DB servers and LLM providers.
- **AI features are opt-in** — disabled by default until user configures a provider.
- **AGPL-3.0 license** — all code must be compatible.

---

## Tech Stack (do not switch without updating this file)

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2 (Rust) |
| Frontend | React 19 + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| SQL Editor | CodeMirror 6 |
| ERD | React Flow |
| State | Zustand |
| Local DB | SQLite (tauri-plugin-sql) |
| Encryption | AES-256-GCM (Rust, ring crate) |
| DB Drivers | sqlx, tiberius, others (see PROJECT.md §3) |
| Charts | Recharts |
| Terminal | xterm.js |

---

## File Structure Conventions

```
src/                  # React frontend
  components/         # Reusable UI components
  features/           # Feature-specific modules (editor, browser, erd, etc.)
  stores/             # Zustand state stores
  hooks/              # Custom React hooks
  lib/                # Utilities, helpers
src-tauri/            # Rust backend
  src/
    commands/         # Tauri invoke handlers
    db/               # DB driver wrappers per engine
    crypto/           # Encryption/decryption
    config/           # Local config store (SQLite)
    session/          # Session management
PROJECT.md            # Feature specification and roadmap (always up to date)
CLAUDE.md             # This file
```
