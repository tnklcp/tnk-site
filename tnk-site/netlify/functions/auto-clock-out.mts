import type { Config } from "@netlify/functions";
import { readCollection, writeCollection } from "./_shared/storage.mts";

type TimeEntry = {
  id: string;
  jobId?: string;
  userId: string;
  userEmail?: string;
  status: "open" | "closed";
  clockIn: string;
  clockOut?: string;
  notes?: string;
  entryType?: "time" | "adjustment";
  adjustMinutes?: number;
  adjustedBy?: string;
  adjustedAt?: string;
  closedBy?: string;
  closedAt?: string;
};

const COLLECTION_KEY = "time-entries";
const SITE_TIME_ZONE = "America/Los_Angeles";
const AUTO_CLOCK_OUT_HOUR = 20;

const isAdjustmentEntry = (entry: TimeEntry) =>
  entry.entryType === "adjustment" || typeof entry.adjustMinutes === "number";

const getHourInZone = (date: Date, timeZone: string): number => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const hourPart = parts.find((part) => part.type === "hour");
  const hour = hourPart ? Number(hourPart.value) : NaN;
  return hour === 24 ? 0 : hour;
};

export default async () => {
  const now = new Date();
  const localHour = getHourInZone(now, SITE_TIME_ZONE);
  if (localHour !== AUTO_CLOCK_OUT_HOUR) {
    return;
  }

  const entries = await readCollection<TimeEntry>(COLLECTION_KEY);
  const nowIso = now.toISOString();
  let changed = 0;

  for (const entry of entries) {
    if (entry.status !== "open" || isAdjustmentEntry(entry)) continue;
    entry.status = "closed";
    entry.clockOut = nowIso;
    entry.closedBy = "system_auto_clock_out";
    entry.closedAt = nowIso;
    changed += 1;
  }

  if (changed > 0) {
    await writeCollection(COLLECTION_KEY, entries);
  }

  console.log(`auto-clock-out: closed ${changed} open entries at ${nowIso}`);
};

export const config: Config = {
  schedule: "0 3,4 * * *"
};
