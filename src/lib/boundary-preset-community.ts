/**
 * Invariant for `GET /api/boundary-presets?forIngest=1` — must match SQL in
 * `listBoundaryCutPresets(..., { forCommunityIngest: true })`.
 */
export function isPresetListedForCommunityIngest(row: {
  isArchived: boolean;
  isSystem: boolean;
  shareWithCommunity: boolean;
}): boolean {
  if (row.isArchived) return false;
  return row.isSystem || row.shareWithCommunity;
}
