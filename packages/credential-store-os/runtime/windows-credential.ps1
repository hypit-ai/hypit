param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("read", "write", "delete")]
  [string]$Operation
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$null = [Windows.Security.Credentials.PasswordVault, Windows.Security.Credentials, ContentType = WindowsRuntime]
$null = [Windows.Security.Credentials.PasswordCredential, Windows.Security.Credentials, ContentType = WindowsRuntime]
$vault = New-Object Windows.Security.Credentials.PasswordVault
$notFound = -2147023728 # HRESULT_FROM_WIN32(ERROR_NOT_FOUND)

function Find-Credential {
  try {
    return $vault.Retrieve([string]$request.service, [string]$request.account)
  } catch {
    if ($_.Exception.HResult -eq $notFound) { return $null }
    throw
  }
}

switch ($Operation) {
  "read" {
    $credential = Find-Credential
    if ($null -eq $credential) {
      @{ found = $false } | ConvertTo-Json -Compress
      break
    }
    $credential.RetrievePassword()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($credential.Password)
    @{ found = $true; secret = [Convert]::ToBase64String($bytes) } | ConvertTo-Json -Compress
  }
  "write" {
    $existing = Find-Credential
    if ($null -ne $existing) { $vault.Remove($existing) }
    $bytes = [Convert]::FromBase64String([string]$request.secret)
    $secret = [System.Text.Encoding]::UTF8.GetString($bytes)
    $credential = New-Object Windows.Security.Credentials.PasswordCredential(
      [string]$request.service,
      [string]$request.account,
      $secret
    )
    $vault.Add($credential)
    @{ ok = $true } | ConvertTo-Json -Compress
  }
  "delete" {
    $credential = Find-Credential
    if ($null -eq $credential) {
      @{ deleted = $false } | ConvertTo-Json -Compress
      break
    }
    $vault.Remove($credential)
    @{ deleted = $true } | ConvertTo-Json -Compress
  }
}
