"""One Cloud Run Job execution owns one submission and one offline sandbox."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

API = 'https://mini-hackathon-judge.vercel.app/api/judge'
LAUNCHER = '/usr/local/gcp/bin/sandbox'
NAME = 'submission'
RUN = os.environ.get('JUDGE_RUN', '')
TOKEN = os.environ.get('JUDGE_TICKET', '')
OWNER = os.environ['CLOUD_RUN_EXECUTION']
CHUNK = 1024 * 1024


def rpc(action, body=None, chunk=None):
    suffix = '?part=' + str(chunk) if chunk is not None else ''
    request = urllib.request.Request(
        f'{API}/{RUN}/{action}{suffix}',
        data=json.dumps(body or {}).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN,
                 'X-Judge-Execution': OWNER},
    )
    # Safe operations tolerate a transient network interruption. The server
    # deduplicates observations, claims and final scorecard writes.
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=95) as res:
                return res.read() if chunk is not None else json.load(res)
        except (urllib.error.URLError, TimeoutError) as exc:
            if isinstance(exc, urllib.error.HTTPError):
                if action == 'probe-result':
                    print('Synthetic Vercel check:', exc.code, exc.read(500).decode(errors='replace'))
                    raise RuntimeError('Synthetic scoring check failed') from None
                if exc.code < 500:
                    raise RuntimeError(f'{action} returned HTTP {exc.code}') from None
            if action in ('plan', 'finalize') or attempt == 2:
                raise RuntimeError(f'{action} unavailable') from None
            time.sleep(0.5 * (attempt + 1))


def sandbox(args, timeout, data=None):
    return subprocess.run([LAUNCHER, *args], input=data if data is not None else b'',
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)


def require_ok(result, operation):
    if result.returncode:
        if os.getenv('JUDGE_PROBE') == '1':
            print(result.stderr[:1400].decode(errors='replace'), flush=True)
        raise RuntimeError(f'Sandbox {operation} failed (exit {result.returncode})')


def prepare(inbox, filename):
    export = inbox.parent / 'export'
    export.mkdir(mode=0o755)
    result = sandbox(['run', '--detach', '--rootfs', '/guest', '--workdir', '/',
                      '--mount', f'type=bind,src={inbox},dst=/input,readonly',
                      '--mount', f'type=bind,src={export},dst=/export',
                      'unpack', '--', '/bin/sleep', '100'], 30)
    require_ok(result, 'preparation startup')
    try:
        result = sandbox(['exec', '--stdin=false', '--workdir', '/', 'unpack', '--',
                          '/usr/bin/python3', '/usr/local/lib/unpack.py', filename], 35)
        require_ok(result, 'unpack')
        manifest = result.stdout[:6500].decode(errors='replace')
    finally:
        sandbox(['delete', '--force', 'unpack'], 10)
    result = sandbox(['run', '--detach', '--rootfs', '/guest', '--workdir', '/',
                      '--mount', f'type=bind,src={export}/submission,dst=/srv/submission,readonly',
                      '--mount', f'type=bind,src={export}/reference,dst=/srv/reference,readonly',
                      NAME, '--', '/bin/sleep', '920'], 30)
    require_ok(result, 'startup')
    result = sandbox(['exec', '--stdin=false', '--workdir', '/tmp', NAME, '--',
                      '/bin/bash', '-ec', '/bin/mkdir /tmp/work && /bin/cp -R /srv/submission/. /tmp/work/'], 25)
    require_ok(result, 'working copy')
    return manifest


def inspect(command):
    # Feed commands through stdin so infrastructure tracing only sees this fixed wrapper.
    shell = 'set -o pipefail; timeout -k 1s 12s /bin/bash -s 2>&1 | head -c 6000'
    result = sandbox(['exec', '--env', 'PATH=/usr/local/bin:/usr/bin:/bin',
                      '--env', 'HOME=/tmp/work', '--workdir', '/tmp/work', NAME, '--',
                      '/usr/bin/setpriv', '--no-new-privs', '--', '/bin/bash', '-c', shell],
                     20, command.encode())
    return f'exit {result.returncode}\n' + result.stdout[:6000].decode(errors='replace')


def rounds(until, phase, count, stop_before):
    for turn in range(1, count + 1):
        if time.time() >= until - stop_before:
            break
        try:
            plan = rpc('plan', {'phase': phase, 'turn': turn})
        except RuntimeError:
            if time.time() >= until - stop_before:
                break
            raise
        for index, command in enumerate(plan['commands'], 1):
            if time.time() >= until - (300 if phase == 'inspect' else 65) - 15:
                return
            ref = ('I' if phase == 'inspect' else 'V') + f'{turn:02}-{index}'
            rpc('observe', {'ref': ref, 'command': command, 'output': inspect(command)})
        if turn >= 2 and plan['covered'] and (phase == 'crosscheck' or time.time() >= until-390):
            break


def main():
    probe = os.environ.get('JUDGE_PROBE') == '1'
    claimed = False
    try:
        with tempfile.TemporaryDirectory() as folder:
            inbox = Path(folder) / 'input'
            inbox.mkdir()
            inbox.chmod(0o755)
            if probe:
                (inbox / 'artifact').write_text('cloud-sandbox-fixture\n')
                prepare(inbox, 'fixture.txt')
                result = inspect('cat fixture.txt && touch copy-test && ! (echo changed > /srv/submission/fixture.txt) 2>/dev/null && test -z "$JUDGE_TICKET" && test ! -e /opt/judge/main.py && ! timeout 2 /bin/bash -c "echo > /dev/tcp/169.254.169.254/80" 2>/dev/null')
                if result.strip() != 'exit 0\ncloud-sandbox-fixture':
                    print(repr(result[:400]), flush=True)
                    raise RuntimeError('Sandbox fixture verification failed')
                print('Verified sandbox isolation and read-only original.')
                if RUN and TOKEN:
                    rpc('probe-result', {'output': result})
                    print('Verified Vercel callback and AI scoring.')
                return
            ctx = rpc('claim')
            if not ctx.get('claimed'):
                return
            claimed = True
            until = ctx['until'] / 1000
            digest = hashlib.sha256()
            with (inbox / 'artifact').open('wb') as out:
                for part in range((ctx['size'] + CHUNK - 1) // CHUNK):
                    data = rpc('artifact', chunk=part)
                    out.write(data)
                    digest.update(data)
            if digest.hexdigest() != ctx['digest']:
                raise RuntimeError('Frozen artifact digest mismatch')
            if ctx['tax']:
                (inbox / 'tax.json').write_bytes(Path('/opt/judge/tax-sample.json').read_bytes())
            manifest = prepare(inbox, ctx['filename'])
            rpc('observe', {'ref': 'inventory', 'command': 'File inventory (paths and bytes)', 'output': manifest})
            rounds(until, 'inspect', 20, 325)
            time.sleep(max(0, until - 300 - time.time()))
            rounds(until, 'crosscheck', 5, 100)
            rpc('finalize')
            print('Verified scorecard saved.')
    except Exception as exc:
        if claimed:
            rpc('review', {'issue': str(exc)[:400]})
        raise
    finally:
        try:
            sandbox(['delete', '--force', NAME], 10)
        except (OSError, subprocess.TimeoutExpired):
            pass  # Cloud Run disposes of the instance on task exit.


if __name__ == '__main__':
    main()
