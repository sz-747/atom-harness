# Native PowerShell entrypoint. Keep the caller's working directory.
# Explicitly load Atom's trusted extensions so branding works outside this repo too.
$ErrorActionPreference = 'Stop'
$pi = Get-Command pi.cmd -CommandType Application -ErrorAction Stop
$startup = Join-Path $PSScriptRoot '.pi\extensions\atom-startup.ts'
$title = Join-Path $PSScriptRoot '.pi\extensions\atom-title.ts'
$guard = Join-Path $PSScriptRoot '.pi\extensions\atom-guard.ts'
$subagent = Join-Path $PSScriptRoot '.pi\extensions\subagent\index.ts'
$calm = Join-Path $PSScriptRoot '.pi\extensions\calm\index.ts'
$compaction = Join-Path $PSScriptRoot '.pi\extensions\atom-compaction.ts'
$footer = Join-Path $PSScriptRoot '.pi\extensions\atom-footer.ts'
$theme = Join-Path $PSScriptRoot '.pi\themes\atom.json'
& $pi.Source --theme $theme --extension $startup --extension $title --extension $guard --extension $subagent --extension $calm --extension $compaction --extension $footer @args
exit $LASTEXITCODE
