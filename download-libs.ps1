# Download PDF.js and pdf-lib libraries for the extension
# Run this script once from the pdf-annotate-pro directory

$libDir = "lib"
if (-not (Test-Path $libDir)) { New-Item -ItemType Directory -Path $libDir | Out-Null }

Write-Host "Downloading PDF.js..." -ForegroundColor Cyan
$pdfJsBase = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174"

Invoke-WebRequest -Uri "$pdfJsBase/pdf.min.js"        -OutFile "$libDir/pdf.min.js"
Invoke-WebRequest -Uri "$pdfJsBase/pdf.worker.min.js" -OutFile "$libDir/pdf.worker.min.js"

Write-Host "Downloading pdf-lib..." -ForegroundColor Cyan
Invoke-WebRequest -Uri "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js" -OutFile "$libDir/pdf-lib.min.js"

Write-Host "`nAll libraries downloaded to /$libDir/" -ForegroundColor Green
Write-Host "File sizes:"
Get-ChildItem $libDir | Select-Object Name, @{n='Size KB';e={[math]::Round($_.Length/1KB,1)}} | Format-Table
