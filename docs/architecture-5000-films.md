# MetroVision at Scale: 5,000 Film Analysis Architecture

*A technical architecture document for processing 5,000 films through the MetroVision cinematography analysis pipeline within 14 days at $2,500 budget with 85%+ accuracy.*

---

## The Math

**Scale assumptions:**
- 5,000 films × ~100 shots per film = **500,000 shots**
- Average film: 90 minutes, ~400MB, ~80-150 shots
- Total video: ~2TB of source material
- Total clips: ~500,000 clips × ~2MB each = ~1TB of extracted clips
- Total thumbnails: ~500,000 × ~30KB = ~15GB

**Time budget:**
- 14 days = 336 hours = 1,209,600 seconds
- 500,000 shots / 1,209,600 seconds = **0.41 shots/second sustained throughput**
- With 50% utilization buffer: need **~1 shot/second peak capacity**

**Cost budget: $2,500**

| Component | Estimated Cost | Notes |
|-----------|---------------|-------|
| Gemini Batch API (classification) | $800-1,200 | 500K shots × $0.002/shot (batch pricing) |
| Modal compute (detect + extract) | $300-500 | ~2,000 GPU-hours at $0.15-0.25/hr |
| S3 storage (3TB total) | $70 | Standard tier |
| Neon Pro database | $40 | 14 days of Pro |
| OpenAI embeddings (500K) | $25 | text-embedding-3-small |
| Redis queue (Upstash) | $10 | Serverless, pay-per-command |
| Vercel Pro | $20 | Web app hosting |
| Human QA (Mechanical Turk / Scale AI) | $200-400 | ~10,000 flagged shots at $0.03/shot |
| Monitoring (Axiom free tier) | $0 | Logging + alerts |
| **Total** | **$1,465-2,265** | Under budget with margin |

---

## Architecture

```
                    ┌──────────────────────────────────────────────────┐
                    │                 CONTROL PLANE                    │
                    │           (Vercel + Next.js app)                │
                    │                                                  │
                    │  /admin/batch     — Submit batch jobs            │
                    │  /admin/monitor   — Pipeline dashboard           │
                    │  /admin/qa        — Human review queue           │
                    │  /agent           — Agent MetroVision            │
                    │  /visualize       — D3 analytics                 │
                    └─────────────┬────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │      JOB QUEUE            │
                    │   (Upstash Redis +        │
                    │    BullMQ / Inngest)       │
                    │                           │
                    │  Queue: film-detect       │
                    │  Queue: shot-extract      │
                    │  Queue: shot-classify     │
                    │  Queue: shot-embed        │
                    │  Queue: human-review      │
                    └──┬──────┬──────┬──────┬───┘
                       │      │      │      │
          ┌────────────┘      │      │      └────────────┐
          ▼                   ▼      ▼                    ▼
┌─────────────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────┐
│  DETECT WORKERS │ │ EXTRACT  │ │  CLASSIFY    │ │  EMBED       │
│  (Modal, CPU)   │ │ WORKERS  │ │  (Gemini     │ │  (OpenAI     │
│                 │ │ (Modal)  │ │   Batch API) │ │   Batch API) │
│  10 concurrent  │ │          │ │              │ │              │
│  PySceneDetect  │ │ 50 conc. │ │  Async batch │ │  Async batch │
│  + FFprobe      │ │ FFmpeg   │ │  submissions │ │  submissions │
│                 │ │ → S3     │ │  per 1000    │ │  per 5000    │
└────────┬────────┘ └────┬─────┘ └──────┬───────┘ └──────┬───────┘
         │               │              │                 │
         └───────┬───────┘              │                 │
                 ▼                      ▼                 ▼
         ┌───────────────┐     ┌────────────────┐  ┌───────────┐
         │     S3        │     │  Neon Postgres  │  │  pgvector │
         │  (3TB video)  │     │  (metadata)     │  │ (embeds)  │
         └───────────────┘     └────────────────┘  └───────────┘
```

---

## The 4 Pipeline Stages

### Stage 1: DETECT (CPU-bound, parallelizable per film)

**What:** Run PySceneDetect on each film to find shot boundaries.

**Infrastructure:** Modal with `cpu=2` containers, 10 running concurrently.

**Throughput:**
- Content detector: ~2 min per 90-min film with downscale
- 10 concurrent = ~5 films/min = **300 films/hour**
- 5,000 films = **~17 hours**

**Output:** For each film, a list of `{ start, end, index }` splits written to the `shots` table with status `"detected"`.

