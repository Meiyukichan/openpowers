## Example Workflow

```
You: I'm using Subagent-Driven Development to execute this plan.

$ furina config show language experimental.review.specs experimental.review.code
Language: en
Spec review: True
Code quality review: True

$ furina change feature auth --status
Feature List Status:
furina/changes/auth/plan.json
  Total: 3
  Done: 0
  In Progress: 0
  Pending: 3
  Blocked: 0
  Skipped: 0
Progress: 0.0%

$ furina change feature auth --next
Next feature: auth-001
  Category: authentication
  Function: user-login
  Description: Implement email/password login
...

Feature auth-001: User login

$ furina change feature auth --start auth-001

[Dispatch reference explorer — using reference-explorer-prompt.md prompt template]

[Reference explorer completed, continue to next step]

[Dispatch implementer subagent — using code-implementer-prompt.md prompt template]

Implementer: "Before I begin - should tokens expire after 1 hour or 24 hours?"

You: "1 hour, with refresh token support in a later feature"

[After answering, re-dispatch a fresh implementer subagent with feature data, reference docs, context, and the answer above]

Implementer: "Got it. Implementing now..."
[Later] Implementer:
  - Implemented login endpoint
  - Added tests, 5/5 passing
  - Self-review: Found I missed brute-force rate limiting, added it
  - Committed

[experimental.review.specs = True, dispatch spec compliance reviewer]
Spec reviewer: ❌ Issues:
  - Missing: Unified error message on login failure (acceptance criteria says "should not reveal whether user exists")
  - Extra: Added login logging (not requested)

[Dispatch fresh implementer subagent to fix spec gaps]
Implementer: Removed login logging, added unified error message return

[Spec reviewer reviews again]
Spec reviewer: ✅ All acceptance criteria met now

[experimental.review.code = True, get git SHA, dispatch code quality reviewer]
Code reviewer: Strengths: Good test coverage, clean. Issues: None. Approved.

$ furina change feature auth --complete auth-001

$ furina change feature auth --next
Next feature: auth-002
  Category: authentication
  Function: token-refresh
  Description: Implement token refresh endpoint
...

Feature auth-002: Token refresh

$ furina change feature auth --start auth-002

[Dispatch reference explorer — using reference-explorer-prompt.md prompt template for auth-002]

[Reference explorer completed, continue to next step]

[Dispatch implementer subagent - using code-implementer-prompt.md prompt template]

Implementer: [No questions, proceeds]
Implementer:
  - Added refresh token endpoint
  - 8/8 tests passing
  - Self-review: All good
  - Committed

[experimental.review.specs = True, dispatch spec compliance reviewer]
Spec reviewer: ❌ Issues:
  - Missing: Token rotation (acceptance criteria says "old refresh token must be invalidated")
  - Extra: Added token family tracking (not requested)

[Dispatch fresh implementer subagent to fix spec gaps]
Implementer: Removed token family tracking, added proper token invalidation

[Spec reviewer reviews again]
Spec reviewer: ✅ All acceptance criteria met now

[experimental.review.code = True, dispatch code quality reviewer]
Code reviewer: Strengths: Solid. Issues (Important): Magic number (3600 for TTL)

[Dispatch fresh implementer subagent to fix quality issues]
Implementer: Extracted TOKEN_TTL_SECONDS constant

[Code reviewer reviews again]
Code reviewer: ✅ Approved

$ furina change feature auth --complete auth-002

...

[After all features]
$ furina change feature auth --status
Feature List Status:
  Total: 5
  ✅ Done: 5
  Progress: 100.0%

Done!
```
