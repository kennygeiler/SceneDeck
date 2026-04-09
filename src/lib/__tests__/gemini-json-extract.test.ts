import { describe, expect, it } from "vitest";

import { extractFirstJsonObject } from "../gemini-json-extract";

describe("extractFirstJsonObject", () => {
  it("extracts first object when trailing prose exists", () => {
    const raw = `Here you go: {"a":1,"b":"x"} thanks`;
    expect(extractFirstJsonObject(raw)).toBe('{"a":1,"b":"x"}');
  });

  it("ignores braces inside strings", () => {
    const raw = `{"msg": "use } carefully", "ok": true}`;
    expect(extractFirstJsonObject(raw)).toBe(raw.trim());
  });

  it("returns first object only when two objects are adjacent", () => {
    const raw = '{"x":1}{"y":2}';
    expect(extractFirstJsonObject(raw)).toBe('{"x":1}');
  });
});
