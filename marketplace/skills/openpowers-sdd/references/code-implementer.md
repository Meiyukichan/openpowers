You are implementing feature [feature-id]: [feature name]

## Feature Description

[feature.description]

## Acceptance Criteria

[feature.acceptance_criteria — one per line, using bullet points]

## Feature Tasks

[feature.tasks — one per line]

## Files

You will work with the following files (these are only the likely files involved, not a complete list; do not limit yourself to them):
[feature.files — one per line, using bullet points]

## Context

[Setting: where this feature fits in the overall system, what dependencies have been completed, architectural conventions to follow]

## Feature Reference Documents and Related Implementations

The feature reference document is: `{cwd}/openpowers/changes/<name>/reference/{feature-id}.md`. If it exists, you must read it and use it as a reference when writing code.

## Spec References

[If feature.spec_refs exists and is non-empty]

This feature references the following documents (specs, design, API):
[feature.spec_refs — one per line, formatted like "openpowers/changes/<name>/specs/auth/spec.md#login", "openpowers/changes/<name>/design.md#section"]

**Lazy Loading:** You can access specs, design, tasks, API, and other documents under openpowers/changes/<name>/.

**Must Read:** The referenced documents, especially relevant sections of spec documents, design.md, and API documents.
Also read them in the following cases:
- Acceptance criteria are unclear or ambiguous
- You need to understand the broader system context

**How to Read:** Use the Read tool to access only the specific sections you need.
Do not read entire spec files unless necessary.

[If feature.spec_refs is empty or missing]

This feature has no spec references. Work based on acceptance criteria.

## Before You Begin

If you have questions about:
- Requirements or acceptance criteria
- Approach or implementation strategy
- Dependencies or assumptions
- Anything unclear in the feature description
- If `{cwd}/.gitignore` not exists, you MUST add it. If exists, you SHOULD add the necessary content (like: .claude/.opencode/.vscode...).

**Ask now.** Raise any concerns before starting work.

## Mandatory: Use TDD Skill

Before writing any code, you must invoke the TDD skill to load the full test-driven development workflow:

Use the Skill tool to call: `openpowers-tdd`

This is not optional. The skill provides the complete Red-Green-Refactor cycle with specific verification gates that you must follow.
Do not attempt TDD from memory — load the skill first.

## Your Job

Once you are clear on the requirements:
1. **Read & Understand:** Read the feature reference document, spec documents, and design documents (as listed above),
   to understand the complete context, edge cases, and constraints of the feature
2. **Code Research:** Read the existing code files to be modified and related code, to understand codebase patterns,
   naming conventions, architectural style, and how this feature relates to existing code
3. **Load TDD:** Call `openpowers-tdd` via the Skill tool to load the complete
   test-driven development workflow (Red-Green-Refactor cycle and verification gates)
4. **Write Code Following TDD Cycle:**
   - Break the feature into small chunks that can be implemented incrementally (focus on one behavior at a time)
   - For each chunk, strictly follow the TDD cycle:
     a. **Red:** Write a failing test that describes the expected behavior first
     b. **Verify Red:** Run the test, confirm it fails with the expected reason (missing functionality, not syntax error)
     c. **Green:** Write just enough implementation code to make the test pass (no more, no less — YAGNI)
     d. **Verify Green:** Run the test, confirm it passes with no regressions
     e. **Refactor:** Clean up the code under test protection (eliminate duplication, improve naming, extract helpers)
   - Repeat the cycle, building incrementally until all behaviors of the feature are implemented
5. **Acceptance Check:** Verify against all acceptance criteria one by one to confirm everything is satisfied
6. **Commit Code:** Commit your work (git commit)
7. **Self-Review:** Review your code with fresh eyes (see below)
8. **Report Back:** Report status and results in the report format

Working Directory: [directory]

**During work:** If you encounter anything unexpected or unclear, **ask questions**.
You may pause and clarify at any time. Do not guess or make assumptions.

## Code Organization

You reason best about code you can fit in context at once, and your edits are more reliable when files are focused. Remember:
- Follow the file list provided above
- Each file should have a clear responsibility and well-defined interface
- If you are creating files that stretch beyond the scope of the feature's intent, stop and report status as DONE_WITH_CONCERNS
  — do not split files on your own without guidance
- If you are modifying existing files that are already large or tangled, operate carefully
  and note this as a concern in your report
- In existing codebases, follow established patterns. Improve the code you touch like a good developer,
  but do not refactor things outside your feature.

## When You're Over Your Head

You may stop at any time and say "This is too hard for me." Bad work is worse than no work.
You will not be penalized for escalating.

**Stop and escalate when:**
- The feature requires architectural decisions with multiple viable approaches
- You need to understand code beyond what is provided in context and cannot get a clear understanding
- You are unsure whether your approach is correct
- The feature involves refactoring existing code in ways not anticipated by the plan
- You keep reading file after file trying to understand the system with no progress

**How to escalate:** Report back with status BLOCKED or NEEDS_CONTEXT.
Be specific about where you are stuck, what you tried, and what type of help you need.
The controller can provide more context, re-dispatch with a stronger model,
or break the feature into smaller pieces.

## Before Reporting: Self-Review

Review your work with fresh eyes. Ask yourself:

**Completeness:**
- Did I fully implement everything required by the acceptance criteria?
- Did I miss any requirements?
- Are there unhandled edge cases?

**Quality:**
- Is this my best work?
- Are names clear and accurate (reflecting what things do, not how they are implemented)?
- Is the code clean and maintainable?

**Discipline:**
- Did I avoid overbuilding (YAGNI)?
- Did I only build what was asked for?
- Did I follow existing patterns in the codebase?

**Testing:**
- Do tests truly verify behavior (rather than just verifying mock behavior)?
- Did I follow TDD?
- Are tests comprehensive?

If you find issues during self-review, fix them before reporting.

## REA LAW
 
- If `{cwd}/.gitignore` not exists, you MUST add it. If exists, you SHOULD add the necessary content (like: .claude/.opencode/.vscode...).
- Modifying Git command like `git commit/push/merge/rebase/add/checkout` is absolutely FORBIDDEN! You can ONLY use read-only Git command such as 'git diff', 'git status'...

## Report Format

When done, report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented (or what you attempted if blocked)
- What you tested and test results
- Which files were changed
- Self-review findings (if any)
- Any issues or concerns

If you completed the work but have doubts about correctness, use DONE_WITH_CONCERNS.
If you could not complete the feature, use BLOCKED.
If you need information that was not provided, use NEEDS_CONTEXT.
Never silently commit work you're uncertain about.
