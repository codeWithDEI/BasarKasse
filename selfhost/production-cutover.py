#!/usr/bin/env python3
"""Root-only, explicit production cutover. `check` never activates or reloads Caddy."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone

ROOT = Path('/srv/basarkasse-production')
OPS = Path('/srv/basarkasse-production-ops')
PROXY_DATA = Path('/var/lib/docker/volumes/roetgesportal_caddy_data/_data')
MAIN = Path('/srv/roetgesportal/deploy/Caddyfile')
ROUTE = PROXY_DATA / 'basarkasse-demo/evaluation.caddy'
CANDIDATE = PROXY_DATA / 'basarkasse-production/production.candidate'
CONTAINER = 'basarkasse-production-basarkasse-production-1'
PROXY = 'roetgesportal-proxy-1'
GATES = ('configurationAccepted', 'venueInternetChecked', 'tabletsAndRecoveryChecked',
         'cashProcedureAndOwnersAssigned', 'backupLossWindowAccepted',
         'capacityAccepted', 'dependencyReviewAccepted')


def run(*args, data=None):
    return subprocess.check_output(args, input=data, stderr=subprocess.PIPE, timeout=180).decode()


def private_json(path):
    path = Path(path)
    if path.stat().st_mode & 0o077:
        raise ValueError('Private input file must have mode 0600')
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def atomic(path, data, mode=0o600):
    path = Path(path)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.basar-')
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def inspect(name):
    return json.loads(run('docker', 'inspect', name))[0]


def database():
    return json.loads(run('docker', 'exec', CONTAINER, 'node', '--experimental-strip-types',
                          'selfhost/production.mjs', 'inspect', '--database', '/data/basarkasse.sqlite'))


def verify_approval(approval, plan, now=None):
    now = time.time() if now is None else now
    at = datetime.fromisoformat(approval.get('approvedAt', '').replace('Z', '+00:00')).timestamp()
    if (approval.get('approved') is not True or not approval.get('approvedBy', '').strip()
            or abs(now - at) > 86400
            or approval.get('installationId') != plan['installationId']
            or approval.get('reviewedRuntimeRevision') != plan['revision']
            or not isinstance(approval.get('mergedRevision'), str)
            or len(approval['mergedRevision']) != 40
            or not all(approval.get('acceptance', {}).get(g) is True for g in GATES)):
        raise ValueError('Current explicit Go, reviewed/merged release and acceptance gates required')


def check(plan):
    if sha(MAIN) != plan['mainConfigSha256'] or sha(ROUTE) != plan['previousRouteSha256']:
        raise ValueError('Existing proxy configuration changed; refresh and review the plan')
    if sha(CANDIDATE) != plan['candidateRouteSha256']:
        raise ValueError('Candidate route changed')
    app = inspect(CONTAINER)
    env = dict(v.split('=', 1) for v in app['Config']['Env'] if '=' in v)
    if (app['Image'] != plan['imageId'] or env.get('BASAR_REVISION') != plan['revision']
            or env.get('BASAR_MODE') != 'production'
            or hashlib.sha256(env.get('BASAR_TEAM_PIN_KEY', '').encode()).hexdigest() != plan['pinKeySha256']
            or env.get('BASAR_PUBLIC_ORIGIN') != 'https://roetgesportal.de'
            or not any(v.get('Name') == 'basarkasse-production_production-data' and v.get('Destination') == '/data' for v in app['Mounts'])
            or app['HostConfig']['PortBindings']
            or app['State'].get('Health', {}).get('Status') != 'healthy'):
        raise ValueError('Prepared production container/image/health does not match')
    for name, expected in plan['otherContainers'].items():
        row = inspect(name)
        if row['Image'] != expected['image'] or row['State']['StartedAt'] != expected['startedAt']:
            raise ValueError('Another application changed; review current deployment first')
    status = database()
    if (status['installationId'] != plan['installationId'] or status['phase'] != 'prepared'
            or not status['paused'] or status['demoAccounts'] or status['integrity'] != 'ok'
            or any(status['counts'][t] for t in ('sales', 'till_sessions', 'payouts', 'movements', 'pool_entries'))):
        raise ValueError('Prepared database identity, emptiness or write gate does not match')
    for name in ('server', 'mac'):
        state = json.loads((OPS / 'state' / (name + '.json')).read_text())
        age = time.time() - datetime.fromisoformat(state['verifiedAt'].replace('Z', '+00:00')).timestamp()
        if not state.get('ok') or age < -60 or age > 360:
            raise ValueError('A fresh verified server and Mac backup is required')
    if shutil.disk_usage(ROOT).free < 5 * 1024**3:
        raise ValueError('At least 5 GiB free storage required')
    # Validate a separate full config; the active import and Caddy process are unchanged.
    imported = 'import /data/basarkasse-demo/*.caddy'
    original = MAIN.read_text()
    if original.count(imported) != 1:
        raise ValueError('Expected single BasarKasse import missing')
    validation = original.replace(imported, 'import /data/basarkasse-production/production.candidate')
    atomic(CANDIDATE.parent / 'candidate.Caddyfile', validation.encode())
    run('docker', 'exec', PROXY, 'caddy', 'validate', '--config',
        '/data/basarkasse-production/candidate.Caddyfile', '--adapter', 'caddyfile')
    return status



def verify_public_installation(base, installation_id):
    # The app's backend network is intentionally internal. Probe public HTTPS
    # from the host without granting the app container outbound Internet access.
    script = """import json, sys, urllib.request, urllib.error
