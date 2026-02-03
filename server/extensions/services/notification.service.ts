import axios from "axios";
import { logger } from "../utils/logger";
import { isMockMode, mockSendMessage } from "../../wework-mock";
import { createWeworkMessage, updateMessageStatus } from "../../wework-db";

type LeadNotificationPayload = {
  name?: string;
  phone?: string;
  wechat?: string;
  source?: string;
  sourceState?: string;
  externalUserId?: string;
};

export class NotificationService {
  async notifyLead(payload: LeadNotificationPayload): Promise<void> {
    await Promise.allSettled([
      this.notifySms(payload),
      this.notifyWework(payload),
      this.notifyGroup(payload),
    ]);
  }

  private async notifySms(payload: LeadNotificationPayload) {
    const smsWebhook = process.env.SMS_WEBHOOK_URL;
    if (!smsWebhook) {
      logger.info("SMS webhook not configured, skipping SMS notification.");
      return;
    }

    try {
      await axios.post(smsWebhook, {
        message: this.formatMessage(payload),
        phone: payload.phone,
      });
    } catch (error) {
      logger.error("SMS notification failed:", error);
    }
  }

  private async notifyWework(payload: LeadNotificationPayload) {
    const notifyUserId = process.env.WEWORK_NOTIFY_USER_ID || "admin";
    const messageContent = { content: this.formatMessage(payload) };

    try {
      const message = await createWeworkMessage({
        externalUserId: payload.externalUserId || notifyUserId,
        sendUserId: notifyUserId,
        msgType: "text",
        content: JSON.stringify(messageContent),
        status: "pending",
      });

      if (await isMockMode()) {
        const result = await mockSendMessage({
          touser: payload.externalUserId || notifyUserId,
          msgtype: "text",
          text: messageContent,
        });
        if (result.errcode === 0) {
          await updateMessageStatus(message.id, "sent");
        } else {
          await updateMessageStatus(message.id, "failed", result.errmsg);
        }
        return;
      }

      logger.info("Wework real message send not configured; recorded message only.");
    } catch (error) {
      logger.error("Wework notification failed:", error);
    }
  }

  private async notifyGroup(payload: LeadNotificationPayload) {
    const webhook = process.env.WEWORK_GROUP_WEBHOOK_URL;
    if (!webhook) {
      logger.info("Wework group webhook not configured, skipping group notification.");
      return;
    }

    try {
      await axios.post(webhook, {
        msgtype: "text",
        text: { content: this.formatMessage(payload) },
      });
    } catch (error) {
      logger.error("Group webhook notification failed:", error);
    }
  }

  private formatMessage(payload: LeadNotificationPayload) {
    const lines = [
      "【新线索回流】",
      payload.name ? `姓名：${payload.name}` : null,
      payload.phone ? `手机号：${payload.phone}` : null,
      payload.wechat ? `微信：${payload.wechat}` : null,
      payload.externalUserId ? `外部联系人ID：${payload.externalUserId}` : null,
      payload.source ? `来源：${payload.source}` : null,
      payload.sourceState ? `来源标记：${payload.sourceState}` : null,
    ].filter(Boolean);
    return lines.join("\n");
  }
}

export const notificationService = new NotificationService();
