Add-Type -AssemblyName System.Drawing

$src    = "C:\Users\HP\.gemini\antigravity\brain\cb620292-d50a-40c4-a501-09f72fc600f6\pdf_annotate_pro_icon_1779182512407.png"
$outDir = "icons"

foreach ($size in @(16, 48, 128)) {
    $orig = [System.Drawing.Image]::FromFile($src)
    $bmp  = New-Object System.Drawing.Bitmap($size, $size)
    $g    = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($orig, 0, 0, $size, $size)
    $outPath = "$outDir\icon${size}.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    $orig.Dispose()
    Write-Host "Saved $outPath"
}

Write-Host "All icons updated!" -ForegroundColor Green
