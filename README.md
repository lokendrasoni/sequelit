# Sequelit

> An open-source, local-first desktop SQL client for developers and DBAs — full database management, schema tooling, and real-time monitoring in a single lightweight app with zero server dependency.

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#install">Install</a> ·
  <a href="#run-from-source">Run from source</a> ·
  <a href="#contributing">Contributing</a> ·
  <a href="PROJECT.md">Full spec</a>
</p>

---

## Why Sequelit

- **Local-first.** Everything runs on your machine via Tauri. No server, no daemon, no telemetry, no outbound calls except to the databases and LLM providers you configure.
- **All features, free, forever.** No paywalls, no usage caps, no tiers. AGPL-3.0 licensed.
- **One app for the whole workflow.** Write queries, browse data, manage schemas, monitor performance, administer users — without juggling tools.
- **Credentials encrypted at rest.** AES-256-GCM. Plaintext passwords are never stored.

## Features

- **SQL Editor** with autocomplete, multi-tab, query history
- **Data Browser** with server-side sort, filter, search across all columns, inline cell editing, row delete, JSON sidebar
- **Schema Browser** with right-click inspectors for tables (columns, indexes, constraints) and schemas (types, functions, sequences)
- **ERD Tool** — visualize relationships, generate from existing schema
- **Schema Diff** — compare schemas across connections, generate migration SQL
- **Dashboard & Activity Monitor** — live connection metrics, running queries, lock waits
- **Roles & Permissions** manager
- **Import / Export** — CSV, multi-table
- **Backup & Restore** — `pg_dump` / `mysqldump` integration
- **AI Assistant** (opt-in) — bring your own provider key, never on by default
- **Cloud Workspaces** — optional encrypted sync for sharing connections and queries with a team
- **SSH tunnels**, **SSL/TLS**, **read-only mode**, **session timeout**

See [`PROJECT.md`](PROJECT.md) for the full feature spec, architecture, and roadmap.

## Supported databases

PostgreSQL · MySQL · MariaDB · SQLite · SQL Server · Redshift · BigQuery · CockroachDB · TiDB · Cassandra · ClickHouse · DuckDB · LibSQL/Turso · MongoDB · Redis · Snowflake · Trino/Presto · SurrealDB · Oracle (ODBC) · Firebird.

Phase 1 ships with **PostgreSQL, MySQL, SQLite**; the rest land in subsequent phases (see roadmap).

## Install

Grab the installer for your platform from the [latest release](../../releases/latest).

| Platform | File | Install |
|---|---|---|
| macOS | `.dmg` | Open the DMG, drag Sequelit to **Applications** |
| Ubuntu / Debian | `.deb` | `sudo dpkg -i sequelit_*.deb` |
| Linux (generic) | `.AppImage` | `chmod +x sequelit_*.AppImage && ./sequelit_*.AppImage` |
| Windows | `.msi` or `.exe` | Double-click and follow the installer |

### macOS: first-launch warning

Sequelit is ad-hoc signed but not yet notarized with Apple, so macOS Gatekeeper warns on the first launch.

- If you see **"Sequelit is damaged and can't be opened"**, run:
  ```bash
  xattr -dr com.apple.quarantine /Applications/Sequelit.app
  ```
- If you see **"unidentified developer"**, right-click Sequelit in `/Applications`, choose **Open**, then click **Open** in the prompt. macOS will remember the decision.

### System requirements

- macOS 12+
- Ubuntu 22.04+ / Debian 12+ (or any distro that supports AppImage / WebKitGTK 4.1)
- Windows 10+

## Run from source

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node 20+](https://nodejs.org/) and npm
- Tauri 2 system deps — see the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) for your OS

### Develop

```bash
git clone https://github.com/lokendrasoni/sequelit.git
cd sequelit
npm install
npm run tauri dev
```

### Build a production bundle

```bash
npm run tauri build
```

Artifacts land in `src-tauri/target/release/bundle/`.

## Contributing

Pull requests are welcome. Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** before opening issues or PRs — it covers dev setup, code style, the issue / PR workflow, and the release process.

Quick links:
- 🐛 [File a bug](../../issues/new?template=bug_report.yml)
- ✨ [Request a feature](../../issues/new?template=feature_request.yml)
- 💬 Open a [Discussion](../../discussions) for design questions

## License

[AGPL-3.0](LICENSE). All code must remain open-source under the same license; SaaS deployments of Sequelit must publish their source. See [PROJECT.md §12](PROJECT.md#12-open-source-license).
