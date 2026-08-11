# Clean-TypeScript Instruction

Before generating, writing, or modifying any TypeScript/JavaScript code, you must follow the steps below to consult coding standards.

## Input Parameters

- **Output language**: {`language` or Chinese}
- **Context**: {`context`}
- **outputFile**: A specific file path. If not provided, no file is output by default.

## Execution Phases

Execute strictly in the following phases. Do not skip or merge phases. **You MUST output the result of each phase before proceeding to the next phase.** This is enforced to prevent skipping or merging phases. Each phase's output serves as the input to the next phase.

### Phase 1: Analyze context → Identify relevant chapters

Carefully analyze the user's input context. First, read `${CLAUDE_PLUGIN_ROOT}/skills/furina-cleancode/references/ts/toc.md` to understand the full standards catalog, then take different approaches based on the input type:

#### Case A: User provides a requirement description

1. **Understand the requirement**: Read the user's requirement carefully to clarify the feature to implement or behavior to modify.
2. **Derive code features**: Infer which TypeScript code features are likely involved (e.g., defining new classes/interfaces, modifying imports/exports, adding type annotations, writing functions, exception handling, async patterns, etc.).
3. **Match chapters**: Determine which chapters need to be reviewed for this requirement. Examples:
   - Class definitions → "Classes & Objects", "Naming", "Type Declarations"
   - Type declarations → "Type Declarations", "Assertions"
   - Imports/exports → "Modules", "Scope"
   - Error handling → "Exceptions", "External Data Validation"

#### Case B: User provides file content or a file list

1. **Identify changes**: Analyze the changed file content or file list, extracting the code features and syntax structures involved.
2. **Match chapters**: Determine the relevant chapters based on the code features. Examples:
   - Changes contain class/function/variable declarations → "Classes & Objects", "Functions", "Naming"
   - Changes contain type definitions/generics → "Type Declarations", "Enums", "Assertions"
   - Changes contain imports/exports/module structure → "Modules", "Scope"
   - Changes contain comments/JSDoc → "Comments"
   - Changes contain Node.js backend code → "Nodejs Backend", "External Data Validation"
   - Changes contain DOM operations → "Performance", "Memory"

### Phase 2: Read the standards

Based on the chapter list identified in Phase 1, perform the following steps:

1. **Read detail documents**: Read the detail documents for each identified chapter one by one (paths listed in `${CLAUDE_PLUGIN_ROOT}/skills/furina-cleancode/references/ts/toc.md`).
2. **Read core style documents**: Read the core style document for typescript (`${CLAUDE_PLUGIN_ROOT}/skills/furina-cleancode/references/ts/typescript-core-style.md`).
3. **Filter by relevance**: Within each chapter document, not all rules may apply. Only extract the rules that are related to the code features, security concerns, or design patterns implied by the `context` (requirement or changed files). Ignore rules that govern code features clearly unrelated to this context. When in doubt, include the rule rather than exclude it — it is better to have a rule filtered down in Phase 4 than to miss a relevant rule entirely.

### Phase 3: Generate coding guidelines

**Before starting Phase 3, you MUST output the Phase 2 result**: list every rule you extracted (rule ID + rule title + source chapter), so that Phase 3 has a clear inventory to work from.

Synthesize the standards gathered in Phase 2, then generate a coding guidelines document in Markdown following `${CLAUDE_PLUGIN_ROOT}/skills/furina-cleancode/references/cleancode-format.md`. This document is the intermediate draft — do NOT write it to `outputFile` yet. The file write will happen after Phase 5 verification.

**CRITICAL — Phase 3 generates a FULL draft with ALL rules included (no relevance filtering yet). Filtering happens in Phase 4.** In Phase 3, for each rule:
- Copy the description verbatim from the reference document — include ALL sentences, list items, exceptions, notes
- Include BOTH compliant and non-compliant code examples verbatim from the reference document
- Do NOT fabricate code examples that do not exist in the reference document

**Quality requirements — the generated content must be detailed and accurate:**

- **Be specific, not generic**: Every rule must come from the reference documents actually read in Phase 2. Do not fabricate rules from general knowledge or write vague advice like "use good naming". Quote the concrete rule as stated in the source document (including the rule ID, e.g., G.NAM.01, P.01).
- **Preserve original content faithfully**: For each rule, copy the description verbatim from the reference document — do NOT rewrite, condense, or omit any part (constraints, rationale, exceptions, limits, thresholds). This is a strict requirement: even a single omitted sentence from the original description is a violation. Copy code samples verbatim as well — do NOT rewrite, adapt, or translate them to match the `context`, even if the original uses unrelated names (e.g., `Foo`, `CoffeeOrder`). Do NOT invent code examples that do not exist in the reference document; if the reference document provides only a non-compliant example without a compliant example (or vice versa), include only what exists — do NOT fabricate the missing example.
- **Cover all matched chapters**: Every chapter identified in Phase 1 that is relevant must be reflected in the output. Do not skip a chapter because "it's obvious" — if Phase 1 flagged it, Phase 3 must cover it.
- **Scope-aware**: Only include rules relevant to the actual requirement or changes. Do not dump the entire reference document.
- **Include rule level**: For each rule, indicate its level (Required/Recommended) as stated in the reference document.

