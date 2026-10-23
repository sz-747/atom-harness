---
description: Delegate the research - scout gathers context, planner writes the plan, nothing is implemented
argument-hint: "<task>"
---
Use the subagent tool in chain mode for this task: $@

1. "scout": find all code relevant to the task.
2. "planner": write an implementation plan for the task using the scout's findings ({previous}).

Pass the scout's output to the planner with the {previous} placeholder. Return the plan and stop; do not implement.
