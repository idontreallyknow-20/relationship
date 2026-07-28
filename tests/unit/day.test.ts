import { describe, expect, it } from "vitest";
import {
  addDays, daysBetween, dayIn, endOfDayIn, labelDay, msUntilNextDay, startOfDayIn, todayIn,
} from "@/lib/day";

// The daily question rolls over on the couple's day, not the device's. These
// tests pin that behavior down, including across a daylight saving change.

describe("dayIn", () => {
  it("uses the given timezone, not the process timezone", () => {
    // 2026-03-15T02:30Z is still the 14th in New York and already the 15th in Tokyo.
    const instant = Date.parse("2026-03-15T02:30:00Z");
    expect(dayIn("America/New_York", instant)).toBe("2026-03-14");
    expect(dayIn("Asia/Tokyo", instant)).toBe("2026-03-15");
  });

  it("falls back to the default timezone when given nonsense", () => {
    const instant = Date.parse("2026-03-15T02:30:00Z");
    expect(dayIn("Not/AZone", instant)).toBe("2026-03-14");
  });
});

describe("startOfDayIn", () => {
  it("returns the instant a day begins in that timezone", () => {
    // New York is UTC-4 in July, so the day starts at 04:00Z.
    expect(startOfDayIn("America/New_York", "2026-07-04").toISOString()).toBe(
      "2026-07-04T04:00:00.000Z",
    );
    // And UTC-5 in January.
    expect(startOfDayIn("America/New_York", "2026-01-04").toISOString()).toBe(
      "2026-01-04T05:00:00.000Z",
    );
  });

  it("lands correctly on the spring daylight saving day", () => {
    // Clocks jump forward at 2am on 8 March 2026; midnight is still UTC-5.
    expect(startOfDayIn("America/New_York", "2026-03-08").toISOString()).toBe(
      "2026-03-08T05:00:00.000Z",
    );
    // The following day is already UTC-4.
    expect(startOfDayIn("America/New_York", "2026-03-09").toISOString()).toBe(
      "2026-03-09T04:00:00.000Z",
    );
  });

  it("makes a daylight saving day 23 hours long", () => {
    const start = startOfDayIn("America/New_York", "2026-03-08").getTime();
    const end = endOfDayIn("America/New_York", "2026-03-08").getTime();
    expect((end - start) / 3_600_000).toBe(23);
  });
});

describe("addDays and daysBetween", () => {
  it("shifts and measures whole days", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
  });

  it("crosses a daylight saving boundary without drifting", () => {
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });
});

describe("msUntilNextDay", () => {
  it("counts down to the next local midnight", () => {
    const at = Date.parse("2026-07-04T23:00:00Z"); // 7pm in New York
    const ms = msUntilNextDay("America/New_York", at);
    expect(ms).toBe(5 * 3_600_000);
  });

  it("never returns zero or a negative value", () => {
    const at = startOfDayIn("America/New_York", "2026-07-04").getTime();
    expect(msUntilNextDay("America/New_York", at)).toBeGreaterThan(0);
  });
});

describe("labelDay", () => {
  it("names today and yesterday relative to the couple's day", () => {
    const today = todayIn("America/New_York");
    expect(labelDay("America/New_York", today)).toBe("Today");
    expect(labelDay("America/New_York", addDays(today, -1))).toBe("Yesterday");
  });
});
