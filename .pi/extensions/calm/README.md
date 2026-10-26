# Atom Calm

Atom's implementation of a quiet transcript and a working boat. Licensed under the repository's [MIT license](../../../LICENSE).

## Use

The Atom launcher explicitly loads `index.ts`, including when launched from another project. Alternatively, use `pi --extension /path/to/atom-harness/.pi/extensions/calm/index.ts`.

Run `/calm` to switch the presentation on or off. A fresh installation defaults to off. The plain `on` or `off` preference is stored in `calm` under Pi's agent directory (`~/.pi/agent`, or `PI_CODING_AGENT_DIR`). An existing preference is honored.

- Built-in tool call and text-result rows disappear, without leaving blank rows.
- Image results and custom tools remain visible.
- Reasoning display is still controlled by Pi.
- An animated yellow boat on green water replaces the working indicator until `agent_settled`, including across tool calls and retries.
- Toggle off to restore normal tool output, including earlier rows.
- Execution, model context, stored results, and export data are not filtered.
- Print, JSON, and RPC modes do not install the presentation adapter.

Do not load this together with an older standalone Calm extension. Disable the older copy using `pi config`; keep personal configuration changes separate from installing this repository.

## Compatibility

The boat uses public widget and lifecycle APIs. Hiding complete tool rows requires internal `AgentSession.getToolDefinition` and `ToolExecutionComponent.render` hooks. The adapter adds origin metadata to a copy of a tool definition, leaving the registry and execution function unchanged. Pi's renderer copies retain that metadata; extension tools and SDK overrides are excluded.

The render hook keeps Pi's image components and spacers. Turning Calm off delegates to the original renderer. Reload reuses a process-wide adapter rather than stacking wrappers. If required hooks are missing, Calm reports a warning and the boat remains available.

Verified with Pi 0.87.1. Pi upgrades can change these internal interfaces; run `npm test` after upgrading. The tests load the extension through Pi, exercise real tool-row rendering, verify unchanged execution/results, and check toggling, persistence, lifecycle cleanup, non-TUI modes, images, custom/SDK overrides, and narrow/resized boat rendering. They do not replace a visual check in a real terminal.

This is new Atom source implementing the requested behavior, not a redistributed copy of the previously installed Calm extension. The existing local installation is not modified.
