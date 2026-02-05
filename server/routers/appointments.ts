import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { appointmentStore } from "../appointments";

const createInput = z
  .object({
    customerId: z.number().optional(),
    customerName: z.string().min(1),
    customerPhone: z.string().regex(/^\+?[0-9-]{6,20}$/, "手机号格式不正确"),
    staffId: z.string().min(1),
    staffName: z.string().min(1),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    notes: z.string().optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .refine((value) => value.endAt > value.startAt, {
    message: "结束时间必须大于开始时间",
    path: ["endAt"],
  });

function mapAppointmentError(error: unknown): never {
  if (!(error instanceof Error)) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "预约服务异常" });
  }

  if (error.message.includes("幂等键冲突") || error.message.includes("已有预约")) {
    throw new TRPCError({ code: "CONFLICT", message: error.message });
  }

  if (error.message.includes("不允许改约") || error.message.includes("状态流转不合法")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }

  if (error.message.includes("预约不存在")) {
    throw new TRPCError({ code: "NOT_FOUND", message: error.message });
  }

  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

export const appointmentsRouter = router({
  list: protectedProcedure.query(() => {
    return appointmentStore.list();
  }),

  create: protectedProcedure.input(createInput).mutation(({ input }) => {
    try {
      return appointmentStore.create(input);
    } catch (error) {
      mapAppointmentError(error);
    }
  }),

  confirm: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => {
      try {
        return appointmentStore.updateStatus(input.id, "confirmed");
      } catch (error) {
        mapAppointmentError(error);
      }
    }),

  complete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => {
      try {
        return appointmentStore.updateStatus(input.id, "completed");
      } catch (error) {
        mapAppointmentError(error);
      }
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => {
      try {
        return appointmentStore.updateStatus(input.id, "cancelled");
      } catch (error) {
        mapAppointmentError(error);
      }
    }),

  noShow: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => {
      try {
        return appointmentStore.updateStatus(input.id, "no_show");
      } catch (error) {
        mapAppointmentError(error);
      }
    }),

  reschedule: protectedProcedure
    .input(
      z
        .object({
          id: z.number(),
          startAt: z.coerce.date(),
          endAt: z.coerce.date(),
        })
        .refine((value) => value.endAt > value.startAt, {
          message: "结束时间必须大于开始时间",
          path: ["endAt"],
        })
    )
    .mutation(({ input }) => {
      try {
        return appointmentStore.reschedule(input.id, input.startAt, input.endAt);
      } catch (error) {
        mapAppointmentError(error);
      }
    }),

  calendar: protectedProcedure
    .input(
      z
        .object({
          startAt: z.coerce.date(),
          endAt: z.coerce.date(),
        })
        .refine((value) => value.endAt > value.startAt, {
          message: "结束时间必须大于开始时间",
          path: ["endAt"],
        })
    )
    .query(({ input }) => appointmentStore.calendar(input.startAt, input.endAt)),
});
