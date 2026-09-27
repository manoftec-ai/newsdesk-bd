# Working in this repo with more than one agent session

**Rule: one session, one worktree, one branch. Never two sessions in the same directory.**

Established 2026-09-27 after three concurrent opencode sessions repeatedly destroyed each
other's work in this repo.

## What went wrong before

Three sessions shared `~/project-coba/newsdesk-bd`. Consequences observed in one evening:

- A session's uncommitted changes were **wiped by a `git stash`** from another session.
  Recovered from `stash@{0}` by luck.
- Another session **committed my staged files into its own commit** (`66fb05b`,
  message "homepage audit: the lead card printed its date as raw ISO"). The code
  survived; the commit message did not.
- My commit was later **rehashed** `44b1bd5` -> `21b23e3` by a concurrent rebase.
- A merge between a pipeline commit and a session commit silently **discarded 31 rows
  of fetched data** (see `pipeline.yml` history). That one had a code cause too, but
  the concurrent writer is what triggered it.

None of this is theoretical. All four happened.

## The setup

Three worktrees, one per session, already created:

| path | branch | use for |
|---|---|---|
| `~/project-coba/newsdesk-bd` | `main` | reading, merging, deploy inspection |
| `~/project-coba/wt-newsroom` | `session/newsroom` | pipeline, articles, editorial |
| `~/project-coba/wt-site` | `session/site` | site UI, layouts, components |
| `~/project-coba/wt-infra` | `session/infra` | CI workflows, config, tooling |

`~/.git` objects are **shared**, so the 156 MB repo is stored once. Each worktree adds
~280 MB, most of it `node_modules`. There is 29 GB free, so this is cheap.

## One-time setup per worktree

```bash
cd ~/project-coba/wt-<name>
npm --prefix site ci --no-audit --no-fund
npm --prefix pipeline ci --no-audit --no-fund
```

Skipping this means no local test run in that worktree.

## The rules

1. **Start each session by `cd`-ing into its own worktree.** Tell the agent the absolute
   path. If a session's working directory is the parent `~/project-coba`, it will land in
   the main checkout and cause this again.
2. **Never check out the same branch in two worktrees.** Git refuses this, which is the
   point — it is the enforcement mechanism, not an inconvenience.
3. **Work on your own branch. Do not `git checkout main`.** The main checkout is for
   reading and merging.
4. **Do not run `git stash`, `git checkout --`, `git reset --hard`, or `git clean` in the
   main checkout.** Those are what destroyed work. If you need a clean main:
   `git -C ~/project-coba/newsdesk-bd pull --ff-only`.
5. **Push your branch, not main.** `git push -u origin session/<name>`. Then open a PR or
   merge deliberately. This removes the push race entirely.
6. **Sync your branch before long work:** `git fetch origin && git rebase origin/main`.
   Rebasing your own branch is safe and is not the same as rebasing `main`.

## Verifying isolation

```bash
cd ~/project-coba/newsdesk-bd && git worktree list
```

Each line should show a distinct branch. If two lines share a branch, the separation has
been broken.

## If a session is already running in the wrong directory

Do not kill it mid-write. Let it finish, then move it:

```bash
# from the main checkout
git worktree add ~/project-coba/wt-<name2> -b session/<name2> main
```

and restart that session with the new path. Verify with `git worktree list` before
starting any new work.

## Why worktrees and not just separate clones

A separate clone per session would also stop the file clobbering, but each clone gets its
own 156 MB `.git` and its own remote-tracking state, so sessions disagree about what
`origin/main` is — which is how you get two agents each convinced the other is behind.
Worktrees share the object database and refs, so there is exactly one truth about
`main`, and isolation comes from the branches.
