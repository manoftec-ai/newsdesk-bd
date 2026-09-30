#!/data/data/com.termux/files/usr/bin/bash
# tools/facebook_web_daemon.sh — keep the browser-based Facebook poster running.
#
# The poster needs a live Chromium session holding a Facebook login, so it CANNOT run in
# GitHub Actions (ephemeral disk + datacenter IP). It runs here, on this phone, inside tmux,
# with a wake lock so Android does not kill it when the screen goes off.
#
#   ./tools/facebook_web_daemon.sh start     # begin draining in the background
#   ./tools/facebook_web_daemon.sh status    # is it running, and what did it last do
#   ./tools/facebook_web_daemon.sh stop      # stop it and release the wake lock
#   ./tools/facebook_web_daemon.sh logs      # tail the log
#
# Phone must be charging for long unattended runs; Android may still kill the process
# under memory pressure. `status` tells you if that happened.
set -uo pipefail

PIPELINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "$PIPELINE_DIR/.." && pwd)"
SESSION="newsdesk-fb-web"
LOG="$PIPELINE_DIR/logs/facebook-web.log"
EXTRA_ARGS="${FACEBOOK_WEB_ARGS:---max-per-session=25 --interval=1200000}"

# Opt-in: commit+push the shared queue file after the loop, so the repo's copy of
# facebook-sent.json never goes stale and cannot re-post an old story if the Graph API
# path is ever switched on. Off by default — this pushes from a phone.
commit_state() {
  [ "${FACEBOOK_WEB_COMMIT:-0}" = "1" ] || return 0
  cd "$REPO_DIR" || return 1
  git add pipeline/state/facebook-sent.json pipeline/state/facebook-web-status.json 2>/dev/null || return 1
  git diff --cached --quiet && return 0
  git commit -q -m "facebook: web poster state (auto, $(date -u +%Y%m%dT%H%M))" || return 1
  git push -q 2>/dev/null || echo "push failed — will retry next batch"
}

mkdir -p "$PIPELINE_DIR/logs"

running() { tmux has-session -t "$SESSION" 2>/dev/null; }

case "${1:-status}" in
  start)
    # Double-post guard: the Graph API poster and this browser poster must never both be
    # live, or every story lands on the Page twice.
    if [ -n "${FACEBOOK_PAGE_TOKEN:-}" ]; then
      echo "refusing to start: FACEBOOK_PAGE_TOKEN is set, so facebook_post.mjs (Graph API)" >&2
      echo "may also be posting. Unset it, or remove .github/workflows/facebook.yml first." >&2
      exit 1
    fi
    if running; then
      echo "already running (tmux session: $SESSION)"
      exit 0
    fi
    command -v termux-wake-lock >/dev/null && termux-wake-lock && echo "wake lock acquired"
    tmux new-session -d -s "$SESSION" \
      "cd '$PIPELINE_DIR' && echo \"[\$(date -u +%FT%TZ)] daemon start\" >> '$LOG' && while true; do node tools/facebook_web_post.mjs --loop-once $EXTRA_ARGS >> '$LOG' 2>&1; '$0' commit >> '$LOG' 2>&1; sleep 1200; done"
    sleep 2
    if running; then
      echo "started (tmux session: $SESSION)"
      echo "log: $LOG"
    else
      echo "failed to start — check $LOG" >&2
      exit 1
    fi
    ;;

  stop)
    if running; then
      tmux send-keys -t "$SESSION" C-c 2>/dev/null
      sleep 1
      tmux kill-session -t "$SESSION" 2>/dev/null
      echo "stopped"
    else
      echo "not running"
    fi
    command -v termux-wake-unlock >/dev/null && termux-wake-unlock && echo "wake lock released"
    ;;

  status)
    if running; then
      echo "running (tmux session: $SESSION)"
    else
      echo "NOT running"
    fi
    if [ -f "$PIPELINE_DIR/state/facebook-web-status.json" ]; then
      echo "--- status file ---"
      cat "$PIPELINE_DIR/state/facebook-web-status.json"
    fi
    if [ -f "$LOG" ]; then
      echo "--- last 15 log lines ---"
      tail -15 "$LOG"
    fi
    ;;

  commit)
    commit_state
    echo "state commit done"
    ;;

  logs)
    tail -f "$LOG"
    ;;

  *)
    echo "usage: $0 {start|stop|status|logs|commit}" >&2
    exit 2
    ;;
esac