base, expected = sys.argv[1:]
def request(path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    headers = {} if payload is None else {'Origin':'https://roetgesportal.de','Content-Type':'application/json'}
    req = urllib.request.Request(base+path, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())
status, access = request('/api/basar?view=access')
if status != 200 or access.get('mode') != 'production' or access.get('phase') != 'live' or access.get('installationId') != expected or access.get('device') is not None:
    raise ValueError('Public installation mismatch')
if request('/api/basar')[0] != 403:
    raise ValueError('Anonymous API was not denied')
status, denied = request('/api/basar', {'action':'demo','staffId':'demo-leitung'})
if status != 403 or denied.get('code') != 'DEMO_DISABLED':
    raise ValueError('Demo login was not denied')
print('Public production metadata/access checks passed')
"""
    run('python3', '-c', script, base, installation_id)


def activate(plan, approval):
    verify_approval(approval, plan)
    status = check(plan)
    record = OPS / 'launch'
    record.mkdir(mode=0o700, exist_ok=False)
    atomic(record / 'approval.json', (json.dumps(approval, indent=2) + '\n').encode())
    atomic(record / 'previous-route.private', ROUTE.read_bytes())
    run('systemctl', 'start', 'basarkasse-production-backup.service')
    snapshot = json.loads((OPS / 'backups/latest.json').read_text())
    shutil.copyfile(OPS / 'backups' / snapshot['name'], record / 'before-activation.sqlite')
    os.chmod(record / 'before-activation.sqlite', 0o600)
    published = False
    try:
        expression = "import {activateProduction} from './selfhost/production.mjs';import {readFileSync} from 'node:fs';console.log(JSON.stringify(activateProduction('/data/basarkasse.sqlite',JSON.parse(readFileSync(0,'utf8')))));"
        run('docker', 'exec', '-i', CONTAINER, 'node', '--experimental-strip-types',
            '--input-type=module', '-e', expression, data=json.dumps(approval).encode())
        # Only this imported route is replaced. Preserve all other portal routes/configuration.
        atomic(ROUTE, CANDIDATE.read_bytes(), 0o600)
        published = True
        run('docker', 'exec', PROXY, 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile')
        base = 'https://roetgesportal.de/basarkasse'
        verify_public_installation(base, plan['installationId'])
        final = database()
        atomic(record / 'result.json', (json.dumps({'ok': True, 'activatedAt': datetime.now(timezone.utc).isoformat(), 'revision': plan['revision'], 'imageId': plan['imageId'], 'installationId': status['installationId'], 'counts': final['counts']}, indent=2)+'\n').encode())
        return {'publicProduction': True, 'revision': plan['revision'], 'installationId': status['installationId']}
    except Exception:
        # Never restore an old database after publication: some requests may have committed.
        pause = "import './selfhost/bootstrap.mjs';globalThis.__basarDB.sqlite.prepare('UPDATE instance_state SET writes_paused=1 WHERE id=1').run();console.log('Writes paused; financial data retained');"
        try:
            run('docker', 'exec', CONTAINER, 'node', '--input-type=module', '-e', pause)
        finally:
            if published:
                atomic(ROUTE, (record / 'previous-route.private').read_bytes())
                run('docker', 'exec', PROXY, 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile')
        raise ValueError('Launch failed: production data retained and writes paused; investigate before any retry')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=('check', 'activate'))
    parser.add_argument('--plan', default='/etc/basarkasse-production/launch.json')
    parser.add_argument('--approval')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise ValueError('Run with sudo on the prepared Ubuntu host')
    plan = private_json(args.plan)
    if args.mode == 'check':
        status = check(plan)
        print(json.dumps({'prepared': True, 'publicActivation': False, 'phase': status['phase'], 'installationId': status['installationId'], 'acceptanceRequired': GATES}))
    else:
        if not args.approval:
            raise ValueError('Explicit private approval file required')
        print(json.dumps(activate(plan, private_json(args.approval))))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.SubprocessError) as error:
        # Do not print subprocess stderr: it can include private proxy configuration.
        print('Production launch refused: ' + (str(error) if isinstance(error, ValueError) else type(error).__name__))
        raise SystemExit(1)
