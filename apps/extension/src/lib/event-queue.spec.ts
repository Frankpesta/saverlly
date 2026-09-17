import { flushCouponEvents, queueCouponTestEvent } from "./event-queue";
import { reportCouponTestEvent } from "./api-client";
import { getDeviceToken } from "./storage";
jest.mock("./api-client");
jest.mock("./storage");
const report = reportCouponTestEvent as jest.Mock;
let stored: Record<string, unknown>;
const sendMessage = jest.fn().mockResolvedValue(undefined);
beforeEach(() => {
  stored = {};
  report.mockReset();
  (getDeviceToken as jest.Mock).mockResolvedValue("device-a");
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async () => ({ ...stored }),
        set: async (values: object) => {
          Object.assign(stored, values);
        },
        remove: async (key: string) => {
          delete stored[key];
        },
      },
    },
    runtime: { sendMessage },
  };
});
it("persists outages and retries the same event ID after recovery", async () => {
  report.mockRejectedValue(
    new Error("Unexpected status 503 reporting coupon test event"),
  );
  await queueCouponTestEvent({
    merchantId: "m1",
    result: "applied",
    discountAmount: 10,
  });
  await flushCouponEvents();
  expect(Object.keys(stored)).toHaveLength(1);
  const first = report.mock.calls[0][0];
  report.mockResolvedValue(undefined);
  await flushCouponEvents();
  expect(report).toHaveBeenLastCalledWith(first);
  expect(stored).toEqual({});
  expect(sendMessage).toHaveBeenCalledWith({ type: "SAVINGS_UPDATED" });
});
it("does not attribute one device’s queued savings to a replacement device token", async () => {
  stored["couponEvent:old"] = {
    token: "device-b",
    payload: { merchantId: "m1", result: "applied", discountAmount: 20 },
  };
  await flushCouponEvents();
  expect(report).not.toHaveBeenCalled();
});
