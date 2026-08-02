import assert from "node:assert/strict";
import test from "node:test";
import {
  dailyChirpDateKey,
  dailyChirpDismissalKey,
  dailyChirpForDate,
  dailyChirpIndex,
  dailyChirps,
} from "../lib/daily-chirp.js";

test("contains 60 uniquely numbered Daily Chirps", () => {
  assert.equal(dailyChirps.length, 60);
  assert.equal(new Set(dailyChirps.map(chirp => chirp.id)).size, 60);
  assert.equal(new Set(dailyChirps.map(chirp => chirp.image)).size, 60);
  dailyChirps.forEach(chirp => {
    assert.ok(chirp.caption.length > 10);
    assert.ok(chirp.alt.length > 10);
  });
});

test("selects one stable chirp for a local calendar date", () => {
  const morning = new Date(2026, 7, 2, 8, 15);
  const evening = new Date(2026, 7, 2, 23, 45);
  assert.equal(dailyChirpIndex(morning), dailyChirpIndex(evening));
  assert.deepEqual(dailyChirpForDate(morning), dailyChirpForDate(evening));
});

test("rotates without repeating during a complete 60-day cycle", () => {
  const start = new Date(2026, 0, 1);
  const ids = Array.from({ length: 60 }, (_, offset) => {
    const date = new Date(start);
    date.setDate(date.getDate() + offset);
    return dailyChirpForDate(date).id;
  });
  assert.equal(new Set(ids).size, 60);
});

test("uses a date-scoped dismissal key", () => {
  const date = new Date(2026, 7, 2, 12);
  assert.equal(dailyChirpDateKey(date), "2026-08-02");
  assert.equal(dailyChirpDismissalKey(date), "leavebird-daily-chirp-dismissed-2026-08-02");
});
