"""Exercise deployment ordering/failure handling against synthetic files and commands."""
import importlib.util
import json
from pathlib import Path
import tempfile
import time
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('cutover', 'selfhost/production-cutover.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class CutoverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.ops = root / 'ops'
        (self.ops / 'state').mkdir(parents=True)
        (self.ops / 'backups').mkdir()
        for name in ('server', 'mac'):
            (self.ops / 'state' / (name + '.json')).write_text(json.dumps({'ok': True, 'verifiedAt': datetime.now(timezone.utc).isoformat()}))
        self.main, self.route, self.candidate = [root / n for n in ('main', 'route', 'candidate')]
        self.main.write_text('example.org {\nimport /data/basarkasse-demo/*.caddy\n}\n')
        self.route.write_text('private previous route')
        self.candidate.write_text('new production route')
        self.plan = {'installationId': 'synthetic-id', 'revision': 'a'*40, 'imageId': 'test-image', 'pinKeySha256': m.hashlib.sha256(b'synthetic-key').hexdigest(), 'mainConfigSha256': m.sha(self.main), 'previousRouteSha256': m.sha(self.route), 'candidateRouteSha256': m.sha(self.candidate), 'otherContainers': {}}
        self.approval = {'approved': True, 'approvedBy': 'Synthetic owner', 'approvedAt': datetime.now(timezone.utc).isoformat(), 'installationId': 'synthetic-id', 'reviewedRuntimeRevision': 'a'*40, 'mergedRevision': 'b'*40, 'acceptance': dict.fromkeys(m.GATES, True)}
        self.status = {'installationId': 'synthetic-id', 'phase': 'prepared', 'paused': True, 'demoAccounts': 0, 'integrity': 'ok', 'counts': dict.fromkeys(('sales', 'till_sessions', 'payouts', 'movements', 'pool_entries', 'operations'), 0)}
        self.calls = []
        self.fail_public = False
        def command(*args, data=None):
            self.calls.append(args)
            if args[:2] == ('systemctl', 'start'):
                (self.ops / 'backups/snapshot.sqlite').write_text('synthetic snapshot')
                (self.ops / 'backups/latest.json').write_text(json.dumps({'name': 'snapshot.sqlite'}))
            if self.fail_public and args[-1] == 'synthetic-id':
                raise ValueError('Synthetic public verification failure')
            return '{}'
        for key, value in {'ROOT': root, 'OPS': self.ops, 'MAIN': self.main, 'ROUTE': self.route, 'CANDIDATE': self.candidate}.items():
            p = patch.object(m, key, value);p.start();self.addCleanup(p.stop)
        for key, value in {'run': command, 'database': lambda: self.status, 'inspect': lambda name: {'Image': 'test-image', 'Config': {'Env': ['BASAR_REVISION='+'a'*40, 'BASAR_MODE=production', 'BASAR_TEAM_PIN_KEY=synthetic-key', 'BASAR_PUBLIC_ORIGIN=https://roetgesportal.de']}, 'Mounts': [{'Name': 'basarkasse-production_production-data', 'Destination': '/data'}], 'HostConfig': {'PortBindings': {}}, 'State': {'Health': {'Status': 'healthy'}}}}.items():
            p = patch.object(m, key, value);p.start();self.addCleanup(p.stop)

    def test_check_validates_candidate_without_activation_or_reload(self):
        m.check(self.plan)
        self.assertEqual(self.route.read_text(), 'private previous route')
        self.assertTrue(any('validate' in c for c in self.calls))
        self.assertFalse(any('reload' in c or '-i' in c for c in self.calls))

    def test_missing_go_expired_go_wrong_installation_and_open_gate_are_refused(self):
        for changes in ({'approved': False}, {'approvedAt': '2020-01-01T00:00:00Z'}, {'installationId': 'other'}, {'acceptance': {}}):
            with self.assertRaises(ValueError):
                m.verify_approval({**self.approval, **changes}, self.plan)
        self.assertEqual(self.calls, [])

    def test_changed_proxy_nonempty_database_and_old_backup_are_refused(self):
        self.route.write_text('operator changed route')
        with self.assertRaises(ValueError):m.check(self.plan)
        self.route.write_text('private previous route');self.status['counts']['sales'] = 1
        with self.assertRaises(ValueError):m.check(self.plan)
        self.status['counts']['sales'] = 0
        (self.ops / 'state/mac.json').write_text(json.dumps({'ok': True, 'verifiedAt': '2020-01-01T00:00:00Z'}))
        with self.assertRaises(ValueError):m.check(self.plan)

    def test_success_keeps_snapshot_and_only_replaces_target_route(self):
        result = m.activate(self.plan, self.approval)
        self.assertTrue(result['publicProduction'])
        self.assertEqual(self.route.read_text(), 'new production route')
        self.assertEqual((self.ops/'launch/previous-route.private').read_text(), 'private previous route')
        self.assertTrue((self.ops/'launch/before-activation.sqlite').exists())
        self.assertTrue(any('reload' in c for c in self.calls))

    def test_failed_public_verification_pauses_writes_and_keeps_database(self):
        self.fail_public = True
        with self.assertRaisesRegex(ValueError, 'data retained'):
            m.activate(self.plan, self.approval)
        self.assertEqual(self.route.read_text(), 'private previous route')
        self.assertTrue(any(any('writes_paused=1' in arg for arg in c) for c in self.calls))
        self.assertFalse((self.ops/'launch/result.json').exists())
        self.assertTrue((self.ops/'launch/before-activation.sqlite').exists())


if __name__ == '__main__':
    unittest.main()
