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
 * 支持两种类型：customer（客户问询）和 internal（内部管理）
 */
export const knowledgeBase = mysqlTable("knowledge_base", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["customer", "internal"]).default("customer").notNull(), // customer=客户问询知识库, internal=内部管理知识库
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  category: varchar("category", { length: 100 }).notNull(), // 项目介绍/FAQ/注意事项/价格政策/销售话术/心理分析/异议处理
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
  // 客户画像字段
  psychologyType: mysqlEnum("psychology_type", ["恐惧型", "贪婪型", "安全型", "敏感型"]), // 心理类型
  psychologyTags: text("psychology_tags"), // JSON 数组，存储心理标签
  budgetLevel: mysqlEnum("budget_level", ["低", "中", "高"]), // 消费能力
  customerTier: mysqlEnum("customer_tier", ["A", "B", "C", "D"]), // 客户分层
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
  age: int("age"), // 年龄
  interestedServices: text("interested_services"), // JSON 数组
  budget: varchar("budget", { length: 50 }),
  budgetLevel: mysqlEnum("budget_level", ["低", "中", "高"]), // 消费能力
  message: text("message"),
  source: varchar("source", { length: 50 }).notNull(), // 来源渠道
  sourceContent: varchar("source_content", { length: 255 }), // 来源内容
  status: varchar("status", { length: 50 }).default("new").notNull(), // new/contacted/interested/quoted/converted
  psychologyType: varchar("psychology_type", { length: 50 }), // 心理类型：恐惧型/贪婪型/安全型/敏感型
  psychologyTags: text("psychology_tags"), // 心理标签，JSON 数组
  customerTier: mysqlEnum("customer_tier", ["A", "B", "C", "D"]), // 客户分层：A=高价值 B=中价值 C=低价值 D=无效
  notes: text("notes"), // 备注
  followUpDate: timestamp("follow_up_date"), // 下次跟进日期
  conversationId: int("conversation_id"), // 关联的对话 ID
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  syncedAt: timestamp("synced_at"), // 同步到 Airtable 的时间
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

/**
 * 触发器表 - 存储自动化营销触发规则
 */
export const triggers = mysqlTable("triggers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(), // 触发器名称
  description: text("description"), // 描述
  type: mysqlEnum("type", ["time", "behavior", "weather"]).notNull(), // 触发类型
  // 时间触发配置
  timeConfig: text("time_config"), // JSON: { type: "birthday|holiday|reminder", date: "2024-01-01", time: "10:00", repeat: "yearly|monthly|once" }
  // 行为触发配置
  behaviorConfig: text("behavior_config"), // JSON: { event: "browse_no_consult|consult_no_book|book_no_show", duration: 24, unit: "hours" }
  // 天气触发配置
  weatherConfig: text("weather_config"), // JSON: { condition: "sunny|rainy|hot|cold", temperature: { min: 25, max: 35 }, projects: ["防晒", "补水"] }
  // 触发动作
  action: mysqlEnum("action", ["send_message", "send_email", "create_task", "notify_staff"]).notNull(),
  actionConfig: text("action_config"), // JSON: { template: "xxx", content: "xxx", channel: "wechat|sms|email" }
  // 目标客户筛选
  targetFilter: text("target_filter"), // JSON: { customerTier: ["A", "B"], psychologyType: ["恐惧型"], source: ["小红书"] }
  isActive: int("is_active").default(1).notNull(), // 1=active, 0=inactive
  executionCount: int("execution_count").default(0).notNull(), // 执行次数
  lastExecutedAt: timestamp("last_executed_at"), // 最后执行时间
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Trigger = typeof triggers.$inferSelect;
export type InsertTrigger = typeof triggers.$inferInsert;

/**
 * 触发器执行记录表 - 记录每次触发的执行情况
 */
export const triggerExecutions = mysqlTable("trigger_executions", {
  id: int("id").autoincrement().primaryKey(),
  triggerId: int("trigger_id").notNull(), // 关联触发器 ID
  leadId: int("lead_id"), // 关联线索 ID
  executedAt: timestamp("executed_at").defaultNow().notNull(),
  status: mysqlEnum("status", ["success", "failed", "skipped"]).notNull(),
  result: text("result"), // 执行结果详情
  errorMessage: text("error_message"), // 错误信息
});

export type TriggerExecution = typeof triggerExecutions.$inferSelect;
export type InsertTriggerExecution = typeof triggerExecutions.$inferInsert;

/**
 * 小红书内容表 - 存储小红书发布的内容及数据
 */
export const xiaohongshuPosts = mysqlTable("xiaohongshu_posts", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  images: text("images"), // JSON 数组，存储图片 URL
  tags: text("tags"), // JSON 数组，存储话题标签
  contentType: varchar("content_type", { length: 50 }).notNull(), // 项目体验/效果对比/价格揭秘/避坑指南/节日营销
  project: varchar("project", { length: 100 }), // 关联项目
  status: mysqlEnum("status", ["draft", "scheduled", "published", "deleted"]).default("draft").notNull(),
  publishedAt: timestamp("published_at"), // 发布时间
  scheduledAt: timestamp("scheduled_at"), // 计划发布时间
  // 数据监控
  viewCount: int("view_count").default(0).notNull(), // 阅读量
  likeCount: int("like_count").default(0).notNull(), // 点赞数
  commentCount: int("comment_count").default(0).notNull(), // 评论数
  shareCount: int("share_count").default(0).notNull(), // 转发数
  collectCount: int("collect_count").default(0).notNull(), // 收藏数
  lastSyncedAt: timestamp("last_synced_at"), // 最后同步数据时间
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type XiaohongshuPost = typeof xiaohongshuPosts.$inferSelect;
export type InsertXiaohongshuPost = typeof xiaohongshuPosts.$inferInsert;

/**
 * 小红书评论表 - 存储小红书内容的评论
 */
export const xiaohongshuComments = mysqlTable("xiaohongshu_comments", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("post_id").notNull(), // 关联内容 ID
  authorName: varchar("author_name", { length: 100 }).notNull(), // 评论者昵称
  authorAvatar: varchar("author_avatar", { length: 500 }), // 评论者头像
  content: text("content").notNull(), // 评论内容
  replyContent: text("reply_content"), // 回复内容
  replyStatus: mysqlEnum("reply_status", ["pending", "replied", "ignored"]).default("pending").notNull(),
  sentiment: mysqlEnum("sentiment", ["positive", "neutral", "negative"]), // 情感分析
  isFiltered: int("is_filtered").default(0).notNull(), // 是否被敏感词过滤
  commentedAt: timestamp("commented_at").notNull(), // 评论时间
  repliedAt: timestamp("replied_at"), // 回复时间
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type XiaohongshuComment = typeof xiaohongshuComments.$inferSelect;
export type InsertXiaohongshuComment = typeof xiaohongshuComments.$inferInsert;
