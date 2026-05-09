# @file install.ps1
# @license AGPL-3.0-or-later
#
# Mock NM Host 설치 스크립트 — Windows.
# HKCU 레지스트리에 NM host 를 등록한다.
# 테스트/CI 전용. 프로덕션 배포 미포함.
#
# 사용법:
#   $env:EXT_ID = "your-extension-id"
#   .\install.ps1
#
# 환경 변수:
#   EXT_ID    — 브라우저 확장 ID
#   HOST_NAME — NM host 이름 (기본: com.secretbank.nm_host)

$ErrorActionPreference = "Stop"

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$HostJs     = Join-Path $ScriptDir "index.js"
$ExtId      = if ($env:EXT_ID) { $env:EXT_ID } else { "placeholder_ext_id" }
$HostName   = if ($env:HOST_NAME) { $env:HOST_NAME } else { "com.secretbank.nm_host" }
$ManifestName = "$HostName.json"

# NM manifest JSON 생성 (임시 디렉토리에 저장)
$TempDir      = Join-Path $env:TEMP "secretbank-mock-nm-host"
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
$ManifestPath = Join-Path $TempDir $ManifestName

# Chrome 용 manifest (allowed_origins)
$ChromeManifest = @{
  name               = $HostName
  description        = "Secretbank Mock Native Messaging Host (test-only)"
  path               = "node.exe"  # node 를 직접 실행
  type               = "stdio"
  allowed_origins    = @("chrome-extension://$ExtId/")
} | ConvertTo-Json -Depth 5

# node.exe 경로를 찾아 path 에 삽입
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $NodeExe) {
  Write-Error "[install] node.exe 를 찾을 수 없습니다. Node.js 설치 후 재시도하세요."
  exit 1
}

# Windows 에서는 wrapper .cmd 또는 직접 node + script 경로 사용
# NM host 는 path 를 직접 실행하므로 .cmd wrapper 를 생성한다
$WrapperPath = Join-Path $TempDir "secretbank-mock-nm-host.cmd"
Set-Content -Path $WrapperPath -Value "@echo off`r`nnode `"$HostJs`" %*"

$ChromeManifestObj = @{
  name            = $HostName
  description     = "Secretbank Mock Native Messaging Host (test-only)"
  path            = $WrapperPath
  type            = "stdio"
  allowed_origins = @("chrome-extension://$ExtId/")
}
$ChromeManifestJson = $ChromeManifestObj | ConvertTo-Json -Depth 5
Set-Content -Path $ManifestPath -Value $ChromeManifestJson -Encoding UTF8

Write-Host "[install] manifest: $ManifestPath"

# Chrome / Chromium / Edge 레지스트리 등록 (HKCU — 관리자 권한 불필요)
$ChromeRegKey   = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
$ChromiumRegKey = "HKCU:\Software\Chromium\NativeMessagingHosts\$HostName"
$EdgeRegKey     = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"

foreach ($RegKey in @($ChromeRegKey, $ChromiumRegKey, $EdgeRegKey)) {
  $Browser = ($RegKey -split "\\")[3]  # Chrome | Chromium | Edge
  New-Item -Path $RegKey -Force | Out-Null
  Set-ItemProperty -Path $RegKey -Name "(Default)" -Value $ManifestPath
  Write-Host "[install] $Browser 레지스트리 등록: $RegKey"
}

Write-Host ""
Write-Host "[install] Mock NM Host 등록 완료."
Write-Host "  Host:     $HostName"
Write-Host "  Script:   $HostJs"
Write-Host "  Wrapper:  $WrapperPath"
Write-Host "  Manifest: $ManifestPath"
Write-Host "  Ext ID:   $ExtId"
Write-Host ""
Write-Host "제거하려면: .\uninstall.ps1"
