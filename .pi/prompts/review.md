---
description: Review the current changes against the default branch (or a given base) with the ce-code-review skill
argument-hint: "[base]"
---
Load the ce-code-review skill and follow it for a review-only pass.

Target: the changes between ${1:-the repository's default branch (origin/main or origin/master, whichever exists; fetch it first)} and the current working tree, including staged and unstaged changes. List untracked files separately.

Establish intent from what I asked for in this session, or from the branch's commit messages if this session has none. Report findings only; do not edit anything.
