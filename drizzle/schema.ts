import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 系统配置表 - 存储 Airtable 等第三方服务配置
 */
export const systemConfig = mysqlTable("system_config", {
  id: int("id").autoincrement().primaryKey(),
  configKey: varchar("config_key", { length: 100 }).notNull().unique(),
  configValue: text("config_value"), // JSON 格式存储
  description: text("description"),
  isActive: int("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type SystemConfig = typeof systemConfig.$inferSelect;
export type InsertSystemConfig = typeof systemConfig.$inferInsert;

/**
 * 知识库表 - 存储医美项目知识、FAQ、注意事项等
 */
export const knowledgeBase = mysqlTable("knowledge_base", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  category: varchar("category", { length: 100 }).notNull(), // 项目介绍/FAQ/注意事项/价格政策
  tags: text("tags"), // JSON 数组，如 ["超皮秒", "祛斑", "激光"]
  embedding: text("embedding"), // 向量嵌入，JSON 格式
  viewCount: int("view_count").default(0).notNull(),
  usedCount: int("used_count").default(0).notNull(), // AI 引用次数
  isActive: int("is_active").default(1).notNull(), // 1=active, 0=inactive
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type KnowledgeBase = typeof knowledgeBase.$inferSelect;
export type InsertKnowledgeBase = typeof knowledgeBase.$inferInsert;

/**
 * 对话历史表 - 记录 AI 客服对话
 */
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull().unique(), // 会话 ID
  visitorName: varchar("visitor_name", { length: 100 }),
  visitorPhone: varchar("visitor_phone", { length: 20 }),
  visitorWechat: varchar("visitor_wechat", { length: 100 }),
  source: varchar("source", { length: 50 }).default("web").notNull(), // web/wechat/enterprise_wechat
  status: mysqlEnum("status", ["active", "converted", "closed"]).default("active").notNull(),
  leadId: varchar("lead_id", { length: 100 }), // 关联的 Airtable 线索 ID
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * 消息记录表 - 存储对话中的每条消息
 */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversation_id").notNull(),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  knowledgeUsed: text("knowledge_used"), // 使用的知识库 ID 列表，JSON 格式
  extractedInfo: text("extracted_info"), // 提取的客户信息，JSON 格式
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * 线索记录表 - 本地备份 Airtable 线索数据
 */
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  airtableId: varchar("airtable_id", { length: 100 }).unique(), // Airtable 记录 ID
  name: varchar("name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  wechat: varchar("wechat", { length: 100 }),
  interestedServices: text("interested_services"), // JSON 数组
  budget: varchar("budget", { length: 50 }),
  message: text("message"),
  source: varchar("source", { length: 50 }).notNull(), // 来源渠道
  sourceContent: varchar("source_content", { length: 255 }), // 来源内容
  status: varchar("status", { length: 50 }).default("新线索").notNull(),
  conversationId: int("conversation_id"), // 关联的对话 ID
  createdAt: timestamp("created_at").defaultNow().notNull(),
  syncedAt: timestamp("synced_at"), // 同步到 Airtable 的时间
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;