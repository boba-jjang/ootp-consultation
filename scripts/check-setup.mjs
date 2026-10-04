// Checks a local machine against what this repo expects: `pnpm check-setup`.
// It reads files and runs version commands only; it changes nothing.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const STAGING_REF = 'kcmjeivksnptmvemusma';
const PROD_REF = 'piswvhjbbzeogclbulwp';
const CI_SUPABASE_CLI = '2.119.0';

let failures = 0;
const pass = (message) => {
  console.log(`  ok    ${message}`);
};
const warn = (message) => {
  console.log(`  warn  ${message}`);
};
const fail = (message) => {
  failures += 1;
  console.log(`  FAIL  ${message}`);
};

function versionOf(command, args = ['--version']) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim()
      .split('\n')[0];
  } catch {
    return undefined;
  }
}

function readEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !line.trimStart().startsWith('#')) {
      values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return values;
}

console.log('Tools');
const wantedNode = readFileSync(`${root}.nvmrc`, 'utf8').trim();
const nodeMajor = process.versions.node.split('.')[0];
if (nodeMajor === wantedNode) {
  pass(`Node ${process.versions.node}`);
} else {
  fail(
    `Node ${process.versions.node}, but .nvmrc wants ${wantedNode}. Run \`nvm use\` or \`fnm use\`.`,
  );
}

const wantedPnpm = JSON.parse(readFileSync(`${root}package.json`, 'utf8')).packageManager.split(
  '@',
)[1];
const pnpmVersion = versionOf('pnpm');
if (pnpmVersion === wantedPnpm) {
  pass(`pnpm ${pnpmVersion}`);
} else if (pnpmVersion) {
  warn(`pnpm ${pnpmVersion}; the repo pins ${wantedPnpm}. \`corepack enable\` makes them match.`);
} else {
  fail('pnpm not found. Run `corepack enable`, or `npm install -g pnpm@' + wantedPnpm + '`.');
}

if (existsSync(`${root}node_modules/.pnpm`)) {
  pass('Dependencies installed');
} else {
  fail('Dependencies missing. Run `pnpm install`.');
}

console.log('\nApp settings (apps/web/.env.local)');
const envPath = `${root}apps/web/.env.local`;
if (!existsSync(envPath)) {
  fail('apps/web/.env.local is missing. Copy apps/web/.env.example to it and fill in staging.');
} else {
  const env = readEnvFile(envPath);
  const url = env.VITE_SUPABASE_URL ?? '';
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
  const ref = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(url)?.[1];

  if (ref === STAGING_REF) {
    pass(`VITE_SUPABASE_URL points at staging (${ref})`);
  } else if (ref === PROD_REF) {
    fail('VITE_SUPABASE_URL points at production. Local development uses staging.');
  } else if (/^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(url)) {
    pass('VITE_SUPABASE_URL points at a local Supabase stack');
  } else if (ref) {
    warn(`VITE_SUPABASE_URL points at ${ref}, which is neither staging nor production`);
  } else {
    fail('VITE_SUPABASE_URL should look like https://<project-ref>.supabase.co');
  }

  if (key.startsWith('sb_secret_') || key.includes('service_role')) {
    fail(
      'VITE_SUPABASE_PUBLISHABLE_KEY holds a SECRET key. It would ship to the browser: replace it ' +
        'with the publishable key, and rotate the secret key in Supabase.',
    );
  } else if (/^sb_publishable_\S{10,}$/.test(key)) {
    pass('VITE_SUPABASE_PUBLISHABLE_KEY is a publishable key');
  } else {
    fail('VITE_SUPABASE_PUBLISHABLE_KEY should start with sb_publishable_');
  }

  for (const name of Object.keys(env)) {
    if (name.startsWith('VITE_') && /SECRET|PASSWORD|TOKEN|SERVICE_ROLE|PRIVATE/.test(name)) {
      fail(`${name} looks secret, but the VITE_ prefix ships it to the browser`);
    }
  }
}

console.log('\nOptional (database tests only)');
const docker = versionOf('docker');
if (docker) {
  pass(docker);
} else {
  warn('Docker not found. Only needed to run the database tests locally; CI runs them anyway.');
}
const supabase = versionOf('supabase');
if (!supabase) {
  warn(`Supabase CLI not found. Only needed for database tests; CI uses ${CI_SUPABASE_CLI}.`);
} else if (supabase === CI_SUPABASE_CLI) {
  pass(`Supabase CLI ${supabase}`);
} else {
  warn(`Supabase CLI ${supabase}; CI uses ${CI_SUPABASE_CLI}.`);
}

console.log(failures === 0 ? '\nAll required checks passed.' : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
