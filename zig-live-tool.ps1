# =====================================================================
#  Zig City 2 - Outil lien YouTube (live/video) -> ecran WaterFrames
#  Auto-installateur : telecharge yt-dlp + Deno au 1er lancement dans
#  %LOCALAPPDATA%\ZigLiveTool\bin, puis affiche l'outil. Rien a installer.
# =====================================================================
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA 'ZigLiveTool'
$bin = Join-Path $dir 'bin'
New-Item -ItemType Directory -Force -Path $bin | Out-Null

try {
  if (-not (Test-Path (Join-Path $bin 'yt-dlp.exe'))) {
    Write-Host "Telechargement de yt-dlp (1re fois)..."
    Invoke-WebRequest 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile (Join-Path $bin 'yt-dlp.exe') -UseBasicParsing
  }
  if (-not (Test-Path (Join-Path $bin 'deno.exe'))) {
    Write-Host "Telechargement de Deno (1re fois, ~40 Mo, patiente)..."
    $z = Join-Path $dir 'deno.zip'
    Invoke-WebRequest 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip' -OutFile $z -UseBasicParsing
    Expand-Archive -Path $z -DestinationPath $bin -Force
    Remove-Item $z -Force
    $d = Get-ChildItem $bin -Recurse -Filter deno.exe | Select-Object -First 1
    if ($d -and $d.FullName -ne (Join-Path $bin 'deno.exe')) { Move-Item $d.FullName (Join-Path $bin 'deno.exe') -Force }
  }
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  [void][System.Windows.Forms.MessageBox]::Show("Echec du telechargement des outils. Verifie ta connexion puis relance.`n`n" + $_.Exception.Message, "Outil Live YouTube")
  return
}

$yt = Join-Path $bin 'yt-dlp.exe'
$env:PATH = $bin + ";" + $env:PATH

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "Lien YouTube pour ecran - Zig City 2"
$form.Size = New-Object System.Drawing.Size(620, 390)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(24, 24, 28)
$form.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$form.ForeColor = [System.Drawing.Color]::White

$lbl1 = New-Object System.Windows.Forms.Label
$lbl1.Text = "URL YouTube (live ou video) :"
$lbl1.Location = New-Object System.Drawing.Point(16, 14)
$lbl1.AutoSize = $true
$form.Controls.Add($lbl1)

$txtIn = New-Object System.Windows.Forms.TextBox
$txtIn.Location = New-Object System.Drawing.Point(16, 38)
$txtIn.Size = New-Object System.Drawing.Size(572, 26)
$form.Controls.Add($txtIn)

$lblQ = New-Object System.Windows.Forms.Label
$lblQ.Text = "Qualite :"
$lblQ.Location = New-Object System.Drawing.Point(16, 76)
$lblQ.AutoSize = $true
$form.Controls.Add($lblQ)

$cmbQ = New-Object System.Windows.Forms.ComboBox
$cmbQ.Location = New-Object System.Drawing.Point(84, 72)
$cmbQ.Size = New-Object System.Drawing.Size(300, 26)
$cmbQ.DropDownStyle = "DropDownList"
[void]$cmbQ.Items.Add("Auto (qualite max)")
[void]$cmbQ.Items.Add("720p")
[void]$cmbQ.Items.Add("480p (conseille si beaucoup d'ecrans)")
[void]$cmbQ.Items.Add("360p (tres leger)")
$cmbQ.SelectedIndex = 2
$form.Controls.Add($cmbQ)

$btnGen = New-Object System.Windows.Forms.Button
$btnGen.Text = "Generer le lien"
$btnGen.Location = New-Object System.Drawing.Point(16, 110)
$btnGen.Size = New-Object System.Drawing.Size(170, 36)
$btnGen.BackColor = [System.Drawing.Color]::FromArgb(0, 180, 180)
$btnGen.ForeColor = [System.Drawing.Color]::Black
$btnGen.FlatStyle = "Flat"
$form.Controls.Add($btnGen)

$lbl2 = New-Object System.Windows.Forms.Label
$lbl2.Text = "Lien a coller sur l'ecran :"
$lbl2.Location = New-Object System.Drawing.Point(16, 160)
$lbl2.AutoSize = $true
$form.Controls.Add($lbl2)

