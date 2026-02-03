import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, 
  users, 
  knowledgeBase, 
  InsertKnowledgeBase,
  conversations,
  InsertConversation,
  messages,
  InsertMessage,
  leads,
  InsertLead
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ==================== 知识库相关 ====================

export async function createKnowledge(data: InsertKnowledgeBase) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(knowledgeBase).values(data);
}

export async function getActiveKnowledge(category?: string, type?: "customer" | "internal") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const conditions = [eq(knowledgeBase.isActive, 1)];
  if (category) {
    conditions.push(eq(knowledgeBase.category, category));
  }
  if (type) {
    conditions.push(eq(knowledgeBase.type, type));
  }
  
  return db.select().from(knowledgeBase)
    .where(and(...conditions))
    .orderBy(desc(knowledgeBase.usedCount));
}

export async function getAllKnowledge(type?: "customer" | "internal") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  if (type) {
    return db.select().from(knowledgeBase)
      .where(eq(knowledgeBase.type, type))
      .orderBy(desc(knowledgeBase.createdAt));
  }
  
  return db.select().from(knowledgeBase).orderBy(desc(knowledgeBase.createdAt));
}

export async function getKnowledgeById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(knowledgeBase)
    .where(eq(knowledgeBase.id, id))
    .limit(1);
  
  return result[0];
}

export async function updateKnowledge(id: number, data: Partial<InsertKnowledgeBase>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(knowledgeBase)
    .set(data)
    .where(eq(knowledgeBase.id, id));
}

export async function deleteKnowledge(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(knowledgeBase).where(eq(knowledgeBase.id, id));
}

export async function incrementKnowledgeUsage(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const knowledge = await db.select().from(knowledgeBase).where(eq(knowledgeBase.id, id)).limit(1);
  if (knowledge[0]) {
    await db.update(knowledgeBase)
      .set({ usedCount: knowledge[0].usedCount + 1 })
      .where(eq(knowledgeBase.id, id));
  }
}

// ==================== 对话相关 ====================

export async function createConversation(data: InsertConversation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(conversations).values(data);
}

export async function getConversationBySessionId(sessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(conversations)
    .where(eq(conversations.sessionId, sessionId))
    .limit(1);
  
  return result[0];
}

export async function updateConversation(sessionId: string, data: Partial<InsertConversation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(conversations)
    .set(data)
    .where(eq(conversations.sessionId, sessionId));
}

export async function getAllConversations() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(conversations).orderBy(desc(conversations.createdAt));
}

// ==================== 消息相关 ====================

export async function createMessage(data: InsertMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(messages).values(data);
}

export async function getMessagesByConversationId(conversationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
}

// ==================== 线索相关 ====================

export async function createLead(data: InsertLead) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(leads).values(data);
  return result;
}

export async function getLeadByPhone(phone: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(leads)
    .where(eq(leads.phone, phone))
    .limit(1);
  
  return result[0];
}

export async function updateLeadAirtableId(id: number, airtableId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(leads)
    .set({ 
      airtableId, 
      syncedAt: new Date() 
    })
    .where(eq(leads.id, id));
}

export async function getAllLeads() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(leads).orderBy(desc(leads.createdAt));
}

export async function getLeadById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return result[0] || null;
}

// ==================== 内容相关 ====================

export async function createContentPost(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { contentPosts } = await import("../drizzle/schema");
  const result = await db.insert(contentPosts).values(data);
  return { id: Number((result as any).insertId) };
}

export async function getContentPosts(status?: "draft" | "published", limit = 20, offset = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { contentPosts } = await import("../drizzle/schema");
  let query = db.select().from(contentPosts);
  if (status) {
    query = query.where(eq(contentPosts.status, status)) as any;
  }
  return query.orderBy(desc(contentPosts.createdAt)).limit(limit).offset(offset);
}


// ==================== 小红书相关 ====================

export async function getAllXiaohongshuPosts(status?: "draft" | "scheduled" | "published" | "deleted", limit = 20, offset = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { xiaohongshuPosts } = await import("../drizzle/schema");
  
  let query = db.select().from(xiaohongshuPosts);
  if (status) {
    query = query.where(eq(xiaohongshuPosts.status, status)) as any;
  }
  
  const posts = await query.orderBy(desc(xiaohongshuPosts.createdAt)).limit(limit).offset(offset);
  return posts;
}

export async function getXiaohongshuPostById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { xiaohongshuPosts } = await import("../drizzle/schema");
  
  const result = await db.select().from(xiaohongshuPosts).where(eq(xiaohongshuPosts.id, id)).limit(1);
  return result[0] || null;
}

export async function createXiaohongshuPost(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { xiaohongshuPosts } = await import("../drizzle/schema");
  
  const result = await db.insert(xiaohongshuPosts).values(data);
  return { id: Number((result as any).insertId) };
}

export async function updateXiaohongshuPost(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { xiaohongshuPosts } = await import("../drizzle/schema");
  
  await db.update(xiaohongshuPosts).set(data).where(eq(xiaohongshuPosts.id, id));
  return { success: true };
}

export async function getXiaohongshuComments(postId: number, replyStatus?: "pending" | "replied" | "ignored") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { xiaohongshuComments } = await import("../drizzle/schema");
  
  if (replyStatus) {
    const comments = await db.select().from(xiaohongshuComments)
      .where(and(eq(xiaohongshuComments.postId, postId), eq(xiaohongshuComments.replyStatus, replyStatus)))
      .orderBy(desc(xiaohongshuComments.commentedAt));
    return comments;
  }
  
  const comments = await db.select().from(xiaohongshuComments)
    .where(eq(xiaohongshuComments.postId, postId))
    .orderBy(desc(xiaohongshuComments.commentedAt));
  return comments;
}

export async function replyXiaohongshuComment(id: number, replyContent: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { xiaohongshuComments } = await import("../drizzle/schema");
  
  await db.update(xiaohongshuComments).set({
    replyContent,
    replyStatus: "replied",
    repliedAt: new Date(),
  }).where(eq(xiaohongshuComments.id, id));
  
  return { success: true };
}


// ==================== Triggers ====================

export async function getAllTriggers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { triggers } = await import("../drizzle/schema");
  
  const result = await db.select().from(triggers).orderBy(desc(triggers.createdAt));
  return result;
}

export async function getTriggerById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { triggers } = await import("../drizzle/schema");
  
  const result = await db.select().from(triggers).where(eq(triggers.id, id));
  return result[0] || null;
}

export async function createTrigger(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { triggers } = await import("../drizzle/schema");
  
  const result = await db.insert(triggers).values(data);
  return { id: Number((result as any).insertId) };
}

export async function updateTrigger(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { triggers } = await import("../drizzle/schema");
  
  await db.update(triggers).set(data).where(eq(triggers.id, id));
  return { success: true };
}

export async function deleteTrigger(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { triggers } = await import("../drizzle/schema");
  
  await db.delete(triggers).where(eq(triggers.id, id));
  return { success: true };
}

export async function getTriggerExecutions(triggerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { triggerExecutions } = await import("../drizzle/schema");
  
  const result = await db.select().from(triggerExecutions)
    .where(eq(triggerExecutions.triggerId, triggerId))
    .orderBy(desc(triggerExecutions.executedAt))
    .limit(50);
  return result;
}

export async function createTriggerExecution(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { triggerExecutions } = await import("../drizzle/schema");
  
  const result = await db.insert(triggerExecutions).values(data);
  return { id: Number((result as any).insertId) };
}
