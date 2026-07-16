import { describe, expect, it } from "vitest";
import {
  distanceKm, formatDistance, formatDuration, relationshipDays, sameDay,
} from "@/lib/format";

describe("relationshipDays", () => {
  it("counts the start date as day 1", () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(relationshipDays(iso)).toBe(1);
  });

  it("counts yesterday as day 2", () => {
    const y = new Date(Date.now() - 86400000);
    const iso = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
    expect(relationshipDays(iso)).toBe(2);
  });
});

describe("formatDuration", () => {
  it("formats seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(59)).toBe("0:59");
    expect(formatDuration(61)).toBe("1:01");
    expect(formatDuration(600)).toBe("10:00");
  });
});

describe("distance", () => {
  it("computes zero distance for identical points", () => {
    expect(distanceKm(40.7, -74.0, 40.7, -74.0)).toBe(0);
  });

  it("computes a known distance approximately (NYC to LA ~3936 km)", () => {
    const d = distanceKm(40.7128, -74.006, 34.0522, -118.2437);
    expect(d).toBeGreaterThan(3900);
    expect(d).toBeLessThan(3975);
  });

  it("formats close distances as nearby", () => {
    expect(formatDistance(0.1)).toBe("right nearby");
  });
});

describe("sameDay", () => {
  it("detects same and different days", () => {
    expect(sameDay("2026-07-16T01:00:00", "2026-07-16T23:00:00")).toBe(true);
    expect(sameDay("2026-07-16T01:00:00", "2026-07-17T01:00:00")).toBe(false);
  });
});
