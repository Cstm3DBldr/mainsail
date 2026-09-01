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
PLUGIN_EXT="js"

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

PLUGIN_FILE="$REPO_ROOT/plugins/PluginSmokeTest/dist/${PLUGIN}.${PLUGIN_EXT}"
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

# The printer's own config.json is the only thing that knows how this
# install reaches Moonraker, so grab it before the web root is touched.
ORIG_CONFIG="$(mktemp)"
trap 'rm -f "$ORIG_CONFIG"' EXIT
ssh "$SSH" "cat ~/mainsail/config.json 2>/dev/null" > "$ORIG_CONFIG" || true

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
echo "  ~/mainsail/plugins/${PLUGIN}.${PLUGIN_EXT}"

# Register the panel by ADDING to the printer's existing config.json rather
# than writing a fresh one. Connection settings in particular must be left
# alone: a stock Klipper install leaves hostname/port null so the browser
# talks to its own origin and nginx reverse-proxies through to Moonraker.
# Pinning them to host:7125 instead makes the browser cross-origin, which
# Moonraker's cors_domains will not usually allow -- the symptom is Mainsail
# loading fine and then reporting it cannot connect to Moonraker.
#
# config.json is used rather than the Moonraker database because this is a
# throwaway test bench: one file, no database write, and it is wiped by the
# same update that would wipe the build it belongs to. A real install should
# register through the database instead.
say "Registering the panel"
MERGED_CONFIG="$(mktemp)"
trap 'rm -f "$ORIG_CONFIG" "$MERGED_CONFIG"' EXIT

python3 - "$ORIG_CONFIG" "$PLUGIN" > "$MERGED_CONFIG" <<'PYEOF'
import json, sys

path, plugin = sys.argv[1], sys.argv[2]

try:
    with open(path, encoding="utf-8") as fh:
        config = json.load(fh)
except Exception:
    # No readable config on the printer: fall back to an empty one, which
    # leaves hostname/port absent and so still same-origin.
    config = {}

panel = {
    "id": "smoketest",
    "title": "Plugin smoke test",
    "icon": "",
    "entryUrl": "/plugins/%s.mjs" % plugin,
    "collapsible": True,
}

panels = [p for p in config.get("customPanels", []) if p.get("id") != panel["id"]]
panels.append(panel)
config["customPanels"] = panels

json.dump(config, sys.stdout, indent=4)
PYEOF

scp -q "$MERGED_CONFIG" "$SSH:~/mainsail/config.json"
echo "  panel added to config.json, entryUrl /plugins/${PLUGIN}.${PLUGIN_EXT}"
echo "  connection settings left as the printer had them"

# ----------------------------------------------------------------- check ---
# A status code is not enough here. Mainsail is a single-page app, so nginx
# falls back to index.html for anything it cannot find -- a missing plugin
# comes back as 200 with HTML in it, and the browser then fails on a dynamic
# import of something that is not JavaScript. So check what came back, not
# just that something did.
say "Verifying over http"
BASE="http://${HOST}"
fetch_ok=1

check() {
    local path="$1" expect="$2"
    local body
    body="$(curl -s --max-time 10 "${BASE}${path}" || true)"

    if [[ -z "$body" ]]; then
        echo "  FAIL ${path} -- empty response"
        fetch_ok=0
        return
    fi

    if grep -qi "<!doctype html" <<<"$body"; then
        echo "  FAIL ${path} -- got index.html back, so the file is not actually there."
        echo "       nginx served its single-page fallback. The likely cause is that"
        echo "       this site's web root is not the ~/mainsail we just wrote to."
        fetch_ok=0
        return
    fi

    if ! grep -q "$expect" <<<"$body"; then
        echo "  FAIL ${path} -- served, but the content is not what we deployed."
        fetch_ok=0
        return
    fi

    echo "  ok   ${path}"
}

check "/config.json" "customPanels"
check "/plugins/${PLUGIN}.${PLUGIN_EXT}" "__mainsail_plugin_runtime__"

if [[ "$fetch_ok" -eq 0 ]]; then
    echo
    echo "Deployment landed on disk but is not being served correctly."
    echo "Find the real web root with:"
    echo "  ssh ${SSH} \"grep -r root /etc/nginx/sites-enabled/\""
    exit 1
fi

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
