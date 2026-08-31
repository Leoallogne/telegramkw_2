import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envFile = path.join(root, '.env.local');
const pkgFile = path.join(root, 'package.json');

function readEnv() {
  if (!fs.existsSync(envFile)) {
    return {};
  }

  const content = fs.readFileSync(envFile, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    env[key] = value.replace(/^['"]|['"]$/g, '');
  }
  return env;
}

async function checkSupabase(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasKeys = Boolean(url && anon);
  const status = {
    envReady: hasKeys,
    url,
    anonKeyPresent: Boolean(anon),
    runtime: 'unknown',
    diagnosis: 'unknown'
  };

  if (!hasKeys) {
    status.diagnosis = 'Missing project credentials. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.';
    console.log('Supabase env: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return status;
  }

  try {
    const res = await fetch(`${url}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        Accept: 'application/json'
      }
    });
    status.runtime = res.status;

    if (res.status === 401) {
      status.diagnosis = 'Unauthorized: project URL or anon key does not match the active Supabase project, or credentials are stale.';
    } else if (res.ok) {
      status.diagnosis = 'Supabase credentials are valid for this project and REST endpoint is reachable.';
    } else {
      status.diagnosis = `Unexpected response status ${res.status}. Check project settings and URL.`;
    }

    console.log(`Supabase REST check: status ${res.status} (${res.ok ? 'OK' : 'NOT OK'})`);
    console.log(`Diagnosis: ${status.diagnosis}`);
  } catch (err) {
    status.runtime = 'error';
    status.diagnosis = 'Network or DNS issue while contacting Supabase REST endpoint.';
    console.error('Supabase REST check failed:', err.message);
  }

  return status;
}

async function checkVercel() {
  let vercelReady = false;
  const packageJson = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  const hasVercelCli = Boolean(packageJson.devDependencies?.vercel || packageJson.dependencies?.vercel);

  const vercelDir = path.join(root, '.vercel');
  const repoJsonPath = path.join(vercelDir, 'repo.json');
  const projectJsonPath = path.join(vercelDir, 'project.json');
  const linked = fs.existsSync(repoJsonPath) || fs.existsSync(projectJsonPath);

  let linkedInfo = { projectLinked: false, projectName: null };
  if (linked && fs.existsSync(repoJsonPath)) {
    try {
      const repoData = JSON.parse(fs.readFileSync(repoJsonPath, 'utf8'));
      const project = repoData.projects?.[0];
      if (project) {
        linkedInfo = {
          projectLinked: true,
          projectName: project.name || null
        };
      }
    } catch (err) {
      console.warn('Failed to parse .vercel/repo.json:', err.message);
    }
  }

  try {
    const { execSync } = await import('node:child_process');
    const output = execSync('npx vercel --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    vercelReady = Boolean(output && output.trim());
    console.log(`Vercel CLI: ${output.trim()}`);
  } catch (err) {
    console.error('Vercel CLI check failed:', err.message);
  }

  return {
    cliInstalled: hasVercelCli,
    cliWorking: vercelReady,
    projectLinked: linkedInfo.projectLinked,
    projectName: linkedInfo.projectName,
    note: linkedInfo.projectLinked
      ? 'Vercel project is linked and local metadata is present.'
      : 'Run "npx vercel" in the project folder to link a Vercel project and enable deployment monitoring.'
  };
}

async function main() {
  const env = readEnv();
  const mode = process.argv[2] || 'all';

  console.log('=== Integration health check ===');
  console.log('Mode:', mode);

  if (mode === 'supabase' || mode === 'all') {
    const supabaseStatus = await checkSupabase(env);
    console.log('Supabase status:', JSON.stringify(supabaseStatus, null, 2));
  }

  if (mode === 'vercel' || mode === 'all') {
    const vercelStatus = await checkVercel();
    console.log('Vercel status:', JSON.stringify(vercelStatus, null, 2));
  }
}

main().catch((err) => {
  console.error('Health check failed:', err);
  process.exit(1);
});
