# Native PowerShell entrypoint. Keep the caller's working directory.
# Explicitly load Atom's trusted extensions so branding works outside this repo too.
$ErrorActionPreference = 'Stop'
$pi = Get-Command pi.cmd -CommandType Application -ErrorAction Stop
$startup = Join-Path $PSScriptRoot '.pi\extensions\atom-startup.ts'
$title = Join-Path $PSScriptRoot '.pi\extensions\atom-title.ts'
$subagent = Join-Path $PSScriptRoot '.pi\extensions\subagent\index.ts'
& $pi.Source --extension $startup --extension $title --extension $subagent @args
exit $LASTEXITCODE
