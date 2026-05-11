import { Command } from 'commander';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { uploadAsset, getApiKey, getCreator } from './upload.js';
import { startDashboard } from './dashboard.js';
import { listUploads, stats, DB_PATH } from './db.js';
import { setupClaude } from './setup-claude.js';

const program = new Command();

program
  .name('roblox-upload')
  .description('Universal Roblox asset uploader (Open Cloud) with local history dashboard.')
  .version('1.0.0');

function expandTargets(inputs) {
  const out = [];
  for (const input of inputs) {
    const abs = resolve(input);
    if (!existsSync(abs)) {
      console.error(`Skipping (not found): ${input}`);
      continue;
    }
    const s = statSync(abs);
    if (s.isDirectory()) {
      for (const entry of readdirSync(abs)) {
        const child = join(abs, entry);
        if (statSync(child).isFile()) out.push(child);
      }
    } else {
      out.push(abs);
    }
  }
  return out;
}

program
  .command('upload')
  .description('Upload one or more assets. Returns JSON with asset IDs.')
  .argument('<files...>', 'File path(s) or directory. Directories are uploaded non-recursively.')
  .option('-c, --creator <creator>', 'user:<id> or group:<id>. Defaults to ROBLOX_CREATOR env var.')
  .option('-t, --asset-type <type>', 'Override inferred asset type (Decal, Audio, Model, Video).')
  .option('-n, --name <name>', 'displayName (single-file uploads only).')
  .option('-d, --description <text>', 'Asset description.')
  .option('--session-label <label>', 'Tag for the dashboard (e.g. "bloom-icons-batch3").')
  .option('--json', 'Emit machine-readable JSON only (no progress chatter).')
  .action(async (files, opts) => {
    try {
      getApiKey();
      getCreator(opts.creator);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }

    const targets = expandTargets(files);
    if (!targets.length) {
      console.error('No files to upload.');
      process.exit(1);
    }

    const results = [];
    for (const file of targets) {
      if (!opts.json) process.stderr.write(`Uploading ${file} ... `);
      try {
        const r = await uploadAsset(file, {
          creator: opts.creator,
          assetType: opts.assetType,
          name: targets.length === 1 ? opts.name : undefined,
          description: opts.description,
          sessionLabel: opts.sessionLabel,
        });
        if (!opts.json) process.stderr.write(`OK assetId=${r.assetId}\n`);
        results.push({ file, status: 'success', assetId: r.assetId, filename: r.filename });
      } catch (e) {
        if (!opts.json) process.stderr.write(`FAILED ${e.message}\n`);
        results.push({ file, status: 'failed', error: e.message });
      }
    }

    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
    const anyFailed = results.some(r => r.status === 'failed');
    process.exit(anyFailed ? 2 : 0);
  });

program
  .command('history')
  .description('Print recent upload history as JSON.')
  .option('-n, --limit <n>', 'Number of rows', '50')
  .option('-s, --status <status>', 'Filter by status: success | failed | pending')
  .option('-q, --search <query>', 'Filter by filename / asset ID / display name')
  .action(opts => {
    const rows = listUploads({
      limit: parseInt(opts.limit) || 50,
      status: opts.status,
      search: opts.search,
    });
    process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
  });

program
  .command('stats')
  .description('Print summary stats.')
  .action(() => {
    process.stdout.write(JSON.stringify({ ...stats(), dbPath: DB_PATH }, null, 2) + '\n');
  });

program
  .command('dashboard')
  .description('Launch the local history dashboard.')
  .option('-p, --port <port>', 'Port', '7787')
  .option('--no-open', 'Do not open the browser automatically.')
  .action(async opts => {
    await startDashboard({
      port: parseInt(opts.port) || 7787,
      openBrowser: opts.open !== false,
    });
  });

program
  .command('check')
  .description('Verify env (API key + creator). Does NOT upload anything.')
  .option('-c, --creator <creator>', 'user:<id> or group:<id>')
  .action(opts => {
    try {
      const key = getApiKey();
      const creator = getCreator(opts.creator);
      console.log('OK');
      console.log(`  ROBLOX_API_KEY  : ${key.slice(0, 4)}...${key.slice(-4)} (${key.length} chars)`);
      console.log(`  Creator         : ${creator.type} ${creator.id}`);
      console.log(`  DB              : ${DB_PATH}`);
    } catch (e) {
      console.error('FAIL');
      console.error(e.message);
      process.exit(1);
    }
  });

program
  .command('setup-claude')
  .description('Install the Claude Code integration on this device (idempotent). Adds a block to ~/.claude/CLAUDE.md so any Claude session knows this CLI exists.')
  .option('--dry-run', 'Print what would change without writing files.')
  .action(opts => {
    const r = setupClaude({ dryRun: !!opts.dryRun });
    for (const a of r.actions) console.log(a);
    if (opts.dryRun) console.log('(dry-run — no files written)');
    else console.log('\nDone. Any new Claude Code session on this device will now auto-discover roblox-upload.');
  });

program.parseAsync(process.argv).catch(e => {
  console.error(e?.stack || e);
  process.exit(1);
});
