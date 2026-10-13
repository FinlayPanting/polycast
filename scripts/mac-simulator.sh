#!/usr/bin/env bash
# Build Polycast and open it in the iPhone simulator on a Mac.
# Needs Xcode from the Mac App Store; no Apple Developer membership needed.
#
# Run it from Terminal with:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/FinlayPanting/polycast/rebuild-ios/scripts/mac-simulator.sh)"
#
# Safe to run again: it updates the code and rebuilds.
set -euo pipefail

DIR="$HOME/Developer/polycast-ios"
BRANCH="rebuild-ios"

step() { printf '\n\033[1;33m==> %s\033[0m\n' "$1"; }
stop() { printf '\n\033[1;31m%s\033[0m\n' "$1"; exit 1; }

step "Checking Xcode"
[ -d /Applications/Xcode.app ] || stop "Xcode isn't in Applications yet. Install it from the Mac App Store, open it once, then run this again."
if [ "$(xcode-select -p 2>/dev/null)" != "/Applications/Xcode.app/Contents/Developer" ]; then
  echo "Pointing the command-line tools at Xcode (your Mac password may be needed)."
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
fi
if ! xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1; then
  echo "Accepting Xcode's licence and finishing its first-launch setup (your Mac password may be needed)."
  sudo xcodebuild -license accept
  sudo xcodebuild -runFirstLaunch
fi

step "Checking the iPhone simulator"
if ! xcrun simctl list runtimes 2>/dev/null | grep -q "^iOS"; then
  echo "Downloading the iOS simulator (several GB, can take 10 to 20 minutes)."
  xcodebuild -downloadPlatform iOS
fi

step "Checking Homebrew, Node and CocoaPods"
if ! command -v brew >/dev/null 2>&1; then
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
fi
need_brew() {
  command -v brew >/dev/null 2>&1 && return 0
  echo "Installing Homebrew, the Mac's package installer (your Mac password will be needed)."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
}
node_major=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)
if [ -z "${node_major}" ] || [ "${node_major}" -lt 20 ]; then
  need_brew
  brew install node
fi
if ! command -v pod >/dev/null 2>&1; then
  need_brew
  brew install cocoapods
fi
echo "Node $(node -v), CocoaPods $(pod --version)"

step "Getting the latest Polycast code"
mkdir -p "$(dirname "$DIR")"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH"
  git -C "$DIR" checkout -q "$BRANCH"
  git -C "$DIR" reset -q --hard "origin/$BRANCH"
else
  git clone -q -b "$BRANCH" https://github.com/FinlayPanting/polycast.git "$DIR"
fi
cd "$DIR"
git log --oneline -1

step "Installing packages"
npx -y pnpm@9.15.9 install

step "Pointing the app at the live server"
# Public values only (the same ones the App Store build uses; see app/eas.json).
cat > app/.env <<'EOF'
EXPO_PUBLIC_API_URL=https://polycast-production.up.railway.app
EXPO_PUBLIC_SUPABASE_URL=https://usfdvpivogjtmrbwopzg.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_AoGtiBtbd9z_xFnR8SX-6Q_WQPA2xTI
EOF

step "Building and opening Polycast in the simulator (the first build takes 5 to 15 minutes)"
echo "Leave this window open while you test: it serves the app. Press Ctrl+C to stop."
# Pick an iPhone simulator explicitly, so a plugged-in iPhone isn't chosen
# (building for a real phone needs a signing certificate).
SIM=$(xcrun simctl list devices available -j | node -e '
  const d = JSON.parse(require("fs").readFileSync(0, "utf8")).devices
  const ios = Object.keys(d).filter((k) => k.includes("iOS")).sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true }))
  for (const r of ios) {
    const phones = d[r].filter((x) => x.name.startsWith("iPhone"))
    const pick = phones.find((x) => / Pro$/.test(x.name)) || phones[0]
    if (pick) { console.log(pick.udid); break }
  }')
[ -n "$SIM" ] || stop "No iPhone simulator found. Open Xcode > Settings > Components, install iOS, then run this again."
echo "Using simulator: $(xcrun simctl list devices | grep "$SIM" | sed -E 's/ \(.*//;s/^ +//')"
xcrun simctl boot "$SIM" 2>/dev/null || true
# Xcode 27 replaced Simulator.app with Device Hub; open whichever this Mac has.
open -b com.apple.dt.Devices 2>/dev/null || open "$(xcode-select -p)/Applications/Simulator.app" 2>/dev/null || true

# Expo's own run:ios can't find Xcode 27's simulators yet, so build with
# xcodebuild, install with simctl and start the dev server ourselves.
cd app
npx expo prebuild -p ios --clean
WS=$(ls -d ios/*.xcworkspace | head -1)
SCHEME=$(basename "$WS" .xcworkspace)
echo "Building $SCHEME (quiet: only problems are printed; the first build takes 5 to 15 minutes)."
xcodebuild -workspace "$WS" -scheme "$SCHEME" -configuration Debug \
  -sdk iphonesimulator -destination "id=$SIM" -derivedDataPath ios/build \
  CODE_SIGNING_ALLOWED=NO -quiet build
APP="ios/build/Build/Products/Debug-iphonesimulator/$SCHEME.app"
[ -d "$APP" ] || stop "The build finished but $APP is missing."
xcrun simctl install "$SIM" "$APP"
echo "Installed on the simulator."

step "Starting the app's dev server"
lsof -ti tcp:8081 | xargs kill 2>/dev/null || true
npx expo start --dev-client --port 8081 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
for _ in $(seq 1 60); do
  curl -fs http://localhost:8081/status 2>/dev/null | grep -q running && break
  sleep 2
done
xcrun simctl openurl "$SIM" "exp+polycast://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
echo
echo "Polycast is opening in the simulator. Leave this window open while you test; press Ctrl+C to stop."
wait $SERVER
