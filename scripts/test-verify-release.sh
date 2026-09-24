#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
verifier="$root/scripts/verify-release.sh"
valid_sha="0000000000000000000000000000000000000000"

expect_refuse() {
  local label="$1"
  shift
  local output

  if output="$("$@" 2>&1)"; then
    echo "FALHOU: $label deveria RECUSAR e aprovou" >&2
    exit 1
  fi
  if [[ "$output" != Refusing:* ]]; then
    echo "FALHOU: $label não começou com Refusing" >&2
    echo "$output" >&2
    exit 1
  fi
  echo "  ok  $label"
}

expect_refuse "modo interno sem RUNNER_NAME" \
  env -u RUNNER_NAME -u DATABASE_URL bash "$verifier" --inside

expect_refuse "runner de produção no modo interno" \
  env RUNNER_NAME=qlmed-prod \
    DATABASE_URL=postgresql://qlmed_ci:qlmed_ci@qlmed-ci-db:5432/qlmed_ci \
    bash "$verifier" --inside

expect_refuse "banco CI do host na porta 5433" \
  env RUNNER_NAME=qlmed-ci-linux-01 \
    DATABASE_URL=postgresql://qlmed_ci:qlmed_ci@127.0.0.1:5433/qlmed_ci \
    bash "$verifier" --inside

expect_refuse "writer canônico na porta 5435" \
  env RUNNER_NAME=qlmed-ci-linux-01 \
    DATABASE_URL=postgresql://qlmed_ci:qlmed_ci@127.0.0.1:5435/qlmed_ci \
    bash "$verifier" --inside

isolation_output=""
if isolation_output="$(
  cd "$root"
  RUNNER_NAME=qlmed-ci-linux-01 \
    DATABASE_URL=postgresql://qlmed_ci:qlmed_ci@qlmed-ci-db:5432/qlmed_ci?schema=public \
    bash "$verifier" --inside 2>&1
)"; then
  echo "FALHOU: isolamento válido não pode passar no host" >&2
  exit 1
fi
if [[ ! "$isolation_output" =~ ISOLATION[[:space:]]FAIL|Refusing ]]; then
  echo "FALHOU: recusa do isolamento não trouxe evidência esperada" >&2
  echo "$isolation_output" >&2
  exit 1
fi
echo "  ok  isolamento interno recusa execução no host"

expect_refuse "SHA inválido no modo host" \
  env QLMED_VERIFY_SKIP_DOCKER=1 bash "$verifier" abc123

idle_output="$(
  (
    qlmed_runner_busy() {
      return 1
    }
    # shellcheck source=scripts/verify-release.sh
    . "$verifier"
    QLMED_VERIFY_SKIP_DOCKER=1 qlmed_verify_release "$valid_sha"
  )
)"
if [[ "$idle_output" != *"HOST_PREFLIGHT_OK"* ]]; then
  echo "FALHOU: runner ocioso não concluiu o preflight" >&2
  echo "$idle_output" >&2
  exit 1
fi
echo "  ok  SHA válido e runner ocioso passam o preflight"

busy_output=""
if busy_output="$(
  (
    qlmed_runner_busy() {
      echo "123 Runner.Worker"
      return 0
    }
    # shellcheck source=scripts/verify-release.sh
    . "$verifier"
    QLMED_VERIFY_SKIP_DOCKER=1 qlmed_verify_release "$valid_sha" 2>&1
  )
)"; then
  echo "FALHOU: runner ocupado deveria RECUSAR e aprovou" >&2
  exit 1
fi
if [[ "$busy_output" != Refusing:* ]]; then
  echo "FALHOU: runner ocupado não começou com Refusing" >&2
  echo "$busy_output" >&2
  exit 1
fi
echo "  ok  runner ocupado recusa o preflight"

echo "ok"
