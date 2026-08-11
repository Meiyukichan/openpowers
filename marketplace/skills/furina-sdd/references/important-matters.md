### Lazy Loading Strategy

**Specs are lazy-loaded by subagents, not preloaded by the controller.**

The controller provides:
- Feature data (description, acceptance_criteria, files)
- Document references (paths like `furina/changes/<name>/specs/auth/spec.md#login`, `furina/changes/<name>/design.md#section`)
- Context about dependencies and conventions

Subagents decide on their own:
- Referenced specs must be read before implementation, especially design documents
- Which parts to read (only those relevant to the feature)

**Why Lazy Loading:**
- Saves controller tokens: the controller does not preload spec content; subagents only read what they need
- Faster dispatch: the controller does not need to wait for spec reads
- Subagent autonomy: they read what they need when they need it
- Avoids overload: implementers focus on the feature, not the entire system

**The controller's responsibility:** Provide the map (spec paths), not the territory (spec content).

### Handling Implementer Status

Implementer subagents report one of four statuses. Handle each appropriately:

**DONE:** Proceed to spec compliance review.

**DONE_WITH_CONCERNS:** The implementer completed the work but flagged concerns. Read these concerns before proceeding. If concerns are about correctness or scope, resolve them before reviewing. If they are observations (e.g., "this file is getting large"), note them and continue to review.

**NEEDS_CONTEXT:** The implementer needs information that was not provided. Provide the missing context and re-dispatch.

**BLOCKED:** The implementer could not complete the feature. Evaluate the blockage:
1. If it's a context issue, provide more context and re-dispatch with the same model
2. If the feature requires more reasoning, re-dispatch with a stronger model
3. If the feature is too large, break it into smaller pieces
4. If the plan itself is wrong, escalate to the human user

**Never** ignore an escalation or force the same model to retry without changes. If the implementer says they're stuck, something needs to change.

### Advantages

**Efficiency Gains:**
- No file reading overhead (controller provides feature data)
- Controller precisely curates needed context
- Subagent gets complete information in one shot
- Issues surface before work begins (not after)
- JSON state persists across sessions — interrupted work can be cleanly resumed

**Quality Gates:**
- Self-review catches issues before handoff
- Two-phase review: spec compliance, then code quality
- Review loops ensure fixes actually work
- Acceptance criteria prevent overbuilding or underbuilding
- Code quality ensures the implementation is well-built

**TDD Verification (Three Layers):**

1. **Spec Compliance Reviewer** — Verifies every testable acceptance criterion has a corresponding test
   - Maps each testable criterion to at least one test
   - Checks test quality (behavior vs implementation)
   - Flags untested edge cases

2. **Code Quality Reviewer** — Runs coverage analysis
   - Executes coverage tools (npm test --coverage, pytest --cov, etc.)
   - Enforces minimum 80% coverage for new code
   - Identifies uncovered lines in changed files
   - Verifies that tests actually validate behavior (not just execute lines)

3. **Coverage Evidence** — Requires proof before approval
   - Spec reviewer confirms: "Every testable criterion has test coverage"
   - Code reviewer confirms: "Coverage ≥ 80%, uncovered lines identified"
   - Both must pass before the feature can be marked complete

**Costs:**
- More subagent calls (per feature: reference explorer + implementer + 2 reviewers)
- Controller does more prep work (extracts all features upfront)
- Review loops add iteration
- But catches issues early (cheaper than debugging later)
