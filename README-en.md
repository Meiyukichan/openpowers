# Furina

> Evolved from [OpenSpec](https://github.com/Fission-AI/OpenSpec) + [SuperPowers](https://github.com/obra/superpowers), built for Claude Code — a plugin system that enables seamless switching between different vendor models within the same session and provides a structured SDD+TDD development workflow.

[Furina](https://github.com/Meiyukichan/furina) is a plugin-based development toolkit for **Claude Code**. It provides a complete **SDD (Specification-Driven Development) + TDD (Test-Driven Development)** workflow within Claude Code, and through a built-in **Anthropic API Proxy**, enables the ability to freely switch between multiple AI model vendors **within the same session**.

---

## Table of Contents

- [Installation & Initialization](#installation--initialization)
- [Quick Start](#quick-start)
- [Four Core Modules](#four-core-modules)
  - [1. Marketplace — Claude Code Plugin](#1-marketplace--claude-code-plugin)
  - [2. CLI Command System](#2-cli-command-system)
  - [3. Web UI Management Panel](#3-web-ui-management-panel)
  - [4. Multi-Vendor Model Proxy](#4-multi-vendor-model-proxy)
- [CLI Command Reference](#cli-command-reference)
- [Workflow Details](#workflow-details)
- [Configuration System](#configuration-system)
- [License](#license)

---

## Installation & Initialization

### Requirements

- **Node.js** >= 20
- **Claude Code** (must be installed first)

### Install

```bash
npm i -g @meiyukichan/furina
```

### Initialize

```bash
furina init
```

One command completes the plugin installation. After initialization, open Claude Code and type `/furina:workflow` to get started.

---

## Quick Start

### Step 1: Open Web UI Management Panel

```bash
furina ui
```

Your browser will automatically open `http://localhost:3939`.

### Step 2: Add Your Model Vendors

Click **Add Vendor** in the Web UI and fill in:

- **Vendor Name** (e.g., DeepSeek, Kimi)
- **API Key**
- **Base URL**
- **Model Mapping** (Sonnet model name, Opus model name, Haiku model name)

You can also import from preset templates with one click.

### Step 3: Enable a Vendor

Click **Enable** on the vendor card to set it as the default call target.

### Step 4: Enable the Proxy

Click **Enable Proxy** in the Web UI, or use the CLI command:

```bash
furina enable
```

Once enabled, all Claude Code API requests will be automatically routed through the Furina proxy to your selected active vendor.

Note: The auto-switching feature across different workflow phases requires the proxy to be **enabled first**.

### Step 5: Start the Workflow

In Claude Code, type:

```
/furina:workflow {your requirement}
```

The workflow will guide you through the complete development process from exploration to finalization.

---

## Four Core Modules

### 1. Marketplace — Claude Code Plugin

Once installed as a Claude Code plugin, Furina injects **12 Skills**, **Lifecycle Hooks**, and the core **Workflow Command** into Claude Code.

#### Core Command

| Command | Description |
|------|------|
| `/furina:workflow` | Launch the 6-phase structured development workflow |

#### 12 Skills at a Glance

| Skill | Type | Description |
|------|------|------|
| `furina-workflow` | Command | Entry point for the 6-phase SDD+TDD workflow |
| `furina-explore` | Explore | Dispatch multiple exploration subagents concurrently to investigate codebases, repositories, references, specs, and more |
| `furina-brainstorm` | Think | Brainstorming partner for refining requirements and exploring solutions |
| `furina-propose` | Propose | One-click generation of proposals, design docs, and specs |
| `furina-plan` | Plan | Supplement technical spec schema docs and generate executable implementation plans based on specs |
| `furina-review` | Review | Dispatch a review subagent to review proposals and plans for completeness and feasibility, with auto-fix |
| `furina-sdd` | Implement | Subagent-driven development — dispatch implementation subagents per feature in topological order with two-phase review |
| `furina-tdd` | Test | TDD enforcement — write tests first, then implement |
| `furina-finalize` | Finalize | Auto Git commit, push, and sync Codebase documentation |
| `furina-codebase` | Documentation | Codebase integration with three instructions: explore, generate, synchronize |
| `furina-cleancode` | Quality | Query coding standards and output focused guidelines before generating code |
| `furina-commit` | Tool | Auto-stage changes, generate Conventional Commits messages, and push safely |

#### furina-codebase in Detail

`furina-codebase` organizes the project's source code into a hierarchically structured **code-document tree** (Codebase), enabling LLMs to navigate and retrieve information by level. The document tree structure:

```
{codebaseDir}/
├── toc.md                          ← Overview (top-level index, ≤500 lines)
├── {module-a}/
│   ├── toc.md                      ← Module index
│   ├── {submodule-1}/
│   │   ├── toc.md                  ← Submodule index
│   │   ├── spec-xxx.md
│   │   └── spec-yyy.md
│   ├── {submodule-2}/
│   │   └── ...
│   └── spec-zzz.md                 ← Direct spec under module
└── ...
```

Three operations via the `instruction` parameter:

| Instruction | Purpose | Core Flow |
|------|------|------|
| `explore` | Query relevant implementations by business/feature/code keywords | Module location → submodule matching → spec verification → output source summaries + upstream callers + downstream dependencies |
| `generate` | Generate a Codebase document tree from scratch | Global scan & module partitioning → per-module submodule/spec discovery → spec document generation → bottom-up toc.md creation → comprehensive review |
| `synchronize` | Sync incremental code changes back into the document tree | Determine Codebase state → locate target specs → create/update/delete specs → bottom-up toc updates → index traceability verification |

- **explore** depends on an existing document tree and does not generate new documents; query results include spec summaries + direct source code + upstream callers + downstream dependencies
- **generate** automatically skips test files (`*.test.ts`, `__tests__/**`, etc.); module/submodule scale is capped (≤50 children / 5-50 specs)
- **synchronize** follows strict incremental discipline — only processes the user-provided change file list without expanding scope; auto-switches to `generate` flow on first-time initialization

#### Hooks — Lifecycle Hooks

Furina leverages Claude Code's Hook mechanism to automatically intervene before and after Agent tool calls:

- **PreToolUse**: Before a subagent starts, automatically switches to the configured model vendor for the current workflow phase
- **PostToolUse**: After a subagent completes, captures output and records logs
- **UserPromptSubmit**: Automatically initializes the session when the user submits a prompt

This means **you never need to manually switch models** — the workflow automatically selects the configured AI model during exploration, proposal, planning, coding, and other phases.

---

### 2. CLI Command System

The `furina` CLI is the command-line support system for the workflow, providing initialization, configuration management, change tracking, session scheduling, and other tools.

```bash
furina [command] [options]
```

#### Command Overview

| Command | Description |
|------|------|
| `furina init` | Initialize the Furina plugin; auto-starts the UI service after installation |
| `furina ui [--restart]` | Start the Web UI management panel and open in browser |
| `furina launch` | Start the backend service (without opening the browser) |
| `furina active` | Probe the backend service status; auto-start if not running (self-healing) |
| `furina enable` | Enable the Anthropic API proxy, routing Claude Code requests to the active vendor |
| `furina disable` | Disable the proxy, restore original Claude Code settings |
| `furina remove [-y]` | Uninstall the Furina plugin and all its configurations |
| `furina recover` | Restore default settings when Claude Code configuration is broken |
| `furina config list` | List the complete merged configuration (JSON format) |
| `furina config show <key...>` | Query config values by dot-path keys (supports `codebases` virtual key) |
| `furina config mode <lite\|standard\|max>` | Apply a preset for experimental feature flags in one step |
| `furina config set <key> <value> [--global]` | Write a single config entry (auto-infers type) |
| `furina agents list [--session <id>]` | List vendor models or session stage-model mappings |
| `furina agents show <stage> --session <id>` | Show the model name for a given workflow stage |
| `furina agents switch <name> [--session <id>]` | Switch model vendor globally or at session level |
| `furina agents init --session <id> --cwd <path>` | Initialize session configuration file |
| `furina change list` | List all active changes and their progress |
| `furina change new <name> --desc <description>` | Create a new change directory |
| `furina change status <name>` | View change artifact pipeline status (JSON) |
| `furina change archive <name>` | Archive a completed change |
| `furina change instruction <name> --proposal\|--design\|--specs` | Get artifact generation instructions |
| `furina change feature <name> --status\|--next\|--start\|--complete` | Feature lifecycle management |
| `furina change stage <name> --session <id> --status <st> [--title\|--input\|--output]` | Update stage progress of a change |
| `furina schedule restart` | Restart the cron scheduler |
| `furina schedule stop` | Stop the cron scheduler |

---

### 3. Web UI Management Panel

```bash
furina ui [--restart]
```

A visual web-based management interface running at `http://localhost:3939`, providing:

- **Model Vendor Management** — Add, edit, delete, and search model vendors
- **Active Vendor Switching** — Set a vendor as the preferred one with one click
- **Vendor Template System** — 12 pre-configured vendor templates, ready to use out of the box
- **Proxy Toggle Control** — Visually enable/disable the Anthropic API proxy
- **One-Click Reset** — Restore to default configuration

---

### 4. Multi-Vendor Model Proxy

This is Furina' core capability — a **true multi-vendor multi-agent collaboration architecture** within **the same Claude Code session**.

#### How It Works for You

During the `/furina:workflow` workflow, different phases automatically switch to your pre-configured model vendors. For example:

- **Explore phase**: Use a cost-effective model (e.g., DeepSeek)
- **Propose / Review phase**: Switch to the strongest reasoning model (e.g., Claude Opus)
- **Coding phase**: Use a balanced model, or even assign different vendors to each subagent
- **Finalize phase**: Use a lightweight, fast model

Simply pre-configure which vendor you want for each phase in the Web UI and config — everything switches automatically with no manual intervention.

#### Core Features

- **Different phases, different models**: Automatically select the most suitable vendor model for exploration, proposal, coding, and other phases
- **One session, multiple vendors**: Schedule DeepSeek, Claude, Kimi, and other AIs in the same conversation without switching tools
- **Plug-and-play, no code changes**: Claude Code experience remains unchanged when the proxy is on — vendor switching happens automatically in the background

#### Phase–Model Mapping Configuration

```json
{
  "switchProviders": {
    "workflow": "deepseek-v4-pro",
    "explore": "MiniMax-M2.7",
    "propose": "glm-5.0",
    "plan": "MiniMax-M2.7",
    "review": "mimo-v2.5-pro",
    "coding": "deepseek-v4-pro",
    "finalize": "deepseek-v4-pro"
  }
}
```

- Model names come from the vendor models configured in the Web UI; `"default"` means using the active vendor's default model
- Configuration file path: `{project}/.claude/furina.json`

---

## CLI Command Reference

### `furina init`

```bash
furina init
```

Initializes the Furina plugin. Automatically completes plugin installation and UI service startup. After installation, `/furina:workflow` can be used directly.

---

### `furina ui`

```bash
# Start the UI management panel
furina ui

# Restart the UI management panel
furina ui --restart
```

Starts the Web management panel at `http://localhost:3939/furina/ui`. `--restart` terminates any existing process before restarting.

---

### `furina launch`

```bash
furina launch
```

Starts the Furina backend service in the background without opening the browser. Prints a message if the service is already running.

---

### `furina active`

```bash
furina active
```

Probes the backend service status. Outputs "active" if the service is running; automatically starts the service if not (self-healing mechanism).

---

### `furina enable`

```bash
furina enable
```

Enables the Anthropic API proxy. Automatically syncs Claude Code settings, routing all API requests to the local proxy.

---

### `furina disable`

```bash
furina disable
```

Disables the proxy, restoring original Claude Code settings or falling back to direct vendor configuration.

---

### `furina remove`

```bash
# Interactive uninstall
furina remove

# Skip confirmation
furina remove -y
```

Uninstalls the Furina plugin and all its configurations.

---

### `furina recover`

```bash
furina recover
```

Restores default settings when Claude Code configuration is broken.

---

### `furina config`

```bash
# View complete config (merged: defaults + project override)
furina config list

# Query by path
furina config show language
furina config show project.sourcecode
furina config show project.codebase
furina config show exploration.repository
furina config show codebases

# Apply a feature preset (lite / standard / max)
furina config mode standard

# Write config (auto-infers type: string, number, boolean)
furina config set experimental.review.code true
furina config set language english --global
```

`config show codebases` is a virtual key that automatically assembles `project.codebase.path` and `exploration.codebase` into a unified list.

`config mode` presets:
| Mode | explore | furina review | specs review | code review |
|------|---------|-------------------|--------------|-------------|
| `lite` | Off | Off | Off | Off |
| `standard` | On | Off | Off | On |
| `max` | On | On | On | On |

---

### `furina agents`

```bash
# List all model vendors (table)
furina agents list

# View session stage-model mappings
furina agents list --session <session-id>

# View the model for a specific stage
furina agents show plan --session <session-id>

# Switch vendor globally (by vendor name or model name)
furina agents switch DeepSeek

# Switch at session level
furina agents switch kimi2.6 --session <session-id>

# Initialize session settings
furina agents init --session <session-id> --cwd /path/to/project
  [--change <change-name>] [--prompt <text>]
```

---

### `furina change`

```bash
# List all active changes and their progress
furina change list

# Create a new change
furina change new my-feature --desc "Add user login feature"

# View change status
furina change status my-feature

# Get artifact generation instructions
furina change instruction my-feature --proposal

# Manage feature lifecycle
furina change feature my-feature --status
furina change feature my-feature --next
furina change feature my-feature --start feat-1
furina change feature my-feature --complete feat-1

# Update stage progress (called by Hooks)
furina change stage explore --session <id> --status done --title "Exploration complete"

# Archive a completed change
furina change archive my-feature
```

---

### `furina schedule`

```bash
# Restart the cron scheduler
furina schedule restart

# Stop the cron scheduler
furina schedule stop
```

Requires the Furina backend service to be running.

---

## Workflow Details

`/furina:workflow` provides a complete 6-phase development process from idea to delivery:

```
Idea → 1.Explore → 2.Propose → 3.Plan → 4.Review → 5.SDD → 6.Finalize
```

### Phase 1: Explore

Uses the `furina-explore` skill to concurrently dispatch multiple exploration subagents based on `exploreType`, deeply investigating the project's code structure, reference documents, repository materials, existing specs, etc.

**Output**: Exploration results written to the `explore-design/` directory

**Vendor**: Automatically uses the model configured for the `explore` phase

---

### Phase 2: Propose

First uses `furina-brainstorm` for requirement brainstorming and alignment, then uses `furina-propose` to generate a complete proposal in one step:
- `proposal.md` — Purpose, scope, and impact of the change
- `design.md` — Technical design decisions
- `specs/**/*.md` — Detailed feature specifications

After this phase, the user is prompted to choose a workflow mode (Lite / Standard / Max) to control review levels in subsequent phases.

**Output**: Proposal trilogy

**Vendor**: Automatically uses the model configured for the `propose` phase

---

### Phase 3: Plan

Dispatches a planning subagent to generate an executable implementation plan `plan.json` based on the spec documents, with dependency topological sorting.

**Output**: `plan.json` (optional `api.yaml`, `database.md`)

**Vendor**: Automatically uses the model configured for the `plan` phase

---

### Phase 4: Review Furina Artifacts

Uses the `furina-review` skill to review the completeness and feasibility of the proposal, design, specs, and plan.

**Output**: Review feedback and modification suggestions

**Vendor**: Automatically uses the model configured for the `review` phase

---

### Phase 5: SDD — Subagent-Driven Development

Uses the `furina-sdd` skill to process features from `plan.json` in topological order, dispatching a fresh implementation subagent for each feature. Each subagent enforces `furina-tdd` internally (write tests first, then implement), followed by two-phase review: **spec compliance review** and **code quality review**.

**Output**: Test cases + implementation code + review approval reports

**Vendor**: Each subagent can independently use different vendor models

---

### Phase 6: Finalize

Uses the `furina-finalize` skill to automatically complete:
- Integration testing
- Codebase documentation synchronization
- Change archiving
- Git commit and push

**Vendor**: Automatically uses the model configured for the `finalize` phase

---

### Resume from Interruption

The workflow supports resuming from interruption. On startup, it automatically detects existing artifacts, skips completed phases, and continues from the current progress without losing any produced artifacts.

---

## Configuration System

Furina supports global default configuration and project-level override configuration:

- **Project config**: Written in `.claude/furina.json` at the project root; applies only to the current project
- **Default config**: Items not overridden in the project config automatically use global defaults

### Configuration Reference

```jsonc
{
  // Output language
  "language": "chinese",

  // Model vendors auto-switched per phase
  "switchProviders": {
    "workflow": "default",          // Workflow orchestration
    "explore": "default",           // Explore phase
    "propose": "default",           // Propose phase
    "plan": "default",              // Plan phase
    "review": "default",            // Review phase
    "coding": "default",            // Coding phase
    "finalize": "default"           // Finalize phase
  },

  // Project settings
  "project": {
    "sourcecode": "./",            // Source code directory
    "codebase": {                  // Project Codebase settings
      "enable": false,
      "path": "docs/codebase"
    }
  },

  // Exploration configuration
  "exploration": {
    "codebase": [],                // Additional Codebase paths to query during exploration
    "repository": [                // Project repositories to reference during exploration
      {
        "type": "directory",
        "path": "./furina/",
        "description": "Furina artifacts directory for cross-change global historical reference"
      }
    ],
    "reference": [],               // External reference materials for exploration
    "specification": []            // Specification documents for exploration
  },

  // Experimental features
  "experimental": {
    "explore": true,               // Enable exploration phase
    "websearch": true,             // Enable web search
    "context7": true,              // Enable Context7
    "review": {
      "furina": false,         // Review Furina artifacts
      "propose": false,            // Review proposal
      "plan": false,               // Review plan
      "specs": false,              // Review specs
      "code": true,                // Code quality review
      "acceptance": true           // Acceptance review
    },
    "prompt": {
      "reviewCode": null           // Custom prompt for code review (skill name or content)
    },
    "coverage": "70%",             // Target test coverage
    "budget": true,                // Enable budget management
    "factor": 1                    // Feature count factor (features < factor * specs)
  },

  // Enhancement configuration
  "enhancement": {
    "context": null,               // Enhancement context
    "rules": {
      "design": [],                // Design phase enhancement rules
      "specs": [],                 // Specs phase enhancement rules
      "implement": []              // Implementation phase enhancement rules
    },
    "memory": {
      "schedule": "14 18 * * *"    // Memory scheduling cron expression
    }
  }
}
```

---

## License

[MIT](LICENSE) © 2026 Meiyukichan

---

*Furina — Give Claude Code multi-vendor model switching and scheduling within a single session, delivering high-quality code through a structured workflow.*
