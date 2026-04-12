import { describe, expect, it } from "vitest";

import { isPresetListedForCommunityIngest } from "@/lib/boundary-preset-community";

describe("isPresetListedForCommunityIngest", () => {
  it("excludes archived", () => {
    expect(
      isPresetListedForCommunityIngest({
        isArchived: true,
        isSystem: true,
        shareWithCommunity: true,
      }),
    ).toBe(false);
  });

  it("includes system even when not explicitly community-shared", () => {
    expect(
      isPresetListedForCommunityIngest({
        isArchived: false,
        isSystem: true,
        shareWithCommunity: false,
      }),
    ).toBe(true);
  });

  it("includes community when not system", () => {
    expect(
      isPresetListedForCommunityIngest({
        isArchived: false,
        isSystem: false,
        shareWithCommunity: true,
      }),
    ).toBe(true);
  });

  it("excludes private non-system", () => {
    expect(
      isPresetListedForCommunityIngest({
        isArchived: false,
        isSystem: false,
        shareWithCommunity: false,
      }),
    ).toBe(false);
  });
});
