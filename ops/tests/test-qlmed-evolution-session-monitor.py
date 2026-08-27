#!/usr/bin/env python3
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


OPS_DIR = Path(__file__).resolve().parents[1]
SCRIPT = OPS_DIR / "scripts/qlmed-evolution-session-monitor.sh"
INSTALLER = OPS_DIR / "scripts/install-qlmed-evolution-session-monitor.sh"
SERVICE = OPS_DIR / "systemd/qlmed-evolution-session-monitor.service"
FIXTURES = OPS_DIR / "tests/fixtures"


class QlmedEvolutionMonitorTest(unittest.TestCase):
    def run_monitor(self, fixture: str, state: Path, log: Path, alert_log: Path, lib: Path):
        env = os.environ.copy()
        env.update(
            {
                "QLMED_EVOLUTION_MONITOR_FIXTURE": str(FIXTURES / fixture),
                "QLMED_EVOLUTION_STATE_DIR": str(state),
                "QLMED_EVOLUTION_LOG_FILE": str(log),
                "QLMED_EVOLUTION_REALERT_SECONDS": "21600",
                "QLMED_EVOLUTION_ALERT_TO": "fixture@example.invalid",
                "QLMED_EVOLUTION_MONITOR_NO_ALERT": "0",
                "OPS_LIB": str(lib),
                "ALERT_LOG": str(alert_log),
            }
        )
        return subprocess.run([str(SCRIPT), "--check"], env=env, capture_output=True, text=True)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.state = root / "state"
        self.log = root / "monitor.log"
        self.alert_log = root / "alerts.log"
        self.lib = root / "fixture-lib.sh"
        self.lib.write_text(
            "email_send() { printf 'subject=%s\\n' \"$1\" >>\"$ALERT_LOG\"; }"
            "\n",
            encoding="utf-8",
        )

    def tearDown(self):
        self.tmp.cleanup()

    def alert_count(self):
        if not self.alert_log.exists():
            return 0
        return len(self.alert_log.read_text(encoding="utf-8").splitlines())

    def test_two_failures_alert_realert_spacing_and_recovery(self):
        self.assertEqual(self.run_monitor("monitor-open.json", self.state, self.log, self.alert_log, self.lib).returncode, 0)
        self.assertEqual(self.run_monitor("monitor-close.json", self.state, self.log, self.alert_log, self.lib).returncode, 1)
        self.assertEqual(self.alert_count(), 0)
        self.assertEqual(self.run_monitor("monitor-close.json", self.state, self.log, self.alert_log, self.lib).returncode, 1)
        self.assertEqual(self.alert_count(), 1)
        self.assertEqual(self.run_monitor("monitor-close.json", self.state, self.log, self.alert_log, self.lib).returncode, 1)
        self.assertEqual(self.alert_count(), 1)
        self.assertEqual(self.run_monitor("monitor-recovery.json", self.state, self.log, self.alert_log, self.lib).returncode, 0)
        self.assertEqual(self.alert_count(), 2)
        state = (self.state / "state").read_text(encoding="utf-8")
        self.assertIn("status=open", state)
        self.assertIn("outage_alerted=0", state)

    def test_unreachable_requires_two_failures(self):
        self.assertEqual(self.run_monitor("monitor-unreachable.json", self.state, self.log, self.alert_log, self.lib).returncode, 1)
        self.assertEqual(self.alert_count(), 0)
        self.assertEqual(self.run_monitor("monitor-unreachable.json", self.state, self.log, self.alert_log, self.lib).returncode, 1)
        self.assertEqual(self.alert_count(), 1)

    def test_alert_transport_failure_is_internal_failure(self):
        failing_lib = Path(self.tmp.name) / "failing-lib.sh"
        failing_lib.write_text("email_send() { return 1; }\n", encoding="utf-8")
        self.assertEqual(self.run_monitor("monitor-close.json", self.state, self.log, self.alert_log, failing_lib).returncode, 1)
        failed = self.run_monitor("monitor-close.json", self.state, self.log, self.alert_log, failing_lib)
        self.assertEqual(failed.returncode, 2)
        self.assertIn("reason=alert_transport_failed", (self.state / "state").read_text(encoding="utf-8"))

    def test_source_and_unit_have_no_restart_or_secret(self):
        source = SCRIPT.read_text(encoding="utf-8")
        unit = SERVICE.read_text(encoding="utf-8")
        self.assertNotIn("docker restart", source)
        self.assertNotIn("device_removed", source)
        self.assertIn("connectionState", source)
        self.assertIn("StateDirectory=qlmed-evolution-session-monitor", unit)
        self.assertIn("LogsDirectory=qlmed-evolution-session-monitor", unit)
        self.assertIn("User=root", unit)
        self.assertNotIn("API_KEY=", unit)
        self.assertNotIn("SMTP_PASS=", unit)
        self.assertIn("SuccessExitStatus=0 1", unit)
        self.assertIn("exit 2", source)

    def test_nonroot_install_is_rejected_without_touching_live_paths(self):
        env = os.environ.copy()
        env["QLMED_EVOLUTION_MONITOR_AUTHORIZED"] = "YES"
        proc = subprocess.run([str(INSTALLER), "--install"], env=env, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 78)
        self.assertIn("requires EUID 0", proc.stderr)

    def test_staging_refuses_different_overwrite_and_records_hash_receipt(self):
        stage = Path(self.tmp.name) / "stage"
        first = subprocess.run([str(INSTALLER), "--stage", str(stage)], capture_output=True, text=True)
        self.assertEqual(first.returncode, 0, first.stderr)
        service = stage / "etc/systemd/system/qlmed-evolution-session-monitor.service"
        service.write_text(service.read_text(encoding="utf-8") + "\n# drift\n", encoding="utf-8")
        second = subprocess.run([str(INSTALLER), "--stage", str(stage)], capture_output=True, text=True)
        self.assertEqual(second.returncode, 78)
        self.assertIn("different file", second.stderr)
        receipt = (stage / "qlmed-evolution-session-monitor.install-receipt").read_text(encoding="utf-8")
        self.assertIn("script_sha256=", receipt)
        self.assertIn("daemon_reload=false", receipt)
        self.assertIn("--rollback", INSTALLER.read_text(encoding="utf-8"))

    def test_rollback_contract_checks_installed_hashes_before_restore(self):
        installer = INSTALLER.read_text(encoding="utf-8")
        self.assertIn("restore_receipt()", installer)
        self.assertIn("assert_installed_destination", installer)
        self.assertIn("installed_script_sha256", installer)
        self.assertIn("installed_service_sha256", installer)
        self.assertIn("installed_timer_sha256", installer)
        self.assertIn("--uninstall", installer)
        self.assertIn("daemon-reload and activation remain separate", installer)
        rollback = installer.split("restore_receipt()", 1)[1]
        self.assertLess(
            rollback.index('assert_installed_destination "$script_dest"'),
            rollback.index('restore_one "$backup/script" "$script_dest"'),
        )

    def test_stage_is_non_live_and_binds_installed_exec_path(self):
        stage = Path(self.tmp.name) / "stage"
        proc = subprocess.run(
            [str(INSTALLER), "--stage", str(stage)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("no daemon-reload or activation", proc.stdout)
        self.assertTrue((stage / "usr/local/libexec/qlmed-evolution-session-monitor.sh").is_file())
        staged_unit = (stage / "etc/systemd/system/qlmed-evolution-session-monitor.service").read_text(encoding="utf-8")
        self.assertIn("ExecStart=/usr/local/libexec/qlmed-evolution-session-monitor.sh --check", staged_unit)


if __name__ == "__main__":
    unittest.main()
