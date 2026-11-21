import { describe, expect, it } from "vitest";
import { invoicePeriod, invoiceSubscriptionId, subscriptionPeriod } from "./stripePeriod";

const NOV_1 = 1793491200; // 2026-11-01T00:00:00Z
const DEC_1 = 1796083200; // 2026-12-01T00:00:00Z

describe("subscriptionPeriod", () => {
  it("reads the period from the subscription items (new Stripe API)", () => {
    const p = subscriptionPeriod({ items: { data: [{ current_period_start: NOV_1, current_period_end: DEC_1 }] } });
    expect(p.start?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(p.end?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("still works with the old shape on the subscription itself", () => {
    const p = subscriptionPeriod({ current_period_start: NOV_1, current_period_end: DEC_1 });
    expect(p.start?.getTime()).toBe(NOV_1 * 1000);
    expect(p.end?.getTime()).toBe(DEC_1 * 1000);
  });

  it("prefers the items when both shapes are present", () => {
    const p = subscriptionPeriod({ current_period_end: 1, items: { data: [{ current_period_end: DEC_1 }] } });
    expect(p.end?.getTime()).toBe(DEC_1 * 1000);
  });

  it("uses the earliest start and the latest end across items", () => {
    const p = subscriptionPeriod({
      items: { data: [{ current_period_start: NOV_1 + 50, current_period_end: DEC_1 }, { current_period_start: NOV_1, current_period_end: DEC_1 + 99 }] },
    });
    expect(p.start?.getTime()).toBe(NOV_1 * 1000);
    expect(p.end?.getTime()).toBe((DEC_1 + 99) * 1000);
  });

  it("returns nulls instead of guessing when Stripe sent no period", () => {
    expect(subscriptionPeriod({ items: { data: [] } })).toEqual({ start: null, end: null });
    expect(subscriptionPeriod(null)).toEqual({ start: null, end: null });
    expect(subscriptionPeriod({ items: { data: [{ current_period_end: 0 }] } }).end).toBeNull();
  });
});

describe("invoiceSubscriptionId", () => {
  it("reads parent.subscription_details (new Stripe API)", () => {
    expect(invoiceSubscriptionId({ parent: { subscription_details: { subscription: "sub_new" } } })).toBe("sub_new");
  });
  it("reads invoice.subscription (old Stripe API), as a string or an object", () => {
    expect(invoiceSubscriptionId({ subscription: "sub_old" })).toBe("sub_old");
    expect(invoiceSubscriptionId({ subscription: { id: "sub_obj" } })).toBe("sub_obj");
  });
  it("returns null for one-off invoices", () => {
    expect(invoiceSubscriptionId({ parent: null })).toBeNull();
    expect(invoiceSubscriptionId({})).toBeNull();
  });
});

describe("invoicePeriod", () => {
  it("takes the paid period from the invoice lines", () => {
    const p = invoicePeriod({ lines: { data: [{ period: { start: NOV_1, end: DEC_1 } }] } });
    expect(p.start?.getTime()).toBe(NOV_1 * 1000);
    expect(p.end?.getTime()).toBe(DEC_1 * 1000);
  });
  it("returns nulls when there are no lines", () => {
    expect(invoicePeriod({ lines: { data: [] } })).toEqual({ start: null, end: null });
    expect(invoicePeriod(undefined)).toEqual({ start: null, end: null });
  });
});
