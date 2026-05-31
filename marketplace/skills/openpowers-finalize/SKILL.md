---
name: openpowers-finalize
description: commit all git changes, and perform integration testing and codebase synchronization after completing OpenPowers change development.
---

# OpenPowers Finalize

Finalize after completing OpenPowers development of `openpowers/changes/<name>` - commit all git changes, and perform integration testing and codebase synchronization.

## Input Parameters

- `Change Directory (change)`<required>: `openpowers/changes/<name>/`

If required parameters are missing, you MUST use the `AskUserQuestion` tool to ask user for them.

## Execute Instructions

You **MUST** strictly and accurately execute the following instruction document step by step:

1. execute `Integration Testing Instruction`, and wait util this instruction executes completely.
2. execute `Git-Sync Instruction` after the completation of `Integration Testing Instruction`.
3. execute bash command to archive OpenPowers change: `openpowers change archive <change-name>`.

### Instruction Documents

- `Integration Testing Instruction`: `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-finalize/instructions/integration.md`
- `Git-Sync Instruction`: `${CLAUDE_PLUGIN_ROOT}/skills/openpowers-finalize/instructions/gitsync.md`

## RED LAW

- Progressive Document Reading: ONLY ALLOW reading the instruction document WHEN you are about to execute that instruction.
