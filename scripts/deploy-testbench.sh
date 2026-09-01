#!/usr/bin/env bash
#
# Deploy this Mainsail build plus its panel plugins onto a printer.
#
# A stock Mainsail release has no custom-panel code, so a panel registration
# means nothing to it. To run plugins on real hardware the printer needs a
# Mainsail built from this branch, which is what this installs.
#
# Which plugins go out, and how each registers, is declared in
# scripts/deploy-plugins.json rather than hardcoded here -- the plugins do not
# all live in this repo, and each needs registration metadata (title, icon,
# any required printer object) that cannot be inferred from the file.
#
# Usage:  ./scripts/deploy-testbench.sh <printer-host> [ssh-user] [manifest]
# Example: ./scripts/deploy-testbench.sh 192.168.1.214 pi
#
# Safe to re-run. The existing Mainsail is backed up on the printer before
# anything is replaced, and the script stops at the first real failure.

set -euo pipefail

HOST="${1:-}"
USER_NAME="${2:-pi}"

if [[ -z "$HOST" ]]; then
    echo "ERROR: no printer given."
    echo "Usage: $0 <printer-host> [ssh-user] [manifest]   e.g. $0 192.168.1.214 pi"
    exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="${3:-$REPO_ROOT/scripts/deploy-plugins.json}"
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

if [[ ! -f "$MANIFEST" ]]; then
    echo "ERROR: no plugin manifest at $MANIFEST"
    exit 1
fi

