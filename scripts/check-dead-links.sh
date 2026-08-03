#!/usr/bin/env bash
#
# Fails if a placeholder link creeps back into a user-facing app.
#
# The marketing site once had a footer full of `href="#"` — links that look real,
# are keyboard-focusable, and jump you to the top of the page. They were swept
# out by hand (ROADMAP 1.4), and the follow-up recorded there was a guard so the
# sweep can't quietly undo itself. This is that guard.
#
# Deliberately narrow: only shapes that are ALWAYS wrong in shipped markup.
# `href="#faq"` is a real in-page anchor and is left alone.
#
#   ./scripts/check-dead-links.sh
set -euo pipefail

APPS=(apps/marketing/src apps/dashboard/src apps/developers/src apps/admin/src)

# One pattern per shape. No empty alternation branches: some greps (ugrep) reject
# `(a|b|)` outright, and the first version of this script did exactly that — the
# error was swallowed and the guard reported a clean tree forever.
PATTERNS=(
  'href=\{?"#"'          # href="#" / href={"#"}
  "href=\\{?'#'"         # href='#'
  'href=\{?"[[:space:]]*"' # href="" — reloads the page
  'href=\{?"javascript:'  # never in this codebase
)

found=0
for dir in "${APPS[@]}"; do
  [[ -d "$dir" ]] || continue
  for pat in "${PATTERNS[@]}"; do
    set +e
    hits=$(grep -rnE "$pat" "$dir" 2>&1)
    code=$?
    set -e
    # 0 = matched (bad), 1 = no match (good), >1 = grep itself failed — which
    # must be loud. A guard that goes quiet when its own check breaks is worse
    # than no guard, because it reads as a passing test.
    if [[ "$code" -gt 1 ]]; then
      echo "✗ the check itself failed for /$pat/ in $dir:" >&2
      echo "$hits" | sed 's/^/    /' >&2
      exit 2
    fi
    if [[ "$code" -eq 0 ]]; then
      echo "✗ placeholder link(s) in $dir:"
      echo "$hits" | sed 's/^/    /'
      found=1
    fi
  done
done

if [[ "$found" -eq 1 ]]; then
  cat >&2 <<'EOF'

Placeholder links are links to nowhere: they look real, they take keyboard
focus, and clicking one jumps to the top of the page. Point it somewhere real,
or make it a <button> if it isn't navigation.
EOF
  exit 1
fi

echo "✓ no placeholder links (${#APPS[@]} apps, ${#PATTERNS[@]} patterns)"
