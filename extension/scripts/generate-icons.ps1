param(
  [string]$Source = "$PSScriptRoot\..\..\src-tauri\icons\icon.png",
  [string]$OutDir = "$PSScriptRoot\..\public\icon"
)

# Generate 4 extension icon PNGs (16/32/48/128) from src-tauri/icons/icon.png
# WXT auto-detects extension/public/icon/<size>.png and writes manifest icons + action.default_icon.
# 16  = toolbar / context menu
# 32  = Windows toolbar (HiDPI)
# 48  = chrome://extensions card
# 128 = Web Store listing

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $Source)) {
  Write-Error "Source icon not found: $Source"
  exit 1
}

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

$srcImg = [System.Drawing.Image]::FromFile((Resolve-Path $Source))
Write-Host "Source: $Source ($($srcImg.Width)x$($srcImg.Height))"

$sizes = 16, 32, 48, 128
foreach ($size in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($srcImg, 0, 0, $size, $size)
  $g.Dispose()

  $outPath = Join-Path $OutDir "$size.png"
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()

  $bytes = (Get-Item $outPath).Length
  Write-Host "  wrote $outPath ($bytes bytes)"
}

$srcImg.Dispose()
Write-Host "Done."