**Implementation:**
```python
# Modal function
@app.function(cpu=2, memory=4096, timeout=600)
def detect_film(s3_url: str, film_id: str):
    # Download via ffmpeg remux
    # Run scenedetect detect-content -d 4 -t 27
    # Parse CSV, write splits to Neon
    # Enqueue extract jobs for each split
```

### Stage 2: EXTRACT (I/O-bound, highly parallelizable)

**What:** For each detected shot, extract a video clip + thumbnail, upload to S3.

**Infrastructure:** Modal with 50 concurrent containers, each processing one shot.

**Throughput:**
- ~1.5s per shot (FFmpeg copy + S3 upload)
- 50 concurrent = ~33 shots/second = **120,000 shots/hour**
- 500,000 shots = **~4 hours**

**Output:** S3 keys for clip and thumbnail written to the `shots` table. Shot status updated to `"extracted"`.

**Implementation:**
```python
@app.function(cpu=1, memory=2048, timeout=120)
def extract_shot(s3_url: str, shot_id: str, start: float, end: float, film_slug: str):
    # FFmpeg: extract clip (-c copy) + thumbnail (scale=320)
    # Upload both to S3
    # Update shot record with S3 keys
    # Enqueue classify job
```

### Stage 3: CLASSIFY (API-bound, batch-optimized)

**What:** Send each shot clip to Gemini for cinematography classification.

**Infrastructure:** Gemini Batch API — submit jobs of 1,000 clips, results returned asynchronously.

**Throughput:**
- Batch API processes ~1,000 shots per batch
- ~500 batches total
- Each batch completes in ~10-30 min
- Run 20 batches concurrently
- 500,000 shots = **~12-24 hours**

**Cost optimization:** Batch API is 50% cheaper than individual calls. At ~$0.002/shot = **$1,000 for 500K shots**.

**Output:** Classification JSON written to `shot_metadata` and `shot_semantic` tables. Shot status updated to `"classified"`.

