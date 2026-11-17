#!/bin/sh
# Build both bodies with their game clips (build.py), then the review stills (render.py; RENDER=0 skips them).
# Copy <OUT>/out/archangel.glb and watcher.glb to public/models/ and <OUT>/out/asset.json to art/real-bodies/asset.json.
# Everything Blender writes (prefs, extension, MPFB config/logs) stays under $OUT/bl_user via BLENDER_USER_RESOURCES.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${OUT:?set OUT to the scratch folder}
ASSETS=${ASSETS:-$HOME/Downloads/halaverga-real}
PACKS=${PACKS:-$OUT/packs}          # holds 'Universal Animation Library[Standard]' and 'Universal Animation Library 2[Standard]'
BLENDER=${BLENDER:-$HOME/Applications/Blender-4.2.app/Contents/MacOS/Blender}
ANGEL=${ANGEL:-}                    # optional: the retired angel.glb (git show 86482c2:public/models/angel.glb), a size reference
export BLENDER_USER_RESOURCES="$OUT/bl_user"
mkdir -p "$BLENDER_USER_RESOURCES" "$OUT/out"
[ -d "$BLENDER_USER_RESOURCES/extensions/user_default/mpfb" ] || \
  "$BLENDER" --command extension install-file -r user_default -e "$ASSETS/mpfb/add-on-mpfb-v2.0.18.zip"
"$BLENDER" -b --python-exit-code 1 --python "$HERE/build.py" -- --assets "$ASSETS" --packs "$PACKS" --out "$OUT/out"
[ "${RENDER:-1}" = 0 ] || "$BLENDER" -b --factory-startup --python-exit-code 1 --python "$HERE/render.py" -- --out "$OUT/out" \
  ${ANGEL:+--angel "$ANGEL"} --ual2 "$PACKS/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb"
