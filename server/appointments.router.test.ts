import { describe, expect, it, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import { appointmentStore } from "./appointments";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createProtectedContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "appointments-user",
    email: "appointments@example.com",
    name: "Appointments User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("appointments router", () => {
  beforeEach(() => {
    appointmentStore.clear();
  });

  it("rejects unauthenticated access", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.appointments.list()).rejects.toMatchObject<Partial<TRPCError>>({
      code: "UNAUTHORIZED",
    });
  });

  it("validates create input at router boundary", async () => {
    const caller = appRouter.createCaller(createProtectedContext());

    await expect(
      caller.appointments.create({
        customerName: "客户",
        customerPhone: "invalid-phone",
        staffId: "doctor-1",
        staffName: "Doctor",
        startAt: new Date("2026-02-08T10:00:00.000Z"),
        endAt: new Date("2026-02-08T09:00:00.000Z"),
      })
    ).rejects.toThrow();
  });

  it("supports no_show transition after confirmation", async () => {
    const caller = appRouter.createCaller(createProtectedContext());

    const created = await caller.appointments.create({
      customerName: "客户A",
      customerPhone: "13900000006",
      staffId: "doctor-1",
      staffName: "Doctor",
      startAt: new Date("2026-02-08T10:00:00.000Z"),
      endAt: new Date("2026-02-08T11:00:00.000Z"),
    });

    await caller.appointments.confirm({ id: created.id });
    const marked = await caller.appointments.noShow({ id: created.id });

    expect(marked.status).toBe("no_show");
  });

  it("rejects invalid calendar window", async () => {
    const caller = appRouter.createCaller(createProtectedContext());

    await expect(
      caller.appointments.calendar({
        startAt: new Date("2026-02-09T11:00:00.000Z"),
        endAt: new Date("2026-02-09T10:00:00.000Z"),
      })
    ).rejects.toThrow();
  });

  it("returns same appointment for repeated create with idempotencyKey", async () => {
    const caller = appRouter.createCaller(createProtectedContext());

    const input = {
      customerName: "客户B",
      customerPhone: "13900000007",
      staffId: "doctor-1",
      staffName: "Doctor",
      startAt: new Date("2026-02-08T12:00:00.000Z"),
      endAt: new Date("2026-02-08T13:00:00.000Z"),
      idempotencyKey: "router-create-1",
    };

    const first = await caller.appointments.create(input);
    const second = await caller.appointments.create(input);

    expect(first.id).toBe(second.id);
    const list = await caller.appointments.list();
    expect(list).toHaveLength(1);
  });


  it("rejects create when idempotencyKey is reused with different payload", async () => {
    const caller = appRouter.createCaller(createProtectedContext());

    await caller.appointments.create({
      customerName: "客户C",
      customerPhone: "13900000009",
      staffId: "doctor-1",
      staffName: "Doctor",
      startAt: new Date("2026-02-08T14:00:00.000Z"),
      endAt: new Date("2026-02-08T15:00:00.000Z"),
      idempotencyKey: "router-create-2",
    });

    await expect(
      caller.appointments.create({
        customerName: "客户C-变更",
        customerPhone: "13900000009",
        staffId: "doctor-1",
        staffName: "Doctor",
        startAt: new Date("2026-02-08T14:00:00.000Z"),
        endAt: new Date("2026-02-08T15:00:00.000Z"),
        idempotencyKey: "router-create-2",
      })
    ).rejects.toMatchObject<Partial<TRPCError>>({
      code: "CONFLICT",
      message: "幂等键冲突：相同 idempotencyKey 不允许对应不同预约参数",
    });
  });


  it("maps missing appointment to NOT_FOUND", async () => {
    const caller = appRouter.createCaller(createProtectedContext());

    await expect(caller.appointments.confirm({ id: 99999 })).rejects.toMatchObject<Partial<TRPCError>>({
      code: "NOT_FOUND",
    });
  });

});
