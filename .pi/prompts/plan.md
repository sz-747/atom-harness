---
description: Turn a task into a checkable plan before touching code
argument-hint: "<task>"
---
Plan the following task. Do not change any files yet.

Task: $@

Inspect the code paths involved before writing anything; do not guess file names. Then write the plan in this shape:

1. Intent: the ask in one or two sentences, in my words. Do not widen it.
2. Spec: only what the ask requires, as concrete changes (file, what changes, why). Anything you noticed that is not required goes under "Follow-ups, not in scope".
3. Steps: numbered, smallest first, each ending in something observable.
4. Definition of done: the checks that prove it works (command, expected result). For a bug fix, the reproduction comes first and must fail before and pass after.
5. Open questions: only ones whose answer changes the plan, each with the assumption you would proceed on.

Stop after the plan and wait for my go-ahead.
