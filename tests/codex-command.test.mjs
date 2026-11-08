import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { homedir, tmpdir } from 'node:os';
const fixtureRoot = process.env.BB_THREAD_STORAGE || tmpdir();
import { CallQueue, buildExecArgs, environment, hasCapabilities, loginStatus, parseCodexOutput, run } from '../lib/codex.ts';

test('the child receives prompt on stdin and a minimal credential environment', async () => {
  const dir = await mkdtemp(path.join(fixtureRoot, 'codex-command-'));
  const savedKey = process.env.OPENAI_API_KEY;
  const savedUrl = process.env.OPENAI_BASE_URL;
  try {
    const fake = path.join(dir, 'fake-codex');
    await writeFile(fake, `#!/usr/bin/python3\nimport json,os,sys\nprint(json.dumps({'args':sys.argv[1:],'stdin':sys.stdin.read(),'env_names':sorted(os.environ.keys())}))\n`, { mode: 0o700 });
    process.env.OPENAI_API_KEY = 'synthetic-secret';
    process.env.OPENAI_BASE_URL = 'https://invalid.example';
    const args = buildExecArgs(dir, path.join(dir, 'instructions'), undefined, 'low');
    const result = await run(fake, args, environment(dir), dir, 'synthetic article');
    assert.equal(result.code, 0);
    const capture = JSON.parse(result.out);
    assert.equal(capture.stdin, 'synthetic article');
    assert.ok(!capture.args.some((arg) => arg.includes('synthetic article')));
    for (const flag of ['--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--sandbox']) assert.ok(capture.args.includes(flag), flag);
    assert.ok(capture.args.includes('forced_login_method="chatgpt"'));
    assert.ok(!capture.env_names.includes('OPENAI_API_KEY'));
    assert.ok(!capture.env_names.includes('OPENAI_BASE_URL'));
  } finally {
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
    if (savedUrl === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = savedUrl;
    await rm(dir, { recursive: true, force: true });
  }
});

test('unexpected tool events abort the child', async () => {
  const dir = await mkdtemp(path.join(fixtureRoot, 'codex-tool-'));
  try {
    const fake = path.join(dir, 'fake-codex');
    await writeFile(fake, `#!/usr/bin/python3\nimport json,sys,time\nprint(json.dumps({'type':'item.started','item':{'type':'command_execution'}}),flush=True)\ntime.sleep(10)\n`, { mode: 0o700 });
    await assert.rejects(run(fake, [], environment(dir), dir, '', undefined, true), /unavailable tool/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('cancellation terminates and reaps a running child', async () => {
  const dir = await mkdtemp(path.join(fixtureRoot, 'codex-cancel-'));
  try {
    const fake = path.join(dir, 'fake-codex');
    await writeFile(fake, '#!/usr/bin/python3\nimport time\ntime.sleep(30)\n', { mode: 0o700 });
    const ctrl = new AbortController();
    const pending = run(fake, [], environment(dir), dir, '', ctrl.signal);
    setTimeout(() => ctrl.abort(), 200);
    const result = await pending;
    assert.notEqual(result.code, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('only complete, valid answer events are accepted', () => {
  const answer = JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'fixture answer' } });
  const done = JSON.stringify({ type: 'turn.completed' });
  assert.equal(parseCodexOutput(`${answer}\n${done}\n`), 'fixture answer');
  assert.throws(() => parseCodexOutput(answer), /incomplete/);
  assert.throws(() => parseCodexOutput(done), /incomplete/);
  assert.throws(() => parseCodexOutput('{bad'), /invalid/);
  assert.throws(() => parseCodexOutput(JSON.stringify({ type: 'turn.failed' })), /could not complete/);
  assert.throws(() => parseCodexOutput(JSON.stringify({ type: 'item.completed', item: { type: 'command_execution' } })), /unavailable tool/);
});

test('spawn failures, nonzero exits, and early cancellation are surfaced', async () => {
  const dir = await mkdtemp(path.join(fixtureRoot, 'codex-errors-'));
  try {
    await assert.rejects(run(path.join(dir, 'missing'), [], environment(dir), dir, ''), /ENOENT/);
    const fake = path.join(dir, 'fake-codex');
    await writeFile(fake, '#!/usr/bin/python3\nimport sys\nsys.exit(7)\n', { mode: 0o700 });
    assert.equal((await run(fake, [], environment(dir), dir, '')).code, 7);
    const ctrl = new AbortController(); ctrl.abort();
    await assert.rejects(run(fake, [], environment(dir), dir, '', ctrl.signal), /Stopped/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('CLI status rejects signed-out and synthetic API-key fixtures without changing them', async () => {
  const dir = await mkdtemp(path.join(fixtureRoot, 'codex-status-'));
  try {
    assert.equal(await loginStatus(path.join(homedir(), '.local/bin/codex'), dir), false);
    const auth = path.join(dir, 'auth.json');
    const fixture = JSON.stringify({ OPENAI_API_KEY: 'synthetic-not-real' });
    await writeFile(auth, fixture);
    assert.equal(await loginStatus(path.join(homedir(), '.local/bin/codex'), dir), false);
    assert.equal(await readFile(auth, 'utf8'), fixture);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the two-slot queue supports cancellation while waiting', async () => {
  const queue = new CallQueue();
  const release1 = await queue.acquire();
  const release2 = await queue.acquire();
  const ctrl = new AbortController();
  const third = queue.acquire(ctrl.signal);
  ctrl.abort();
  await assert.rejects(third, /Stopped/);
  const fourth = queue.acquire();
  release1();
  const release4 = await fourth;
  release4(); release2();
  const release5 = await queue.acquire(); release5();
});

test('the process timeout terminates the child', async () => {
  const dir = await mkdtemp(path.join(fixtureRoot, 'codex-timeout-'));
  try {
    const fake = path.join(dir, 'fake-codex');
    await writeFile(fake, '#!/usr/bin/python3\nimport time\ntime.sleep(30)\n', { mode: 0o700 });
    const result = await run(fake, [], environment(dir), dir, '', undefined, false, 100);
    assert.notEqual(result.code, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('CLI capability checks reject wrong versions and missing isolation flags', () => {
  const help = '--ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check --output-schema --json';
  assert.equal(hasCapabilities('codex-cli 0.167.0', help, '0.167.0'), true);
  assert.equal(hasCapabilities('codex-cli 0.146.0', help, '0.167.0'), false);
  assert.equal(hasCapabilities('codex-cli 0.167.0', help.replace('--ignore-rules', ''), '0.167.0'), false);
});
