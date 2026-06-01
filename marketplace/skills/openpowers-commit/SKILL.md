---
name: openpowers-commit
description: >
  Automatically stage all changes, generate a commit message following the Conventional Commits specification,
  and safely push to the remote repository. Ideal for quickly saving work progress while keeping a clean commit history.
  Use this skill when the user mentions "auto commit and push", "smart push", "自动提交并推送", "快速提交推送", "commit & push", or similar intent.
---

# OpenPowers Git — Auto Commit & Push

A Git automation assistant that safely and intelligently stages changes, generates standardized commit messages, and pushes to a remote repository.

## Input Parameters

- `Target branch (branch)` <optional>: Push to a specific branch. Default: current branch (`HEAD`).
- `Commit type (type)` <optional>: Override the Conventional Commits `type` (e.g. `feat`, `fix`, `refactor`).
- `Commit scope (scope)` <optional>: Override the Conventional Commits `scope`.
- `Push enabled (push)` <optional>: `true` (default) to push after commit; `false` to commit only.
- `Stage scope (stage)` <optional>: `all` (default, `git add .`) or `specific:<file1,file2,...>`.

## Prerequisites

- The current working directory must be a Git repository.
- A remote repository is configured, and the current branch has an upstream tracking branch set (`git push -u origin <branch>`).
- The user has reviewed the local changes and agrees to an automated commit.

## Execution Flow

### 1. Environment Check

Run `git status --porcelain -uall` to get the working tree status.

- If output is empty: reply `✅ Working directory clean, nothing to commit.` and terminate.

### 2. Stage Changes

- Default: `git add .` to stage all new, modified, and deleted files.
- Exception: when the user explicitly states "commit only some files" or provides a `specific:<files>` `stage` parameter, run `git add <files>` for those files only.

### 3. Generate a Standardized Commit Message

- Use `git diff --cached --stat` and `git diff --cached` to obtain a summary and detailed diff of the staged changes.
- Generate a concise, accurate commit message following the **Conventional Commits** specification, in the format:

  ```text
  <type>(<scope>): <short description>
  ```

- Common `type`s: `feat`, `fix`, `refactor`, `style`, `docs`, `test`, `chore`, `perf`, `ci`.
- If changes are mixed, pick the most important `type` and add details in the message body if needed.
- Keep the subject line within 72 characters.
- Before finalizing, **MUST scan the diff for potential secrets, passwords, API keys, or other sensitive content**. If found, warn the user and pause for confirmation.
- After generation, show the proposed commit message to the user and request confirmation before committing.

### 4. Commit

After user confirmation, run:

```bash
git commit -m "<generated commit message>"
```

- If the user requests to amend the previous commit, use `--amend` and **explicitly warn about the risks** (rewrites published history).
- Multi-line commit messages should use a HEREDOC:

  ```bash
  git commit -m "$(cat <<'EOF'
  <type>(<scope>): <short description>

  <body>

  Co-Authored-By: Claude <noreply@anthropic.com>
  EOF
  )"
  ```

### 5. Push

1. Get the current branch name: `git rev-parse --abbrev-ref HEAD`
2. If a target `branch` parameter was provided and differs from the current branch, push to that branch instead.
3. Execute push: `git push origin <branch>`
4. Capture the output:
   - Success → reply `✅ Successfully pushed to origin/<branch>.`
   - Failure (e.g., remote has new commits) → remind the user to run `git pull --rebase` to resolve conflicts and ask whether to execute it automatically.
5. If `Push enabled (push)` is `false`, skip this step entirely.

## Security Policy

- **No force push** unless the user explicitly requests `--force-with-lease` and confirms a second time.
- **Protected branches**: if the target branch is `main`, `master`, or matches `release/*`, require **extra user confirmation** before pushing.
- **Sensitive content scan**: before generating the commit message, scan the diff for likely secrets (API keys, tokens, passwords, private keys). Warn the user and pause if found.
- **Skip on uncommitted secrets**: if the diff contains credentials, refuse to commit and instruct the user to remove them or move them to a secure location first.

## Exception Handling

- If `git add` or `git commit` fails: print the error verbatim and terminate; do not retry automatically.
- If a network issue causes push to fail: prompt the user to retry later or push manually.
- If unresolved merge conflicts exist: guide the user to resolve them first before using this skill.
- If the current branch has no upstream tracking branch: instruct the user to run `git push -u origin <branch>` first.
- If the working directory is not a Git repository: terminate with a clear error message and do not attempt any Git operations.

## RED LAW

- **Never** run force push (`--force` or `git push --force`) without explicit two-step user confirmation.
- **Never** commit secrets, credentials, or `.env` files — always scan the diff and pause on detection.
- **Never** run destructive operations (`git reset --hard`, `git checkout .`, `git clean -fd`) from this skill without explicit user instruction.
- **Never** skip the user confirmation step before commit and before push.
