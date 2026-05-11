# roblox-upload — CLAUDE Instructions

This is a universal CLI + dashboard that uploads files to Roblox via the Open Cloud Assets API and returns asset IDs. It is installed globally on this machine. Use it whenever you need to upload an image, audio, model, or video asset to Roblox and get back an asset ID.

## CRITICAL: API key handling

**The user's API key is NEVER stored on disk by this tool.** Every new shell/Claude session must explicitly export `ROBLOX_API_KEY`. This is a deliberate security choice — do not work around it.

**At the start of any session that needs to upload, you MUST:**

1. Check whether the env var is set: `roblox-upload check --creator user:<id>` (or group:<id>).
2. If it errors with "ROBLOX_API_KEY is not set", **ask the user for the key** with a message like:
   > I need your Roblox Open Cloud API key for this session. It will only live in this shell — the tool never writes it to disk. Get one at https://create.roblox.com/dashboard/credentials with the **Assets** API system, Read+Write, and your IP allowlisted.
3. Once they paste it, export it for the current shell:
   - PowerShell: `$env:ROBLOX_API_KEY = "<key>"`
   - bash: `export ROBLOX_API_KEY=<key>`
4. Re-run `roblox-upload check` to confirm.

Do **not** persist the key to `.env` files, `settings.json`, memory, or anywhere else. Do **not** echo it back to the user. If you must reference it in logs, mask all but the first/last 4 chars.

## Commands

```bash
# Verify env without uploading
roblox-upload check --creator user:12345

# Single file
roblox-upload upload ./icon.png --creator user:12345

# Many files (directory, non-recursive)
roblox-upload upload ./icons --creator user:12345 --session-label "bloom-icons-batch3"

# Glob (let the shell expand)
roblox-upload upload ./icons/*.png --creator user:12345

# JSON-only output (good for piping/parsing)
roblox-upload upload ./icon.png --creator user:12345 --json

# Recent history (JSON)
roblox-upload history --limit 20

# Summary stats
roblox-upload stats

# Open the dashboard (http://127.0.0.1:7787)
roblox-upload dashboard
```

`--creator` accepts `user:<userId>` or `group:<groupId>`. You can also set `ROBLOX_CREATOR=user:<id>` once per session to skip the flag.

## Output contract

`upload` writes a JSON array to stdout. Each entry: `{ file, status, assetId?, filename?, error? }`. Exit code is `0` on full success, `2` on any failure. Progress lines go to stderr — they do not pollute stdout JSON.

## Defaults & inference

- `.png .jpg .jpeg .bmp .tga` → `Decal` (this is what gives you the image asset ID Roblox uses)
- `.mp3 .ogg` → `Audio`
- `.fbx` → `Model`
- `.mp4 .mov` → `Video`

Override with `--asset-type` if Roblox requires a different one for a specific use case.

## Cost & gotchas

- Most asset uploads cost **10 Robux** each on the user's account. Confirm with the user before doing large bulk uploads.
- API keys are **IP-allowlisted**. If you see a 401/403 about IP, the user needs to add their current public IP to the key.
- `Decal` is the right type for image assets used in Roblox UI (`ImageLabel.Image`, `Decal.Texture`, etc.). The returned asset ID is what you put in those properties.

## Where things live

- Source: `~/Development/roblox-upload/`
- DB + logs: `~/.roblox-upload/data.db` (SQLite, WAL)
- Dashboard: `http://127.0.0.1:7787` when running

## Tracking work

Use `--session-label "<short-tag>"` on bulk uploads so the user can filter the dashboard later by what was uploaded as part of which task (e.g. `bloom-boost-icons-2026-05`, `styleit-product-thumbs-batch7`).
