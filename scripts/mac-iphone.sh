#!/usr/bin/env bash
# Build Polycast and install it on a plugged-in iPhone, signed with a free Apple account.
# Run scripts/mac-simulator.sh once first (it installs the tools this needs).
#
# Before running: add your Apple Account in Xcode > Settings > Accounts, plug the iPhone
# in with a cable, unlock it and tap Trust.
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/FinlayPanting/polycast/rebuild-ios/scripts/mac-iphone.sh)"
#
# The test app ("Polycast Test") has the JavaScript built in, so it runs without the Mac.
# A free account's install expires after 7 days: run this again to renew it.
set -euo pipefail

DIR="$HOME/Developer/polycast-ios"
BRANCH="rebuild-ios"
step() { printf '\n\033[1;33m==> %s\033[0m\n' "$1"; }
stop() { printf '\n\033[1;31m%s\033[0m\n' "$1"; exit 1; }
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
command -v node >/dev/null && command -v pod >/dev/null || stop "Run the simulator script once first; it installs Node and CocoaPods."

step "Finding your Apple Account's free team in Xcode"
PREFS="$HOME/Library/Preferences/com.apple.dt.Xcode.plist"
TEAM=$(plutil -extract IDEProvisioningTeamByIdentifier json -o - "$PREFS" 2>/dev/null | node -e '
  let teams = []
  try { teams = Object.values(JSON.parse(require("fs").readFileSync(0, "utf8"))).flat() } catch {}
  // Same choice every run: free (personal) team first, then by id.
  teams.sort((a, b) => (b.isFreeProvisioningTeam ? 1 : 0) - (a.isFreeProvisioningTeam ? 1 : 0) || String(a.teamID).localeCompare(String(b.teamID)))
  for (const t of teams) console.error("  found team " + t.teamID + (t.isFreeProvisioningTeam ? " (personal)" : "") + (t.teamName ? " " + t.teamName : ""))
  if (teams[0]) console.log(teams[0].teamID)' || true)
[ -n "$TEAM" ] || stop "No Apple Account in Xcode yet. Open Xcode > Settings > Accounts, click +, add your Apple Account, close Settings, then run this again."
echo "Team: $TEAM"

step "Finding your iPhone"
JSON=$(mktemp)
xcrun devicectl list devices --json-output "$JSON" >/dev/null 2>&1 || true
DEVICE=$(node -e '
  const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).result || {}
  const phones = (r.devices || []).filter((d) => d.hardwareProperties?.platform === "iOS" && d.hardwareProperties?.reality === "physical")
  const p = phones.find((d) => d.connectionProperties?.pairingState === "paired") || phones[0]
  if (p) console.log(p.hardwareProperties.udid + "\t" + (p.deviceProperties?.name || "iPhone"))' "$JSON" 2>/dev/null || true)
[ -n "$DEVICE" ] || stop "No iPhone found. Plug it in with a cable, unlock it, tap Trust, then run this again."
UDID=${DEVICE%%$'\t'*}
echo "iPhone: ${DEVICE#*$'\t'}"

step "Getting the latest Polycast code"
git -C "$DIR" fetch -q origin "$BRANCH"
git -C "$DIR" checkout -q "$BRANCH"
git -C "$DIR" reset -q --hard "origin/$BRANCH"
cd "$DIR"
git log --oneline -1
npx -y pnpm@9.15.9 install
cat > app/.env <<'EOF'
EXPO_PUBLIC_API_URL=https://polycast-production.up.railway.app
EXPO_PUBLIC_SUPABASE_URL=https://usfdvpivogjtmrbwopzg.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_AoGtiBtbd9z_xFnR8SX-6Q_WQPA2xTI
EOF

step "Building Polycast Test for your iPhone (quiet: only problems are printed; 5 to 15 minutes)"
cd app
# Regenerates ios/ as the test app (the simulator script regenerates it back).
export POLYCAST_PERSONAL_TEAM=1
export POLYCAST_TEAM="$TEAM"
npx expo prebuild -p ios --clean
WS=$(ls -d ios/*.xcworkspace | head -1)
SCHEME=$(basename "$WS" .xcworkspace)
xcodebuild -workspace "$WS" -scheme "$SCHEME" -configuration Release \
  -destination "id=$UDID" -derivedDataPath ios/build-phone \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic -quiet build
APP="ios/build-phone/Build/Products/Release-iphoneos/$SCHEME.app"
[ -d "$APP" ] || stop "The build finished but $APP is missing."

step "Installing on your iPhone"
xcrun devicectl device install app --device "$UDID" "$APP"
echo
echo "Done. Polycast Test is on your iPhone."
echo "First time only: on the iPhone open Settings > General > VPN & Device Management,"
echo "tap your Apple Account under Developer App and tap Trust. Then open the app."
echo "Sign in with email. The install lasts 7 days; run this script again to renew it."
