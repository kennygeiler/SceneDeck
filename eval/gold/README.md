# Gold eval JSON

Place boundary gold files here so paths stay stable across machines and docs.

**Ran (1985), hand cuts:** copy your export to:

`eval/gold/gold-ran-2026-04-10.json`

```bash
# From your Mac (example)
cp ~/Downloads/gold-ran-2026-04-10.json eval/gold/gold-ran-2026-04-10.json
```

Shape: `cutsSec` (interior hard cuts, seconds) on the **same timebase** as the video you pass to `detect:export-cuts` or ingest. See `template.json`.

**Detect-only eval** (after the file exists in this folder):

```bash
pnpm detect:export-cuts -- /path/to/Ran.mkv \
  --gold eval/gold/gold-ran-2026-04-10.json --tol 0.5 \
  --out eval/predicted/ran-detect-latest.json --ledger --run-id ran-gold-2026-04-10
```

Set `--start` / `--end` to match the segment your gold was annotated on (e.g. first 12 minutes: `--start 0 --end 720` if gold times are film-absolute 0–720).
