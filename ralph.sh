#!/bin/bash

# Ralph Wiggum Autonomous Development Loop (adapted for teleprompter-native)
# ==========================================================================
# Runs Claude Code in a continuous loop, each iteration with a fresh context
# window. Reads PROMPT.md and feeds it to Claude until all tasks in prd.md
# are complete or max iterations is reached.
#
# Adapted from coleam00/ralph-loop-quickstart for a Swift/AppKit macOS app
# (no agent-browser; verification is `swift build` + `swift test`).
#
# Usage: ./ralph.sh <max_iterations>
# Example: ./ralph.sh 30

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ -z "$1" ]; then
  echo -e "${RED}Error: Missing required argument${NC}"
  echo ""
  echo "Usage: $0 <max_iterations>"
  echo "Example: $0 30"
  exit 1
fi

MAX_ITERATIONS=$1

cd "$(dirname "$0")"

if [ ! -f "PROMPT.md" ]; then
  echo -e "${RED}Error: PROMPT.md not found${NC}"
  exit 1
fi

if [ ! -f "prd.md" ]; then
  echo -e "${RED}Error: prd.md not found${NC}"
  exit 1
fi

if [ ! -f "activity.md" ]; then
  echo -e "${YELLOW}Warning: activity.md not found, creating it...${NC}"
  cat > activity.md << 'EOF'
# Teleprompter v2 - Activity Log

## Current Status
**Last Updated:** Not started
**Tasks Completed:** 0
**Current Task:** None

---

## Session Log

<!-- Each iteration appends a dated entry here -->
EOF
fi

if ! command -v claude >/dev/null 2>&1; then
  echo -e "${RED}Error: 'claude' CLI not found in PATH${NC}"
  echo "Install Claude Code first: https://docs.anthropic.com/claude-code"
  exit 1
fi

if ! command -v swift >/dev/null 2>&1; then
  echo -e "${RED}Error: 'swift' CLI not found in PATH${NC}"
  echo "Install Xcode command line tools: xcode-select --install"
  exit 1
fi

echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}  Ralph Loop — teleprompter-native${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""
echo -e "Working dir:       ${GREEN}$(pwd)${NC}"
echo -e "Max iterations:    ${GREEN}$MAX_ITERATIONS${NC}"
echo -e "Completion signal: ${GREEN}<promise>COMPLETE</promise>${NC}"
echo -e "Permissions:       ${YELLOW}--dangerously-skip-permissions (fully autonomous)${NC}"
echo ""
echo -e "${YELLOW}Starting in 5 seconds... Press Ctrl+C to abort${NC}"
sleep 5
echo ""

for ((i=1; i<=MAX_ITERATIONS; i++)); do
  echo -e "${BLUE}===========================================${NC}"
  echo -e "${BLUE}  Iteration $i of $MAX_ITERATIONS${NC}"
  echo -e "${BLUE}===========================================${NC}"
  echo ""

  result=$(claude -p --dangerously-skip-permissions "$(cat PROMPT.md)" --output-format text 2>&1) || true

  echo "$result"
  echo ""

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo ""
    echo -e "${GREEN}===========================================${NC}"
    echo -e "${GREEN}  ALL TASKS COMPLETE${NC}"
    echo -e "${GREEN}===========================================${NC}"
    echo ""
    echo -e "Finished after ${GREEN}$i${NC} iteration(s)"
    echo ""
    echo "Next steps:"
    echo "  1. Review activity.md for the full build log"
    echo "  2. Run ./Scripts/build-app.sh to produce dist/Teleprompter.app"
    echo "  3. Smoke-test the app on the recording Mac"
    echo "  4. git log to review the commit history this loop produced"
    echo ""
    exit 0
  fi

  echo ""
  echo -e "${YELLOW}--- End of iteration $i ---${NC}"
  echo ""

  sleep 2
done

echo ""
echo -e "${RED}===========================================${NC}"
echo -e "${RED}  MAX ITERATIONS REACHED${NC}"
echo -e "${RED}===========================================${NC}"
echo ""
echo -e "Reached max iterations (${RED}$MAX_ITERATIONS${NC}) without completion."
echo ""
echo "Options:"
echo "  1. Run again with more iterations: ./ralph.sh 50"
echo "  2. Inspect activity.md and prd.md to see remaining work"
echo "  3. Manually finish remaining tasks"
echo ""
exit 1
