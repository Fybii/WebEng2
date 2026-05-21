#!/usr/bin/env bash
# Navix: WSL dev server for phone testing (hotspot or same WiFi)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=5173
cd "$ROOT"

WSL_IP="$(hostname -I | awk '{print $1}')"
WIN_PROJECT="$(wslpath -w "$ROOT" 2>/dev/null || echo "$ROOT")"

get_windows_wlan_ip() {
    powershell.exe -NoProfile -Command "
        Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object {
                \$_.IPAddress -notlike '127.*' -and
                \$_.IPAddress -notlike '169.254.*' -and
                \$_.InterfaceAlias -notlike '*WSL*' -and
                \$_.InterfaceAlias -notlike '*Hyper-V*' -and
                \$_.InterfaceAlias -notlike 'Ethernet 2'
            } |
            Select-Object -First 1 -ExpandProperty IPAddress
    " 2>/dev/null | tr -d '\r'
}

check_portproxy() {
    powershell.exe -NoProfile -Command "netsh interface portproxy show all" 2>/dev/null \
        | tr -d '\r' \
        | grep -qE "0\.0\.0\.0[[:space:]]+${PORT}[[:space:]]+" \
        || return 1
}

print_banner() {
    local win_ip="$1"
    echo ""
    echo "=============================================="
    echo "  Navix – Handy-Zugriff (WSL)"
    echo "=============================================="
    echo "  WSL IP:     ${WSL_IP}"
    echo "  Windows IP: ${win_ip:-?}"
    echo ""
    if [[ -n "$win_ip" ]]; then
        echo "  Am Handy im Browser öffnen:"
        echo "    http://${win_ip}:${PORT}/"
        echo ""
        echo "  (URL gespeichert in scripts/phone-url.txt)"
        echo "http://${win_ip}:${PORT}/" > "$ROOT/scripts/phone-url.txt"
    fi
    echo "=============================================="
    echo ""
}

WIN_IP="$(get_windows_wlan_ip)"

if ! check_portproxy; then
    echo "Hinweis: Port ${PORT} ist noch nicht von Windows nach WSL weitergeleitet."
    echo ""
    echo "Einmalig als Administrator in Windows PowerShell ausführen:"
    echo "  cd \"$WIN_PROJECT\""
    echo "  powershell -ExecutionPolicy Bypass -File scripts/setup-wsl-port.ps1"
    echo ""
    echo "Oder Rechtsklick PowerShell → Als Administrator → obigen Befehl."
    echo ""
    read -r -p "Trotzdem dev server starten? [j/N] " ans || true
    if [[ "${ans,,}" != "j" && "${ans,,}" != "y" ]]; then
        exit 0
    fi
else
    echo "Port-Weiterleitung ${PORT} → WSL OK"
fi

print_banner "$WIN_IP"

echo "Hotspot-Modus:"
echo "  1. Hotspot am Handy AN"
echo "  2. Laptop mit Hotspot verbinden"
echo "  3. Dieses Script nochmal starten (IP kann sich ändern!)"
echo "  4. URL am Handy öffnen → Standort erlauben → Route starten"
echo ""
echo "GPS-Hinweis: Falls kein Standort, HTTPS noetig (z.B. Cloudflare Tunnel)."
echo ""
echo "Starte Vite …"
echo ""

exec npm run dev