**Accuracy pipeline:**
1. Gemini classifies with `responseMimeType: "application/json"`
2. Post-processing rules validate (e.g., whip_pan can't be > 5s, oner must be > 120s)
3. If classification confidence is low OR rules fail → flag for human review
4. Status: `"classified"` or `"needs_review"`

**Implementation:**
```python
@app.function(cpu=1, timeout=3600)
def submit_classify_batch(shot_ids: list[str]):
    # Fetch S3 clip URLs for batch
    # Build Gemini batch request (1000 clips)
    # Submit to Gemini Batch API
    # Poll for completion
    # Parse results, validate, write to DB
    # Flag low-confidence shots for human review
```

### Stage 4: EMBED + ENRICH (API-bound, batch-optimized)

**What:** Generate search embeddings + scene grouping for each film.

**Infrastructure:** OpenAI Batch API for embeddings, custom logic for scene grouping.

**Throughput:**
- OpenAI batch: 50,000 embeddings per batch, ~$0.00004/embedding
- 500,000 embeddings = **10 batches, ~$20**
- Scene grouping: group consecutive shots by Gemini's `scene_title`
- ~5 min per film × 5,000 films / 10 concurrent = **~42 hours**

**Output:** Embeddings in `shot_embeddings`, scenes in `scenes` table.

---

## Accuracy Strategy: 85%+ Guarantee

**Layer 1: LLM Classification (Gemini) — ~80% base accuracy**

Gemini 2.5 Flash is accurate for clear movements (static, pan, tilt, dolly) but struggles with:
- Compound movements (steadicam + tilt)
- Ambiguous handheld vs. steadicam
- Subtle rack focus
- Edge cases (slow pan vs. static with subject movement)

**Layer 2: Validation Rules — catches ~5% of errors**

Post-processing rules that flag impossible classifications:

```
IF duration < 1s AND movement_type NOT IN (whip_pan, whip_tilt, rack_focus) → FLAG
IF duration > 60s AND duration_cat != "long_take" AND duration_cat != "oner" → FIX
IF is_compound = true AND compound_parts is empty → FLAG
IF movement_type = "dolly_zoom" AND speed = "freeze" → FLAG
IF shot_size = "extreme_wide" AND angle_vertical = "worms_eye" → FLAG (rare combo)
```

Auto-fix clear errors, flag ambiguous ones.

**Layer 3: Human Review — covers the remaining ~10%**

**Estimated human review volume:**
- ~10% of 500,000 = 50,000 shots flagged
- At $0.03/shot (Scale AI or Mechanical Turk): **$1,500**
- BUT: we can reduce this by only reviewing the most impactful errors

**Smart prioritization:**
1. Review flagged shots from validation rules first (~25,000)
2. Sample 5% of "confident" classifications for spot-check (~25,000)
3. Skip review for high-confidence static shots (they're almost always right)

**Estimated actual review needed:** ~10,000-15,000 shots = **$300-450**

**Human review interface:**
- Modified `/verify` page with batch mode
- Show: video clip + Gemini's classification + confidence flags
- Reviewer: confirm, correct, or skip
- Target: 30 shots/minute per reviewer = 500 shots/hour
- 2 reviewers × 8 hours/day × 5 days = 40,000 shots reviewed
- More than enough to cover flagged shots

**Combined accuracy: 85-90%**

| Layer | Accuracy contribution |
|-------|----------------------|
| Gemini base | ~80% correct |
| Validation rules | +3% (auto-fix obvious errors) |
| Human review (flagged) | +4% (correct the ambiguous ones) |
| **Total** | **~87%** |

---

## Execution Timeline: 14 Days

### Week 1: Infrastructure + Pipeline Run

**Day 1-2: Infrastructure Setup**
- [ ] Set up Modal account, deploy detect/extract functions
- [ ] Set up Upstash Redis + BullMQ job queues
- [ ] Set up Gemini Batch API access (requires Google Cloud project)
- [ ] Provision Neon Pro database
- [ ] Create S3 bucket structure: `films/{slug}/source/`, `films/{slug}/clips/`, `films/{slug}/thumbnails/`
- [ ] Build batch submission UI (`/admin/batch`)
- [ ] Build pipeline monitoring dashboard (`/admin/monitor`)

**Day 2-3: Film Sourcing + Ingestion**
- [ ] Source 5,000 films (Internet Archive, public domain, licensed collections)
- [ ] Create film manifest CSV: `title, director, year, s3_url`
- [ ] Upload source films to S3 (can run overnight, ~2TB)
- [ ] Insert film records into Neon with TMDB enrichment

**Day 3-4: Detection Run**
- [ ] Submit 5,000 detect jobs to Modal
- [ ] Monitor: ~300 films/hour, expect completion in ~17 hours
- [ ] Handle failures: retry queue catches timeouts and corrupt files
- [ ] Validate: spot-check 50 films for reasonable shot counts

**Day 4-5: Extraction Run**
- [ ] Extraction starts automatically as detection completes (queue-driven)
- [ ] 50 concurrent extractors: 500K shots in ~4 hours
- [ ] Monitor S3 upload success rate
- [ ] Validate: spot-check clips play correctly

**Day 5-7: Classification Run**
- [ ] Submit Gemini batch jobs (500 batches of 1,000)
- [ ] 20 concurrent batches: ~12-24 hours total
- [ ] Run validation rules on completed batches
- [ ] Flag shots for human review
- [ ] Generate embeddings via OpenAI Batch API

### Week 2: Human QA + Polish

**Day 8-10: Human Review**
- [ ] Deploy batch review interface
- [ ] 2 reviewers process flagged shots (target: 500/hour each)
- [ ] ~10,000-15,000 shots reviewed over 3 days
- [ ] Corrections written back to database

**Day 11-12: Scene Grouping + Enrichment**
- [ ] Run scene grouping algorithm (group by Gemini's scene_title)
- [ ] Compute film-level coverage stats
- [ ] Generate search embeddings for any corrected shots
- [ ] Run accuracy audit: sample 1,000 shots, manually verify → measure actual accuracy %

**Day 13: Validation + Testing**
- [ ] Full accuracy audit: random sample of 500 shots across 50 films
- [ ] Verify all pages work: /browse, /film/[id], /visualize, /agent
- [ ] Performance test: browse page loads < 3s with 500K shots
- [ ] Agent MetroVision test: verify it can query and compare across 5K films
- [ ] Database optimization: add indexes, vacuum, analyze

**Day 14: Launch**
- [ ] Final QA pass
- [ ] Deploy to production Vercel
- [ ] Document the dataset: total shots, accuracy %, coverage
- [ ] Write the blog post

---

## Database Schema Changes for Scale

**New tables:**

```sql
-- Job tracking
CREATE TABLE pipeline_jobs (
  id UUID PRIMARY KEY,
  film_id UUID REFERENCES films(id),
  stage TEXT NOT NULL, -- 'detect', 'extract', 'classify', 'embed', 'review'
  status TEXT NOT NULL, -- 'queued', 'running', 'completed', 'failed', 'needs_review'
  worker_id TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error TEXT,
  metadata JSONB
);

-- Classification confidence + review tracking
ALTER TABLE shot_metadata ADD COLUMN confidence REAL; -- 0-1
ALTER TABLE shot_metadata ADD COLUMN review_status TEXT DEFAULT 'unreviewed';
-- 'unreviewed', 'auto_validated', 'human_verified', 'human_corrected'
ALTER TABLE shot_metadata ADD COLUMN validation_flags TEXT[]; -- ['duration_mismatch', 'rare_combo', ...]
```

**Indexes for 500K shots:**
```sql
CREATE INDEX idx_shots_film_id ON shots(film_id);
CREATE INDEX idx_shots_scene_id ON shots(scene_id);
CREATE INDEX idx_shot_metadata_movement ON shot_metadata(movement_type);
CREATE INDEX idx_shot_metadata_review ON shot_metadata(review_status);
CREATE INDEX idx_pipeline_jobs_status ON pipeline_jobs(status, stage);
```

---

## Monitoring Dashboard (`/admin/monitor`)

Real-time view of the pipeline:

```
╔══════════════════════════════════════════════════════╗
║  PIPELINE STATUS — Day 5 of 14                      ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  DETECT     ████████████████████ 5000/5000 (100%)   ║
║  EXTRACT    ████████████████░░░░ 412,000/500,000    ║
║  CLASSIFY   ██████████░░░░░░░░░░ 245,000/500,000   ║
║  EMBED      ████░░░░░░░░░░░░░░░░ 100,000/500,000   ║
║  QA REVIEW  ░░░░░░░░░░░░░░░░░░░░ 0/12,400 flagged  ║
║                                                      ║
║  Throughput: 0.8 shots/sec | ETA: 3d 4h             ║
║  Failures: 23 (0.005%) | Flagged: 12,400 (2.5%)    ║
║  Cost so far: $1,247 / $2,500 budget                ║
║                                                      ║
║  Top errors:                                        ║
║    • Gemini timeout: 18                              ║
║    • FFmpeg decode error: 3                          ║
║    • S3 upload failure: 2 (retried)                 ║
╚══════════════════════════════════════════════════════╝
```

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Gemini rate limiting | Medium | High | Batch API avoids per-request limits. Fallback: Claude API |
| Corrupt source files | Low | Low | FFprobe validation before detection. Skip + log |
| PySceneDetect misses cuts | Medium | Medium | Post-hoc: if ASL > 30s, re-run with adaptive detector |
| Cost overrun | Low | Medium | Budget alerts at $500 intervals. Pause if trending over |
| Database performance | Medium | Medium | Batch inserts, connection pooling, proper indexes |
| Human reviewer fatigue | Medium | Low | Cap at 4 hours/day, rotate between reviewers |
| Timeline slip | Medium | Medium | Days 1-7 are parallelizable. Buffer built into week 2 |

---

## Film Sourcing Strategy

For 5,000 films, you need a sourcing plan:

**Tier 1: Public Domain (free, ~1,000 films)**
- Internet Archive: ~2,000+ feature films in public domain
- Filter: pre-1928 automatically public domain
- Quality: variable (some are 240p, skip those)

**Tier 2: Educational/Research License (~2,000 films)**
- Criterion Channel API (if you negotiate research access)
- University film library partnerships
- BFI National Archive (research access)

**Tier 3: Director-focused collections (~2,000 films)**
- Complete filmographies of 50-100 directors
- Focus on directors with distinct visual styles (maximizes analytical value)
- Sources: digital purchases, Blu-ray rips (educational use)

**Manifest format:**
```csv
title,director,year,source_url,source_type,license
"Battleship Potemkin","Sergei Eisenstein",1925,"s3://films/potemkin.mp4","internet_archive","public_domain"
"2001: A Space Odyssey","Stanley Kubrick",1968,"s3://films/2001.mp4","purchased","educational"
```

---

## What This Unlocks

With 5,000 films analyzed:

1. **The largest structured cinematography dataset in existence.** No one has 500K shots with classified camera movement, shot size, pacing data, and scene structure.

2. **Director style fingerprinting.** With 50+ films per director, you can statistically characterize visual styles and spot influences across generations.

3. **Film school in a database.** Agent MetroVision becomes genuinely useful — it can back up every claim with data from thousands of films.

4. **API/MCP as a product.** Other tools (ComfyUI, Runway, film researchers) could query this data. The dataset itself becomes valuable.

5. **The LinkedIn article writes itself.** "We analyzed 5,000 films with AI. Here's what we learned about how directors actually use cameras."

---

## Next Steps

1. **Decide on Modal vs. self-hosted** for compute (I recommend Modal — zero ops)
2. **Set up Google Cloud project** for Gemini Batch API access
3. **Start with a 50-film pilot** to validate accuracy numbers before committing to 5,000
4. **Source the film manifest** — this is the longest lead-time item

Want me to build the 50-film pilot pipeline?
