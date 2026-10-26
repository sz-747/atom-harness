# Atom

Atom is a calm, Pi-based coding-agent harness for testing bare model capability.

Launch page: <https://sz-747.github.io/atom-harness/>. To have a coding agent install it for you, give it [INSTALL.md](INSTALL.md).

It is designed to compare what a model can do with a small, quiet wrapper against heavier harnesses such as Claude Code and Codex. Atom keeps the useful parts of an agent shell while removing visual noise: tool-call rows stay out of the transcript, reasoning remains readable, and a small boat shows that the model is working.

## What it includes

- A calm terminal UI with Atom's dragon header and boat working indicator.
- A native Windows launcher that preserves the project working directory.
- A confirmation guard for destructive shell commands and publishing actions.
- Optional Pi subagents and short workflow prompts.
- A fast, self-contained banner renderer built with React and Ink.

## Quick start

Atom requires Node.js 22+ and an installed Pi runtime.

```powershell
git clone https://github.com/sz-747/atom-harness.git
cd atom-harness
npm install
.\atom.cmd
```

The launcher starts Atom in the current directory, so run it from the project you want to work on.

## Verify

```powershell
npm test
```

Atom is an experiment in harness minimalism. The goal is to make model ability easier to see, compare, and measure.