# Resolve every plugin file up front, so a missing build fails before the web
# root is touched rather than half way through replacing it.
PLUGIN_FILES=()
PLUGIN_NAMES=()
while IFS= read -r rel; do
    [[ -z "$rel" ]] && continue
    # Absolute means a leading slash, or a Windows drive letter -- a manifest
    # written on Windows may carry "C:/..." paths, and treating one as relative
    # silently produces a nonsense path under the repo root.
    if [[ "$rel" = /* || "$rel" == ?:/* ]]; then abs="$rel"; else abs="$REPO_ROOT/$rel"; fi
    if [[ ! -f "$abs" ]]; then
        echo "ERROR: a plugin in the manifest is not built: $rel"
        echo "Build it, then re-run. Looked for: $abs"
        exit 1
    fi
    PLUGIN_FILES+=("$abs")
    PLUGIN_NAMES+=("$(basename "$abs")")
    echo "  ok  plugin present: $(basename "$abs")"
done < <(python3 -c "
import json, sys
for entry in json.load(open(sys.argv[1], encoding='utf-8')):
    sys.stdout.buffer.write((entry['file'] + chr(10)).encode('utf-8'))
" "$MANIFEST")

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

MOONRAKER="http://${HOST}:7125"
if ! curl -sf --max-time 10 "${MOONRAKER}/server/info" >/dev/null; then
    echo "ERROR: moonraker is not answering on ${MOONRAKER}"
    echo "Panels register in its database, so it has to be up."
    exit 1
fi
echo "  ok  moonraker reachable"

# ---------------------------------------------------------------- backup ---
say "Backing up the existing Mainsail"
ssh "$SSH" "cp -a ~/mainsail ~/mainsail.bak.${STAMP}"
echo "  saved to ~/mainsail.bak.${STAMP}"
echo "  to undo:  ssh ${SSH} 'rm -rf ~/mainsail && mv ~/mainsail.bak.${STAMP} ~/mainsail'"

# ---------------------------------------------------------------- deploy ---
# config.json is deliberately preserved. It records how this install reaches
# moonraker, and a stock install leaves hostname/port null so the browser
# talks to its own origin and nginx reverse-proxies through. Rewriting it to
# host:7125 makes the browser cross-origin, which moonraker's cors_domains
# usually rejects -- Mainsail then loads and reports it cannot connect.
say "Copying the Mainsail build"

# Take a copy of the printer's config.json before anything touches the web
# root, and put it back afterwards.
#
# Excluding it from the wipe is not enough: dist/ contains its own
# config.json, built from this repo's public/ directory, and the copy below
# lands on top. That file carries whatever the developer's sandbox was
# pointing at -- which on the first run of this script meant a printer got
# hostname/port pinned to :7125 (cross-origin, so moonraker's cors_domains
# rejected the websocket and Mainsail could not connect) and an entryUrl
# pointing at a plugin host on the developer's own machine.
CONFIG_BACKUP="$(mktemp)"
trap 'rm -f "$CONFIG_BACKUP"' EXIT
if ssh "$SSH" "test -f ~/mainsail/config.json"; then
    ssh "$SSH" "cat ~/mainsail/config.json" > "$CONFIG_BACKUP"
fi

ssh "$SSH" "find ~/mainsail -mindepth 1 -maxdepth 1 -exec rm -rf {} +"
scp -q -r "$REPO_ROOT/dist/." "$SSH:~/mainsail/"

if [[ -s "$CONFIG_BACKUP" ]]; then
    scp -q "$CONFIG_BACKUP" "$SSH:~/mainsail/config.json"
    echo "  copied $(find "$REPO_ROOT/dist" -type f | wc -l | tr -d ' ') files, restored the printer's own config.json"
else
    echo "  copied $(find "$REPO_ROOT/dist" -type f | wc -l | tr -d ' ') files (printer had no config.json)"
fi

# Mainsail ships as a PWA. A browser that has used this printer before may
# hold a service worker precaching the OLD build and keep serving it, so the
# tester sees a Mainsail with no custom-panel code: no panel, and no setting
# to enable one either. That reads as "the plugin failed" rather than "this
# is cached". Replace sw.js with one that uninstalls itself.
say "Neutralising the old service worker"
scp -q "$REPO_ROOT/scripts/testbench-sw.js" "$SSH:~/mainsail/sw.js"
ssh "$SSH" "rm -f ~/mainsail/workbox-*.js" 2>/dev/null || true
echo "  sw.js replaced with a self-uninstalling worker"

say "Copying the plugins"
ssh "$SSH" "mkdir -p ~/mainsail/plugins"
for f in "${PLUGIN_FILES[@]}"; do
    scp -q "$f" "$SSH:~/mainsail/plugins/"
    echo "  ~/mainsail/plugins/$(basename "$f")"
done

# Registration goes in moonraker's database rather than config.json. The
# database survives a Mainsail update, which wipes the web root; config.json
# does not. It is also not a cacheable static file, so a newly added panel
# appears without the user having to clear their browser cache.
say "Registering the panels"
PAYLOAD="$(mktemp)"
trap 'rm -f "$PAYLOAD"' EXIT

python3 -c "
import json, sys

manifest = json.load(open(sys.argv[1], encoding='utf-8'))
panels = []
for entry in manifest:
    panel = dict(entry['panel'])
    # Derived from the deployed filename rather than written by hand, so the
    # registration cannot drift from what was actually copied.
    panel['entryUrl'] = '/plugins/' + entry['file'].rsplit('/', 1)[-1]
    panels.append(panel)

json.dump({'namespace': 'mainsail', 'key': 'view.customPanels', 'value': panels}, open(sys.argv[2], 'w'))

for p in panels:
    req = p.get('requiresPrinterObject')
    print('  %-12s %s%s' % (p['id'], p['entryUrl'], ' [needs %s]' % req if req else ''))
" "$MANIFEST" "$PAYLOAD"

if ! curl -sf -X POST "${MOONRAKER}/server/database/item" \
    -H 'Content-Type: application/json' --data-binary "@$PAYLOAD" --max-time 20 -o /dev/null; then
    echo "ERROR: could not write the panel registration to moonraker's database."
    exit 1
fi
echo "  written to moonraker database (namespace mainsail, key view.customPanels)"

# ----------------------------------------------------------------- check ---
# A status code is not enough. Mainsail is a single-page app, so nginx falls
# back to index.html for anything it cannot find -- a plugin that never landed
# comes back as 200 with HTML in it, and the browser then fails on a dynamic
# import of something that is not JavaScript.
say "Verifying over http"
BASE="http://${HOST}"
fetch_ok=1

check() {
    local path="$1" expect="$2" body
    body="$(curl -s --max-time 15 "${BASE}${path}" || true)"

    if [[ -z "$body" ]]; then
        echo "  FAIL ${path} -- empty response"
        fetch_ok=0
    elif grep -qi "<!doctype html" <<<"$body"; then
        echo "  FAIL ${path} -- got index.html back, so the file is not there."
        echo "       nginx served its single-page fallback; the likely cause is"
        echo "       that this site's web root is not the ~/mainsail we wrote to."
        fetch_ok=0
    elif ! grep -q "$expect" <<<"$body"; then
        echo "  FAIL ${path} -- served, but not the content we deployed."
        fetch_ok=0
    else
        echo "  ok   ${path}"
    fi
}

# The printer's own connection settings must have survived. A config.json
# carrying the developer's sandbox values is the difference between a working
# install and one that cannot reach moonraker at all.
SERVED_HOST="$(curl -s --max-time 10 "${BASE}/config.json" | python3 -c "
import json, sys
try:
    print(json.load(sys.stdin).get('hostname'))
except Exception:
    print('unreadable')
")"
if [[ "$SERVED_HOST" == "127.0.0.1" || "$SERVED_HOST" == "localhost" ]]; then
    echo "  FAIL config.json hostname is '${SERVED_HOST}' -- a sandbox value was deployed."
    fetch_ok=0
else
    echo "  ok   config.json kept the printer's own connection settings"
fi

for name in "${PLUGIN_NAMES[@]}"; do
    check "/plugins/${name}" "__mainsail_plugin_runtime__"
done

# A plugin served as application/octet-stream will not execute: browsers
# refuse a module with a non-JavaScript MIME type, and the only symptom is a
# generic "failed to fetch dynamically imported module" that looks like a
# missing file.
CT="$(curl -s -o /dev/null -w '%{content_type}' --max-time 10 "${BASE}/plugins/${PLUGIN_NAMES[0]}" || true)"
if [[ "$CT" == *javascript* ]]; then
    echo "  ok   plugins served as $CT"
else
    echo "  FAIL plugins served as '${CT}', not javascript."
    echo "       The browser will refuse to execute them. Add the extension to"
    echo "       nginx's mime.types, or rename the bundle to .js."
    fetch_ok=0
fi

if [[ "$fetch_ok" -eq 0 ]]; then
    echo
    echo "Deployment landed on disk but is not being served correctly."
    echo "Find the real web root with:"
    echo "  ssh ${SSH} \"grep -r root /etc/nginx/sites-enabled/\""
    exit 1
fi

say "Done"
cat <<REPORT
Open  ${BASE}  in a browser.

If you have used this printer before, open it in a PRIVATE window first.
Mainsail is a PWA and the browser also caches aggressively; a private window
has neither and shows the truth immediately. The deployed sw.js uninstalls
any old worker on the next visit.

Panels are registered in moonraker's database, so they survive a Mainsail
update. The plugin FILES do not -- an update wipes the web root including
~/mainsail/plugins/, leaving registrations pointing at missing files. Re-run
this script after any Mainsail update.

To undo:
  ssh ${SSH} 'rm -rf ~/mainsail && mv ~/mainsail.bak.${STAMP} ~/mainsail'
REPORT
