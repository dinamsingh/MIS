import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const container = `mis-pilot-test-${randomUUID()}`;
let started = false;
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || result.error?.message);
  return result.stdout;
}
function sqlFile(filename) {
  return docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], readFileSync(filename, 'utf8'));
}
try {
  docker(['run', '--rm', '-d', '--network', 'none', '--name', container, '-e', 'POSTGRES_PASSWORD=isolated-tests-only', 'postgres:17-alpine']);
  started = true;
  docker(['exec', container, 'sh', '-c', 'until pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done']);
  sqlFile(path.join(root, 'tests/database/bootstrap.sql'));
  const snapshot = process.env.MIS_PILOT_SCHEMA_SNAPSHOT;
  if (snapshot) {
    console.log('Schema-only live snapshot; no production data');
    sqlFile(snapshot);
  }
  const files = readdirSync(path.join(root, 'src/data/migrations')).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (snapshot && Number(file.slice(0, 4)) < 58) continue;
    console.log(`Apply ${file}`);
    if (file.startsWith('0058')) sqlFile(path.join(root, 'tests/database/existing-teacher.sql'));
    sqlFile(path.join(root, 'src/data/migrations', file));
  }
  // Reapplication must not reset owner approvals or regress live hardening.
  for (const file of files.filter(f => Number(f.slice(0, 4)) >= 58)) sqlFile(path.join(root, 'src/data/migrations', file));
  const ownerSetup = readFileSync(path.join(root, 'docs/sql/teacher_pilot_owner_setup.sql'), 'utf8');
  const ownerBlock = ownerSetup.slice(ownerSetup.indexOf('do $$'), ownerSetup.lastIndexOf('$$;') + 3)
    .replace("v_email text := 'REPLACE_WITH_VERIFIED_TEACHER_EMAIL';", "v_email text := 'teacher@pilot.test';");
  const testSql = readFileSync(path.join(root, 'tests/database/teacher-pilot.sql'), 'utf8')
    .replace('-- OWNER_SETUP_TEST', () => ownerBlock)
    .replace('-- OWNER_ROLLBACK_TEST', () => {
      const rollback = readFileSync(path.join(root, 'docs/sql/teacher_pilot_rollback.sql'), 'utf8');
      return rollback.slice(rollback.indexOf('do $$'), rollback.lastIndexOf('$$;') + 3)
        .replace("v_email text:='REPLACE_WITH_VERIFIED_TEACHER_EMAIL';", "v_email text:='teacher@pilot.test';");
    });
  console.log(docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], testSql));
} finally {
  if (started) spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' });
}
