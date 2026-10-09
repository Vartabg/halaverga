#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
blender_bin=${BLENDER_BIN:-/Applications/Blender.app/Contents/MacOS/Blender}
"$blender_bin" --background --python scripts/district/build.py
pnpm dlx @gltf-transform/cli@4.2.1 optimize /tmp/halaverga-district-raw.glb public/models/environment/meridian-district.glb --compress meshopt --join false --palette false --prune-attributes false --simplify false --texture-compress false
python3 scripts/district/report.py
