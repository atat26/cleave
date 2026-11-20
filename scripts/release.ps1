# Builds the Cleave installer and publishes it as a GitHub release.
#
#   npm.cmd run release:github            builds, then publishes the release for the version in package.json
#   npm.cmd run release:github -- -DryRun builds everything but publishes nothing
#
# Before you run it: set the new version in package.json (npm.cmd version patch --no-git-tag-version),
# merge that to main, and be on an up-to-date main. The script refuses to run otherwise, and refuses
# to reuse a version that already has a release (an update only reaches an installed app when the
# version number is higher).
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Run([string]$what, [scriptblock]$command) {
  Write-Host "`n== $what"
  & $command
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" }
}

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tag = "v$version"
Write-Host "Cleave $version ($tag)"

# 1. Only release what is on main, saved and pushed.
$branch = (git branch --show-current)
if ($branch -ne 'main') { throw "You are on '$branch'. Switch to main first." }
if (git status --porcelain --untracked-files=no) { throw 'There are unsaved changes. Commit or discard them first.' }
Run 'Fetching the latest main' { git fetch origin main --quiet }
if ((git rev-parse HEAD) -ne (git rev-parse origin/main)) { throw 'main is not the same as origin/main. Pull or push first.' }

# 2. A version is released once.
if (-not $DryRun) {
  # (List the releases rather than asking for this one: asking for a release that does not exist
  # prints an error, which this script would treat as a failure.)
  $existing = @(gh release list --limit 200 --json tagName --jq '.[].tagName')
  if ($LASTEXITCODE -ne 0) { throw 'Could not read the list of releases (is gh signed in?).' }
  if ($existing -contains $tag) { throw "A release for $tag already exists. Raise the version in package.json." }
}

# 3. The same checks as every pull request, then the installer.
Run 'Checking the code' { npm.cmd run check }
Run 'Building the installer' { npm.cmd run make }

$folder = 'out\make\squirrel.windows\x64'
$setup = Join-Path $folder 'Cleave-Setup.exe'
$full = Join-Path $folder "Cleave-$version-full.nupkg"
$releases = Join-Path $folder 'RELEASES'
foreach ($file in @($setup, $full, $releases)) {
  if (-not (Test-Path $file)) { throw "The build did not make $file" }
}

# 4. Checksums, so a download (or the app's update) can be checked.
$sums = Join-Path $folder 'SHA256SUMS.txt'
Get-ChildItem $setup, $full | ForEach-Object {
  '{0}  {1}' -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name
} | Set-Content -Path $sums -Encoding ascii
Write-Host "`nChecksums:"; Get-Content $sums

if ($DryRun) {
  Write-Host "`nDry run: built, nothing published. Files are in $folder"
  return
}

# 5. Publish (this is the step that goes public).
Run "Publishing $tag" {
  gh release create $tag $setup $full $releases $sums --title "Cleave $version" --generate-notes --target main
}
Write-Host "`nDone. https://github.com/atat26/cleave/releases/tag/$tag"
