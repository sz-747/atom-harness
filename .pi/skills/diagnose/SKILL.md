---
name: diagnose
description: Find the root cause of a bug, failure, or unexpected behaviour before changing code. Use when something fails, misbehaves, or a fix did not work, and always before proposing a fix. Produces a reproduction, a cause backed by evidence, and the smallest fix.
---

# Diagnose

The goal is a cause you can demonstrate, not a plausible story. Do not edit code until step 5.

1. Reproduce it the way the user hits it. Run the real command, the real entry point, or the real UI path, on this machine (Windows, PowerShell or Git Bash). If it cannot be reproduced, say so and stop guessing; ask for the exact steps or output.
2. Separate three things and name each: the initiating trigger (what started the failure), the masking condition (what let it go unnoticed until now), and the visible symptom (what the user sees). Fixing the symptom alone is the most common wrong fix.
3. Compare the failing path with a proven working one. Same input through a path that works, or the same path at an earlier commit, config, or version. Check history: what changed between working and failing (git log, package versions, settings, environment).
4. Find the smallest counterfactual: the one change that flips the outcome from failing to working. Then look for disconfirming evidence: what would be true if this cause were wrong, and check that too. A cause that survives an attempt to disprove it is the one to fix.
5. Fix the cause with the smallest change, in the place that owns the behaviour. The reproduction from step 1 becomes the regression test where the project has tests; otherwise re-run the reproduction and show its output.
6. Report: cause, evidence (commands and output, file:line), the fix, what was verified, and anything the diagnosis found that is outside the ask, listed as follow-ups rather than fixed.

A diagnosis is evidence, not authorization. It does not widen the task beyond what was asked.
