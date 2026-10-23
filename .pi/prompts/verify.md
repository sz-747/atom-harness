---
description: Check every claim from this session against evidence before calling it done
---
Before reporting done, audit your own work in this session.

1. List each claim of what was changed, fixed, or verified.
2. For each claim, show the evidence: the command and its output, the test result, or the diff. Run anything that has not actually been run. A claim without evidence is marked "unverified", not reworded.
3. Show the complete set of changes (git diff and git status, or the list of touched files outside a repo) and check for anything unrelated to the ask. Revert unrelated changes.
4. List unfinished work and known gaps explicitly.

Report in four parts: verified, unverified, unfinished, recommendation. Do not start new fixes; report what you find.