$txtOut = New-Object System.Windows.Forms.TextBox
$txtOut.Location = New-Object System.Drawing.Point(16, 184)
$txtOut.Size = New-Object System.Drawing.Size(572, 60)
$txtOut.Multiline = $true
$txtOut.ReadOnly = $true
$txtOut.ScrollBars = "Vertical"
$txtOut.BackColor = [System.Drawing.Color]::FromArgb(40, 40, 46)
$txtOut.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($txtOut)

$btnCopy = New-Object System.Windows.Forms.Button
$btnCopy.Text = "Copier"
$btnCopy.Location = New-Object System.Drawing.Point(16, 252)
$btnCopy.Size = New-Object System.Drawing.Size(170, 34)
$btnCopy.FlatStyle = "Flat"
$btnCopy.Enabled = $false
$form.Controls.Add($btnCopy)

$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Location = New-Object System.Drawing.Point(198, 254)
$lblStatus.Size = New-Object System.Drawing.Size(390, 80)
$lblStatus.Text = ""
$form.Controls.Add($lblStatus)

try {
  $clip = (Get-Clipboard) -join "`n"
  if ($clip -and ($clip -match 'youtube\.com|youtu\.be')) { $txtIn.Text = $clip.Trim() }
} catch { }

$btnGen.Add_Click({
  $url = $txtIn.Text.Trim()
  if (-not ($url -match 'youtube\.com|youtu\.be')) {
    $lblStatus.ForeColor = [System.Drawing.Color]::Salmon
    $lblStatus.Text = "Colle une URL YouTube valide (youtube.com / youtu.be)."
    return
  }
  switch ($cmbQ.SelectedIndex) {
    0 { $fmt = "b" }
    1 { $fmt = "b[height<=720]/b" }
    2 { $fmt = "b[height<=480]/b" }
    3 { $fmt = "b[height<=360]/b" }
    default { $fmt = "b[height<=480]/b" }
  }
  $btnGen.Enabled = $false
  $btnCopy.Enabled = $false
  $txtOut.Text = ""
  $lblStatus.ForeColor = [System.Drawing.Color]::Gold
  $lblStatus.Text = "Generation en cours... (5-15 s)"
  [System.Windows.Forms.Application]::DoEvents()

  try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $yt
    $psi.Arguments = "-g -f `"$fmt`" `"$url`""
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    $so = $p.StandardOutput.ReadToEnd()
    $se = $p.StandardError.ReadToEnd()
    $p.WaitForExit()

    $link = ($so -split "`n") | Where-Object { $_ -match '^https?://' } | Select-Object -First 1
    if ($link) {
      $link = $link.Trim()
      $txtOut.Text = $link
      Set-Clipboard -Value $link
      $btnCopy.Enabled = $true
      $dur = ""
      if ($link -match '/expire/(\d+)/') {
        $exp = [long]$matches[1]
        $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        $h = [math]::Round(($exp - $now) / 3600.0, 1)
        $dur = " (valide ~$h h)"
      }
      $lblStatus.ForeColor = [System.Drawing.Color]::LightGreen
      $lblStatus.Text = "OK ! Lien copie$dur. Colle-le (Ctrl+V) sur l'ecran en jeu."
    } else {
      $msg = ($se -split "`n" | Where-Object { $_ -match 'ERROR' } | Select-Object -First 1)
      if (-not $msg) { $msg = "Echec : video privee/terminee, ou probleme reseau." }
      $lblStatus.ForeColor = [System.Drawing.Color]::Salmon
      $lblStatus.Text = $msg.Trim()
    }
  } catch {
    $lblStatus.ForeColor = [System.Drawing.Color]::Salmon
    $lblStatus.Text = "Erreur : " + $_.Exception.Message
  }
  $btnGen.Enabled = $true
})

$btnCopy.Add_Click({
  if ($txtOut.Text) {
    Set-Clipboard -Value $txtOut.Text
    $lblStatus.ForeColor = [System.Drawing.Color]::LightGreen
    $lblStatus.Text = "Lien recopie dans le presse-papiers."
  }
})

[void]$form.ShowDialog()
