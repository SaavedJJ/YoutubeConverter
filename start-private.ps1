param(
  [int]$Port = 3000,
  [string]$TailscaleOrigin = ""
)

$ErrorActionPreference = 'Stop'
$securePassword = Read-Host 'Introduce una contraseña de al menos 12 caracteres' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:CONVERTER_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $env:PORT = "$Port"
  $env:TAILSCALE_ORIGIN = $TailscaleOrigin
  node (Join-Path $PSScriptRoot 'server.js')
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Item Env:\CONVERTER_PASSWORD -ErrorAction SilentlyContinue
}
