import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}
function redact(text, secrets) {
  let output = String(text ?? '');
  for (const secret of secrets.filter((value) => typeof value === 'string' && value.length > 0)) {
    output = output.split(secret).join('[REDACTED]');
  }
  return output.trim();
}

export function resolveFreeMoteTools(project) {
  const root = project.paths.freeMote;
  if (typeof root !== 'string') throw new Error('freemote-info-psb requires paths.freeMote');
  const config = project.config.adapterConfig?.tool ?? {};
  const names = {
    decompiler: config.decompiler ?? 'PsbDecompile.exe',
    builder: config.builder ?? 'PsBuild.exe',
    converter: config.converter ?? 'EmtConvert.exe',
  };
  const tools = {};
  for (const [id, name] of Object.entries(names)) {
    if (typeof name !== 'string' || name.length === 0 || path.basename(name) !== name) {
      throw new Error(`adapterConfig.tool.${id} must be a file name inside paths.freeMote`);
    }
    const file = path.resolve(root, name);
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
      throw new Error(`tool path escapes paths.freeMote: ${name}`);
    }
    if (!fs.existsSync(file)) throw new Error(`FreeMote tool not found: ${name}`);
    const expected = config.hashes?.[id];
    if (expected !== undefined) {
      if (typeof expected !== 'string' || !/^[A-Fa-f0-9]{64}$/.test(expected)) {
        throw new Error(`adapterConfig.tool.hashes.${id} must be a SHA-256 hex string`);
      }
      if (sha256(file) !== expected.toUpperCase()) throw new Error(`FreeMote tool hash mismatch: ${name}`);
    }
    tools[id] = file;
  }
  return tools;
}

export function createToolRunner({ spawn = spawnSync } = {}) {
  return ({ executable, args, cwd, label, secrets = [] }) => {
    const result = spawn(executable, args, {
      cwd,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      stdio: 'pipe',
    });
    if (result.error) throw new Error(`${label} could not start: ${redact(result.error.message, secrets)}`);
    if (result.status !== 0) {
      const detail = redact(result.stderr || result.stdout, secrets);
      throw new Error(`${label} failed with exit code ${result.status}${detail ? `: ${detail}` : ''}`);
    }
    return { stdout: redact(result.stdout, secrets), stderr: redact(result.stderr, secrets) };
  };
}
