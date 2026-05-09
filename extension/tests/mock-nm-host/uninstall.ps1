# @file uninstall.ps1
# @license AGPL-3.0-or-later
#
# Mock NM Host 제거 스크립트 — Windows.
# install.ps1 로 등록한 레지스트리 키를 제거한다.

$ErrorActionPreference = "Stop"

$HostName = if ($env:HOST_NAME) { $env:HOST_NAME } else { "com.secretbank.nm_host" }

$ChromeRegKey   = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
$ChromiumRegKey = "HKCU:\Software\Chromium\NativeMessagingHosts\$HostName"
$EdgeRegKey     = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"

foreach ($RegKey in @($ChromeRegKey, $ChromiumRegKey, $EdgeRegKey)) {
  $Browser = ($RegKey -split "\\")[3]
  if (Test-Path $RegKey) {
    Remove-Item -Path $RegKey -Recurse -Force
    Write-Host "[uninstall] $Browser 레지스트리 제거: $RegKey"
  } else {
    Write-Host "[uninstall] $Browser: 키 없음 (skip)"
  }
}

# 임시 디렉토리 정리 (선택)
$TempDir = Join-Path $env:TEMP "secretbank-mock-nm-host"
if (Test-Path $TempDir) {
  Remove-Item -Path $TempDir -Recurse -Force
  Write-Host "[uninstall] 임시 디렉토리 제거: $TempDir"
}

Write-Host "[uninstall] 완료."
