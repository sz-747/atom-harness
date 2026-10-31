# Pi setup used with Atom

This repository contains the portable parts of the Pi setup used with Atom. It keeps the green reasoning display and the quiet transcript without copying private credentials or machine-specific paths.

## Required

- Windows 10 or 11
- Node.js 22 or later
- Git
- Pi `0.87.1` or later
- A provider login configured with Pi, such as `openai-codex`

Install Pi if needed:

```powershell
npm install -g @earendil-works/pi-coding-agent
pi --version
```

Clone and install Atom:

```powershell
git clone https://github.com/sz-747/atom-harness.git
Set-Location .\atom-harness
npm ci
npm run build
```

Launch it from the project that you want Atom to work on:

```powershell
E:\path\to\atom-harness\atom.cmd
```

## Display settings

Atom launches Pi with the repository theme at `.pi/themes/atom.json`. The theme provides the green reasoning colours.

The Pi user settings should contain these values:

```json
{
  "theme": "atom",
  "hideThinkingBlock": false,
  "defaultProvider": "openai-codex",
  "defaultModel": "gpt-5.6-luna",
  "defaultThinkingLevel": "medium",
  "quietStartup": true
}
```

`hideThinkingBlock: false` keeps reasoning visible. The exact amount of reasoning still depends on the selected model and reasoning level.

The Atom launcher also loads two project extensions:

- `atom-compaction.ts` triggers one compaction when the live context crosses 50% of the active model window.
- `atom-footer.ts` keeps the useful footer information but omits the redundant `(openai-codex)` provider label.

Set the provider login inside Pi. Do not commit `auth.json`, API keys, tokens, or the complete user settings file.

## Optional packages

The laptop setup also has these user packages:

```text
npm:pi-web-access@0.29.0
npm:@ryan_nookpi/pi-extension-codex-fast-mode@0.2.7
```

They are optional. Fast Mode is off unless enabled in a session with:

```text
/codex-fast on
```

Check it with:

```text
/codex-fast status
```

## Extensions and prompts

The Atom launcher loads the project-local extensions and prompts from `.pi`. Do not copy the laptop's absolute paths such as `E:\atom-harness` into another machine's Pi settings.

Do not load an older standalone Calm extension together with the bundled `.pi/extensions/calm` extension. Disable the old copy with `pi config` first. Otherwise the working boat can appear twice.

## Verify

```powershell
pi --version
Test-Path .\branding\generated\header.mjs
npm test
```

In an interactive Atom session:

1. Confirm the reasoning text is visible and green.
2. Run `/calm`.
3. Run a prompt that uses a built-in tool.
4. Confirm one working boat appears and built-in tool rows are hidden.
5. Run `/calm` again and confirm normal tool rows return.
