# Calm: legacy presentation policy

Calm is an optional, presentation-only extension. Run `/calm` to toggle it. A fresh installation starts off; the preference is saved as `calm` in Pi's agent directory (`~/.pi/agent`, or `PI_CODING_AGENT_DIR` when configured).

When enabled:

- Built-in tool-call and text-result rows are hidden.
- Image results and custom-tool rows remain visible.
- Pi controls reasoning visibility through its own settings and controls.
- An animated boat replaces the working row from `agent_start` until `agent_settled`, including retries and continuations. Shutdown disposes the animation.

No prompts, tool execution, results, model context or saved sessions are changed. This policy differs from variants that hide every tool and reasoning block.

## Compatibility and verification

The legacy implementation was originally aligned with Pi 0.85.1. The current offline checks pass against Pi 1.4.0 on Node.js 24, including strict TypeScript, the real extension loader and tool components, image preservation, custom/SDK overrides, toggle persistence, animation lifecycle and narrow terminal widths. These checks do not invoke models and are not a live-provider end-to-end test. Pi 0.85.1 was not rerun for this revision.

The adapter uses Pi's tool-definition metadata and tool-component rendering APIs. If a later runtime removes a required API, the adapter reports a diagnostic instead of silently claiming compatibility.

## Load only one implementation

Atom's launcher explicitly loads this bundled extension. Do not also load a standalone Calm extension in the same process: separate copies can register the same command and disagree about the toggle state. Inspect Pi's extension configuration before activation. With the owner's permission, disable or scope the standalone copy so Atom loads only this implementation; do not disable unrelated personal extensions.

Adapted from Kun Chen's Pi Calm extension, itself adapted from Firstmate. See [LICENSE](LICENSE).
