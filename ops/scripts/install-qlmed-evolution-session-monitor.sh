#!/usr/bin/env bash
# Stage or (only after explicit authorization) install the prepared QLMED
# Evolution monitor.  Installation is byte-safe, hash-checked and reversible;
# this script never daemon-reloads or enables the timer.
set -euo pipefail
umask 077

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
source_script="$root/qlmed/ops/scripts/qlmed-evolution-session-monitor.sh"
service_unit="$root/qlmed/ops/systemd/qlmed-evolution-session-monitor.service"
timer_unit="$root/qlmed/ops/systemd/qlmed-evolution-session-monitor.timer"

script_dest=/usr/local/libexec/qlmed-evolution-session-monitor.sh
service_dest=/etc/systemd/system/qlmed-evolution-session-monitor.service
timer_dest=/etc/systemd/system/qlmed-evolution-session-monitor.timer
backup_root=${QLMED_EVOLUTION_MONITOR_BACKUP_DIR:-/var/backups/qlmed-evolution-session-monitor}
receipt_root=${QLMED_EVOLUTION_MONITOR_RECEIPT_DIR:-/var/lib/qlmed-evolution-session-monitor}

# These values are updated together with the prepared source files.  They
# protect the installer from copying a source that was changed after review.
EXPECTED_SCRIPT_SHA256=61926f6e6dbd74ead4a0e1f6ecc86d259490b638df071f6a85c121e359ee5380
EXPECTED_SERVICE_SHA256=e714a0b4c9b76fd325c33b3ac6f4a3e6dd11158508fc7e5dac9a62c65ffa04a0
EXPECTED_TIMER_SHA256=98ec3ea8d17f85356dce71ec540ac7d495aa3a9eac078832ce581cac1ddcc2c8

usage() {
  echo "usage: $0 --stage DESTDIR | --install | --rollback RECEIPT | --uninstall RECEIPT" >&2
}

die() { echo "refusing monitor operation: $*" >&2; exit 78; }

sha256_file() {
  sha256sum "$1" | awk '{print $1}'
}

require_root_authorized() {
  (( EUID == 0 )) || die "--install/--rollback/--uninstall requires EUID 0; use sudo -n after approval"
  [[ "${QLMED_EVOLUTION_MONITOR_AUTHORIZED:-}" == YES ]] || die "set QLMED_EVOLUTION_MONITOR_AUTHORIZED=YES after the approval checkpoint"
}

validate_sources() {
  local got
  for path in "$source_script" "$service_unit" "$timer_unit"; do
    [[ -f "$path" && ! -L "$path" ]] || die "source missing or symlink: $path"
  done
  got=$(sha256_file "$source_script"); [[ "$got" == "$EXPECTED_SCRIPT_SHA256" ]] || die "monitor script hash drift"
  got=$(sha256_file "$service_unit"); [[ "$got" == "$EXPECTED_SERVICE_SHA256" ]] || die "service unit hash drift"
  got=$(sha256_file "$timer_unit"); [[ "$got" == "$EXPECTED_TIMER_SHA256" ]] || die "timer unit hash drift"
}

assert_destination_safe() {
  local source="$1" destination="$2"
  if [[ -L "$destination" ]]; then
    die "destination is a symlink: $destination"
  fi
  if [[ -e "$destination" ]]; then
    [[ -f "$destination" ]] || die "destination is not a regular file: $destination"
    cmp -s "$source" "$destination" || die "refusing to overwrite a different file: $destination"
  fi
}

install_if_absent_or_identical() {
  local source="$1" destination="$2" mode="$3"
  if [[ -e "$destination" ]]; then
    return 0
  fi
  install -D -m "$mode" "$source" "$destination"
}

