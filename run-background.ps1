param(
  [int]$Port = 3001,
  [Parameter(Mandatory = $true)]
  [string]$TailscaleOrigin
)

$ErrorActionPreference = 'Stop'
$dataDir = Join-Path $env:LOCALAPPDATA 'YoutubeConverter'
$stdout = Join-Path $dataDir 'server.log'
$stderr = Join-Path $dataDir 'server-error.log'
$pointer = [IntPtr]::Zero
try {
  $password = Get-Content -LiteralPath (Join-Path $dataDir 'password.txt') -Raw | ConvertTo-SecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
  $env:CONVERTER_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $env:PORT = "$Port"
  $env:TAILSCALE_ORIGIN = $TailscaleOrigin
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $server = Join-Path $PSScriptRoot 'server.js'
  $process = Start-Process -FilePath $node -ArgumentList "`"$server`"" -WorkingDirectory $PSScriptRoot -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  if ($process.ExitCode -ne 0) {
    throw "El servidor terminó con código $($process.ExitCode). Consulta $stderr."
  }
} catch {
  Add-Content -LiteralPath $stderr -Value "Error al iniciar el convertidor: $($_.Exception.Message)"
  exit 1
} finally {
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
  Remove-Item Env:\CONVERTER_PASSWORD -ErrorAction SilentlyContinue
}
