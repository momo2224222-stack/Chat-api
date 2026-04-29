param(
  [string]$Port = "",
  [string]$Target = "",
  [string]$ApiKey = "",
  [string]$Model = "",
  [string]$ApiStyle = "",
  [string]$ImageTarget = "",
  [string]$ImageApiKey = "",
  [string]$ImageModel = "",
  [string]$ImagePath = "",
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

function Read-Default {
  param(
    [string]$Prompt,
    [string]$DefaultValue
  )
  if ([string]::IsNullOrWhiteSpace($DefaultValue)) {
    return (Read-Host $Prompt).Trim()
  }
  $value = Read-Host "$Prompt [$DefaultValue]"
  if ([string]::IsNullOrWhiteSpace($value)) { return $DefaultValue }
  return $value.Trim()
}

function Read-Secret {
  param(
    [string]$Prompt,
    [string]$CurrentValue = ""
  )
  if (-not [string]::IsNullOrWhiteSpace($CurrentValue)) { return $CurrentValue }
  $secure = Read-Host $Prompt -AsSecureString
  if ($secure.Length -eq 0) { return "" }
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Find-Node {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return ""
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not (Test-Path (Join-Path $Root "proxy-server.mjs"))) {
  throw "proxy-server.mjs was not found. Run this script from the project folder."
}
if (-not (Test-Path (Join-Path $Root "index.html"))) {
  throw "index.html was not found. Run this script from the project folder."
}

$nodePath = Find-Node
if (-not $nodePath) {
  Write-Host ""
  Write-Host "Node.js was not found." -ForegroundColor Red
  Write-Host "Install Node.js 20 or newer from https://nodejs.org/ , then run this script again."
  Write-Host ""
  Pause
  exit 1
}

try {
  $nodeVersion = (& $nodePath --version).Trim()
  $major = [int]($nodeVersion.TrimStart("v").Split(".")[0])
  if ($major -lt 20) {
    Write-Host "Node.js $nodeVersion detected. Node.js 20 or newer is recommended." -ForegroundColor Yellow
  }
} catch {
  Write-Host "Could not check Node.js version. Continuing..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "AI Chat local service setup" -ForegroundColor Cyan
Write-Host "Project folder: $Root"
Write-Host ""

$Port = Read-Default "Local port" $(if ($Port) { $Port } elseif ($env:AI_PROXY_PORT) { $env:AI_PROXY_PORT } else { "8787" })
$Target = Read-Default "Chat API base URL" $(if ($Target) { $Target } elseif ($env:AI_PROXY_TARGET) { $env:AI_PROXY_TARGET } else { "https://api.openai.com" })
$Model = Read-Default "Chat model" $(if ($Model) { $Model } elseif ($env:AI_PROXY_MODEL) { $env:AI_PROXY_MODEL } else { "gpt-5.5" })
$ApiStyle = Read-Default "Chat API style: chat or responses" $(if ($ApiStyle) { $ApiStyle } elseif ($env:AI_PROXY_API_STYLE) { $env:AI_PROXY_API_STYLE } else { "chat" })
$ImageTarget = Read-Default "Image API base URL" $(if ($ImageTarget) { $ImageTarget } elseif ($env:AI_IMAGE_PROXY_TARGET) { $env:AI_IMAGE_PROXY_TARGET } else { $Target })
$ImageModel = Read-Default "Image model" $(if ($ImageModel) { $ImageModel } elseif ($env:AI_IMAGE_PROXY_MODEL) { $env:AI_IMAGE_PROXY_MODEL } else { "gpt-image-2" })
$ImagePath = Read-Default "Image API path" $(if ($ImagePath) { $ImagePath } elseif ($env:AI_IMAGE_PROXY_PATH) { $env:AI_IMAGE_PROXY_PATH } else { "/v1/images/generations" })

$ApiKey = Read-Secret "Chat API key, blank if your proxy does not need one" $(if ($ApiKey) { $ApiKey } elseif ($env:AI_PROXY_API_KEY) { $env:AI_PROXY_API_KEY } else { "" })
if ([string]::IsNullOrWhiteSpace($ImageApiKey) -and -not [string]::IsNullOrWhiteSpace($env:AI_IMAGE_PROXY_API_KEY)) {
  $ImageApiKey = $env:AI_IMAGE_PROXY_API_KEY
}
if ([string]::IsNullOrWhiteSpace($ImageApiKey) -and $ImageTarget -eq $Target) {
  $ImageApiKey = $ApiKey
} else {
  $ImageApiKey = Read-Secret "Image API key, blank to reuse none" $ImageApiKey
}

$portNumber = [int]$Port
$portInUse = $false
$tcpClient = $null
try {
  $tcpClient = [System.Net.Sockets.TcpClient]::new()
  $async = $tcpClient.BeginConnect("127.0.0.1", $portNumber, $null, $null)
  if ($async.AsyncWaitHandle.WaitOne(200)) {
    try {
      $tcpClient.EndConnect($async)
      $portInUse = $true
    } catch {}
  }
} catch {
  $portInUse = $false
} finally {
  if ($tcpClient) { $tcpClient.Close() }
}
if ($portInUse) {
  Write-Host ""
  Write-Host "Port $portNumber is already in use. Stop the other service or choose another port." -ForegroundColor Red
  Pause
  exit 1
}

$env:AI_PROXY_PORT = [string]$portNumber
$env:AI_PROXY_TARGET = $Target.TrimEnd("/")
$env:AI_PROXY_MODEL = $Model
$env:AI_PROXY_API_STYLE = $ApiStyle.ToLowerInvariant()
$env:AI_IMAGE_PROXY_TARGET = $ImageTarget.TrimEnd("/")
$env:AI_IMAGE_PROXY_MODEL = $ImageModel
$env:AI_IMAGE_PROXY_PATH = $ImagePath

if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
  $env:AI_PROXY_API_KEY = $ApiKey
} else {
  Remove-Item Env:\AI_PROXY_API_KEY -ErrorAction SilentlyContinue
}

if (-not [string]::IsNullOrWhiteSpace($ImageApiKey)) {
  $env:AI_IMAGE_PROXY_API_KEY = $ImageApiKey
} else {
  Remove-Item Env:\AI_IMAGE_PROXY_API_KEY -ErrorAction SilentlyContinue
}

$url = "http://127.0.0.1:$portNumber/"

Write-Host ""
Write-Host "Starting local service..." -ForegroundColor Green
Write-Host "Open: $url"
Write-Host "Chat forwarding: $($env:AI_PROXY_TARGET)"
Write-Host "Image forwarding: $($env:AI_IMAGE_PROXY_TARGET)$($env:AI_IMAGE_PROXY_PATH)"
Write-Host ""
Write-Host "Keep this PowerShell window open while using the web app. Press Ctrl+C to stop."
Write-Host ""

if (-not $NoOpen) {
  Start-Process $url
}

& $nodePath (Join-Path $Root "proxy-server.mjs")
