# Executed INSIDE an unmodified Server Core 2022 container, --network none.
$ErrorActionPreference = 'Stop'
if (Test-Path C:\Windows\System32\vcruntime140.dll) {
    throw 'Clean OS unexpectedly has VC redistributable; necessity probe is invalid'
}
if (-not (Test-Path C:\Windows\System32\ucrtbase.dll)) { throw 'OS UCRT absent' }
if ((Get-Command python,python3 -ErrorAction SilentlyContinue)) { throw 'Python unexpectedly present' }
New-Item -ItemType Directory -Path 'C:\project with spaces' | Out-Null
Set-Location 'C:\project with spaces'
$exe = (Get-ChildItem C:\artifact\system\*.exe).FullName
& $exe --help
if ($LASTEXITCODE -ne 0) { throw 'Minimized binary help failed' }
[IO.File]::WriteAllText("$PWD\.env.example", "# Heading`nKEY=default`n", [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText("$PWD\.env", "KEY=fake-local`n", [Text.UTF8Encoding]::new($false))
& $exe --check
if ($LASTEXITCODE -ne 1) { throw 'Check mismatch exit failed' }
& $exe .env --template .env.example
if ($LASTEXITCODE -ne 0) { throw 'Explicit mode failed' }
& $exe
if ($LASTEXITCODE -ne 0) { throw 'Project mode failed' }
& $exe --check
if ($LASTEXITCODE -ne 0) { throw 'Aligned check failed' }
& $exe --not-an-option
if ($LASTEXITCODE -ne 2) { throw 'Usage error exit failed' }
if ([IO.File]::ReadAllText("$PWD\.env") -cne "# Heading`nKEY=fake-local`n") { throw 'Output bytes differ' }
$probe = (Get-ChildItem C:\artifact\no-vcr\*.exe).FullName
# A bootloader error is expected; this probe is never a release candidate.
& $probe --help
$failure = $LASTEXITCODE
if ($failure -eq 0) { throw 'No-VCR probe unexpectedly succeeded: re-evaluate necessity' }
Write-Host "Clean Server 2022: OS UCRT works; retained VCR required; no-VCR exit=$failure; network disabled"
