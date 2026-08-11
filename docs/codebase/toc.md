# Furina -- Codebase Documentation

> Project documentation for `D:/project-code/llm/furina`.
> 5 modules, 91 spec documents covering the complete codebase.

## Project Introduction

### Background

Furina is a plugin-based development toolkit for [Claude Code](https://docs.anthropic.com/en/docs/claude-code), evolved from [OpenSpec](https://github.com/Fission-AI/OpenSpec) and [SuperPowers](https://github.com/obra/superpowers). It solves two fundamental problems in AI-assisted development:

1. **Multi-vendor model routing** -- Claude Code natively binds to Anthropic's API. Furina inserts a transparent proxy layer that lets users freely switch between 12+ LLM providers (Anthropic, OpenAI, DeepSeek, Kimi, ChatGLM, MiniMax, etc.) within a single session, without modifying Claude Code itself.

2. **Structured SDD+TDD workflow** -- Ad-hoc prompting produces inconsistent results across sessions and projects. Furina defines a deterministic 6-phase workflow (Explore -> Propose -> Plan -> Review -> SDD -> Finalize) with artifact-based stage detection, automatic recovery from interrupted sessions, and TDD enforcement at the feature implementation level.

### Business Goals

- **Zero-friction provider switching**: Users configure providers once via Web UI; the proxy layer handles authentication, model mapping, and stream forwarding transparently.
- **Reproducible development process**: Every change produces a verifiable artifact chain (proposal -> design -> specs -> plan.json -> features) with automated quality review.
- **Cross-project memory**: Background schedulers aggregate design documents across all projects, enabling multi-project awareness and grouped knowledge management.
- **Claude Code native integration**: Skills, hooks, and MCP tools are registered through Claude Code's plugin system, requiring no fork or modification of the host tool.

### Design Philosophy

- **Layered separation**: Foundation utilities (Utils) have zero knowledge of higher layers. CLI, Server, and Client depend on Utils independently. Marketplace orchestrates the workflow but delegates all state mutation to CLI commands.
- **Single source of truth per data domain**: `providers.json` for provider configs, `changes.json` for change tracking, `furina.json` for runtime config, `settings.json` for Claude CLI env -- each file owns its domain with Zod schema enforcement.
- **Graceful degradation**: Every subsystem (logger, config loader, i18n, proxy, scheduler) is designed to silently degrade on failure rather than crash the application.
- **Hook-driven orchestration**: The Marketplace module drives workflow execution through Claude Code's hook system (PreToolUse/PostToolUse/UserPromptSubmit), intercepting tool calls and dispatching to CLI commands. This avoids tight coupling between the workflow engine and the application runtime.
- **Factory pattern for testability**: Core server and CLI entry points use factory functions (`createApp()`, `registerProgram()`) that can be imported and tested without starting real processes or HTTP servers.

---

## Module Dependency Diagram

```
                        ┌──────────────────────────────────────────────┐
                        │            Layer 0: Runtime Host             │
                        │           Claude Code Process                │
                        │  loads hooks.json, runs skills, calls MCP    │
                        └───────┬──────────────────────┬───────────────┘
                                │ hook events           │ MCP tools
                                ▼                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        Layer 1: Marketplace                              │
│  (Intelligence Layer -- not a Node.js import graph; loaded by            │
│   Claude Code runtime via hooks.json + plugin.json)                      │
│                                                                          │
│  ┌─────────────────┐  ┌───────────────────────┐  ┌────────────────────┐ │
│  │  Skills (13)     │  │  Hooks (7 rules)       │  │  Resources (9)     │ │
│  │  explore         │  │  hooks.json            │  │  furina.json   │ │
│  │  brainstorm      │  │  furina_hooks.js   │  │  provider template │ │
│  │  propose         │  │  -> dispatches to CLI  │  │  artifact templates│ │
│  │  plan            │  │    via execSync()      │  │  agent definitions │ │
│  │  review          │  └───────────┬────────────┘  └────────┬─────────┘ │
│  │  sdd/tdd         │              │                        │            │
│  │  finalize/commit │              │                        │            │
│  │  cleancode       │              │                        │            │
│  │  codebase        │              │                        │            │
│  └─────────────────┘              │                        │            │
│       │                           │ CLI process spawn      │ reads via  │
│       │ consumes                   │ (child_process)        │ CLI config │
│       │ artifact templates         │                        │ commands   │
│       └───────────────────────────┘                        │            │
└────────────────────────────────────────────────────────────┼────────────┘
                                                             │
                       ┌─────────────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────────────────────────┐
│                      │       Layer 2: Application                        │
│              ┌───────┴───────────────────────────────────┐               │
│              │                   CLI                      │               │
│              │  bin/furina.js -> src/cli/index.ts     │               │
│              │  Commander.js root + 12 command modules    │               │
│              │  change/ submodule (8 specs)               │               │
│              └──┬──────────────┬──────────────┬──────────┘               │
│                 │              │              │                           │
│    ┌────────────┴──────┐      │              │                           │
│    │     Server         │      │              │                           │
│    │  Express app       │◄─────┘              │                           │
│    │  entry.ts -> HTTP  │   CLI commands      │  HTTP REST                │
│    │  on port 3939      │   call server       │  API calls                │
│    │                    │   modules directly  │                           │
│    │  + anthropic proxy │                     │                           │
│    │  + routes-api      │              ┌──────┴──────┐                    │
│    │  + mcp-marker      │              │   Client    │                    │
│    │  + memory-cron     │              │  React SPA  │                    │
│    │  + service-manager │              │  Vite build │                    │
│    └────────────────────┘              └─────────────┘                    │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────────────────────────┐
│                      ▼       Layer 3: Foundation                         │
│              ┌──────────────────────────────────────┐                    │
│              │              Utils                    │                    │
│              │                                       │                    │
│              │  ┌─────────┐  ┌──────────┐           │                    │
│              │  │ Logger  │  │ Config   │           │                    │
│              │  │ (single │  │ (Zod     │           │                    │
│              │  │  ton)   │  │  schemas │           │                    │
│              │  └────┬────┘  │  deep-   │           │                    │
│              │       │       │  merge,  │           │                    │
│              │       │       │  loader, │           │                    │
│              │       │       │  query,  │           │                    │
│              │       │       │  I/O)    │           │                    │
│              │       │       └──────────┘           │                    │
│              │       │                               │                    │
│              │  ┌────┴─────┐  ┌──────────┐  ┌─────┴──────┐             │
│              │  │Port Mgr  │  │  Memory  │  │  Session   │             │
│              │  │(platform │  │ (changes │  │  (per-     │             │
│              │  │ port     │  │  .json   │  │  session   │             │
│              │  │ detect,  │  │  lifecycle│ │  settings, │             │
│              │  │ kill,    │  │  7-stage │  │  provider  │             │
│              │  │ graceful │  │  merge)  │  │  resolution│             │
│              │  │ shutdown)│  └──────────┘  └────────────┘             │
│              │  └──────────┘                                           │
│              │                                                         │
│              │  ┌─────────────┐  ┌──────────┐                         │
│              │  │  Provider   │  │  Common  │                         │
│              │  │  Templates  │  │  (path   │                         │
│              │  │  (preset    │  │  normal- │                         │
│              │  │   CRUD)     │  │  ize)    │                         │
│              │  └─────────────┘  └──────────┘                         │
│              └──────────────────────────────────────┘                  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

Data flow key paths:
  Proxy:  Claude CLI -> anthropic-proxy/handler -> session.ts -> providers-store -> upstream LLM
  Memory: CLI change new -> memory.ts -> changes.json -> server memory-scheduler -> Claude CLI agents
  Config: resources/furina.json + .claude/furina.json -> config.ts deep-merge -> Zod validate
  Hooks:  Claude Code event -> hooks.json -> furina_hooks.js -> execSync("furina ...")
```

---

## Entry Points

### CLI Entry (`bin/furina.js` -> `src/cli/index.ts`)

The CLI is the primary user-facing entry point. `bin/furina.js` is the npm bin shim that imports the compiled Commander.js program from `dist/cli/index.js` and calls `program.parse()`. The barrel file `src/cli/index.ts` creates the root Commander instance, reads version from `package.json`, and registers all 12 command modules: `init`, `ui`, `active`, `launch`, `remove`, `recover`, `change`, `config`, `enable`, `disable`, `agents`, `schedule`.

**Key spec**: [cli/spec-entry-barrel.md](./cli/spec-entry-barrel.md)

### Server Entry (`src/server/entry.ts` -> `src/server/index.ts`)

The server is spawned as a detached background child process by `service-manager.ts`. `entry.ts` calls `createApp()` from `index.ts` (which mounts all Express routes + Anthropic proxy catch-all), starts HTTP listening on port 3939, starts the memory scheduler, and installs global exception handlers. The factory function `createApp()` accepts a `beforeProxy` hook allowing `entry.ts` to inject the shutdown route.

**Key spec**: [server/spec-app-entry.md](./server/spec-app-entry.md)

### Client Entry (`src/client/main.tsx`)

The browser loads `index.html`, which imports `main.tsx` as a module. The `bootstrap()` async function first initializes i18n (fetching language config from the server API), then mounts the React 18 concurrent-mode rendering tree (`StrictMode > I18nextProvider > App`).

**Key spec**: [client/spec-app-root.md](./client/spec-app-root.md)

### Hooks Entry (`marketplace/scripts/furina_hooks.js`)

Not a Node.js entry in the traditional sense. Claude Code's runtime loads `hooks.json` and invokes `furina_hooks.js` via child process when hook events fire. The script reads stdin synchronously, parses session/context data using regex-first + JSON-fallback strategy, and dispatches to the appropriate `furina` CLI command via `execSync()`.

**Key spec**: [marketplace/hooks/spec-hooks-runner-main.md](./marketplace/hooks/spec-hooks-runner-main.md)

---

## Cross-Module Call Chains

### 1. Provider Activation Flow

```
User clicks "Set Active" in Web UI
  -> Client App.tsx: PUT /furina/api/providers/active
    -> Server routes-api/providers-routes.ts
      -> providers-store.ts: setActiveProviderId() [validates existence + enabled]
      -> claude-settings.ts: writeEnvToClaudeSettings() [writes ANTHROPIC_* env vars]
    <- 200 OK
  <- Client: triggerRefresh() + showToast()
```

### 2. Workflow Execution (Hook-Driven)

```
User types /furina:workflow in Claude Code
  -> Claude Code: UserPromptSubmit hook fires
    -> furina_hooks.js: runInitAgent()
      -> execSync("furina change new ...") [creates change directory + registers in changes.json]
  -> Claude Code: calls Agent tool (workflow subagent)
    -> PreToolUse: runBeforeAgent()
      -> execSync("furina change stage explore in_progress ...") [writes to memory]
    -> Workflow subagent runs explore -> propose -> plan -> review -> sdd -> finalize skills
      -> During propose: MCP markBeginPropose/markEndPropose markers
      -> During sdd: Bash tool calls to "furina change feature --start/--complete"
        -> PreToolUse: runBeforeBash() intercepts CLI calls
    -> PostToolUse: runAfterAgent()
      -> execSync("furina change stage explore done ...")
```

### 3. Service Lifecycle Flow

```
furina ui --restart
  -> CLI ui.ts: gracefulShutdown(port)
    -> port-manager.ts: isPortInUse() [net.createServer probe]
    -> HTTP POST /furina/api/shutdown [entry.ts graceful close]
    -> poll waitForPortFree() up to 5s
    -> force killPortProcess() fallback (platform-specific)
  -> CLI ui.ts: startBackendService(port)
    -> service-manager.ts: spawn(process.execPath, ["dist/server/entry.js"])
      -> detached: true, windowsHide: true
      -> writes PID file to ~/.furina/.furina.pid
    -> returns "http://localhost:3939/furina/ui"
  -> openBrowser(url)
```

### 4. Memory Sync Flow (Background)

```
Server entry.ts starts -> startScheduler()
  -> scheduler.ts: node-cron job (default: daily 02:00)
    -> scan ~/.furina/memory/Memory_* directories
    -> for each project with pending .md files:
      -> execSync("claude ... --agent backgroud-designer")
        -> reads design docs, generates project-design.md
    -> syncProjectGroup():
      -> execSync("claude ... --agent backgroud-grouper")
        -> aggregates project-design.md into project-groups.json
      -> project-group-schema.ts: validateProjectGroupsFile() [Zod strict]

CLI change feature --status
  -> syncDesignToMemory(): copies design.md to ~/.furina/memory/
    -> HTTP PUT /furina/api/schedule [ensures scheduler is running]
```

### 5. Anthropic API Proxy Flow

```
Claude CLI sends POST /v1/messages
  -> anthropic/router.ts: matches route, calls proxyRequestHandler()
    -> handler.ts: extract session_id from metadata.user_id
    -> session.ts: getProviderBySessionId()
      -> readSessionSettings() -> resolve via switchProviders map
      -> fallback: getProviderByModels([model]) -> providers-store lookup
      -> final fallback: getDefaultProvider() -> activeProvider
    -> handler.ts: prepareModifiedHeaders() [strip hop-by-hop, inject auth]
    -> handler.ts: mapModel() [haiku/opus/sonnet keyword matching]
    -> axios POST to upstream Provider baseUrl
    -> handler.ts: detectStreamRequest() -> dual-layer stream handling
      -> SSE Content-Type: pipe stream directly to Express response
      -> Non-SSE: buffer and forward
    -> router.ts: logRequest() [uvicorn-style access log]
```

---

## File System Layout

```
~/.furina/
  providers.json          # Provider CRUD (providers-store, single source of truth)
  .furina.pid         # Server PID + port (service-manager)
  settings.bak.json       # Backup of original ~/.claude/settings.json
  furina.json         # User-level config override (config I/O)
  logs/
    furina.log        # Current logger output (logger.ts)
    furina-*.log      # Rotated daily archives
    error.log             # Uncaught exceptions from entry.ts
    anthropic.log         # Global proxy request log
  sessions/<id>/
    settings.json         # Per-session config (session.ts)
    anthropic.log         # Per-session proxy log
    toolUseId.txt         # Hook-written prompt snapshot
    toolUseId.json        # Hook-written response snapshot
  memory/
    changes.json          # Global change registry (memory subsystem)
    Memory_<flatCwd>/
      designs/            # Synced design documents
      project-design.md   # Generated by scheduler agent
    project-groups.json   # Cross-project grouping result
    dreamwork.log         # Scheduler operation log

~/.claude/
  settings.json           # Claude CLI env config (claude-settings)

<project>/
  .claude/
    furina.json       # Project-level config override
  furina/
    changes.json          # Project-level change registry
    changes/<name>/
      proposal.md         # Generated proposal artifact
      design.md           # Generated design artifact
      specs/*.md          # Generated spec documents
      plan.json           # Feature decomposition + DAG
      api.yaml            # Optional API schema
      database.md         # Optional DB schema
    archive/
      YYYY-MM-DD-<name>/  # Archived change directories
```

---

## Module Overview

### CLI

Command-line interface system built on Commander.js. Provides 12 top-level commands covering plugin lifecycle (init/remove), service management (ui/active/launch), proxy control (enable/disable/recover), configuration (config/agents/schedule), and full change artifact lifecycle management (change).

- **Submodules**
  - `change/` -- Change artifact lifecycle. Manages creation (kebab-case validation + dual-level storage), listing, artifact pipeline status computation (proposal/design/specs ready/done/blocked state machine), archiving (atomic directory move + registry update + global memory sync), JSON template instruction generation (placeholder substitution + dependency checking), feature lifecycle (pending->in_progress->done transitions, DFS cycle detection, dependency resolution, DAG topology scheduling), and intelligent stage progress routing (10 stages, non-empty overlay merge, explore->coding auto-forwarding, coding->finalize.integration conditional routing). (8 specs)
- **Direct Specs**
  - `spec-entry-barrel.md` -- CLI entry and command registration. Defines bin/furina.js shebang entry and src/cli/index.ts barrel registration logic, creating Commander.js root instance and registering all 12 command modules.
  - `spec-init.md` -- Plugin initialization. Implements furina init's 5-step install flow: check Claude CLI, uninstall old plugin, remove old marketplace, add marketplace, install plugin, auto-start UI.
  - `spec-ui.md` -- UI service management. Covers --restart mode (cascade shutdown then restart), browser-only when service running, full startup when service stopped.
  - `spec-launch-active.md` -- Service start and health probing. Launch is fire-and-forget; active is health-check + self-heal primitive (exit 1 signals caller to retry).
  - `spec-enable-disable.md` -- Proxy toggle and Claude settings sync. Enable ensures backend running -> writes proxy flag -> syncs Claude settings.json; disable clears flag -> restores original settings.
  - `spec-recover.md` -- Claude settings restore. Thin command wrapper for restoreClaudeSettings(), used when settings.json is corrupted or proxy flag residues remain.
  - `spec-remove.md` -- Plugin uninstall. Fault-tolerant uninstall flow (plugin + marketplace), --yes skips confirmation, builds removal result summary.
  - `spec-agents.md` -- Per-session model routing management. 4 subcommands (list/show/switch/init), VALID_STAGES constrains stage parameter.
  - `spec-config.md` -- Global configuration management. 4 subcommands (list/show/mode/set), two-layer config model + Zod validation.
  - `spec-schedule.md` -- Scheduled task management. restart/stop subcommands delegate to backend schedule routes via HTTP API.
- **Index**: [CLI/toc.md](./cli/toc.md)

### Server

Express backend service module hosting Web UI backend, Anthropic-compatible API proxy, REST API routes, MCP endpoints, memory scheduling subsystem, Provider persistent store, Claude settings management, and background process control. Serves as the server-side runtime backbone, exposing HTTP endpoints for the React SPA frontend, transparently proxying Anthropic API requests to upstream LLM Providers, managing Provider configurations and Claude CLI settings, and running background cron schedulers for memory aggregation tasks.

- **Submodules**
  - `anthropic-proxy/` -- Anthropic API transparent proxy. Handles Provider resolution + auth injection, stream detection + dual-layer stream processing, model name mapping, hop-by-hop header stripping, path-level timeout differentiation (messages 600s / others 120s), global and per-session independent logging. (4 specs)
  - `claude-settings/` -- Claude CLI configuration management. Reads/writes ~/.claude/settings.json, backup/restore, and environment variable config generation. Generates ANTHROPIC_* env var objects based on run mode (proxy vs direct provider). (2 specs)
  - `memory-subsystem/` -- Background memory scheduling. Scans ~/.furina/memory/ for pending design documents, invokes Claude CLI for automated project design processing and cross-project memory aggregation. Includes scheduler core, design document sync, project group validation, and schedule-specific logging. (4 specs)
  - `providers-store/` -- Provider persistent store. Single data source at ~/.furina/providers.json. Zod schema + CRUD + active Provider state management (with cascade clearing) + default Provider resolution and model reverse lookup + global settings flags (proxy toggle, Claude backup guard, language preference). (5 specs)
  - `routes-api/` -- Express REST API route layer for frontend Web UI. Includes config-routes (language GET/PUT), providers-routes (full Provider lifecycle), schedule-routes (scheduler start/stop control). (3 specs)
- **Direct Specs**
  - `spec-app-entry.md` -- Application factory and server bootstrap. index.ts creates Express app (mounts all routes, SPA static files, beforeProxy hook, Anthropic proxy catch-all); entry.ts executes full bootstrap (listen, shutdown route, scheduler, exception handlers).
  - `spec-changes-api.md` -- Changes API routes and cross-project aggregation. GET / (local changes.json), GET /:name (exact query changes+archive), GET /all (cross-project aggregation with cwd/status filtering and fuzzy search, concurrent Memory directory scanning).
  - `spec-mcp-marker.md` -- MCP marker service. Based on Model Context Protocol, provides markBeginPropose/markEndPropose tools. Stateless mode (fresh McpServer per request, CVE-2026-25536 compliant).
  - `spec-service-manager.md` -- Background service process lifecycle management. Spawns Express server as detached subprocess (detached + windowsHide), persists PID+port to ~/.furina/.furina.pid, pre-checks build artifacts before startup.
- **Index**: [Server/toc.md](./server/toc.md)

### Client

React 18 single-page application frontend built with Vite. VSCode-style layout architecture with ActivityBar switching between Providers (supplier management) and Projects (change navigation) views. Covers full Provider lifecycle (CRUD dialogs, preset templates, API Key validation), project/change browsing (dual-tab sidebar, search with debounce, project grouping), 7-stage workflow progress visualization (horizontal scrollable progress axis, stage summary details), zh-CN/en-US i18n with runtime switching, and AI provider brand icon system.

- **Submodules**
  - `provider-management/` -- Full Provider lifecycle management. Covers ProviderList (API data fetch, loading/empty/error/normal quad-state), ProviderCard (brand icons, hover action button group, active/disabled visual), CRUD dialogs (AddProviderDialog with preset template selector and API Key validation, EditProviderDialog with prefilled form, DeleteConfirmDialog with double confirmation), ConfirmResetDialog. (6 specs)
  - `project-views/` -- Project views and change navigation. Covers ProjectSidebar (dual-tab: active changes / all changes grouped by project, with search, 300ms debounce, TabCache), collapsible ProjectGroup (cwd-based aggregation, localStorage collapse persistence), ChangeCard (tri-state border state machine), DetailPanel (state bridging), 7-stage horizontal progress axis (viewport window design, smooth scrolling, status coloring, STAGE_CONFIG export), stage summary details (generic / Finalize three-part sub-stages / subAgentDev grouped by featureId). (6 specs)
- **Direct Specs**
  - `spec-app-root.md` -- Application entry and root component. Covers HTML shell loading (index.html/index.css), async bootstrap (main.tsx initializes i18n before mounting React 18 concurrent mode), App root component with 8 top-level states and all Provider REST API operation wrappers.
  - `spec-layout.md` -- Application shell layout and ActivityBar. Layout fixed top Header (brand, Settings, Reset, proxy toggle, LanguageSwitcher, add button) and content area (ActivityBar 48px vertical icon bar + sidebar slot + main area), ActivityBar provides Providers/Projects view switching.
  - `spec-i18n.md` -- Internationalization subsystem. i18next + react-i18next dual language support (zh-CN/en-US), initI18n fetches language config from backend, LanguageSwitcher runtime switch + backend persistence, 130+ translation keys covering all UI areas.
  - `spec-icons.md` -- Provider brand icon asset system. 9 SVG icon files, ICON_MAP filename->Vite ?url import URL mapping, claude.svg dual purpose (brand identity + favicon).
  - `spec-client-utils-and-mocks.md` -- Client infrastructure layer. Browser-compatible logger (error/warn delegates console, info/debug no-ops), SVG URL Mock module (Vitest test environment replacement for Vite ?url imports), test environment initialization (jest-dom matchers + auto-cleanup).
- **Index**: [Client/toc.md](./client/toc.md)

### Utils

Cross-layer shared utility modules providing foundational services for CLI, Server, and Client. No dependencies on any higher-layer module. Covers Zod-based configuration system (schema definitions, deep-merge, loading, dot-path query, config I/O), global memory system (changes.json data model, I/O with seeding, entry lifecycle, 7 stage merge handlers), cross-platform port management, Winston file logger with daily rotation, Provider template CRUD, per-session settings management, and common path utilities.

- **Submodules**
  - `config/` -- Zod-based configuration subsystem, serving as single source of truth for Furina' full configuration tree. Covers Zod schema definitions with type derivation (FurinaConfig, DeepPartial), recursive deep-merge engine (layered default+override), load-time resilient Zod validation (prunes invalid leaf nodes instead of crashing), dot-path safe query, user/default config file I/O with atomic dot-path setter operations. (5 specs)
  - `memory/` -- Global change management memory subsystem. Manages ~/.furina/memory/changes.json -- central data model tracking all project changes through a 7-stage workflow. Covers Zod schema definitions (ChangeEntry/ChangeStage/SubAgentDevProgress/FinalizeStage), changes.json I/O (with auto-seeding from project-local changes.json and path existence validation), change entry lifecycle management (createOrUpdateChange as sole write entry point with progress sync and artifact scanning), and 7 specialized stage merge handlers (field-priority rules and cascade close logic). (4 specs)
- **Direct Specs**
  - `spec-logger.md` -- Global Winston file logger. Singleton module writing to ~/.furina/logs/furina.log with daily archival (mtime detection), graceful degradation to silent no-op when log directory is unwritable.
  - `spec-port-manager.md` -- Cross-platform port management and process termination. isPortInUse (net.createServer probe), killPortProcess (Windows netstat+taskkill / Unix lsof+kill-9), waitForPortFree (configurable timeout polling), gracefulShutdown (HTTP POST two-phase shutdown + force kill fallback).
  - `spec-provider-templates.md` -- Provider preset template CRUD. Read/add/delete templates from resources/claude-providers-template.json, builtin template protection, duplicate-name validation.
  - `spec-session.md` -- Per-session settings management and Provider resolution. ~/.furina/sessions/<id>/settings.json read/write (Windows path normalization), multi-level Provider resolution chain (session -> switchProviders mapping -> model-based lookup -> default fallback).
  - `spec-common.md` -- Shared utility functions. normalizePath path normalization (backslash->forward slash, merge consecutive slashes, remove trailing slash), used by memory.ts's flattenCwdPath.
- **Index**: [Utils/toc.md](./utils/toc.md)

### Marketplace

Claude Code plugin marketplace definition module containing skill definitions, Hook lifecycle engine, workflow orchestration, plugin manifest, and resource templates. This module is Furina' intelligence layer: 13 skills orchestrate the full software development lifecycle, the Hook Runner manages Agent session lifecycle, the workflow slash command chains 6 phases (Explore -> Propose -> Plan -> Review -> SDD -> Finalize), and static resource files provide runtime default data and instruction templates.

Note: This module is NOT a typical Node.js import dependency. It is loaded by Claude Code's runtime through `hooks.json` (hook rules) and `plugin.json` (MCP server registration). The `furina_hooks.js` script invokes CLI commands via `execSync()`, bridging the hook system to the CLI module.

- **Submodules**
  - `hooks/` -- Hook Runner runtime infrastructure. Manages Agent session lifecycle across workflow phases, implements automatic Provider switching, session state management, and change stage tracking. hooks.json registers 7 declarative trigger rules (5 PreToolUse + 1 PostToolUse + 1 UserPromptSubmit), furina_hooks.js intercepts tool calls (Agent/Bash/AskUserQuestion/MCP propose), uses regex-first / JSON-fallback dual strategy to parse stdin data, dispatches to furina CLI commands for session management. Covers 6 regex pattern constants, 4 specialized handlers, and 127 Vitest test cases. (6 specs)
  - `skills/` -- Furina skill definition set. 13 skills (11 spec documents), each a self-contained instruction set (SKILL.md + instructions/ + references/) orchestrating a specific development lifecycle phase. Workflow mainline skills (explore -> brainstorm -> propose -> plan -> review -> sdd -> finalize) execute in 6-phase order; cross-cutting skills (tdd, cleancode, codebase, commit) are called on demand. Covers multi-dimensional codebase exploration, stance-based brainstorming, artifact generation, schema supplementation and topology-sorted planning, dual-phase review, SubAgent-driven development, TDD discipline, coding standards query, codebase document tree management, and Git auto-commit push. (11 specs)
- **Direct Specs**
  - `spec-plugin-manifest.md` -- Plugin manifest and registration. marketplace.json defines marketplace entries, plugin.json defines plugin body (name, version, MCP server config pointing to localhost:3939), details init/remove registration flow and MCP tool namespace rules.
  - `spec-slash-command-workflow.md` -- Workflow slash command. /furina:workflow 6-phase sequential workflow (Explore -> Propose -> Plan -> Review -> SDD -> Finalize), artifact-based stage detection and recovery logic, Hooks integration flow, three workflow mode presets (Lite/Standard/Max with experimental config combinations), MCP marker tools, 13 red-line warnings.
  - `spec-resources-templates.md` -- Resource templates and configuration. Covers 9 static resource files: furina.json (default config), claude-providers-template.json (12 built-in Provider registry), 3 artifact templates (proposal/design/specs), 2 Agent definitions (background-designer/grouper), 2 Skill definitions (compose-design/group-design), detailing config loading, template substitution, and memory sync data flow.
- **Index**: [Marketplace/toc.md](./marketplace/toc.md)
