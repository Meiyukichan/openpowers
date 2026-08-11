---
name: furina-finalize
description: commit all git changes, and perform integration testing and codebase synchronization after completing Furina change development.
---

# Furina Finalize

Finalize after completing Furina development of `furina/changes/<name>` - commit all git changes, and perform integration testing and codebase synchronization.

## Input Parameters

- `Change Directory (change)`<required>: `furina/changes/<name>/`

If required parameters are missing, you MUST use the `AskUserQuestion` tool to ask user for them.

## Execute Instructions

You **MUST** strictly and accurately execute the following instruction document step by step:

1. execute `Integration Testing Instruction`, and wait util this instruction executes completely.
2. execute `Codebase Sync Instruction` after the `Integration Testing Instruction`.
3. execute bash command to archive Furina change: `furina change archive <change-name>`.
4. call skill: furina-commit to commit changes to remote branch.

### Instruction Documents

- `Integration Testing Instruction`: `${CLAUDE_PLUGIN_ROOT}/skills/furina-finalize/instructions/integration.md`
- `Codebase Sync Instruction`: `${CLAUDE_PLUGIN_ROOT}/skills/furina-finalize/instructions/syncbase.md`

## RED LAW

- Progressive Document Reading: ONLY ALLOW reading the instruction document WHEN you are about to execute that instruction.
