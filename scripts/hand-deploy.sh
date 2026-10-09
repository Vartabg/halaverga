#!/usr/bin/env bash
# Hand deploy to Vercel from the committed files of HEAD (or of HALAVERGA_DEPLOY_REF), with the secrets scan as a real gate (docs/deploy.md, section 3).
#   scripts/hand-deploy.sh preview [vercel deploy flags]
#   scripts/hand-deploy.sh prod    [vercel deploy flags]      only after the owner says yes in chat
# Every step below must succeed, or `vercel deploy` never runs: `set -e` stops the script at the first failure, so a gitleaks
# finding, a missing gitleaks or a missing project link all end it before anything leaves this machine. There is no skip flag.
set -euo pipefail

mode="${1:-}"
if [ "$mode" != preview ] && [ "$mode" != prod ]; then
  echo "usage: scripts/hand-deploy.sh preview|prod [vercel deploy flags]" >&2
  exit 2
fi
shift

need() { command -v "$1" >/dev/null 2>&1 || { echo "stop: $1 is not installed, so nothing is deployed" >&2; exit 1; }; }
need git; need tar; need gitleaks; need vercel

root="$(git rev-parse --show-toplevel)"
# HEAD, unless HALAVERGA_DEPLOY_REF names another commit (the last-resort redeploy of an old build, docs/deploy.md section 8).
sha="$(git -C "$root" rev-parse --verify "${HALAVERGA_DEPLOY_REF:-HEAD}^{commit}")"
# The link to halaverga-flight lives only in the primary tree (gitignored); HALAVERGA_VERCEL_LINK points at another copy.
link="${HALAVERGA_VERCEL_LINK:-$HOME/code/halaverga/.vercel/project.json}"
[ -f "$link" ] || { echo "stop: no Vercel project link at $link (set HALAVERGA_VERCEL_LINK)" >&2; exit 1; }
if [ -n "$(git -C "$root" status --porcelain)" ]; then
  echo "note: uncommitted changes are not deployed, only the commit $sha" >&2
fi

# A scratch folder, not the repo: exactly the committed files, no .git, no node_modules, no .env.
dir="$(mktemp -d "${TMPDIR:-/tmp}/halaverga-deploy.XXXXXX")"
git -C "$root" archive "$sha" | tar -x -C "$dir"
mkdir -p "$dir/.vercel"
cp "$link" "$dir/.vercel/project.json"

# The gate: history first, then the exact folder that goes up. A finding exits non-zero and `set -e` ends the script here.
gitleaks git "$root" --no-banner --redact --exit-code 1
gitleaks dir "$dir" --no-banner --redact --exit-code 1
echo "no leaks found; scratch folder $dir" >&2

args=(deploy --yes --build-env "VERCEL_GIT_COMMIT_SHA=$sha")
if [ "$mode" = prod ]; then args+=(--prod); fi
echo "deploying $sha as $mode" >&2
cd "$dir"
exec vercel "${args[@]}" "$@"
