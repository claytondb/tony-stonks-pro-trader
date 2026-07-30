#!/usr/bin/env bash
# Configure git push auth for this sandbox checkout from a token file.
#
# The token is read from a file and written straight into a git credential
# store. It is never printed, never passed as a command-line argument, and
# never echoed back into the conversation.
#
# Usage: bash tools/setup-git-auth.sh /path/to/token.txt
set -euo pipefail

TOKEN_FILE="${1:?usage: setup-git-auth.sh <token-file>}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRED_FILE="$HOME/.git-credentials-tsp"
OWNER="claytondb"
REPO="tony-stonks-pro-trader"

[ -f "$TOKEN_FILE" ] || { echo "FAIL: token file not found: $TOKEN_FILE" >&2; exit 1; }

# Strip whitespace/newlines/BOM without ever printing the value.
TOKEN="$(tr -d '\r\n\t \357\273\277' < "$TOKEN_FILE")"
[ -n "$TOKEN" ] || { echo "FAIL: token file is empty" >&2; exit 1; }

case "$TOKEN" in
  github_pat_*) KIND="fine-grained PAT" ;;
  ghp_*)        KIND="classic PAT" ;;
  gho_*|ghs_*)  KIND="OAuth/app token" ;;
  *)            KIND="unrecognised format — this may not be a GitHub token" ;;
esac
echo "Token detected: $KIND (${#TOKEN} chars)"

umask 077
printf 'https://%s:%s@github.com\n' "$OWNER" "$TOKEN" > "$CRED_FILE"
chmod 600 "$CRED_FILE"
unset TOKEN

cd "$REPO_DIR"
git config credential.helper "store --file=$CRED_FILE"
git remote set-url origin "https://github.com/$OWNER/$REPO.git"

echo "Credential store: $CRED_FILE (mode $(stat -c %a "$CRED_FILE"))"
echo "Remote:           $(git remote get-url origin)"

echo "--- verifying read access ---"
if git ls-remote --heads origin >/dev/null 2>&1; then
  echo "OK: can read the remote"
else
  echo "FAIL: cannot read the remote — token is wrong, expired, or lacks repo access" >&2
  exit 1
fi

echo "--- verifying write access (dry run) ---"
if git push --dry-run origin HEAD:refs/heads/main 2>&1 | grep -qiE 'denied|forbidden|403|not authorized'; then
  echo "FAIL: token can read but not write. Needs Contents: Read and write." >&2
  exit 1
fi
echo "OK: push access confirmed"
echo
echo "Auth is configured. Pushes from this sandbox will now work."
