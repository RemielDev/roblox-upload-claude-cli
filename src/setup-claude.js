import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const BEGIN = '<!-- roblox-upload:begin -->';
const END = '<!-- roblox-upload:end -->';

const BLOCK = `${BEGIN}
## roblox-upload (installed)

The \`roblox-upload\` CLI is installed globally on this device. It uploads files
to Roblox via the Open Cloud Assets API and returns asset IDs, with a local
SQLite history viewable at \`roblox-upload dashboard\` (http://127.0.0.1:7787).

**API key handling — mandatory:**
- The tool deliberately never persists the API key. Every shell session must
  export \`ROBLOX_API_KEY\` explicitly.
- When the user asks for a Roblox upload, run \`roblox-upload check --creator user:<id>\`
  first. If it errors with "ROBLOX_API_KEY is not set", ask the user for their
  key (point them at https://create.roblox.com/dashboard/credentials, Assets
  system, Read+Write, IP allowlisted), then \`$env:ROBLOX_API_KEY = "<key>"\`
  (PowerShell) or \`export ROBLOX_API_KEY=<key>\` (bash).
- Never write the key to disk, memory, .env, settings.json, or anywhere else.
  Never echo it back to the user.

**Commands:**
\`\`\`
roblox-upload check --creator user:<id>
roblox-upload upload <file|dir> --creator user:<id> [--session-label tag] [--json]
roblox-upload history --limit 20
roblox-upload stats
roblox-upload dashboard
\`\`\`

\`upload\` writes JSON to stdout, progress to stderr. Exit 0 = full success, 2 = any failure.
Most asset uploads cost **10 Robux each** — confirm before bulk runs.
Full docs: \`~/Development/roblox-upload/CLAUDE.md\` (if source is checked out locally).
${END}`;

export function setupClaude({ dryRun = false } = {}) {
  const claudeDir = join(homedir(), '.claude');
  const globalMd = join(claudeDir, 'CLAUDE.md');
  const result = { files: [], actions: [] };

  if (!existsSync(claudeDir)) {
    if (dryRun) {
      result.actions.push(`would create: ${claudeDir}`);
    } else {
      mkdirSync(claudeDir, { recursive: true });
      result.actions.push(`created: ${claudeDir}`);
    }
  }

  let existing = '';
  if (existsSync(globalMd)) existing = readFileSync(globalMd, 'utf8');

  let next;
  let action;
  if (existing.includes(BEGIN) && existing.includes(END)) {
    const before = existing.slice(0, existing.indexOf(BEGIN));
    const after = existing.slice(existing.indexOf(END) + END.length);
    next = before + BLOCK + after;
    action = 'updated';
  } else if (existing.trim()) {
    next = existing.replace(/\s+$/, '') + '\n\n' + BLOCK + '\n';
    action = 'appended';
  } else {
    next = BLOCK + '\n';
    action = 'created';
  }

  const verb = { updated: 'update', appended: 'append', created: 'create' }[action];
  if (dryRun) {
    result.actions.push(`would ${verb} block in: ${globalMd}`);
  } else {
    writeFileSync(globalMd, next, 'utf8');
    result.actions.push(`${action} block in: ${globalMd}`);
  }
  result.files.push(globalMd);

  return result;
}
