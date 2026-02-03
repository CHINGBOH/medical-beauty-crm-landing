import { createConversation, createLead, getLeadByPhone } from "./db";
import {
  createWeworkCustomer,
  getWeworkCustomer,
  updateWeworkCustomer,
} from "./wework-db";
import { notificationService } from "./extensions/services/notification.service";
import { nanoid } from "nanoid";

type WeworkWebhookPayload = {
  event: string;
  externalUserId: string;
  name?: string;
  phone?: string;
  wechat?: string;
  state?: string;
  source?: string;
  followUserId?: string;
};

export async function handleWeworkWebhook(payload: WeworkWebhookPayload) {
  if (payload.event !== "contact_added") {
    return { success: true, ignored: true };
  }

  const existing = await getWeworkCustomer(payload.externalUserId);
  if (existing) {
    await updateWeworkCustomer(payload.externalUserId, {
      name: payload.name || existing.name,
      state: payload.state || existing.state,
    });
  } else {
    await createWeworkCustomer({
      externalUserId: payload.externalUserId,
      name: payload.name,
      state: payload.state,
      followUserId: payload.followUserId,
    });
  }

  let leadId: number | null = null;
  if (payload.phone) {
    const existingLead = await getLeadByPhone(payload.phone);
    if (!existingLead) {
      const sessionId = nanoid();
      await createConversation({
        sessionId,
        source: "enterprise_wechat",
        status: "active",
        visitorName: payload.name,
        visitorPhone: payload.phone,
        visitorWechat: payload.wechat,
      });
      const result = await createLead({
        name: payload.name || "未知",
        phone: payload.phone,
        wechat: payload.wechat,
        source: payload.source || "wework",
        sourceContent: payload.state || null,
        status: "new",
      });
      leadId = Number((result as any).insertId);
    }
  }

  await notificationService.notifyLead({
    name: payload.name,
    phone: payload.phone,
    wechat: payload.wechat,
    source: payload.source || "wework",
    sourceState: payload.state,
    externalUserId: payload.externalUserId,
  });

  return { success: true, leadId };
}
