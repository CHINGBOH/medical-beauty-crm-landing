import { describe, expect, it } from "vitest";
import { InMemoryAppointmentStore, canTransitionStatus, hasTimeConflict, isTimeRangeValid } from "./appointments";

describe("appointments time rules", () => {
  it("validates endAt is greater than startAt", () => {
    const start = new Date("2026-02-05T10:00:00.000Z");
    const end = new Date("2026-02-05T11:00:00.000Z");
    expect(isTimeRangeValid(start, end)).toBe(true);
    expect(isTimeRangeValid(end, start)).toBe(false);
  });

  it("detects overlap for the same staff", () => {
    const appointments = [
      {
        id: 1,
        customerName: "A",
        customerPhone: "1",
        staffId: "doctor-1",
        staffName: "Doctor 1",
        startAt: new Date("2026-02-05T10:00:00.000Z"),
        endAt: new Date("2026-02-05T11:00:00.000Z"),
        status: "confirmed" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    expect(
      hasTimeConflict(
        appointments,
        "doctor-1",
        new Date("2026-02-05T10:30:00.000Z"),
        new Date("2026-02-05T11:30:00.000Z")
      )
    ).toBe(true);

    expect(
      hasTimeConflict(
        appointments,
        "doctor-2",
        new Date("2026-02-05T10:30:00.000Z"),
        new Date("2026-02-05T11:30:00.000Z")
      )
    ).toBe(false);
  });

  it("supports create and reschedule without conflicts", () => {
    const store = new InMemoryAppointmentStore();

    const created = store.create({
      customerName: "Customer A",
      customerPhone: "13900000000",
      staffId: "doctor-1",
      staffName: "Doctor 1",
      startAt: new Date("2026-02-05T10:00:00.000Z"),
      endAt: new Date("2026-02-05T11:00:00.000Z"),
    });

    expect(created.id).toBe(1);
    expect(created.status).toBe("pending");

    const moved = store.reschedule(
      created.id,
      new Date("2026-02-05T11:00:00.000Z"),
      new Date("2026-02-05T12:00:00.000Z")
    );

    expect(moved.startAt.toISOString()).toBe("2026-02-05T11:00:00.000Z");
    expect(moved.endAt.toISOString()).toBe("2026-02-05T12:00:00.000Z");
  });

  it("enforces appointment status transitions", () => {
    expect(canTransitionStatus("pending", "confirmed")).toBe(true);
    expect(canTransitionStatus("pending", "completed")).toBe(false);

    const store = new InMemoryAppointmentStore();
    const created = store.create({
      customerName: "Customer B",
      customerPhone: "13900000001",
      staffId: "doctor-1",
      staffName: "Doctor 1",
      startAt: new Date("2026-02-05T13:00:00.000Z"),
      endAt: new Date("2026-02-05T14:00:00.000Z"),
    });

    expect(() => store.updateStatus(created.id, "completed")).toThrow("状态流转不合法");
    expect(store.updateStatus(created.id, "confirmed").status).toBe("confirmed");
    expect(store.updateStatus(created.id, "completed").status).toBe("completed");
  });

  it("rejects reschedule if it conflicts with another appointment", () => {
    const store = new InMemoryAppointmentStore();
    const first = store.create({
      customerName: "Customer C",
      customerPhone: "13900000002",
      staffId: "doctor-2",
      staffName: "Doctor 2",
      startAt: new Date("2026-02-06T10:00:00.000Z"),
      endAt: new Date("2026-02-06T11:00:00.000Z"),
    });

    store.create({
      customerName: "Customer D",
      customerPhone: "13900000003",
      staffId: "doctor-2",
      staffName: "Doctor 2",
      startAt: new Date("2026-02-06T11:00:00.000Z"),
      endAt: new Date("2026-02-06T12:00:00.000Z"),
    });

    expect(() =>
      store.reschedule(
        first.id,
        new Date("2026-02-06T11:30:00.000Z"),
        new Date("2026-02-06T12:30:00.000Z")
      )
    ).toThrow("改约失败");
  });

  it("supports marking confirmed appointments as no_show", () => {
    const store = new InMemoryAppointmentStore();
    const created = store.create({
      customerName: "Customer E",
      customerPhone: "13900000004",
      staffId: "doctor-3",
      staffName: "Doctor 3",
      startAt: new Date("2026-02-07T10:00:00.000Z"),
      endAt: new Date("2026-02-07T11:00:00.000Z"),
    });

    store.updateStatus(created.id, "confirmed");
    expect(store.updateStatus(created.id, "no_show").status).toBe("no_show");
  });

  it("blocks reschedule for completed appointments", () => {
    const store = new InMemoryAppointmentStore();
    const created = store.create({
      customerName: "Customer F",
      customerPhone: "13900000005",
      staffId: "doctor-3",
      staffName: "Doctor 3",
      startAt: new Date("2026-02-07T12:00:00.000Z"),
      endAt: new Date("2026-02-07T13:00:00.000Z"),
    });

    store.updateStatus(created.id, "confirmed");
    store.updateStatus(created.id, "completed");

    expect(() =>
      store.reschedule(
        created.id,
        new Date("2026-02-07T13:00:00.000Z"),
        new Date("2026-02-07T14:00:00.000Z")
      )
    ).toThrow("不允许改约");
  });


  it("supports idempotent create by idempotencyKey", () => {
    const store = new InMemoryAppointmentStore();
    const payload = {
      customerName: "Customer G",
      customerPhone: "13900000006",
      staffId: "doctor-4",
      staffName: "Doctor 4",
      startAt: new Date("2026-02-08T10:00:00.000Z"),
      endAt: new Date("2026-02-08T11:00:00.000Z"),
      idempotencyKey: "apt-create-g-1",
    };

    const first = store.create(payload);
    const second = store.create(payload);

    expect(first.id).toBe(second.id);
    expect(store.list()).toHaveLength(1);
  });


  it("rejects different payload with the same idempotencyKey", () => {
    const store = new InMemoryAppointmentStore();
    store.create({
      customerName: "Customer H",
      customerPhone: "13900000008",
      staffId: "doctor-4",
      staffName: "Doctor 4",
      startAt: new Date("2026-02-08T14:00:00.000Z"),
      endAt: new Date("2026-02-08T15:00:00.000Z"),
      idempotencyKey: "apt-create-h-1",
    });

    expect(() =>
      store.create({
        customerName: "Customer H-Changed",
        customerPhone: "13900000008",
        staffId: "doctor-4",
        staffName: "Doctor 4",
        startAt: new Date("2026-02-08T14:00:00.000Z"),
        endAt: new Date("2026-02-08T15:00:00.000Z"),
        idempotencyKey: "apt-create-h-1",
      })
    ).toThrow("幂等键冲突");
  });

});
