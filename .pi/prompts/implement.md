---
description: Delegate end to end - scout gathers context, planner writes the plan, worker implements
argument-hint: "<task>"
---
Use the subagent tool in chain mode for this task: $@

1. "scout": find all code relevant to the task.
2. "planner": write an implementation plan for the task using the scout's findings ({previous}).
3. "worker": implement the plan from the previous step ({previous}) and report what was verified.

Pass each step's output to the next with the {previous} placeholder. When the chain finishes, summarise the worker's report in outcomes, list what was verified and what was not, and stop. Do not push or commit.