write_stage_receipt() {
  local dest="$1" receipt="$dest/qlmed-evolution-session-monitor.install-receipt"
  install -d -m 0700 "$dest"
  {
    printf 'schema_version=1\n'
    printf 'status=STAGED_NOT_INSTALLED\n'
    printf 'script_sha256=%s\n' "$(sha256_file "$source_script")"
    printf 'service_sha256=%s\n' "$(sha256_file "$service_unit")"
    printf 'timer_sha256=%s\n' "$(sha256_file "$timer_unit")"
    printf 'script_destination=%s\n' "$dest$script_dest"
    printf 'service_destination=%s\n' "$dest$service_dest"
    printf 'timer_destination=%s\n' "$dest$timer_dest"
    printf 'daemon_reload=false\nactivation=false\n'
  } >"$receipt.tmp"
  chmod 0600 "$receipt.tmp"
  if [[ -e "$receipt" ]]; then
    cmp -s "$receipt.tmp" "$receipt" || die "refusing to overwrite a different staging receipt"
    unlink "$receipt.tmp"
  else
    mv -- "$receipt.tmp" "$receipt"
  fi
}

stage() {
  local dest="$1"
  [[ -n "$dest" && "$dest" != / ]] || die "invalid staging destination"
  validate_sources
  local staged_script="$dest$script_dest" staged_service="$dest$service_dest" staged_timer="$dest$timer_dest"
  assert_destination_safe "$source_script" "$staged_script"
  assert_destination_safe "$service_unit" "$staged_service"
  assert_destination_safe "$timer_unit" "$staged_timer"
  install_if_absent_or_identical "$source_script" "$staged_script" 0750
  install_if_absent_or_identical "$service_unit" "$staged_service" 0644
  install_if_absent_or_identical "$timer_unit" "$staged_timer" 0644
  [[ "$(sha256_file "$staged_script")" == "$(sha256_file "$source_script")" ]] || die "staged script hash mismatch"
  [[ "$(sha256_file "$staged_service")" == "$(sha256_file "$service_unit")" ]] || die "staged service hash mismatch"
  [[ "$(sha256_file "$staged_timer")" == "$(sha256_file "$timer_unit")" ]] || die "staged timer hash mismatch"
  write_stage_receipt "$dest"
  echo "staged package under $dest (no daemon-reload or activation performed)"
}

record_previous() {
  local source="$1" destination="$2" backup="$3" name="$4"
  if [[ -e "$destination" ]]; then
    install -m 0600 "$destination" "$backup/$name"
    printf 'previous_%s=present\n' "$name"
    printf 'previous_%s_sha256=%s\n' "$name" "$(sha256_file "$destination")"
  else
    printf 'previous_%s=absent\n' "$name"
    printf 'previous_%s_sha256=null\n' "$name"
  fi
  : "$source"
}

restore_one() {
  local backup="$1" destination="$2" previous_state="$3" mode="$4" expected="$5"
  if [[ "$previous_state" == present ]]; then
    install -D -m "$mode" "$backup" "$destination"
  elif [[ -f "$destination" && "$(sha256_file "$destination")" == "$expected" ]]; then
    unlink "$destination"
  fi
}

assert_installed_destination() {
  local destination="$1" expected="$2"
  [[ -f "$destination" && ! -L "$destination" ]] || die "installed destination missing or symlink: $destination"
  [[ "$(sha256_file "$destination")" == "$expected" ]] || die "installed destination drift: $destination"
}

