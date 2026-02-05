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

export const appointmentsRouter = router({
  list: protectedProcedure.query(() => {
    return appointmentStore.list();
  }),

  create: protectedProcedure.input(createInput).mutation(({ input }) => {
    return appointmentStore.create(input);
  }),

  confirm: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => appointmentStore.updateStatus(input.id, "confirmed")),

  complete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => appointmentStore.updateStatus(input.id, "completed")),

  cancel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => appointmentStore.updateStatus(input.id, "cancelled")),

  noShow: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => appointmentStore.updateStatus(input.id, "no_show")),

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
    .mutation(({ input }) => appointmentStore.reschedule(input.id, input.startAt, input.endAt)),

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
