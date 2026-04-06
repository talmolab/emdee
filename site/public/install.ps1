$ErrorActionPreference = "Stop"

$repo = "talmolab/emdee"
$appName = "emdee"

Write-Host "Fetching latest release..."
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest"
$version = $release.tag_name -replace "^v", ""
Write-Host "Latest version: v$version"

$fileName = "${appName}_${version}_x64-setup.exe"
$url = "https://github.com/$repo/releases/download/v$version/$fileName"
$tempDir = Join-Path $env:TEMP "emdee-install"
$installerPath = Join-Path $tempDir $fileName

New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

Write-Host "Downloading: $url"
Invoke-WebRequest -Uri $url -OutFile $installerPath

Write-Host "Running installer..."
Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait

Remove-Item -Recurse -Force $tempDir

Write-Host ""
Write-Host "Installed $appName v$version"
Write-Host ""
Write-Host "Usage: $appName README.md"
