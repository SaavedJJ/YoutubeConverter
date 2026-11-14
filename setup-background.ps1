param(
  [int]$Port = 3001,
  [Parameter(Mandatory = $true)]
  [string]$TailscaleOrigin
)

$ErrorActionPreference = 'Stop'
$taskName = 'YoutubeConverter-Personal'
$dataDir = Join-Path $env:LOCALAPPDATA 'YoutubeConverter'
$passwordFile = Join-Path $dataDir 'password.txt'

if ($Port -lt 1 -or $Port -gt 65535) {
  throw 'El puerto debe estar entre 1 y 65535.'
}
if ($TailscaleOrigin -notmatch '^https://[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+\.ts\.net(?::[0-9]{1,5})?$') {
  throw 'Indica la dirección HTTPS de este equipo en Tailscale.'
}
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  throw "La tarea $taskName ya existe; no se modificará."
}
if (Test-Path $dataDir) {
  throw "La carpeta $dataDir ya existe; no se modificarán sus archivos."
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  throw "El puerto $Port está ocupado. Cierra el convertidor anterior y vuelve a intentarlo."
}
Get-Command node.exe -ErrorAction Stop | Out-Null

$password = Read-Host 'Introduce una contraseña de al menos 12 caracteres' -AsSecureString
if ($password.Length -lt 12) {
  throw 'La contraseña debe tener al menos 12 caracteres.'
}

$user = [Security.Principal.WindowsIdentity]::GetCurrent()
New-Item -ItemType Directory -Path $dataDir | Out-Null
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$inheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
$allow = [Security.AccessControl.AccessControlType]::Allow
foreach ($sid in @($user.User, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
  $rule = New-Object Security.AccessControl.FileSystemAccessRule(
    $sid, 'FullControl', $inheritance, 'None', $allow
  )
  $acl.AddAccessRule($rule)
}
Set-Acl -Path $dataDir -AclObject $acl
$password | ConvertFrom-SecureString | Set-Content -LiteralPath $passwordFile -Encoding ASCII -NoNewline

$runner = Join-Path $PSScriptRoot 'run-background.ps1'
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -Port {1} -TailscaleOrigin "{2}"' -f $runner, $Port, $TailscaleOrigin
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments -WorkingDirectory $PSScriptRoot
$identity = "$env:USERDOMAIN\$env:USERNAME"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "Tarea $taskName instalada e iniciada. Se ejecutará al iniciar sesión en Windows."
