#!/usr/bin/env bash
#
# Deploy this Mainsail build plus a panel plugin onto a test printer.
#
# A stock Mainsail release has no custom-panel code, so a panel registration
# means nothing to it. To test plugins on real hardware the printer needs a
# Mainsail built from this branch, which is what this script installs.
#
# Everything is served out of the printer's own Mainsail web root, so the
# plugin loads same-origin and needs no separate host and no CORS.
#
# Usage:  ./scripts/deploy-testbench.sh <printer-host> [ssh-user]
# Example: ./scripts/deploy-testbench.sh 192.168.1.99 pi
#
# Safe to re-run. The existing Mainsail is backed up on the printer before
# anything is replaced, and the script stops at the first real failure.

set -euo pipefail

HOST="${1:-}"
USER_NAME="${2:-pi}"
PLUGIN="plugin-smoke-test"

if [[ -z "$HOST" ]]; then
    echo "ERROR: no printer given."
    echo "Usage: $0 <printer-host> [ssh-user]   e.g. $0 192.168.1.99 pi"
    exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH="${USER_NAME}@${HOST}"
STAMP="$(date +%s)"

say() { printf '\n== %s\n' "$1"; }

# ---------------------------------------------------------------- checks ---
say "Checking prerequisites"

if [[ ! -f "$REPO_ROOT/dist/index.html" ]]; then
    echo "ERROR: no Mainsail build found at $REPO_ROOT/dist"
    echo "Build it first:  cd '$REPO_ROOT' && npx vite build"
    exit 1
fi
echo "  ok  mainsail build present"

PLUGIN_FILE="$REPO_ROOT/plugins/PluginSmokeTest/dist/${PLUGIN}.mjs"
if [[ ! -f "$PLUGIN_FILE" ]]; then
    echo "ERROR: no plugin build found at $PLUGIN_FILE"
    echo "Build it first:  cd '$REPO_ROOT/plugins/PluginSmokeTest' && npm install && npm run build"
    exit 1
fi
echo "  ok  plugin build present"

if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" true 2>/dev/null; then
    echo "ERROR: cannot reach $SSH over ssh."
    echo "Check the address, and that your ssh key is authorised on that printer."
    exit 1
fi
echo "  ok  ssh to $SSH"

if ! ssh "$SSH" "test -d ~/mainsail"; then
    echo "ERROR: no ~/mainsail directory on $HOST -- is Mainsail installed there?"
    exit 1
fi
echo "  ok  mainsail web root found"

MOONRAKER_PORT="$(ssh "$SSH" "grep -oP '(?<=^port:\s)\d+' ~/printer_data/config/moonraker.conf 2>/dev/null | head -1" || true)"
MOONRAKER_PORT="${MOONRAKER_PORT:-7125}"
echo "  ok  moonraker port ${MOONRAKER_PORT}"

# ---------------------------------------------------------------- backup ---
say "Backing up the existing Mainsail"
ssh "$SSH" "cp -a ~/mainsail ~/mainsail.bak.${STAMP}"
echo "  saved to ~/mainsail.bak.${STAMP}"
echo "  to undo everything:  ssh ${SSH} 'rm -rf ~/mainsail && mv ~/mainsail.bak.${STAMP} ~/mainsail'"

# ---------------------------------------------------------------- deploy ---
say "Copying the Mainsail build"
ssh "$SSH" "rm -rf ~/mainsail/* ~/mainsail/.??*" 2>/dev/null || true
scp -q -r "$REPO_ROOT/dist/." "$SSH:~/mainsail/"
echo "  copied $(find "$REPO_ROOT/dist" -type f | wc -l | tr -d ' ') files"

say "Copying the plugin"
ssh "$SSH" "mkdir -p ~/mainsail/plugins"
scp -q "$PLUGIN_FILE" "$SSH:~/mainsail/plugins/"
echo "  ~/mainsail/plugins/${PLUGIN}.mjs"

# The panel is registered in config.json rather than the Moonraker database
# because this is a throwaway test bench: config.json is one file, needs no
# database write, and is wiped by the same update that would wipe the build
# it belongs to. A real install should use the database instead.
say "Registering the panel"
ssh "$SSH" "cat > ~/mainsail/config.json" <<JSON
{
    "hostname": "${HOST}",
    "port": ${MOONRAKER_PORT},
    "path": null,
    "instancesDB": "moonraker",
    "instances": [],
    "customPanels": [
        {
            "id": "smoketest",
            "title": "Plugin smoke test",
            "icon": "",
            "entryUrl": "/plugins/${PLUGIN}.mjs",
            "collapsible": true
        }
    ]
}
JSON
echo "  config.json written, entryUrl /plugins/${PLUGIN}.mjs"

# ----------------------------------------------------------------- check ---
say "Verifying over http"
BASE="http://${HOST}"
for path in "/config.json" "/plugins/${PLUGIN}.mjs"; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${BASE}${path}" || echo 000)"
    if [[ "$code" == "200" ]]; then
        echo "  ok  ${path} -> 200"
    else
        echo "  WARNING: ${path} -> ${code}"
        echo "  The files are in place but the web server is not serving them as expected."
        echo "  Check nginx's root for this site; some installs serve /home/${USER_NAME}/mainsail"
        echo "  from a different path than the one we just wrote to."
    fi
done

say "Done"
cat <<EOF
Open  ${BASE}  in a browser and hard-refresh (Ctrl+Shift+R) -- the old
bundle is cached and the filenames may not have changed.

The dashboard should show a "Plugin smoke test" panel. Every chip in its
Runtime row should be green. If the panel is missing entirely, the host
did not load the plugin; if it is present but a chip is red, that chip
names the part that failed.

To undo:
  ssh ${SSH} 'rm -rf ~/mainsail && mv ~/mainsail.bak.${STAMP} ~/mainsail'
EOF
