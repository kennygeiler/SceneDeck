# Gold-set evaluation checklist (Phase E)

Use when you need measured accuracy for teaching or partnerships—not required for informal learning use.

1. **Select 3–5 reference films** spanning genre/era; obtain rights for annotation if exporting.
2. **Define slots to score:** e.g. shot boundaries (±0.5s), shot_size, framing, angle_vertical.
3. **Double-annotate** a random 150–300 shot subset; compute agreement (Cohen’s κ or % exact match).
4. **Compare pipeline:** run current ingest; compute boundary F1 and per-slot accuracy vs consensus.
5. **Version control:** pin `ingest_provenance.pipeline_version`, `taxonomy_hash`, and model ids in the eval log.
6. **Re-run** after major detector or prompt changes to ensure monotonic improvement on the same gold slice.

*Placeholder created 2026-04-07 — expand with institution-specific rubrics as needed.*
