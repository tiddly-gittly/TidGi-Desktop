# Deal with errors during release build

## `EBUSY: resource busy or locked` during make

```log
Error: EBUSY: resource busy or locked, unlink 'i:\Temp\...\tidgi.0.13.0-prerelease18.nupkg'
```

esbuild process doesn't exit properly after packaging, holding file handles to temp files.

Solution: kill background **esbuild** process

```powershell
Get-Process | Where-Object { $_.ProcessName -match "esbuild|electron" } | Stop-Process -Force
Remove-Item "$env:TEMP\si-*" -Recurse -Force -ErrorAction SilentlyContinue
```

Also check if there are any open explorer folders, closing them may help.
