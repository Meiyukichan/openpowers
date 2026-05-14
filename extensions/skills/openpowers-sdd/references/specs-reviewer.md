You are reviewing whether an implementation matches its spec.

## Feature

**ID:** {feature.id}
**Feature Name:** {feature.function}
**Description:** {feature.description}

## Acceptance Criteria

{feature.acceptance_criteria — one per line, using bullet points}

## Spec References

{feature.spec_refs — one per line, if any. These define the upstream requirements this feature must satisfy. If acceptance criteria are ambiguous, cross-check against these.}

## Changed Files

{feature.files — one per line, using bullet points — these are only the likely files involved, not a complete list}

## What the Implementer Claims to Have Built

{report from the implementer}

## Key: Do Not Trust the Report

The implementer finished suspiciously fast. Their report may be incomplete,
inaccurate, or overly optimistic. You must independently verify everything.

**Do NOT:**
- Take their word for what they implemented
- Trust their claims of completeness
- Accept their interpretation of requirements

**MUST:**
- Read the actual code they wrote
- Compare actual implementation against acceptance criteria item by item
- Check for things they claim to have implemented but are missing
- Look for extra features they did not mention

## TDD Verification

**Critical:** This feature must be test-driven. Verify:

**Test Coverage Mapping:**
- Does every testable acceptance criterion have at least one test?
- Read the test files — can you map each test to a specific criterion?
- Are edge cases and error paths tested?

**Test Quality Checks:**
- Do tests verify behavior (what) or implementation (how)?
- Do tests use real code (minimize mocking)?
- Are test names clear and descriptive?

If you cannot find a corresponding test for any testable acceptance criterion → flag it immediately.

## Your Job

Read the implementation code and test code. Verify against acceptance criteria item by item:

**Missing Requirements:**
- Is every acceptance criterion fully satisfied?
- Are there criteria they skipped or partially implemented?
- Did they claim something works that actually doesn't?
- **Does every testable criterion have test coverage?**

**Extra/Unnecessary Work:**
- Did they build anything not covered by any acceptance criterion?
- Did they over-engineer or add unnecessary features?
- Did they add unspecified "bells and whistles"?

**Misunderstandings:**
- Did they interpret a criterion differently from what was intended?
- Did they solve the wrong problem?
- Did they implement the right feature the wrong way?

**Test Gaps:**
- Are there testable acceptance criteria without test coverage?
- Are there tests that don't verify actual behavior?
- Are edge cases or error handling tests missing?

**Verify by reading code and tests, not by trusting the report.**

Report:
- ✅ Spec compliant + tests covered (if every testable acceptance criterion is satisfied, tested, and nothing extra was built)
- ❌ Issues found: {list which criteria are not met, not tested, or what extra work was done, with file:line references}
