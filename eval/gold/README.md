# Gold eval JSON

Place boundary gold files here so paths stay stable across machines and docs.

## `gold-ran-2026-04-10.json` (in repo)

Hand cuts from **gold annotate** for **Ran** (1985), `timeOffsetSec: 0`, reference file **`Ran_1985.mp4`**.

- **Interior cuts:** 71 (`cutsSec` entries).
- **Last cut:** 763.222 s — gold spans **~12.7 minutes** (~764 s of annotated timeline), not 0–720. For `detect:export-cuts` / timeline ingest use **`--start 0 --end 780`** (or higher if your last shot extends past 780 s; end must clear the final shot).
- **Fair eval:** The **source file must be long enough** (~**764 s** minimum) to cover all gold instants. A shorter transcode inflates **FN** for cuts past `duration`. See **[`eval/runs/STATUS.md`](../runs/STATUS.md)** for the length-matched baseline pred JSON.

**Detect-only eval** (same timebase as `Ran_1985.mp4` from t=0). From repo root, with deps installed (`npm install` or `pnpm install`):

```bash
# pnpm (if installed)
pnpm detect:export-cuts -- /path/to/Ran_1985.mp4 --start 0 --end 780 \
  --gold eval/gold/gold-ran-2026-04-10.json --tol 0.5 \
  --out eval/predicted/ran-detect-latest.json --ledger --run-id ran-gold-2026-04-10

# npm only (no pnpm on machine)
npm run detect:export-cuts -- /path/to/Ran_1985.mp4 --start 0 --end 780 \
  --gold eval/gold/gold-ran-2026-04-10.json --tol 0.5 \
  --out eval/predicted/ran-detect-latest.json --ledger --run-id ran-gold-2026-04-10
```

Shape: `cutsSec` on the **same** clock as the source file. See `template.json`.
