# PDF Annotate Pro — Icon Generator
# Run once to generate placeholder icons (replace with real ones before publishing)

function Make-Icon($size, $path) {
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g   = [System.Drawing.Graphics]::FromImage($bmp)

  # Background gradient (simulate with solid color)
  $bg = [System.Drawing.Color]::FromArgb(108, 99, 255)
  $g.Clear($bg)

  # Draw rounded rect outline
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [math]::Max(1, $size/32))
  $margin = [int]($size * 0.18)
  $g.DrawRectangle($pen, $margin, $margin, $size - $margin*2, $size - $margin*2)

  # Draw "P" text
  $fontSize  = [int]($size * 0.42)
  $font      = New-Object System.Drawing.Font("Arial", $fontSize, [System.Drawing.FontStyle]::Bold)
  $brush     = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $strSize   = $g.MeasureString("P", $font)
  $x = ($size - $strSize.Width) / 2
  $y = ($size - $strSize.Height) / 2
  $g.DrawString("P", $font, $brush, $x, $y)

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "Created $path ($size x $size)"
}

$iconsDir = "icons"
if (-not (Test-Path $iconsDir)) { New-Item -ItemType Directory -Path $iconsDir | Out-Null }

Make-Icon 16  "$iconsDir/icon16.png"
Make-Icon 48  "$iconsDir/icon48.png"
Make-Icon 128 "$iconsDir/icon128.png"

Write-Host "`nIcons created in /icons/" -ForegroundColor Green