install_live() {
  require_root_authorized
  validate_sources
  assert_destination_safe "$source_script" "$script_dest"
  assert_destination_safe "$service_unit" "$service_dest"
  assert_destination_safe "$timer_unit" "$timer_dest"

  local run_id=${QLMED_EVOLUTION_MONITOR_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}
  [[ "$run_id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]] || die "invalid run id"
  local backup="$backup_root/$run_id" receipt="$receipt_root/$run_id.receipt"
  [[ ! -e "$backup" ]] || die "backup run id already exists: $run_id"
  if [[ -e "$receipt" ]]; then
    die "receipt already exists for run id: $run_id"
  fi
  install -d -m 0700 "$backup" "$receipt_root"
  {
    printf 'schema_version=1\nstatus=INSTALLED\nrun_id=%s\nbackup_dir=%s\n' "$run_id" "$backup"
    record_previous "$source_script" "$script_dest" "$backup" script
    record_previous "$service_unit" "$service_dest" "$backup" service
    record_previous "$timer_unit" "$timer_dest" "$backup" timer
    printf 'installed_script_sha256=%s\n' "$(sha256_file "$source_script")"
    printf 'installed_service_sha256=%s\n' "$(sha256_file "$service_unit")"
    printf 'installed_timer_sha256=%s\n' "$(sha256_file "$timer_unit")"
    printf 'daemon_reload=false\nactivation=false\n'
  } >"$receipt.tmp"
  chmod 0600 "$receipt.tmp"
  mv -- "$receipt.tmp" "$receipt"

  if ! install_if_absent_or_identical "$source_script" "$script_dest" 0750 \
    || ! install_if_absent_or_identical "$service_unit" "$service_dest" 0644 \
    || ! install_if_absent_or_identical "$timer_unit" "$timer_dest" 0644 \
    || [[ "$(sha256_file "$script_dest")" != "$(sha256_file "$source_script")" ]] \
    || [[ "$(sha256_file "$service_dest")" != "$(sha256_file "$service_unit")" ]] \
    || [[ "$(sha256_file "$timer_dest")" != "$(sha256_file "$timer_unit")" ]]; then
    restore_one "$backup/script" "$script_dest" "$(awk -F= '$1=="previous_script"{print $2}' "$receipt")" 0750 "$(sha256_file "$source_script")"
    restore_one "$backup/service" "$service_dest" "$(awk -F= '$1=="previous_service"{print $2}' "$receipt")" 0644 "$(sha256_file "$service_unit")"
    restore_one "$backup/timer" "$timer_dest" "$(awk -F= '$1=="previous_timer"{print $2}' "$receipt")" 0644 "$(sha256_file "$timer_unit")"
    die "installation failed; previous files restored where possible"
  fi
  echo "files installed; receipt=$receipt; daemon-reload and timer activation remain separate authorized operations"
}

restore_receipt() {
  local receipt="$1"
  require_root_authorized
  [[ -f "$receipt" && ! -L "$receipt" ]] || die "receipt missing or symlink"
  local backup script_state service_state timer_state
  backup=$(awk -F= '$1=="backup_dir"{print $2}' "$receipt")
  script_state=$(awk -F= '$1=="previous_script"{print $2}' "$receipt")
  service_state=$(awk -F= '$1=="previous_service"{print $2}' "$receipt")
  timer_state=$(awk -F= '$1=="previous_timer"{print $2}' "$receipt")
  [[ "$backup" == "$backup_root/"* && -d "$backup" ]] || die "receipt backup is outside the approved root"
  local installed_script installed_service installed_timer
  installed_script=$(awk -F= '$1=="installed_script_sha256"{print $2}' "$receipt")
  installed_service=$(awk -F= '$1=="installed_service_sha256"{print $2}' "$receipt")
  installed_timer=$(awk -F= '$1=="installed_timer_sha256"{print $2}' "$receipt")
  assert_installed_destination "$script_dest" "$installed_script"
  assert_installed_destination "$service_dest" "$installed_service"
  assert_installed_destination "$timer_dest" "$installed_timer"
  restore_one "$backup/script" "$script_dest" "$script_state" 0750 "$installed_script"
  restore_one "$backup/service" "$service_dest" "$service_state" 0644 "$installed_service"
  restore_one "$backup/timer" "$timer_dest" "$timer_state" 0644 "$installed_timer"
  echo "previous monitor files restored from $receipt; daemon-reload and activation remain separate"
}

mode=${1:-}
case "$mode" in
  --stage)
    [[ $# -eq 2 ]] || { usage; exit 2; }
    stage "$2"
    ;;
  --install)
    [[ $# -eq 1 ]] || { usage; exit 2; }
    install_live
    ;;
  --rollback|--uninstall)
    [[ $# -eq 2 ]] || { usage; exit 2; }
    restore_receipt "$2"
    ;;
  *)
    usage
    exit 2
    ;;
esac
