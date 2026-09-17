import type { CreateCouponTestEventPayload } from "@saverlly/shared-types";
import { AuthError, reportCouponTestEvent } from "./api-client";
import { getDeviceToken } from "./storage";

const PREFIX = "couponEvent:";
let flushing: Promise<void> | undefined;

export async function queueCouponTestEvent(
  payload: CreateCouponTestEventPayload,
): Promise<void> {
  const eventId = payload.eventId ?? crypto.randomUUID();
  // Individual keys avoid concurrent read/modify/write loss between progress messages.
  await chrome.storage.local.set({
    [PREFIX + eventId]: {
      payload: { ...payload, eventId },
      token: await getDeviceToken(),
    },
  });
  void flushCouponEvents();
}

export function flushCouponEvents(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const stored = await chrome.storage.local.get(null);
    const token = await getDeviceToken();
    for (const [key, entry] of Object.entries(stored)) {
      if (!key.startsWith(PREFIX) || entry.token !== token) continue;
      try {
        await reportCouponTestEvent(entry.payload);
        await chrome.storage.local.remove(key);
        if (entry.payload.result === "applied")
          void chrome.runtime
            .sendMessage({ type: "SAVINGS_UPDATED" })
            .catch(() => {});
      } catch (error) {
        // Invalid/removed merchant data is permanent; outages and auth problems retry later.
        if (error instanceof AuthError) break;
        if (
          error instanceof Error &&
          /status (400|404|422)\b/.test(error.message)
        )
          await chrome.storage.local.remove(key);
        else break;
      }
    }
  })()
    .catch(() => {})
    .finally(() => {
      flushing = undefined;
    });
  return flushing;
}
