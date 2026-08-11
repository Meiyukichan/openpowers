# Utils -- Shared Utility Modules

> Shared utility modules providing foundational services across CLI, server, and client layers. Covers Zod-based configuration system (schema definitions, deep-merge, loading, dot-path query, config I/O), global memory system (changes.json data model, I/O with seeding, entry lifecycle, stage merge handlers), cross-platform port management, Winston file logger with daily rotation, provider template CRUD, per-session settings management, and common path utilities.

## Module Relationship Diagram

```
┌───────────────────────────────┐
│           Logger              │
│  Winston file logger singleton│
│  daily rotation, graceful     │
│  degradation                  │
└──────────────┬────────────────┘
               │ 被所有模块依赖
               ▼
┌───────────────────────────────┐  ┌───────────────────────────────┐
│       Config (submodule)      │  │    Port Manager                │
│  Zod schema, deep-merge,      │  │  端口检测, 进程终止,            │
│  loader, query, config I/O    │  │  优雅关停                      │
└───────────────────────────────┘  └──────────────┬────────────────┘
                                                  │ isPortInUse / gracefulShutdown
                                                  ▼
                                       ┌──────────────────────┐
                                       │   CLI Commands        │
                                       │   ui, launch, active  │
                                       └──────────────────────┘

┌───────────────────────────────┐  ┌───────────────────────────────┐
│     Memory (submodule)        │  │  Provider Templates           │
│  changes.json data model,     │  │  CRUD for provider presets    │
│  I/O, entry lifecycle,        │  │  read/add/delete templates    │
│  7-stage merge handlers       │  └───────────────┬───────────────┘
└──────────────┬────────────────┘                  │ readProviderTemplates
               │ createOrUpdateChange              ▼
               ▼                          ┌──────────────────────┐
┌───────────────────────────────┐         │  Server Routes        │
│   Session Settings            │         │  /providers API       │
│  per-session config,          │         └──────────────────────┘
│  provider resolution,         │
│  debug body logging           │
└───────────────────────────────┘
         │ getProviderBySessionId
         ▼
┌───────────────────────────────┐
│  Anthropic API Proxy Handler  │
│  /server/anthropic/handler.ts │
└───────────────────────────────┘
```

## Submodules

| Submodule | Description | Spec Count | Index |
|-----------|-------------|------------|-------|
| [config/](./config/) | **Zod-based configuration subsystem**. Serves as the single source of truth for Furina' full configuration tree (provider assignments, project, exploration, experimental, enhancement, memory settings). Covers 5 aspects: Zod schema definitions with type derivation (`FurinaConfig`, `DeepPartial<T>`), recursive deep-merge engine for layered "default + override" configuration, load-time resilient Zod validation that prunes invalid leaf nodes instead of crashing, dot-path safe query access, and user/default config file I/O with atomic dot-path setter operations. All config commands (`config set`, `config mode`, `config show`) depend on this subsystem. | 5 specs | [toc.md](./config/toc.md) |
| [memory/](./memory/) | **Global memory subsystem for change management**. Manages `~/.furina/memory/changes.json`, the central data model tracking all project changes through a 7-stage workflow (explore, brainstorm, propose, plan, review, coding, finalize). Covers 4 aspects: Zod schema definitions for the full change data model (entries, stages, sub-agent progress), changes.json I/O with auto-seeding from project-local `furina/changes.json` and path existence validation, change entry lifecycle management with `createOrUpdateChange` as the sole write entry point (handles creation, metadata updates, progress sync, artifact scanning), and 7 specialized stage merge handlers implementing field-priority rules and cascade close logic. | 4 specs | [toc.md](./memory/toc.md) |

## Direct Spec Documents

| Spec | Description | Source Files |
|------|-------------|--------------|
| [spec-logger.md](./spec-logger.md) | **Global Winston file logger with daily rotation**. Covers the singleton logger module that provides unified logging across the entire project. Implements `ensureLogDir` (directory creation), `rotateLogIfNeeded` (mtime-based daily archival to `furina-YYYY-MM-DD.log`), and `createWinstonLogger` (Winston factory with `YYYY-MM-DD HH:mm:ss,SSS` format, File-only transport, `info` level). Gracefully degrades to a silent no-op logger if log directory is unwritable. Exported as a module-level singleton consumed by config, port-manager, server, MCP, and CLI modules. | `src/utils/logger.ts:1-87` |
| [spec-port-manager.md](./spec-port-manager.md) | **Cross-platform port management and process termination**. Covers `isPortInUse` (non-intrusive probe via `net.createServer`), `killPortProcess` (platform-dispatched: Windows `netstat+taskkill` / Unix `lsof+kill -9`), `waitForPortFree` (polling loop with configurable timeout), `gracefulShutdown` (two-phase: HTTP POST `/furina/api/shutdown` then force-kill fallback), and internal helpers `killPortWithCommand` (strategy pattern for platform-specific commands) and `parseWindowsNetstatOutput` (PID deduplication and System Idle Process filtering). Used by `ui --restart`, `launch`, `active`, `enable`, and `schedule` CLI commands. | `src/utils/port-manager.ts:1-288` |
| [spec-provider-templates.md](./spec-provider-templates.md) | **Provider preset template CRUD operations**. Covers `readProviderTemplates` (defensive read from `resources/claude-providers-template.json`, returns `[]` on file-not-found or JSON parse failure), `addProviderTemplate` (append with duplicate-name check, server-enforced `source: 'custom'`), and `deleteProviderTemplate` (with builtin template protection). All write operations follow the read-modify-write pattern. The `ProviderTemplate` interface defines 8 fields including `name`, `baseUrl`, `iconSvg`, model identifiers, and `source` discriminator. Consumed by server routes at `/furina/api/providers/templates`. | `src/utils/provider-templates.ts:1-117` |
| [spec-session.md](./spec-session.md) | **Per-session settings management and provider resolution**. Covers `getSessionFilePath` (path computation under `~/.furina/sessions/<id>/settings.json`), `readSessionSettings` (JSON read with Windows backslash normalization for `cwd`), `writeSessionSettings` (auto-creating directory structure), `getProviderBySessionId` (multi-level provider resolution: session config -> switchProviders mapping -> model-based lookup in providers-store, with cascading fallback to `getDefaultProvider`), and `writeSessionBodyJson` (debug request body snapshot, silent failure). The `SessionSettings` interface includes `sessionId`, `cwd`, `currentProvider`, `switchProviders`, and optional `change`/`brainstorm`/`prompt` fields. Consumed by Anthropic API proxy handler and `agents`/`change stage` CLI commands. | `src/utils/session.ts:1-124` |
