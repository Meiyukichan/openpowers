# OpenPowers

> Evolved from [OpenSpec](https://github.com/anthropics/openspec) + [SuperPowers](https://github.com/obra/superpowers), a plugin system purpose-built for Claude Code that lets you switch between different provider models within the same session, backed by a structured SDD+TDD development workflow.

OpenPowers is a plugin-based development toolkit for **Claude Code**. It provides a complete **SDD (Spec-Driven Development) + TDD (Test-Driven Development)** workflow within Claude Code, and through its built-in **Anthropic API proxy**, enables seamless switching between multiple AI model providers within a **single session**.

---

## Table of Contents

- [Installation & Initialization](#installation--initialization)
- [Quick Start](#quick-start)
- [Four Core Modules](#four-core-modules)
  - [1. Marketplace — Claude Code Plugin](#1-marketplace--claude-code-plugin)
  - [2. CLI Command System](#2-cli-command-system)
  - [3. Web UI Management Panel](#3-web-ui-management-panel)
  - [4. Multi-Provider Agent Proxy](#4-multi-provider-agent-proxy)
- [CLI Command Reference](#cli-command-reference)
- [Workflow in Detail](#workflow-in-detail)
- [Configuration System](#configuration-system)
- [License](#license)

---

## Installation & Initialization

### Prerequisites

- **Node.js** >= 20
- **Claude Code** (must be installed beforehand)

### Install

```bash
npm i -g @meiyukichan/openpowers
```

### Initialize

```bash
openpowers init
```

A single command completes the plugin installation. After initialization, open Claude Code and enter `/openpowers:workflow` to get started.

---

## Quick Start

### Step 1: Open the Web UI

```bash
openpowers ui
```

Your browser will automatically open `http://localhost:3939`.

### Step 2: Add Your Model Providers

In the Web UI, click **Add Provider** and fill in:

- **Provider Name** (e.g., DeepSeek, Kimi)
- **API Key**
- **Base URL**
- **Model Mapping** (Sonnet model name, Opus model name, Haiku model name)

You can also import from pre-built templates with one click.

### Step 3: Enable a Provider

Click **Enable** on a provider card to set it as the default.

### Step 4: Enable the Proxy

Toggle **Enable Proxy** in the Web UI, or use the CLI:

```bash
openpowers enable
```

Once enabled, all Claude Code API requests will be automatically routed through the OpenPowers proxy to your active provider.

**Important!** Automatic phase-based model switching requires the proxy to be **enabled first**.

### Step 5: Start the Workflow

In Claude Code, enter:

```
/openpowers:workflow {your requirement}
```

The workflow will then guide you through the complete development process from exploration to archive.

---

## Four Core Modules

### 1. Marketplace — Claude Code Plugin

Once installed as a Claude Code plugin, OpenPowers injects **13 Skills**, **lifecycle Hooks**, and the core **workflow command** into Claude Code.

#### Core Command

| Command | Description |
|---------|-------------|
| `/openpowers:workflow` | Start the 8-phase structured development workflow |

#### 13 Skills at a Glance

| Skill | Type | Description |
|------|------|-------------|
| `openpowers-workflow` | Command | Entry point for the 8-phase SDD+TDD workflow |
| `openpowers-explore` | Exploration | Investigate the codebase to understand existing implementations and architecture |
| `openpowers-brainstorm` | Ideation | Thinking partner for brainstorming ideas and clarifying requirements |
| `openpowers-propose` | Proposal | Generate proposals, design docs, and specs in one step |
| `openpowers-schema` | Design | Generate API or database schema documentation |
| `openpowers-plan` | Planning | Generate executable implementation plans from specs |
| `openpowers-review` | Review | Dispatch 3 specialized sub-agent reviewers for proposals, plans, and code quality |
| `openpowers-sdd` | Implementation | Sub-agent-driven development with concurrent feature dispatching |
| `openpowers-tdd` | Testing | Enforce TDD — tests first, then implementation |
| `openpowers-finalize` | Wrap-up | Auto Git commit and push to complete code saving |
| `openpowers-archive` | Archive | Archive completed changes to history |
| `openpowers-codebase-generator` | Documentation | Generate structured project documentation trees |
| `openpowers-codebase-explorer` | Query | Query the codebase by business/feature keywords |
| `openpowers-codebase-sync` | Sync | Sync documentation with codebase changes |

#### Hooks — Lifecycle Automation

OpenPowers leverages Claude Code's Hook mechanism to automatically intervene before and after Agent tool invocations:

- **PreToolUse**: Automatically switches the model provider based on the current workflow phase before a sub-agent starts
- **PostToolUse**: Captures output and writes logs after a sub-agent completes
- **UserPromptSubmit**: Auto-initializes the session when the user submits a prompt

This means **you never need to switch models manually** — the workflow automatically selects the most suitable AI model for exploration, proposal, planning, coding, and every other phase.

---

### 2. CLI Command System

The `openpowers` CLI is the command-line backbone of the workflow, providing initialization, configuration management, change tracking, and session scheduling.

```bash
openpowers [command] [options]
```

#### Command Overview

| Command | Description |
|---------|-------------|
| `openpowers init` | Initialize the OpenPowers plugin (run once), auto-starts UI service after install |
| `openpowers ui [--restart]` | Launch the Web UI management panel and open in browser |
| `openpowers enable` | Enable the Anthropic API proxy, routing Claude Code requests to the active provider |
| `openpowers disable` | Disable the proxy and restore original Claude Code settings |
| `openpowers remove [-y]` | Uninstall the OpenPowers plugin and all its configurations |
| `openpowers recover` | Restore default settings when Claude Code configuration has issues |
| `openpowers config list` | Print the current full configuration (JSON format) |
| `openpowers config show <key...>` | Query configuration items by dot-path key |
| `openpowers agents list [--session <id>]` | List model providers or session stage-to-model mappings |
| `openpowers agents show <name> --session <id>` | Show the model used for a specific workflow stage in a session |
| `openpowers agents switch <name> [--session <id>]` | Switch the provider globally or per session |
| `openpowers agents init --session <id>` | Initialize session settings file |
| `openpowers change list` | List all active changes with progress |
| `openpowers change new <name> --desc <description>` | Create a new change directory |
| `openpowers change status <name>` | Output change artifact pipeline status (JSON) |
| `openpowers change archive <name>` | Archive a completed change |
| `openpowers change instruction <name> --proposal\|--design\|--specs` | Generate artifact creation instructions from templates |
| `openpowers change feature <name> --status\|--next\|--start\|--complete` | Feature lifecycle management |

---

### 3. Web UI Management Panel

```bash
openpowers ui [--restart]
```

A visual web management interface running at `http://localhost:3939`, providing:

- **Provider Management** — Add, edit, delete, and search model providers
- **Active Provider Switching** — Set a provider as the active default with one click
- **Provider Templates** — 12 pre-built provider templates, ready to use out of the box
- **Proxy Toggle** — Enable/disable the Anthropic API proxy visually
- **One-Click Reset** — Restore to default configuration

---

### 4. Multi-Provider Agent Proxy

This is OpenPowers' core capability — a **true multi-provider, multi-agent collaboration** architecture within a **single Claude Code session**.

#### How It Works for You

During the `/openpowers:workflow` workflow, different phases automatically switch to your pre-configured model providers. For example:

- **Exploration phase**: Use a cost-effective model (e.g., DeepSeek)
- **Proposal / Review phases**: Switch to the strongest reasoning model (e.g., Claude Opus)
- **Implementation phase**: Use a balanced model, or assign different providers to individual sub-agents
- **Finalize / Archive phases**: Use a lightweight, fast model

Simply pre-configure which provider you want for each phase in the Web UI or config file — everything switches automatically thereafter, no manual intervention needed.

#### Key Features

- **Different models for different phases**: The most suitable provider model is automatically selected for exploration, proposal, coding, and every phase
- **Multiple providers, one session**: No need to switch tools — orchestrate DeepSeek, Claude, Kimi, and other AI providers within a single conversation
- **Zero code changes**: After enabling the proxy, the Claude Code experience is completely unchanged — provider switching happens transparently in the background

#### Configurable Phase-to-Model Mapping

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

- Model names come from the provider's model name configured in the Web UI. Default is `"default"`, which uses the enabled provider's default model.
- Configuration file path: `{project-root}/.claude/openpowers.json`

---

## CLI Command Reference

### `openpowers init`

```bash
openpowers init
```

Initialize the OpenPowers plugin. Auto-completes plugin installation and UI service startup. Ready to use `/openpowers:workflow` immediately after.

---

### `openpowers ui`

```bash
# Start the UI management panel
openpowers ui

# Restart the UI management panel
openpowers ui --restart
```

Launches the Web management panel at `http://localhost:3939`. `--restart` terminates any existing process before restarting.

---

### `openpowers enable`

```bash
openpowers enable
```

Enables the Anthropic API proxy. Automatically syncs Claude Code settings to route all API requests through the local proxy.

---

### `openpowers disable`

```bash
openpowers disable
```

Disables the proxy and restores the original Claude Code settings or falls back to direct provider configuration.

---

### `openpowers remove`

```bash
# Interactive uninstall
openpowers remove

# Skip confirmation
openpowers remove -y
```

Uninstalls the OpenPowers plugin and all its configurations.

---

### `openpowers recover`

```bash
openpowers recover
```

Restores default settings when Claude Code configuration has issues.

---

### `openpowers config`

```bash
# View full configuration
openpowers config list

# Query by path
openpowers config show language
openpowers config show project.sourcecode
openpowers config show switchProviders.plan switchProviders.coding
```

---

### `openpowers agents`

```bash
# List all model providers
openpowers agents list

# View session stage-to-model mapping
openpowers agents list --session <session-id>

# Show model for a specific stage
openpowers agents show plan --session <session-id>

# Switch provider globally (by model name or provider name)
openpowers agents switch DeepSeek

# Switch provider per session
openpowers agents switch kimi --session <session-id>

# Initialize session settings
openpowers agents init --session <session-id> --cwd /path/to/project
```

---

### `openpowers change`

```bash
# List all active changes
openpowers change list

# Create a new change
openpowers change new my-feature --desc "Add user login feature"

# View change status
openpowers change status my-feature

# Archive a completed change
openpowers change archive my-feature
```

---

## Workflow in Detail

`/openpowers:workflow` provides a complete 8-phase development process from idea to delivery:

```
Idea → 1.Explore → 2.Propose → 3.Review → 4.Plan → 5.Review → 6.SDD Implement → 7.Finalize → 8.Archive
```

### Phase 1: Explore

Use the `openpowers-explore` skill to deeply investigate the codebase, understanding existing implementations, architectural patterns, and integration points.

**Output**: `exploration.md`

**Provider**: Automatically uses the model configured for the `explore` phase

---

### Phase 2: Propose

Generate a complete change proposal including:
- `proposal.md` — Purpose, scope, and impact of the change
- `design.md` — Technical design decisions
- `specs/**/*.md` — Detailed feature specifications

**Output**: Proposal bundle

**Provider**: Automatically uses the model configured for the `propose` phase

---

### Phase 3: Review Propose

Use the `openpowers-review` skill to dispatch 3 specialized review sub-agents:
- Completeness review
- Consistency review
- Feasibility review

**Output**: Review feedback and improvement suggestions

**Provider**: Automatically uses the model configured for the `review` phase

---

### Phase 4: Plan

Generate an executable implementation plan based on the specs.

**Output**: `plan.json` (optional `api.yaml`, `database.md`)

**Provider**: Automatically uses the model configured for the `plan` phase

---

### Phase 5: Review Plan

Use `openpowers-review` again to verify the feasibility and completeness of the implementation plan.

**Provider**: Automatically uses the model configured for the `review` phase

---

### Phase 6: SDD Implementation

Use the `openpowers-sdd` skill to break the implementation plan into independent tasks by feature, dispatching **fresh sub-agents** concurrently for execution.

**Output**: Test cases + implementation code + review reports

**Provider**: Each sub-agent can independently use different provider models

---

### Phase 7: Finalize

Use the `openpowers-finalize` skill to automatically:
- `git add` all changes
- `git commit` the code
- `git push` to the remote repository

**Provider**: Automatically uses the model configured for the `finalize` phase

---

### Phase 8: Archive

Use the `openpowers-archive` skill to move the completed change to:

```
openpowers/archive/YYYY-MM-DD-<name>/
```

A complete history is preserved for traceability at any time.

---

### Resume from Any Phase

The workflow supports interruption and recovery. If interrupted at any phase, the next run can continue from that phase without losing any existing artifacts.

---

## Configuration System

OpenPowers supports global defaults with project-level overrides:

- **Project config**: Write in `.claude/openpowers.json` at the project root; takes effect only for the current project
- **Default config**: Items not overridden in the project config automatically use the global defaults

### Configuration Reference

```jsonc
{
  // Output language
  "language": "chinese",

  // Auto-switch model provider for each phase
  "switchProviders": {
    "workflow": "deepseek-v4-pro",  // Workflow orchestration
    "explore": "MiniMax-M2.7",      // Exploration phase
    "propose": "default",           // Proposal phase
    "plan": "deepseek-v4-pro",      // Planning phase
    "review": "deepseek-v4-pro",    // Review phase
    "coding": "MiniMax-M2.7",       // Implementation phase
    "finalize": "MiniMax-M2.7"      // Wrap-up phase
  },

  // Project settings
  "project": {
    "sourcecode": "src",           // Source code directory
    "codebases": {                 // Codebase documentation settings
      "enabled": false,
      "path": "codebases"
    },
    // Additional project repositories, e.g. separate frontend repo
    "repositories": [
      {
        "path": "path/to/some-project1",
        "description": "description about project1"
      },
      {
        "path": "path/to/some-project2",
        "description": "description about project2"
      }
    ],
    // External reference repositories
    "references": [
      {
        "type": "repository",
        "path": "path/to/repository",
        "description": "description about this repository"
      },
      {
        "type": "codebases",
        "path": "path/to/codebases",
        "description": "description about this codebases"
      },
      {
        "type": "skill",
        "path": "path/to/skill or skill name",
        "description": "description about this skill"
      }
    ]
  },

  // Experimental features
  "experimental": {
    "codebases": false,         // Enable codebase functionality
    "websearch": true,          // Enable web search functionality
    "context7": true,           // Enable context7 functionality
    "review": {
        "propose": true,        // Enable proposal review phase
        "plan": true,           // Enable plan review phase
        "specs": true,          // Enable spec review phase
        "code": true            // Enable code review phase
    },
    "prompt": {
        "review-code": null     // Custom prompt for code review, can be a skill name
    },
    "coverage": "70%",          // Required test coverage threshold
    "factor": 1                 // Feature count factor (features < factor * specs)
  }
}
```

---

## License

[MIT](LICENSE) © 2026 Meiyukichan

---

*OpenPowers — Multi-provider model switching within a single Claude Code session, delivering high-quality code through structured workflows.*
