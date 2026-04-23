# Sequelit — Project Document

> An open-source, local-first desktop SQL client for developers and DBAs — full database management, schema tooling, and real-time monitoring in a single lightweight app with zero server dependency.

---

## Table of Contents

1. [Vision & Goals](#1-vision--goals)
2. [Inspiration & Feature Sources](#2-inspiration--feature-sources)
3. [Tech Stack](#3-tech-stack)
4. [Architecture Overview](#4-architecture-overview)
5. [Database Support](#5-database-support)
6. [Connection Management & Persistence](#6-connection-management--persistence)
7. [Session Management](#7-session-management)
8. [Feature Specification](#8-feature-specification)
   - 8.1 [Connection Manager](#81-connection-manager)
   - 8.2 [SQL Editor](#82-sql-editor)
   - 8.3 [Data Browser](#83-data-browser)
   - 8.4 [Schema Browser](#84-schema-browser)
   - 8.5 [ERD Tool](#85-erd-tool)
   - 8.6 [Schema Diff Tool](#86-schema-diff-tool)
   - 8.7 [Query AI Assistant](#87-query-ai-assistant)
   - 8.8 [Import / Export](#88-import--export)
   - 8.9 [Backup & Restore](#89-backup--restore)
   - 8.10 [Dashboard & Monitoring](#810-dashboard--monitoring)
   - 8.11 [User & Role Management](#811-user--role-management)
   - 8.12 [Job Scheduler](#812-job-scheduler)
   - 8.13 [Cloud Workspaces & Team Collaboration](#813-cloud-workspaces--team-collaboration)
   - 8.14 [Plugin System](#814-plugin-system)
   - 8.15 [Query Magics](#815-query-magics)
   - 8.16 [Saved Queries & History](#816-saved-queries--history)
   - 8.17 [Storage Manager](#817-storage-manager)
   - 8.18 [psql / Terminal Tool](#818-psql--terminal-tool)
   - 8.19 [Configuration Editor](#819-configuration-editor)
   - 8.20 [Security & Encryption](#820-security--encryption)
9. [UI/UX Design Principles](#9-uiux-design-principles)
10. [Local Storage Strategy](#10-local-storage-strategy)
11. [Development Roadmap](#11-development-roadmap)
12. [Open Source License](#12-open-source-license)

---

## 1. Vision & Goals

**Sequelit** is a fully open-source, local-first desktop SQL client built for developers and database administrators. It covers the entire database workflow — from writing queries and browsing data to managing schemas, monitoring performance, and administering users — all in one app, with no subscriptions and no server required.

### Core Goals

| Goal | Description |
|---|---|
| **Zero server** | Runs entirely on the user's machine. No backend service required. |
| **Persistent configs** | All connection configs survive app restarts. One-click reconnect. |
| **Multi-database** | Supports every major SQL database engine out of the box. |
| **Full-featured, free forever** | Every feature is included at no cost — no paywalls, no usage caps. |
| **Deep PostgreSQL support** | ERD, Schema Diff, pl/pgsql Debugger, Job Scheduler, real-time dashboards, RLS management, logical replication. |
| **Modern UX** | Fast, responsive, keyboard-first, dark/light themes, 4K-ready. |
| **Privacy-first** | Credentials encrypted locally with AES-256-GCM. Nothing leaves the machine by default. |

---

## 2. Design Principles

Sequelit is designed around three pillars:

**1. Developer-first workflow** — The SQL editor is the heart of the app. Syntax highlighting, autocomplete, multi-tab execution, query history, and saved queries are all first-class. Everything is keyboard-accessible.

**2. Full database administration** — Not just a query tool. Sequelit includes schema visualisation (ERD), schema comparison and migration generation (Schema Diff), real-time server monitoring, user/role management, job scheduling, and deep PostgreSQL-specific tooling (RLS, partitions, logical replication, configuration editor).

**3. Data browser as a spreadsheet** — Browse, filter, sort, inline-edit, and delete rows without writing SQL. Column-specific filters, JSON sidebar for complex values, CSV import/export, and foreign key navigation make the data browser genuinely useful for non-SQL workflows.

---

## 3. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| **Desktop shell** | [Tauri 2](https://tauri.app/) (Rust) | Lightweight native app, ~10MB binary, security-first |
| **Frontend** | React 19 + TypeScript | Component-driven, fast, large ecosystem |
| **UI Components** | shadcn/ui + Tailwind CSS | Accessible, composable, easy to theme |
| **SQL Editor** | CodeMirror 6 | Best-in-class code editor, extensible |
| **ERD / Diagrams** | React Flow | Node-based diagrams, great for ERD |
| **State Management** | Zustand | Minimal, fast, no boilerplate |
| **Local DB / Storage** | SQLite via Tauri plugin (tauri-plugin-sql) | Store configs, query history, saved queries locally |
| **Encryption** | AES-256-GCM via Rust (ring crate) | Encrypt stored credentials at rest |
| **DB Drivers** | Rust: sqlx (PostgreSQL, MySQL, SQLite), tiberius (SQL Server), others via WASM/FFI | Native performance, no Node.js DB overhead |
| **Charts** | Recharts | Lightweight charting for dashboards |
| **File ops** | Tauri FS plugin | Import/export, backup/restore |
| **Terminal** | xterm.js | Embedded terminal for psql tool |
| **AI** | Configurable: OpenAI, Anthropic, custom LLM URL (LM Studio, Ollama, etc.) | User-controlled, no mandatory cloud |

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Sequelit Desktop App                 │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              React Frontend (UI Layer)           │   │
│  │  - Connection Manager    - SQL Editor            │   │
│  │  - Schema Browser        - Data Browser          │   │
│  │  - ERD Tool              - Schema Diff           │   │
│  │  - Dashboard             - AI Assistant          │   │
│  │  - Import/Export         - Backup/Restore        │   │
│  └─────────────────────┬────────────────────────────┘   │
│                        │  Tauri IPC (invoke/events)      │
│  ┌─────────────────────▼────────────────────────────┐   │
│  │             Rust Backend (src-tauri)              │   │
│  │  - DB Connection Pool    - Query Executor         │   │
│  │  - Schema Inspector      - Backup/Restore Cmds    │   │
│  │  - Encryption (AES-256)  - Session Manager        │   │
│  │  - Config Store (SQLite) - File System Ops        │   │
│  └─────────────────────┬────────────────────────────┘   │
│                        │                                 │
│  ┌─────────────────────▼────────────────────────────┐   │
│  │           Local Persistence Layer                 │   │
│  │  ~/.sequelit/                                     │   │
│  │    ├── config.db         (SQLite: connections,    │   │
│  │    │                      saved queries, prefs)   │   │
│  │    ├── credentials.enc   (AES-256 encrypted)      │   │
│  │    ├── backups/          (local DB backups)       │   │
│  │    └── workspaces/       (exported workspaces)    │   │
│  └──────────────────────────────────────────────────┘   │
│                        │                                 │
│  ┌─────────────────────▼────────────────────────────┐   │
│  │          Remote Database Servers                  │   │
│  │  PostgreSQL · MySQL · SQLite · SQL Server         │   │
│  │  MariaDB · CockroachDB · Redis · MongoDB          │   │
│  │  BigQuery · Cassandra · ClickHouse · DuckDB       │   │
│  │  Redshift · Firebird · TiDB · Oracle · ...        │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**
- **No local server process**: All DB connections go directly from Tauri Rust backend to remote DB. No intermediary HTTP server.
- **IPC only**: Frontend never talks to the database directly — all DB calls go through Tauri `invoke()` commands to Rust handlers.
- **Connection pooling in Rust**: sqlx connection pools are held in Tauri's managed state, keyed by connection ID.
- **Encrypted credential store**: Passwords/SSH keys are encrypted with AES-256-GCM before writing to disk. A master password (or OS keychain) is used as the encryption key.

---

## 5. Database Support

| Database | Driver | Notes |
|---|---|---|
| **PostgreSQL** (all versions) | sqlx | Full feature support incl. pl/pgsql debugger, partitions, logical replication |
| **MySQL 5.7+** | sqlx | Full CRUD, schema management |
| **MariaDB** | sqlx | MySQL-compatible |
| **SQLite 3** | sqlx | Local file support, double-click to open |
| **SQL Server** (2012+) | tiberius | Full T-SQL support |
| **Amazon Redshift** | sqlx (postgres) | Redshift-specific dialect support |
| **Google BigQuery** | REST API | Standard SQL queries |
| **CockroachDB** | sqlx (postgres) | PostgreSQL-compatible |
| **TiDB** | sqlx (mysql) | MySQL-compatible |
| **Apache Cassandra** | cassandra-rs | CQL support |
| **ClickHouse** | clickhouse-rs | Analytical queries |
| **DuckDB** | duckdb-rs | In-process analytical DB |
| **Firebird** | rsfbclient | Legacy support |
| **LibSQL / Turso** | libsql | SQLite-compatible |
| **MongoDB** | mongodb | Document + SQL-ish queries |
| **Redis** | redis-rs | Key-value + command interface |
| **Oracle** | ODBC/OCI bridge | via system driver |
| **Snowflake** | REST API | Cloud data warehouse |
| **Trino / Presto** | HTTP API | Federated queries |
| **SurrealDB** | surrealdb-rs | Multi-model |

**Connection methods supported for all databases:**
- Direct TCP/IP
- SSL/TLS (client certificates, CA verification)
- SSH Tunnel (password, key-based, agent forwarding)
- UNIX socket (PostgreSQL, MySQL)
- Database URL string (auto-parsed)
- Read-only mode (enforced at connection level)

---

## 6. Connection Management & Persistence

### How It Works

1. User fills in connection details (host, port, user, password, DB name, SSL, SSH options).
2. Sequelit encrypts the password/SSH key with AES-256-GCM and stores to `~/.sequelit/config.db`.
3. The connection metadata (name, type, host, port, user, DB) is stored in plaintext in `config.db`.
4. On next app launch, all saved connections appear in the sidebar — **no re-entry needed**.
5. User presses **Connect** and the app decrypts credentials, opens the connection pool, and restores the last session state (open tabs, active schema path, etc.).

### Connection Config Schema (stored in local SQLite)

```sql
CREATE TABLE connections (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  db_type     TEXT NOT NULL,         -- 'postgres', 'mysql', 'sqlite', etc.
  host        TEXT,
  port        INTEGER,
  database    TEXT,
  username    TEXT,
  ssl_mode    TEXT,
  ssh_host    TEXT,
  ssh_user    TEXT,
  ssh_port    INTEGER,
  color_tag   TEXT,                  -- visual color label for sidebar
  group_name  TEXT,                  -- folder grouping
  created_at  DATETIME,
  last_used   DATETIME
);

CREATE TABLE connection_secrets (
  connection_id  TEXT PRIMARY KEY REFERENCES connections(id),
  encrypted_blob TEXT NOT NULL       -- AES-256-GCM encrypted JSON
);
```

### Connection Groups & Labels
- Connections can be organized into named groups (folders) in the sidebar.
- Color-coded labels for quick identification.
- Search/filter connections by name, host, or type.
- Pin frequently used connections to top.

---

## 7. Session Management

- **Session duration**: 1 hour of inactivity triggers automatic disconnect.
- The 1-hour timer resets on any user action (query, schema click, tab switch).
- A **countdown notification** appears at the 55-minute mark ("Session expires in 5 minutes").
- User can manually extend the session with one click or set a custom timeout in Preferences.
- On session expiry: connection closes gracefully, unsaved query content is preserved in local state.
- On reconnect after expiry: one-click reconnect from the session-expired banner — no re-entering credentials.
- **Never expires option**: Users can disable the timeout entirely from Preferences.

---

## 8. Feature Specification

### 8.1 Connection Manager

- **Saved connections sidebar** with search, groups, color labels, and pin support.
- **Connection wizard**: step-by-step guided setup for each DB type with field validation and "Test Connection" button.
- **Database URL import**: paste a connection string and auto-fill all fields.
- **SSH Tunnel configuration**: inline UI for bastion host, SSH key upload, port forwarding.
- **SSL configuration**: upload CA cert, client cert, and client key inline.
- **Read-only mode toggle**: prevents any write operations on the connection.
- **Multiple simultaneous connections**: open tabs from different connections side-by-side.
- **Connection health indicator**: green/yellow/red dot in sidebar showing live connection state.
- **Import/export connections**: export connection configs (without passwords) to share with teammates.

---

### 8.2 SQL Editor

Powered by **CodeMirror 6**, the SQL editor is the heart of Sequelit.

#### Core Editor Features
- Syntax highlighting for all supported SQL dialects.
- **Smart autocomplete**: tables, columns, functions, keywords, schema-aware completions.
- **Find & Replace** with regex support.
- Code folding for CTEs and subqueries.
- Line numbers, error highlighting, and inline error messages.
- **Multiple editor tabs** — unlimited, per connection.
- **Zen Mode**: distraction-free fullscreen editor.
- **Split view**: run two queries side-by-side.
- **SQL Formatter / Prettifier**: one-click format with configurable style (keyword case, indentation).

#### Execution
- **Run selected text** or full query with keyboard shortcut.
- **Multi-statement execution**: run multiple statements; results shown in tabs.
- **Manual transaction mode**: explicit BEGIN/COMMIT/ROLLBACK with UI controls.
- **Cancel query** mid-execution.
- **Execute results directly to file**: stream large results to CSV/JSON without loading into memory.
- **Query plan viewer**: visual EXPLAIN / EXPLAIN ANALYZE with interactive node tree, cost color coding, and timing breakdown.

#### Results Grid
- Spreadsheet-like interface for viewing query results.
- Inline cell editing with change staging (shows pending changes before commit).
- **Copy rows** as CSV, JSON, Markdown, or Excel-formatted table.
- **Export results**: CSV, JSON, XLSX, Parquet.
- **Row-level filters**: client-side filtering and sorting without re-running queries.
- **View row as JSON**: click any row to see it as structured JSON in a side panel.
- **Geometry Viewer**: render PostGIS geometry/geography results on an interactive Leaflet map.
- **JSON/XML cell viewer**: pretty-print and collapse/expand nested JSON or XML.
- **Binary data download**: download BYTEA column data as a file.
- **Infinite scroll / pagination** for large result sets (configurable page size).
- **Clickable foreign keys**: click a foreign key value to jump to the related row in another table.

#### Query Tools
- **Query history**: searchable, filterable history of all executed queries per connection.
- **Saved queries**: save frequently used queries with name, description, and tags.
- **Query Magics** *(see §8.15)*.
- **Macros**: assign SQL snippets to keyboard shortcuts.
- **Scratch pad**: persistent notes panel alongside the editor.
- **AI Assistant** *(see §8.7)*.

---

### 8.3 Data Browser

- Spreadsheet-like table view for browsing and editing records without writing SQL.
- **Quick filters**: click any column header to add a filter with operators (=, !=, >, <, LIKE, IN, IS NULL, etc.).
- **Multiple simultaneous column filters** — filter by any number of columns at once.
- **Column sorting**: multi-column sort by clicking headers.
- **Inline editing**: double-click any cell to edit. Changes staged before commit.
- **Add / Delete rows** via buttons or keyboard.
- **JSON Sidebar**: click any row to see the full row as structured, collapsible JSON with nested relationship navigation.
- **View Rows as JSON**: toggle entire table view between grid and JSON format.
- **Foreign key navigation**: click FK values to open the related table and row.
- **Column visibility toggle**: hide/show columns without changing the query.
- **Freeze columns**: pin columns on the left while scrolling.
- **Cell search**: search within a column across all rows.
- **Row count indicator** and pagination controls.

---

### 8.4 Schema Browser

Hierarchical object tree in the left sidebar.

#### Supported Object Types (50+)
- **Databases** → Schemas → Tables, Views, Materialized Views
- Tables: Columns, Constraints (PK, FK, Unique, Check), Indexes, Rules, Triggers, Policies (RLS), Partitions, Statistics
- Views / Materialized Views (with REFRESH support)
- Functions, Procedures, Triggers, Aggregates, Operators
- Sequences
- Extensions
- Foreign Data Wrappers, Foreign Servers, Foreign Tables, User Mappings
- Publications, Subscriptions (logical replication)
- Event Triggers
- Full-text Search (dictionaries, parsers, configurations)
- Types (composite, enum, range, domain)
- Tablespaces
- Roles, Group Roles

#### Per-object Actions
- Create, Alter, Drop any object via GUI dialogs — no SQL required.
- View the **DDL SQL** for any object at any time.
- **Dependencies / Dependents** tab on every object.
- **Properties** panel with inline editing.
- **Statistics** panel (table bloat, row count, last vacuum, sequential scans, etc.).
- **Global object search**: search across all object names in a database instantly.
- Right-click context menus with context-sensitive actions.

#### Table Management
- Visual table designer: add/edit/remove columns, set data types, defaults, constraints.
- **Partition management**: create range/list/hash partitions, attach/detach partitions.
- **TOAST settings**.
- **Autovacuum settings** per table.
- **Row-Level Security policies**: create and manage RLS policies via GUI.
- **Alter table without SQL**: rename columns, change types, add/drop constraints — all via form.

---

### 8.5 ERD Tool

A visual, drag-and-drop Entity Relationship Diagram editor.

- **Auto-generate ERD** from any existing schema with one click.
- Drag and reposition tables freely.
- Click a relationship line to inspect FK details.
- **Add new tables** visually: define columns, types, and constraints in a panel.
- **Draw relationships**: drag from a column to another table to create FK relationships.
- **One-click SQL generation**: generate CREATE TABLE statements + ALTER TABLE ADD CONSTRAINT from the ERD.
- **Export**: save diagram as PNG, SVG, or PDF.
- **Multiple layout algorithms**: auto-layout (dagre), manual, or grid.
- **Zoom + pan** with keyboard and mouse controls.
- **Notes/annotations**: add sticky notes to the diagram.
- **Diff view**: compare the ERD against the live schema to find drift.

---

### 8.6 Schema Diff Tool

- Select two databases, schemas, or specific object types to compare.
- Side-by-side visual diff of schema structure.
- **Generate migration SQL**: produces an ALTER/CREATE/DROP script to bring Schema A in line with Schema B.
- Filter diff by object type (tables only, functions only, etc.).
- Copy the generated SQL directly to the editor.
- Save diff results as a file.

---

### 8.7 Query AI Assistant

Fully integrated AI assistant for SQL writing and analysis — entirely under the user's control.

#### Features
- **AI SQL Shell**: describe what you want in plain English, get a ready-to-run SQL query.
- **Explain query**: select any SQL and ask the AI to explain what it does.
- **Optimize query**: ask AI to suggest index improvements or query rewrites.
- **Generate from schema**: AI is aware of your live schema (tables, columns, types) for accurate completions.
- **AI Reports**: ask questions about your data ("What's the top 10 customers by revenue this month?") and get SQL + chart.
- **Copy AI response text** to editor or clipboard.
- **Conversation history** per connection session.

#### LLM Provider Configuration
Users configure their own LLM provider — Sequelit never hard-codes a cloud key:

| Provider | Notes |
|---|---|
| OpenAI (GPT-4o, etc.) | User's own API key |
| Anthropic (Claude) | User's own API key |
| Ollama (local) | Custom base URL |
| LM Studio (local) | Custom base URL |
| Any OpenAI-compatible API | Custom base URL + key |

- Provider settings stored in local config.
- AI feature can be **completely disabled** in Preferences.
- **No data is sent anywhere** unless the user configures a provider.

---

### 8.8 Import / Export

#### Table-level Import
- **CSV to Table Import**: import a CSV file into an existing table or create a new table from the CSV schema.
- Configure delimiter, quote character, escape character, encoding, NULL string, and column mapping.
- Preview first N rows before importing.
- Skip header row option.
- Upsert mode: insert or update based on primary key.

#### Table-level Export
- **Multi-Table Export**: export multiple tables in one operation.
- Formats: CSV, JSON, XLSX, SQL (INSERT statements), Parquet.
- Column selection, filter by condition before export.
- Compressed ZIP output for multi-table exports.

#### Query Result Export
- Export results from the query editor to CSV, JSON, XLSX, Markdown.
- **Execute results directly to file**: stream large results without buffering in memory — handles millions of rows.

#### Schema Export
- Export DDL for selected objects (tables, functions, full schema) as a `.sql` file.

---

### 8.9 Backup & Restore

Full backup/restore powered by native database CLI tools where available, with custom Rust implementations as fallback.

#### PostgreSQL (pg_dump / pg_restore / pg_dumpall)
- **Backup single database**: Plain SQL, Custom, Tar, or Directory format.
- Compression level control.
- Include/exclude: schemas, tables, data-only, DDL-only, blobs, owner info, privileges, comments.
- Pre/post-data only option.
- Use column inserts option.
- Disable triggers option during restore.
- **Full server backup** (pg_dumpall): includes roles and tablespaces.
- **Restore**: from Custom/Tar/Directory format. Clean before restore, single transaction, table-level restore.

#### MySQL / MariaDB (mysqldump)
- Full database dump with options for triggers, routines, events.
- Single-transaction consistent snapshot.
- Restore from `.sql` dump files.

#### SQLite
- File-level copy (hot backup via SQLite online backup API).

#### All Databases
- **Backup jobs**: schedule automated backups using the built-in job scheduler.
- **Backup history**: log of all backup operations with status and file path.
- **Background jobs**: backup/restore runs asynchronously; progress shown in Processes panel.
- Store backups locally to any path.

---

### 8.10 Dashboard & Monitoring

Real-time server monitoring dashboard available per connection.

#### PostgreSQL Dashboard Charts (auto-refresh, configurable interval)
- Active / idle / idle-in-transaction sessions graph.
- Transactions per second (TPS).
- Tuples inserted/updated/deleted/fetched/returned per second.
- Block I/O: reads vs. cache hits (buffer cache hit ratio).
- WAL generation rate.
- Replication lag (if replicas configured).
- Lock conflicts table.
- Long-running queries indicator with cancel button.

#### Activity Monitor
- Live table of active queries (state, wait event, duration, client IP, user).
- One-click cancel or terminate any backend.
- Filter by user, database, state.

#### Table Statistics Panel
- Per-table: row count, dead rows, last vacuum/analyze, sequential scans, index scans, cache hit ratio, bloat estimate.
- VACUUM / ANALYZE / REINDEX actions callable directly from the panel.

#### System Statistics (if pg_stat_statements / pg_sys_stats installed)
- Top N slowest queries (by total time, mean time, calls).
- Cache hit rates, temp file usage, lock waits.

---

### 8.11 User & Role Management

#### PostgreSQL
- Create, edit, delete login roles with all attributes: SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS, connection limit, validity date, password.
- Manage group roles and membership.
- **Grant Wizard**: GRANT/REVOKE privileges on any object (schemas, tables, sequences, functions) via GUI.
- **Default Privileges**: configure ALTER DEFAULT PRIVILEGES per role.
- **Row-Level Security**: create, enable, disable, drop RLS policies per table.

#### Cross-Database
- User listing and basic privilege management for MySQL, SQL Server, and other supported DBs.

---

### 8.12 Job Scheduler

Modelled after pgAgent but integrated directly into Sequelit's UI.

- Create scheduled jobs with SQL steps and/or shell script steps.
- Cron-style recurrence rules (every N minutes/hours/days, specific days of week, etc.).
- View job history: last run time, status, output/error log.
- Enable/disable individual jobs.
- Jobs stored in local config database (Sequelit-managed, no pgAgent dependency required — though pgAgent jobs can also be viewed/managed if pgAgent is installed on the server).

---

### 8.13 Cloud Workspaces & Team Collaboration

- **Local workspaces**: all data stays on-device by default.
- **Export workspace**: export all saved queries, connection configs (without passwords), and ERD diagrams as a `.sequelit` bundle file for sharing with teammates.
- **Import workspace**: import a `.sequelit` bundle to onboard to a team's setup instantly.
- **Optional cloud sync**: users may configure their own sync backend (S3, Dropbox, iCloud, WebDAV) for cross-device workspace sync. Sequelit does not operate its own cloud — the user controls storage.
- **Team query library**: shared saved queries stored in a team workspace file, versioned by git or any file sync.

---

### 8.14 Plugin System

- Plugin API allowing third-party extensions to add new panels, commands, and database adapters.
- Plugins are TypeScript/React modules loaded at runtime.
- Plugin store (community-hosted GitHub registry) for discovering and installing plugins.
- Built-in plugins:
  - **PostGIS Viewer**: geometry maps (bundled by default).
  - **Redis GUI**: key browser, TTL editor, pub/sub monitor.
  - **MongoDB Shell**: document browser with aggregation pipeline builder.

---

### 8.15 Query Magics

Transform result grid cells into rich visual elements without custom code.

| Magic | Transforms |
|---|---|
| `star_rating` | Integer 1-5 → star icons |
| `progress` | 0-100 float → progress bar |
| `check` | Boolean → checkmark / X icon |
| `image` | URL string → inline image thumbnail |
| `link` | URL string → clickable hyperlink |
| `table_jump` | FK value → jump-to-row button |
| `barcode` | String → rendered barcode/QR |
| `color` | Hex string → color swatch |
| `currency` | Number + currency code → formatted currency |
| `date_relative` | Timestamp → "2 hours ago" relative label |

- Configured per column in the Data Browser or query results.
- Magic configs are saved per connection/table.

---

### 8.16 Saved Queries & History

- **Saved queries**: store any SQL with name, description, tags, and folder grouping.
- Searchable by name, tag, or content.
- Per-connection or global scope.
- **Share**: export selected saved queries as a `.sql` or `.json` file.
- **Query history**: complete log of all executed queries, searchable and filterable.
- Re-run any past query with one click.
- History stored locally, configurable retention (default: 90 days / 10,000 entries).

---

### 8.17 Storage Manager

A built-in file browser for the **remote server's filesystem** (PostgreSQL servers).

- Browse server directories.
- Upload files to the server.
- Download files from the server.
- Used primarily for locating and loading backup files for restore operations.

---

### 8.18 psql / Terminal Tool

- Embedded **psql** terminal running as a Tauri shell process inside the app.
- Full psql meta-command support (`\d`, `\dt`, `\copy`, etc.).
- Per-connection terminal: each connection can open its own psql tab.
- Powered by **xterm.js** in the frontend with a Tauri-managed child process backend.
- For non-PostgreSQL databases: a generic SQL shell using the respective CLI tool (mysql, sqlite3, sqlcmd, etc.) if available on the system PATH.

---

### 8.19 Configuration Editor

For PostgreSQL connections:

- **postgresql.conf editor**: GUI table with descriptions, recommended ranges, and current values. Edit and apply without manual file access.
- **pg_hba.conf editor**: row-by-row rule management with type, database, user, address, and method fields.
- **pg_ident.conf editor**: ident mapping management.
- Changes can be previewed as diff before applying.
- Trigger `pg_reload_conf()` from UI after changes.

---

### 8.20 Security & Encryption

- **Master password**: app optionally prompts for a master password on launch. Used as the encryption key for stored credentials. Alternatively, integrates with OS keychain (macOS Keychain, Windows Credential Manager, Linux libsecret).
- **AES-256-GCM encryption** for all stored passwords and SSH keys.
- **Air-gapped mode**: all AI features disabled, no outbound network calls except to configured DB servers.
- **Read-only connections**: enforced at the Rust driver level — no writes possible.
- **SSL certificate pinning**: configurable per connection.
- **SSO cloud DB auth**: OAuth2 / OIDC flows for cloud databases (AWS IAM, Google Cloud IAM, Azure AD) — credentials never stored, tokens refreshed automatically.
- **Audit log**: local log of all queries executed per connection, configurable retention.
- No telemetry. No analytics. No phoning home.

---

## 9. UI/UX Design Principles

| Principle | Implementation |
|---|---|
| **Speed first** | Sub-100ms UI response for all local operations. Rust backend handles DB I/O. |
| **Keyboard-first** | Every action reachable by keyboard. Command palette (⌘K / Ctrl+K) for anything. |
| **Dark & Light themes** | System-adaptive by default, manually overridable. High-contrast theme for accessibility. |
| **4K ready** | All layouts are vector/scalable, no pixel-fixed assets. |
| **Minimal chrome** | Maximum space for data and queries. Sidebar collapsible. Panels resizable. |
| **Tabs, not windows** | Multi-document interface: queries, table browsers, ERDs all in tabs. |
| **Context-aware menus** | Right-click anywhere for relevant actions. No hunting through menus. |
| **Progressive disclosure** | Simple defaults; advanced options revealed on demand. |
| **No modal hell** | Drawers and inline panels instead of blocking dialogs where possible. |
| **Connection color labels** | Color-tag connections (e.g., red = production, green = dev) to prevent accidents. |

### Layout

```
┌────────────────────────────────────────────────────────┐
│  [⌘K] Command Palette    Sequelit        [●] prod-db   │  ← Top bar
├──────────┬─────────────────────────────────────────────┤
│          │  [Query 1] [ERD] [Dashboard] [+]            │  ← Tabs
│ Sidebar  ├─────────────────────────────────────────────┤
│          │                                             │
│ ▼ prod   │  SQL Editor (CodeMirror)                   │
│   ▼ pg   │                                             │
│     tables│                                             │
│     views │─────────────────────────────────────────── │
│     funcs │  Results Grid / Data Browser               │
│           │                                             │
│ ▼ staging │                                             │
│   ▼ mysql │─────────────────────────────────────────── │
│           │  Status bar: rows · time · connection       │
└──────────┴─────────────────────────────────────────────┘
```

---

## 10. Local Storage Strategy

All data stored in `~/.sequelit/` on the user's machine.

| File / Directory | Contents |
|---|---|
| `config.db` | SQLite: connections, saved queries, query history, preferences, job schedules, workspace data |
| `credentials.enc` | AES-256-GCM encrypted blob: passwords, SSH keys, OAuth tokens |
| `backups/` | Local database backup files |
| `workspaces/` | Exported `.sequelit` workspace bundles |
| `logs/` | Audit logs, application logs |
| `plugins/` | Installed plugin bundles |

**config.db tables:**
- `connections` — connection metadata
- `connection_secrets` — encrypted credential references
- `saved_queries` — user-saved SQL snippets
- `query_history` — execution log
- `query_tags` — tags for saved queries
- `preferences` — app-wide settings (theme, editor font, timeout, etc.)
- `workspaces` — workspace definitions
- `job_schedules` — scheduled jobs
- `magic_configs` — Query Magic column configs per table
- `erd_diagrams` — saved ERD layouts per schema

---

## 11. Development Roadmap

### Phase 1 — Core (MVP)
- [x] Tauri app shell with sidebar + tabbed layout
- [x] Connection Manager: add, edit, delete, test connections (PostgreSQL, MySQL, SQLite)
- [x] Persistent connection storage with AES-256 encryption
- [x] SQL Editor (CodeMirror 6) with autocomplete + syntax highlighting
- [x] Result grid with sort, filter, copy, CSV export
- [x] Schema Browser (tables, views, columns, indexes)
- [x] Data Browser with inline editing
- [x] Session management (1-hour timeout + reconnect)
- [x] Dark / Light theme

### Phase 2 — Power Features
- [x] CockroachDB + Amazon Redshift support (PostgreSQL wire protocol; added to ConnectionForm + DbType enum)
- [ ] SQL Server support (no sqlx driver in v0.8; deferred — tiberius integration planned)
- [ ] BigQuery (no sqlx driver; deferred)
- [x] Import/Export (CSV import, multi-table export, execute-to-file)
- [x] Native Backup & Restore (pg_dump — generates shell command, supports plain/custom/tar/directory formats)
- [x] JSON Sidebar (click any row in Data Browser to see structured, collapsible JSON)
- [x] Query history + Saved queries (save, search, tag, load — per-connection or global)
- [x] Schema Diff Tool (two-connection schema comparison with migration SQL generation)
- [x] ERD Tool (auto-generate from FK relationships, dagre auto-layout, React Flow, zoom/pan)
- [x] Visual EXPLAIN ANALYZE (PostgreSQL/MySQL; tree view with timing per node)

### Phase 3 — Advanced Administration
- [x] Real-time Dashboard (sessions, TPS, I/O, cache hit ratio charts with Recharts, 5s auto-refresh)
- [x] Activity Monitor (live pg_stat_activity table; cancel/terminate buttons per session)
- [x] Table Statistics panel (pg_stat_user_tables: live rows, dead rows, seq/idx scans, vacuum, size)
- [x] User & Role Management (list roles, create role with all attributes, drop, view memberships, grant/revoke)
- [x] postgresql.conf / pg_hba.conf editor (pg_settings viewer with inline edit + ALTER SYSTEM SET, pg_hba_file_rules viewer, pg_reload_conf)
- [x] Job Scheduler (local SQLite-backed; cron schedule UI, run-now, enable/disable, last run status)
- [x] SQL Shell / Terminal Tool (xterm.js terminal with history, table-formatted output, Ctrl+L, Ctrl+C)
- [x] Partitions, RLS, logical replication management (PgManagement tab: RLS policies viewer, partition browser, pub/sub replication viewer)
- [ ] pl/pgsql Debugger (requires PostgreSQL plugin_debugger extension — out of scope for current phase)
- [ ] Storage Manager (server-side file browser — deferred, low priority)

### Phase 4 — AI & Collaboration
- [x] AI SQL Assistant (multi-provider: Anthropic Claude, OpenAI, custom/Ollama; air-gapped mode; AiAssistant.tsx)
- [x] AI settings + Preferences dialog (PreferencesDialog.tsx; provider, API key, model, base URL, air-gapped toggle, theme)
- [x] Workspace export/import (WorkspaceManager.tsx; connections without passwords + saved queries; JSON format v1.0)
- [x] Air-gapped mode (disables all outbound AI calls; configurable in Preferences)
- [ ] Plugin system + plugin registry (scaffold deferred — architecture not yet decided)
- [ ] SSO cloud DB auth (AWS IAM, Google IAM, Azure AD — deferred)
- [ ] Optional self-hosted sync backend (deferred)

---

## 12. Open Source License

**Sequelit** is licensed under the **GNU Affero General Public License v3 (AGPL-3.0)**.

- Free to use, modify, and distribute.
- Modifications must be open-sourced under the same license.
- No "open core" model — every feature in this document is free, forever.
- Commercial use permitted; any SaaS deployment of Sequelit must also be open-sourced.

---

*Last updated: April 2026*
