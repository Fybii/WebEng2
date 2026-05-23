# Run once as Administrator in PowerShell (before mobile testing):
#   powershell -ExecutionPolicy Bypass -File scripts/setup-wsl-port.ps1
#
# Re-run after WSL restart (WSL IP may change).

$ErrorActionPreference = 'Stop'
$Port = 5173

$wslIp = (wsl -e hostname -I).Trim().Split()[0]
if (-not $wslIp) {
    Write-Error 'WSL IP not found. Is WSL running?'
}

Write-Host "WSL IP: $wslIp"

netsh interface portproxy delete v4tov4 listenport=$Port listenaddress=0.0.0.0 2>$null | Out-Null
netsh interface portproxy add v4tov4 listenport=$Port listenaddress=0.0.0.0 connectport=$Port connectaddress=$wslIp

$ruleName = 'Navix Vite Dev 5173'
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort $Port -Protocol TCP -Action Allow | Out-Null
    Write-Host "Firewall rule created: $ruleName"
} else {
    Write-Host "Firewall rule already exists: $ruleName"
}

Write-Host ''
Write-Host 'Port forwarding active:'
netsh interface portproxy show all

$wlan = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.InterfaceAlias -notlike '*WSL*' -and
        $_.InterfaceAlias -notlike '*Hyper-V*' -and
        $_.InterfaceAlias -notlike 'Ethernet 2'
    } |
    Select-Object -First 1

if ($wlan) {
    Write-Host ''
    Write-Host "Open on your phone (same WiFi or laptop on phone hotspot):"
    Write-Host "  http://$($wlan.IPAddress):$Port/" -ForegroundColor Green
} else {
    Write-Host ''
    Write-Host "Open on your phone: http://<WINDOWS-WLAN-IP>:$Port/"
    Write-Host 'Find IP with: ipconfig (look for WLAN adapter)'
}
