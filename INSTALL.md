# Installing Atom (guide for coding agents)

You are installing Atom for the person you are working with. Follow these steps in order on their Windows PC, using PowerShell. Show them what you are doing, ask before installing anything globally or changing PATH, and finish with the checks in step 6. Stop and explain if a step fails; do not work around a failed install or check.

Atom is a small set of extensions for the Pi coding agent. Pi does the work; Atom adds the banner, the terminal title, the guard, Calm mode and the workflow prompts.

## 0. Check the machine

- Windows 10 or 11.
- Git (`git --version`).
- Node.js 22 or later (`node --version`). Node 24 is needed to run the tests in step 6. If Node is missing or older, ask before installing it (e.g. `winget install OpenJS.NodeJS.LTS`).

## 1. Install Pi

Check first: `Get-Command pi.cmd`. If Pi is missing, ask the person, then install it globally:

```powershell
npm install -g @earendil-works/pi-coding-agent
pi --version
```

## 2. Choose a folder and clone

Use `%USERPROFILE%\atom-harness` unless the person names another folder. The launcher loads its extensions from this folder, so it must stay where it is.

```powershell
$base = "$env:USERPROFILE\atom-harness"
git clone https://github.com/sz-747/atom-harness.git $base
Set-Location $base
```

## 3. Install dependencies and build the banner

The banner is generated from `atom-face.png` and is not in the repository, so the build is required before the first launch.

```powershell
npm ci
npm run build
```

Then check that `branding\generated\header.mjs` exists.

## 4. Sign in to a model provider

Pi needs at least one model provider. Ask the person which one they use. They can start `pi` and sign in with `/login`, or set the provider's API key as an environment variable (for example `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`). Do not ask them to paste a key into the chat; let them set it themselves.

## 5. Optional: an `atom` command anywhere

Only if the person wants it, and after asking, put a small shim in a folder that is already on their user PATH (or add one, with their permission):

```powershell
$bin = "$env:USERPROFILE\bin"
New-Item -ItemType Directory -Force $bin | Out-Null
"@echo off`r`n`"$base\atom.cmd`" %*" | Set-Content "$bin\atom.cmd" -Encoding ascii
```

Without the shim, they run `$base\atom.cmd` by its full path.

## 6. Checks

Run these and report each as passed or failed:

```powershell
pi --version
Test-Path "$base\branding\generated\header.mjs"
npm test   # Node 24+; skip and say so on Node 22
```

In an interactive Atom session, run `/calm`, send a prompt that uses a built-in tool, and check that the boat appears while working and the tool rows are hidden. Run `/calm` again and check that normal tool rows return. Calm is off by default; the choice is saved in Pi's agent directory. If an older standalone Calm extension is already installed, disable that copy with `pi config` before using the bundled version. Do not delete or change personal extensions without permission.

Then tell the person how to start Atom: open a terminal in the project they want to work on and run `atom` (with the shim) or `$base\atom.cmd`. Atom starts in that folder, not in `$base`.
