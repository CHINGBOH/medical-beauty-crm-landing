import { integer, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: varchar("role", { length: 20 }).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 系统配置表 - 存储 Airtable 等第三方服务配置
 */
export const systemConfig = pgTable("system_config", {
  id: serial("id").primaryKey(),
  configKey: varchar("config_key", { length: 100 }).notNull().unique(),
  configValue: text("config_value"), // JSON 格式存储
  description: text("description"),
  isActive: integer("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type SystemConfig = typeof systemConfig.$inferSelect;
export type InsertSystemConfig = typeof systemConfig.$inferInsert;

/**
 * 知识库表 - 存储医美项目知识、FAQ、注意事项等
 * 支持两种类型：customer（客户问询）和 internal（内部管理）
 */
export const knowledgeBase = pgTable("knowledge_base", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 20 }).default("customer").notNull(), // customer=客户问询知识库, internal=内部管理知识库
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  category: varchar("category", { length: 100 }).notNull(), // 项目介绍/FAQ/注意事项/价格政策/销售话术/心理分析/异议处理
  tags: text("tags"), // JSON 数组，如 ["超皮秒", "祛斑", "激光"]
  embedding: text("embedding"), // pgvector 向量嵌入（JSON格式或使用vector类型，需要数据库扩展）
  viewCount: integer("view_count").default(0).notNull(),
  usedCount: integer("used_count").default(0).notNull(), // AI 引用次数
  isActive: integer("is_active").default(1).notNull(), // 1=active, 0=inactive
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type KnowledgeBase = typeof knowledgeBase.$inferSelect;
export type InsertKnowledgeBase = typeof knowledgeBase.$inferInsert;

/**
 * 对话历史表 - 记录 AI 客服对话
 */
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull().unique(), // 会话 ID
  visitorName: varchar("visitor_name", { length: 100 }),
  visitorPhone: varchar("visitor_phone", { length: 20 }),
  visitorWechat: varchar("visitor_wechat", { length: 100 }),
  source: varchar("source", { length: 50 }).default("web").notNull(), // web/wechat/enterprise_wechat
  status: varchar("status", { length: 20 }).default("active").notNull(),
  leadId: varchar("lead_id", { length: 100 }), // 关联的 Airtable 线索 ID
  // 客户画像字段
  psychologyType: varchar("psychology_type", { length: 20 }), // 心理类型
  psychologyTags: text("psychology_tags"), // JSON 数组，存储心理标签
  budgetLevel: varchar("budget_level", { length: 20 }), // 消费能力
  customerTier: varchar("customer_tier", { length: 10 }), // 客户分层
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * 消息记录表 - 存储对话中的每条消息
 */
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  role: varchar("role", { length: 20 }).notNull(),
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
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  airtableId: varchar("airtable_id", { length: 100 }).unique(), // Airtable 记录 ID
  name: varchar("name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  wechat: varchar("wechat", { length: 100 }),
  age: integer("age"), // 年龄
  interestedServices: text("interested_services"), // JSON 数组
  budget: varchar("budget", { length: 50 }),
  budgetLevel: varchar("budget_level", { length: 20 }), // 消费能力
  message: text("message"),
  source: varchar("source", { length: 50 }).notNull(), // 来源渠道
  sourceContent: varchar("source_content", { length: 255 }), // 来源内容
  status: varchar("status", { length: 50 }).default("new").notNull(), // new/contacted/interested/quoted/converted
  psychologyType: varchar("psychology_type", { length: 50 }), // 心理类型：恐惧型/贪婪型/安全型/敏感型
  psychologyTags: text("psychology_tags"), // 心理标签，JSON 数组
  customerTier: varchar("customer_tier", { length: 10 }), // 客户分层：A=高价值 B=中价值 C=低价值 D=无效
  notes: text("notes"), // 备注
  followUpDate: timestamp("follow_up_date"), // 下次跟进日期
  conversationId: integer("conversation_id"), // 关联的对话 ID
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
  syncedAt: timestamp("synced_at"), // 同步到 Airtable 的时间
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

/**
 * 触发器表 - 存储自动化营销触发规则
 */
export const triggers = pgTable("triggers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(), // 触发器名称
  description: text("description"), // 描述
  type: varchar("type", { length: 20 }).notNull(), // 触发类型
  // 时间触发配置
  timeConfig: text("time_config"), // JSON: { type: "birthday|holiday|reminder", date: "2024-01-01", time: "10:00", repeat: "yearly|monthly|once" }
  // 行为触发配置
  behaviorConfig: text("behavior_config"), // JSON: { event: "browse_no_consult|consult_no_book|book_no_show", duration: 24, unit: "hours" }
  // 天气触发配置
  weatherConfig: text("weather_config"), // JSON: { condition: "sunny|rainy|hot|cold", temperature: { min: 25, max: 35 }, projects: ["防晒", "补水"] }
  // 触发动作
  action: varchar("action", { length: 30 }).notNull(),
  actionConfig: text("action_config"), // JSON: { template: "xxx", content: "xxx", channel: "wechat|sms|email" }
  // 目标客户筛选
  targetFilter: text("target_filter"), // JSON: { customerTier: ["A", "B"], psychologyType: ["恐惧型"], source: ["小红书"] }
  isActive: integer("is_active").default(1).notNull(), // 1=active, 0=inactive
  executionCount: integer("execution_count").default(0).notNull(), // 执行次数
  lastExecutedAt: timestamp("last_executed_at"), // 最后执行时间
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type Trigger = typeof triggers.$inferSelect;
export type InsertTrigger = typeof triggers.$inferInsert;

/**
 * 触发器执行记录表 - 记录每次触发的执行情况
 */
export const triggerExecutions = pgTable("trigger_executions", {
  id: serial("id").primaryKey(),
  triggerId: integer("trigger_id").notNull(), // 关联触发器 ID
  leadId: integer("lead_id"), // 关联线索 ID
  executedAt: timestamp("executed_at").defaultNow().notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  result: text("result"), // 执行结果详情
  errorMessage: text("error_message"), // 错误信息
});

export type TriggerExecution = typeof triggerExecutions.$inferSelect;
export type InsertTriggerExecution = typeof triggerExecutions.$inferInsert;

/**
 * 小红书内容表 - 存储小红书发布的内容及数据
 */
export const xiaohongshuPosts = pgTable("xiaohongshu_posts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  images: text("images"), // JSON 数组，存储图片 URL
  tags: text("tags"), // JSON 数组，存储话题标签
  contentType: varchar("content_type", { length: 50 }).notNull(), // 项目体验/效果对比/价格揭秘/避坑指南/节日营销
  project: varchar("project", { length: 100 }), // 关联项目
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  publishedAt: timestamp("published_at"), // 发布时间
  scheduledAt: timestamp("scheduled_at"), // 计划发布时间
  // 数据监控
  viewCount: integer("view_count").default(0).notNull(), // 阅读量
  likeCount: integer("like_count").default(0).notNull(), // 点赞数
  commentCount: integer("comment_count").default(0).notNull(), // 评论数
  shareCount: integer("share_count").default(0).notNull(), // 转发数
  collectCount: integer("collect_count").default(0).notNull(), // 收藏数
  lastSyncedAt: timestamp("last_synced_at"), // 最后同步数据时间
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type XiaohongshuPost = typeof xiaohongshuPosts.$inferSelect;
export type InsertXiaohongshuPost = typeof xiaohongshuPosts.$inferInsert;

/**
 * 小红书评论表 - 存储小红书内容的评论
 */
export const xiaohongshuComments = pgTable("xiaohongshu_comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(), // 关联内容 ID
  authorName: varchar("author_name", { length: 100 }).notNull(), // 评论者昵称
  authorAvatar: varchar("author_avatar", { length: 500 }), // 评论者头像
  content: text("content").notNull(), // 评论内容
  replyContent: text("reply_content"), // 回复内容
  replyStatus: varchar("reply_status", { length: 20 }).default("pending").notNull(),
  sentiment: varchar("sentiment", { length: 20 }), // 情感分析
  isFiltered: integer("is_filtered").default(0).notNull(), // 是否被敏感词过滤
  commentedAt: timestamp("commented_at").notNull(), // 评论时间
  repliedAt: timestamp("replied_at"), // 回复时间
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type XiaohongshuComment = typeof xiaohongshuComments.$inferSelect;
export type InsertXiaohongshuComment = typeof xiaohongshuComments.$inferInsert;

/**
 * 企业微信配置表 - 存储企业微信应用配置
 */
export const weworkConfig = pgTable("wework_config", {
  id: serial("id").primaryKey(),
  corpId: varchar("corp_id", { length: 100 }), // 企业 ID
  corpSecret: varchar("corp_secret", { length: 200 }), // 应用 Secret
  agentId: integer("agent_id"), // 应用 AgentID
  token: varchar("token", { length: 100 }), // 回调 Token
  encodingAesKey: varchar("encoding_aes_key", { length: 200 }), // 回调加密密钥
  accessToken: text("access_token"), // Access Token（缓存）
  tokenExpiresAt: timestamp("token_expires_at"), // Token 过期时间
  isActive: integer("is_active").default(1).notNull(), // 1=启用, 0=禁用
  isMockMode: integer("is_mock_mode").default(1).notNull(), // 1=模拟模式, 0=真实模式
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type WeworkConfig = typeof weworkConfig.$inferSelect;
export type InsertWeworkConfig = typeof weworkConfig.$inferInsert;

/**
 * 企业微信"联系我"配置表 - 存储生成的二维码配置
 */
export const weworkContactWay = pgTable("wework_contact_way", {
  id: serial("id").primaryKey(),
  configId: varchar("config_id", { length: 100 }).notNull().unique(), // 企业微信返回的配置 ID
  type: varchar("type", { length: 10 }).default("single").notNull(), // single=单人, multi=多人
  scene: varchar("scene", { length: 10 }).default("1").notNull(), // 1=在小程序中联系, 2=通过二维码联系
  qrCode: text("qr_code"), // 二维码 URL
  remark: varchar("remark", { length: 255 }), // 备注说明
  skipVerify: integer("skip_verify").default(1).notNull(), // 1=自动添加, 0=需要验证
  state: varchar("state", { length: 100 }), // 自定义状态（用于追踪来源）
  userIds: text("user_ids"), // JSON 数组，企业成员 UserID 列表
  isActive: integer("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type WeworkContactWay = typeof weworkContactWay.$inferSelect;
export type InsertWeworkContactWay = typeof weworkContactWay.$inferInsert;

/**
 * 企业微信客户表 - 存储通过企业微信添加的客户
 */
export const weworkCustomers = pgTable("wework_customers", {
  id: serial("id").primaryKey(),
  externalUserId: varchar("external_user_id", { length: 100 }).notNull().unique(), // 企业微信外部联系人 ID
  name: varchar("name", { length: 100 }),
  avatar: text("avatar"), // 头像 URL
  type: varchar("type", { length: 10 }).default("1").notNull(), // 1=微信用户, 2=企业微信用户
  gender: varchar("gender", { length: 10 }).default("0").notNull(), // 0=未知, 1=男, 2=女
  unionId: varchar("union_id", { length: 100 }), // 微信 UnionID
  position: varchar("position", { length: 100 }), // 职位
  corpName: varchar("corp_name", { length: 200 }), // 企业名称
  corpFullName: varchar("corp_full_name", { length: 200 }), // 企业全称
  externalProfile: text("external_profile"), // JSON 格式，外部联系人详细信息
  followUserId: varchar("follow_user_id", { length: 100 }), // 添加该客户的企业成员 UserID
  remark: varchar("remark", { length: 255 }), // 备注
  description: text("description"), // 描述
  createTime: timestamp("create_time"), // 添加时间（企业微信）
  tags: text("tags"), // JSON 数组，标签列表
  state: varchar("state", { length: 100 }), // 来源（对应"联系我"的 state）
  conversationId: integer("conversation_id"), // 关联的对话 ID
  leadId: varchar("lead_id", { length: 100 }), // 关联的 Airtable 线索 ID
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type WeworkCustomer = typeof weworkCustomers.$inferSelect;
export type InsertWeworkCustomer = typeof weworkCustomers.$inferInsert;

/**
 * 企业微信消息记录表 - 存储发送的消息
 */
export const weworkMessages = pgTable("wework_messages", {
  id: serial("id").primaryKey(),
  externalUserId: varchar("external_user_id", { length: 100 }).notNull(), // 接收消息的客户 ID
  sendUserId: varchar("send_user_id", { length: 100 }).notNull(), // 发送消息的企业成员 UserID
  msgType: varchar("msg_type", { length: 20 }).notNull(), // text/image/link/miniprogram
  content: text("content").notNull(), // 消息内容（JSON 格式）
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  errorMsg: text("error_msg"), // 错误信息
  sentAt: timestamp("sent_at"), // 发送时间
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WeworkMessage = typeof weworkMessages.$inferSelect;
export type InsertWeworkMessage = typeof weworkMessages.$inferInsert;
