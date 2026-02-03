import { and, eq, inArray } from "drizzle-orm";
import { getDb, createTriggerExecution, updateTrigger } from "../../db";
import { leads, triggers } from "../../../drizzle/schema";
import { notificationService } from "./notification.service";

type TriggerRecord = typeof triggers.$inferSelect;
type LeadRecord = typeof leads.$inferSelect;

type TimeConfig = {
  type: "birthday" | "holiday" | "reminder";
  date?: string;
  daysBefore?: number;
};

type BehaviorConfig = {
  event?: "no_contact_days" | "consult_no_book";
  days?: number;
};

type ActionConfig = {
  message?: string;
};

export class TriggerService {
  private timers: NodeJS.Timeout[] = [];

  async initializeTriggers() {
    this.setupTimers();
  }

  private setupTimers() {
    this.timers.push(
      setInterval(() => {
        void this.checkTimeTriggers();
      }, 60 * 1000)
    );

    this.timers.push(
      setInterval(() => {
        void this.checkBehaviorTriggers();
      }, 5 * 60 * 1000)
    );
  }

  private async checkTimeTriggers() {
    const active = await this.getActiveTriggers("time");
    for (const trigger of active) {
      const timeConfig = this.safeParse<TimeConfig>(trigger.timeConfig);
      if (!timeConfig) continue;
      const targetLeads = await this.findTargetLeads(trigger);
      for (const lead of targetLeads) {
        if (this.shouldTriggerTime(timeConfig, lead)) {
          await this.executeTrigger(trigger, lead, timeConfig.message);
        }
      }
    }
  }

  private async checkBehaviorTriggers() {
    const active = await this.getActiveTriggers("behavior");
    for (const trigger of active) {
      const config = this.safeParse<BehaviorConfig>(trigger.behaviorConfig);
      if (!config) continue;
      const targetLeads = await this.findTargetLeads(trigger);
      for (const lead of targetLeads) {
        if (this.shouldTriggerBehavior(config, lead)) {
          await this.executeTrigger(trigger, lead);
        }
      }
    }
  }

  private async getActiveTriggers(type: "time" | "behavior" | "weather") {
    const db = await getDb();
    if (!db) return [] as TriggerRecord[];
    return db
      .select()
      .from(triggers)
      .where(and(eq(triggers.isActive, 1), eq(triggers.type, type)));
  }

  private async findTargetLeads(trigger: TriggerRecord) {
    const db = await getDb();
    if (!db) return [] as LeadRecord[];
    const filter = this.safeParse<Record<string, any>>(trigger.targetFilter);

    const conditions = [eq(leads.status, "new")];
    if (filter?.customerTier?.length) {
      conditions.push(inArray(leads.customerTier, filter.customerTier));
    }
    if (filter?.psychologyType?.length) {
      conditions.push(inArray(leads.psychologyType, filter.psychologyType));
    }
    if (filter?.source?.length) {
      conditions.push(inArray(leads.source, filter.source));
    }

    return db
      .select()
      .from(leads)
      .where(and(...conditions));
  }

  private shouldTriggerTime(config: TimeConfig, lead: LeadRecord) {
    const now = new Date();
    if (config.type === "birthday") {
      if (!lead.birthday) return false;
      const birthday = new Date(lead.birthday);
      const daysBefore = config.daysBefore ?? 0;
      const target = new Date(now);
      target.setDate(now.getDate() + daysBefore);
      return (
        birthday.getDate() === target.getDate() &&
        birthday.getMonth() === target.getMonth()
      );
    }
    if (config.type === "holiday") {
      if (!config.date) return false;
      const today = now.toISOString().slice(0, 10);
      return today === config.date;
    }
    if (config.type === "reminder") {
      if (!lead.followUpDate) return false;
      const followUp = new Date(lead.followUpDate);
      const daysBefore = config.daysBefore ?? 0;
      const target = new Date(now);
      target.setDate(now.getDate() + daysBefore);
      return (
        followUp.getFullYear() === target.getFullYear() &&
        followUp.getMonth() === target.getMonth() &&
        followUp.getDate() === target.getDate()
      );
    }
    return false;
  }

  private shouldTriggerBehavior(config: BehaviorConfig, lead: LeadRecord) {
    if (config.event === "no_contact_days" && config.days) {
      const last = lead.updatedAt ? new Date(lead.updatedAt) : null;
      if (!last) return false;
      const diff = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= config.days;
    }
    if (config.event === "consult_no_book") {
      return lead.status !== "converted";
    }
    return false;
  }

  private async executeTrigger(trigger: TriggerRecord, lead: LeadRecord, message?: string) {
    const actionConfig = this.safeParse<ActionConfig>(trigger.actionConfig);
    const note = message || actionConfig?.message || trigger.description || trigger.name;
    await notificationService.notifyLead({
      name: lead.name,
      phone: lead.phone,
      wechat: lead.wechat || undefined,
      source: "trigger",
      sourceState: trigger.name,
      message: note,
    });

    await createTriggerExecution({
      triggerId: trigger.id,
      leadId: lead.id,
      executedAt: new Date(),
      status: "success",
      result: note,
      errorMessage: null,
    });

    await updateTrigger(trigger.id, {
      executionCount: trigger.executionCount + 1,
      lastExecutedAt: new Date(),
    });
  }

  private safeParse<T>(value: string | null) {
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
}
