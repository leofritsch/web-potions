#!/bin/sh
# Exports store/art.html to store/images at the store's exact sizes, as PNGs with no alpha.
# Needs ImageMagick and a server at the repo root:
#   python3 -m http.server 8765 --bind 127.0.0.1
# Pass picture names to export only those, for example: store/render.sh 2-hide tile-small
cd "$(dirname "$0")/.." || exit 1
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
PROFILE=$(mktemp -d)
RAW=$(mktemp -d)
mkdir -p store/images

render() {
  name=$1 width=$2 height=$3
  # Headless Chrome won't go narrower than about 500px, so render bigger and crop.
  "$CHROME" --headless=new --user-data-dir="$PROFILE" --hide-scrollbars --force-device-scale-factor=1 \
    --window-size="$((width < 800 ? 800 : width)),$((height < 600 ? 600 : height))" --virtual-time-budget=5000 \
    --screenshot="$RAW/$name.png" "http://127.0.0.1:8765/store/art.html?shot=$name" 2>/dev/null
  magick "$RAW/$name.png" -crop "${width}x${height}+0+0" +repage -alpha off "PNG24:store/images/$name.png"
  echo "$name: $(magick identify -format '%wx%h %[channels]' "store/images/$name.png")"
}

want() { [ -z "$ONLY" ] || case " $ONLY " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }

ONLY="$*"
for name in 1-tagline 2-hide 3-ai 4-switches 5-free; do
  if want "$name"; then render "$name" 1280 800; fi
done
if want tile-small; then render tile-small 440 280; fi
if want tile-marquee; then render tile-marquee 1400 560; fi
# The same picker scene, at 2x, is the picture on the welcome page.
if want pick; then
  "$CHROME" --headless=new --user-data-dir="$PROFILE" --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=800,600 --virtual-time-budget=5000 --screenshot="$RAW/pick.png" "http://127.0.0.1:8765/store/art-hide.html" 2>/dev/null
  magick "$RAW/pick.png" -crop 800x772+0+0 +repage -alpha off "PNG24:extension/help/pick.png"
  echo "pick: $(magick identify -format '%wx%h' extension/help/pick.png)"
fi
rm -rf "$PROFILE" "$RAW"
