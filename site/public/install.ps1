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

# Add install directory to user PATH if not already present
$installDir = Join-Path $env:LOCALAPPDATA $appName
if (Test-Path (Join-Path $installDir "$appName.exe")) {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -and $userPath -like "*$installDir*") {
        # Already in PATH
    } else {
        $newPath = if ($userPath -and $userPath.TrimEnd(";")) {
            "$($userPath.TrimEnd(";"));$installDir"
        } else {
            $installDir
        }
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Write-Host "Added $installDir to PATH."
        Write-Host "Restart your terminal for the PATH change to take effect."
    }
} else {
    Write-Host "Note: Could not find $appName.exe in $installDir"
    Write-Host "You may need to add the install directory to your PATH manually."
}

Write-Host ""
Write-Host "Installed $appName v$version"
Write-Host ""
Write-Host "Usage: $appName README.md"
