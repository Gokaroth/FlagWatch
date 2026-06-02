# Removing personal data from git history

## Why
Earlier commits of `AI_CONTEXT_MEMO.md` contained a pasted **personal conversation** (financial
figures, employer, personal life). The overhaul branch replaces that file with a clean technical
memo **going forward**, but the old content still lives in **past commits** on the public repo.
The steps below permanently purge it from all history. **You run these** — they force-push to
public `main`.

> Note: this rewrites history. Coordinate if anyone else has clones (they must re-clone).

## Recommended tool: git-filter-repo

Install (pick one):
```bash
pipx install git-filter-repo          # recommended
# or
pip install --user git-filter-repo
# or (Debian/Ubuntu/Arch): your package manager's "git-filter-repo"
```

## Steps

```bash
# 1. Fresh clone of the repo to operate on (filter-repo refuses to run on a non-fresh clone)
git clone https://github.com/Gokaroth/FlagWatch.git flagwatch-scrub
cd flagwatch-scrub

# 2. Purge AI_CONTEXT_MEMO.md from ALL history (every commit)
git filter-repo --path AI_CONTEXT_MEMO.md --invert-paths

# 3. Bring back the NEW clean memo from the overhaul branch (or copy it in), then commit it fresh
#    (after merging the overhaul branch, the clean file already exists on the tip — just re-add it)
#    If needed, copy the clean version in and:
git add AI_CONTEXT_MEMO.md
git commit -m "docs: clean technical context memo (personal content purged from history)"

# 4. filter-repo removes the remote for safety — re-add it
git remote add origin https://github.com/Gokaroth/FlagWatch.git

# 5. Force-push the rewritten history
git push --force --all
git push --force --tags
```

## Alternative: BFG Repo-Cleaner
```bash
bfg --delete-files AI_CONTEXT_MEMO.md   # then: git reflog expire --expire=now --all && git gc --prune=now --aggressive && git push --force
```

## Honest caveats
- **Caches & forks:** GitHub may keep cached views for a while, and the old content may persist in
  any forks or in search-engine caches. History rewrite removes it from *your* repo; it cannot
  retract copies already taken elsewhere.
- **Secrets:** if any real credential/token was ever committed, scrubbing is **not enough** —
  **rotate** it. (FlagWatch currently uses no committed secrets; Copernicus is keyless and the
  optional creds live only in Netlify env vars + a gitignored `.env`.)
- **Order:** doing the scrub after merging the overhaul branch is simplest, so the clean memo is
  already present on the tip when you rewrite.
