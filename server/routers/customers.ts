import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getAllLeads, getLeadById } from "../db";

export const customersRouter = router({
  /**
   * 获取客户列表
   */
  list: protectedProcedure.query(async () => {
    const leads = await getAllLeads();
    return leads;
  }),

  /**
   * 获取客户详情
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const lead = await getLeadById(input.id);
      return lead;
    }),

  /**
   * 获取客户统计
   */
  stats: protectedProcedure.query(async () => {
    const leads = await getAllLeads();
    
    return {
      total: leads.length,
      tierA: leads.filter((l) => l.customerTier === "A").length,
      tierB: leads.filter((l) => l.customerTier === "B").length,
      tierC: leads.filter((l) => l.customerTier === "C").length,
      tierD: leads.filter((l) => l.customerTier === "D").length,
      恐惧型: leads.filter((l) => l.psychologyType === "恐惧型").length,
      贪婪型: leads.filter((l) => l.psychologyType === "贪婪型").length,
      安全型: leads.filter((l) => l.psychologyType === "安全型").length,
      敏感型: leads.filter((l) => l.psychologyType === "敏感型").length,
    };
  }),
});
