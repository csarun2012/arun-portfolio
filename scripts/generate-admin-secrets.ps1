$ErrorActionPreference = "Stop"

function Convert-ToBase64Url([byte[]]$Bytes) {
  return [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function New-CryptographicRandomBytes([int]$Length) {
  $bytes = New-Object byte[] $Length
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return ,$bytes
}

$password = Read-Host "Choose the private admin password" -AsSecureString
$confirmation = Read-Host "Confirm the private admin password" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
$confirmationPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmation)

try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $plainConfirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationPointer)
  if ($plainPassword -cne $plainConfirmation) { throw "Passwords do not match." }
  if ($plainPassword.Length -lt 24) { throw "Use a password-manager-generated password of at least 24 characters." }

  [byte[]]$salt = New-CryptographicRandomBytes 16
  # This deliberately uses 25,000 PBKDF2-SHA-256 iterations. Cloudflare
  # Workers Free allows 10 ms CPU per invocation with limited burst tolerance;
  # the value is paired with a password-manager-generated 24+ character
  # password, Turnstile, and strict D1 login throttling.
  $iterations = 25000
  $pbkdf2 = [Security.Cryptography.Rfc2898DeriveBytes]::new(
    $plainPassword,
    $salt,
    $iterations,
    [Security.Cryptography.HashAlgorithmName]::SHA256
  )
  try { $derived = $pbkdf2.GetBytes(32) } finally { $pbkdf2.Dispose() }

  [byte[]]$sessionSecret = New-CryptographicRandomBytes 32
  [byte[]]$rateLimitSalt = New-CryptographicRandomBytes 32

  Write-Output ""
  Write-Output "Enter these values directly in Cloudflare secrets. Do not save them in source control or paste them into chat."
  Write-Output ("ADMIN_PASSWORD_HASH=pbkdf2_sha256`$" + $iterations + "`$" + (Convert-ToBase64Url $salt) + "`$" + (Convert-ToBase64Url $derived))
  Write-Output ("ADMIN_SESSION_SECRET=" + (Convert-ToBase64Url $sessionSecret))
  Write-Output ("RATE_LIMIT_SALT=" + (Convert-ToBase64Url $rateLimitSalt))
} finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  if ($confirmationPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmationPointer)
  }
  $plainPassword = $null
  $plainConfirmation = $null
}
