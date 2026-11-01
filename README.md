# Atom

Atom is a calm, Pi-based coding-agent harness for testing bare model capability.

Launch page: <https://sz-747.github.io/atom-harness/>. To have a coding agent install it for you, give it [INSTALL.md](INSTALL.md).

It is designed to compare what a model can do with a small, quiet wrapper against heavier harnesses such as Claude Code and Codex. Atom keeps the useful parts of an agent shell while removing visual noise: Calm groups operations under plain-language subtask progress and outcomes, reasoning remains readable, and a small boat shows that the model is working.

## What it includes

- A terminal UI with Atom's dragon header and optional Calm mode: stable subtask progress, reported outcomes, expandable operation details and a boat working indicator.
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

## Calm mode

Run `/calm` to follow meaningful subtasks instead of raw tool names. Each card updates in place and retains the reported result and verification limits. Ctrl+O expands original calls/results; failed tool results and images stay visible. Run `/calm` again to restore native rendering. Calm starts off and remembers your choice.

![Offline simulated progress fixture: one investigation complete, the next subtask in progress](docs/progress-preview.png)

The existing agent supplies short progress reports through one additional tool; this adds ordinary tool-call/context overhead, not a second model or classifier. Original operation execution, permissions and evidence remain unchanged. Progress metadata is saved in native history for restoration. Real-model report quality and latency impact are not yet measured. See [Calm implementation and compatibility](.pi/extensions/calm/README.md).

## Verify

```powershell
npm test
```

Atom is an experiment in harness minimalism. The goal is to make model ability easier to see, compare, and measure.
