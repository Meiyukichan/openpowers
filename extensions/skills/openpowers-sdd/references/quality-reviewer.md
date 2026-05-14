## Key Parameters
### WHAT_WAS_IMPLEMENTED
[Report from the implementer]

### PLAN_OR_REQUIREMENTS
Feature [feature.id] "[feature.function]" — [feature.description]

### ACCEPTANCE_CRITERIA
[feature.acceptance_criteria]

### GIT Changes
Run `git status -uall` to get all changes

### DESCRIPTION
[Feature summary]

## Review the Code
Call the skill openpowers-review to review code, skill parameters:
  - Type: code
  - Change directory: [`openspec/changes/<name>/`]
  - Other parameters: [## Key Parameters content]

## Coverage Verification

**Reviewer must run coverage analysis:**

```bash
# Detect and run the appropriate coverage command
if [ -f "package.json" ]; then
  npm test -- --coverage
  # or: npm run test:coverage
elif [ -f "Cargo.toml" ]; then
  cargo tarpaulin --out Stdout
elif [ -f "requirements.txt" ]; then
  pytest --cov --cov-report=term-missing
elif [ -f "go.mod" ]; then
  go test -coverprofile=coverage.out ./...
  go tool cover -func=coverage.out
fi
```

**Coverage Requirements:**
- Minimum 80% line coverage for new code
- Identify uncovered lines in changed files
- Flag if coverage tools are not configured

**In addition to standard code quality concerns, reviewer should also check:**

**Test Quality (TDD Verification):**
- Can you identify the failing test that drove each piece of implementation?
- Do tests verify behavior (not just mock interactions)?
- Are edge cases and error paths tested?
- Is test coverage meaningful (not just lines covered)?

**Code Organization:**
- Does each file have a clear responsibility and well-defined interface?
- Are units decomposed so they can be understood and tested independently?
- Does the implementation follow the file structure specified in the feature?
- Does this implementation create new files that are already large, or significantly grow existing files? (Do not flag pre-existing file sizes — focus on what this change contributes.)

**Code Reviewer Returns:**
- Coverage report (percentage + uncovered lines)
- Strengths
- Issues (Critical/Major/Minor)
- Assessment (including coverage conclusions)