### Phase 4: Relevance-based filtering

**Before starting Phase 4, you MUST output the Phase 3 result**: the complete draft document (or confirm it is ready). Then apply the filtering below to produce the filtered document.

Evaluate each rule from the Phase 3 output against the specific `context` (requirement or changed files) and classify into three tiers. **Be strict about High — only rules that directly address security risks or core functionality of the context qualify. General best practices (naming conventions, type declaration style, function parameter count, etc.) are Medium, NOT High.**

| Relevance Tier | Criteria | Output Treatment |
|----------------|----------|------------------|
| **High** | The rule directly addresses a security risk or core functional concern specific to the context. Without following this rule, the implementation would have defects, security vulnerabilities, or data leaks. Examples: input validation for login, SQL injection prevention, sensitive data protection. | **Full output**: Keep the rule description verbatim from the reference document (do NOT rewrite, condense, or omit any part of the original description) AND compliant code examples only (remove non-compliant examples). |
| **Medium** | The rule is a general best practice that applies to the code structures in the implementation, but is not specific to the context's security or correctness. Examples: naming conventions, type declaration style, function length, parameter count, import order. | **Condensed output**: Remove ALL code examples (both non-compliant and compliant) — no exceptions. Retain only a brief summary of the rule description (1-2 sentences capturing the key constraint), plus the rule ID and level. |
| **Low** | The rule has little or no connection to the context. The code feature it governs is unlikely to appear in the implementation. | **Remove entirely**: Do not include this rule in the output. |

**Line limit**: The final output document MUST NOT exceed 300 lines. After applying the relevance-based filtering above, if the document still exceeds 300 lines, remove compliant code examples from High-relevance rules in ascending order of relevance (i.e., remove compliant examples from the least-relevant High rules first, then progressively more relevant ones) until the 500-line limit is met. If still exceeding after removing all compliant examples, condense High-relevance rule descriptions (shorten but do not omit key constraints) in the same ascending order until the limit is met.

**Write output**: After Phase 5 verification is complete, if `outputFile` is provided and not null, write the final content to `outputFile`.

### Phase 5: Verification

**Before starting Phase 5, you MUST output the Phase 4 result**: the filtered document with relevance tiers applied. Then perform verification against the original reference documents read in Phase 2. This is a mandatory quality gate — do NOT skip it.

1. **Relevance classification check**: For each rule in the output, verify its relevance tier (High/Medium/Low) is correctly assigned against the `context`. If a rule is tangentially related (general best practice that happens to apply), it should be Medium — not High. If it has little connection, it should be removed entirely (Low).

2. **High-relevance rule — description completeness check**: For each High-relevance rule, re-read the corresponding section in the original reference document. Compare the output description sentence by sentence against the original. If any sentence, clause, list item, exception, or note from the original description is missing or rewritten, you MUST fix it by copying the missing content verbatim from the original. Common omissions to watch for:
   - Numbered/bulleted lists where some items were dropped
   - "例外" (exception) sections that were omitted
   - Explanatory examples or scenarios within the description that were removed
   - Qualifying phrases, thresholds, or constraints that were simplified

3. **High-relevance rule — compliant example check**: For each High-relevance rule, verify the compliant code example is copied verbatim from the original reference document. If any code example was invented, adapted, or translated to match the `context`, replace it with the verbatim original. If the original has no compliant example, include no code example — do NOT fabricate one.

4. **Medium-relevance rule — no code examples check**: For each Medium-relevance rule, verify that ALL code examples (both non-compliant and compliant) have been removed — no exceptions. Only the rule ID, level, and a brief 1-2 sentence summary should remain.

5. **No duplication check**: Ensure no rule appears more than once in the output document. If a rule is referenced in Section 3 (Security & production notes), it should not be repeated with full description there — only a brief context-specific note.

6. **Line limit check**: Use the bash tool to count lines of the output file: `wc -l <outputFile>`. If the result exceeds 300 lines, apply the line-limit reduction strategy from Phase 4, then re-count until the limit is met.

After all verification issues are fixed, proceed to write the output file.

## Return Instruction Result

After Phase 5 completes, return the result using the following wrapper format. The `Exploration Result` field should contain either the `outputFile` path (if provided) or the full Phase 5 output content.

```md
Furina CleanCode Exploration Result
# Explore Content
{`Context`}
# Explore Type
cleancode
# Exploration Result
{If `outputFile` is provided, fill in the file path; otherwise, paste the full Phase 5 output here}
``