# Rasterise the Activity Bar icon from SVG to PNG.
#
# vsce refuses to publish user-supplied SVG images, so the icon that ships in
# the VSIX must be a PNG. The drawing here mirrors media/labwatch.svg: a rounded
# panel with three ascending bars and a green status dot, drawn for a dark
# Activity Bar using currentColor replaced by an explicit light blue.

Add-Type -AssemblyName System.Drawing

$size = 48
$out = Join-Path $PSScriptRoot '..\vscode-extension\media\labwatch.png'
$out = [System.IO.Path]::GetFullPath($out)

$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([System.Drawing.Color]::Transparent)

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

# Panel outline, scaled from the 24x24 viewBox.
$scale = $size / 24.0
$framePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 200, 214, 232), (1.6 * $scale))
$frame = New-RoundedRect (3 * $scale) (4 * $scale) (18 * $scale) (16 * $scale) (2.5 * $scale)
$g.DrawPath($framePen, $frame)

# Three ascending bars.
$bars = @(
    @{ x = 7.0; y = 13.0; h = 4.0;  a = 140 },
    @{ x = 11.0; y = 9.5;  h = 7.5;  a = 204 },
    @{ x = 15.0; y = 6.5;  h = 10.5; a = 255 }
)
foreach ($bar in $bars) {
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($bar.a, 96, 176, 255))
    $rect = New-RoundedRect ($bar.x * $scale) ($bar.y * $scale) (2.6 * $scale) ($bar.h * $scale) (0.8 * $scale)
    $g.FillPath($brush, $rect)
    $brush.Dispose()
    $rect.Dispose()
}

# The green status dot.
$dot = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 52, 211, 153))
$g.FillEllipse($dot, (19.2 - 1.6) * $scale, (5.6 - 1.6) * $scale, 3.2 * $scale, 3.2 * $scale)
$dot.Dispose()

$g.Dispose()
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$info = Get-Item $out
Write-Host ("wrote {0} ({1} bytes, {2}x{3})" -f $info.FullName, $info.Length, $size, $size)
