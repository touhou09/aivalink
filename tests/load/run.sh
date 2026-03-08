#!/usr/bin/env bash
# AivaLink k6 Load Test Runner
# Usage:
#   ./tests/load/run.sh              # run all scenarios sequentially
#   ./tests/load/run.sh ws-chat      # run only the WS chat scenario
#   ./tests/load/run.sh rest-api     # run only the REST API scenario
#   ./tests/load/run.sh spike        # run only the spike scenario
#   ./tests/load/run.sh --parallel   # run all scenarios in parallel (use with care)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCENARIOS_DIR="${SCRIPT_DIR}/scenarios"
RESULTS_DIR="${SCRIPT_DIR}/results"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

mkdir -p "${RESULTS_DIR}"

# Check k6 is installed
if ! command -v k6 &>/dev/null; then
  echo "ERROR: k6 is not installed. Install it from https://k6.io/docs/getting-started/installation/" >&2
  exit 1
fi

# -----------------------------------------------------------------------
# Individual run functions
# -----------------------------------------------------------------------
run_ws_chat() {
  echo ""
  echo "===================================================================="
  echo " Running: WebSocket Chat Load Test (100 VUs, 2m)"
  echo "===================================================================="
  k6 run \
    --out json="${RESULTS_DIR}/ws-chat_${TIMESTAMP}.json" \
    "${SCENARIOS_DIR}/ws-chat.js"
}

run_rest_api() {
  echo ""
  echo "===================================================================="
  echo " Running: REST API Load Test (200 rps, 2m)"
  echo "===================================================================="
  k6 run \
    --out json="${RESULTS_DIR}/rest-api_${TIMESTAMP}.json" \
    "${SCENARIOS_DIR}/rest-api.js"
}

run_spike() {
  echo ""
  echo "===================================================================="
  echo " Running: Spike Test (0 -> 500 VUs in 30s)"
  echo "===================================================================="
  k6 run \
    --out json="${RESULTS_DIR}/spike_${TIMESTAMP}.json" \
    "${SCENARIOS_DIR}/spike.js"
}

# -----------------------------------------------------------------------
# Argument parsing
# -----------------------------------------------------------------------
PARALLEL=false
TARGET=""

for arg in "$@"; do
  case "${arg}" in
    --parallel) PARALLEL=true ;;
    ws-chat)    TARGET="ws-chat" ;;
    rest-api)   TARGET="rest-api" ;;
    spike)      TARGET="spike" ;;
    *)
      echo "Unknown argument: ${arg}" >&2
      echo "Usage: $0 [ws-chat|rest-api|spike|--parallel]" >&2
      exit 1
      ;;
  esac
done

# -----------------------------------------------------------------------
# Execution
# -----------------------------------------------------------------------
if [[ -n "${TARGET}" ]]; then
  case "${TARGET}" in
    ws-chat)  run_ws_chat ;;
    rest-api) run_rest_api ;;
    spike)    run_spike ;;
  esac
elif [[ "${PARALLEL}" == "true" ]]; then
  echo "Running all scenarios in PARALLEL..."
  run_ws_chat  &
  PID_WS=$!
  run_rest_api &
  PID_REST=$!
  run_spike    &
  PID_SPIKE=$!

  wait "${PID_WS}"   && echo "ws-chat   DONE" || echo "ws-chat   FAILED"
  wait "${PID_REST}" && echo "rest-api  DONE" || echo "rest-api  FAILED"
  wait "${PID_SPIKE}"&& echo "spike     DONE" || echo "spike     FAILED"
else
  run_ws_chat
  run_rest_api
  run_spike
fi

echo ""
echo "===================================================================="
echo " All results saved to: ${RESULTS_DIR}/"
echo "===================================================================="
