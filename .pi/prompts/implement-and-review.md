---
description: Delegate with a review loop - worker implements, reviewer reviews, worker applies the fixes
argument-hint: "<task>"
---
Use the subagent tool in chain mode for this task: $@

1. "worker": implement the task.
2. "reviewer": review the implementation described in the previous step ({previous}) against the task.
3. "worker": apply the review's findings from the previous step ({previous}); skip anything it disputes with a reason.

Pass each step's output to the next with the {previous} placeholder. When the chain finishes, report the final state in outcomes, the review findings that were fixed and any that were not, and what was verified. Do not push or commit.
