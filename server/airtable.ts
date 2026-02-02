/**
 * Airtable API 集成工具
 * 用于与 Airtable 进行数据同步
 */

const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_API_URL = "https://api.airtable.com/v0";

interface AirtableRecord {
  id?: string;
  fields: Record<string, unknown>;
  createdTime?: string;
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

/**
 * 创建 Airtable 记录
 */
export async function createAirtableRecord(
  tableName: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord> {
  if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID) {
    throw new Error("Airtable credentials not configured");
  }

  const url = `${AIRTABLE_API_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      records: [{ fields }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airtable API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as AirtableResponse;
  return data.records[0]!;
}

/**
 * 获取 Airtable 记录
 */
export async function getAirtableRecords(
  tableName: string,
  filterFormula?: string,
  maxRecords?: number
): Promise<AirtableRecord[]> {
  if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID) {
    throw new Error("Airtable credentials not configured");
  }

  const params = new URLSearchParams();
  if (filterFormula) params.append("filterByFormula", filterFormula);
  if (maxRecords) params.append("maxRecords", maxRecords.toString());

  const url = `${AIRTABLE_API_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airtable API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as AirtableResponse;
  return data.records;
}

/**
 * 更新 Airtable 记录
 */
export async function updateAirtableRecord(
  tableName: string,
  recordId: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord> {
  if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID) {
    throw new Error("Airtable credentials not configured");
  }

  const url = `${AIRTABLE_API_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}/${recordId}`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airtable API error: ${response.status} - ${error}`);
  }

  return (await response.json()) as AirtableRecord;
}

/**
 * 创建线索到 Airtable
 */
export async function createLeadInAirtable(leadData: {
  name: string;
  phone: string;
  wechat?: string;
  interestedServices?: string[];
  budget?: string;
  message?: string;
  source: string;
  sourceContent?: string;
}): Promise<string> {
  const fields: Record<string, unknown> = {
    "姓名": leadData.name,
    "手机号": leadData.phone,
    "来源渠道": leadData.source,
    "线索状态": "新线索",
  };

  if (leadData.wechat) fields["微信号"] = leadData.wechat;
  if (leadData.interestedServices && leadData.interestedServices.length > 0) {
    fields["意向项目"] = leadData.interestedServices;
  }
  if (leadData.budget) fields["预算区间"] = leadData.budget;
  if (leadData.message) fields["留言内容"] = leadData.message;
  if (leadData.sourceContent) fields["来源内容"] = leadData.sourceContent;

  const record = await createAirtableRecord("线索池", fields);
  return record.id!;
}

/**
 * 获取线索列表
 */
export async function getLeadsFromAirtable(status?: string): Promise<AirtableRecord[]> {
  let filterFormula = "";
  if (status) {
    filterFormula = `{线索状态} = '${status}'`;
  }
  return getAirtableRecords("线索池", filterFormula);
}

/**
 * 更新线索状态
 */
export async function updateLeadStatus(
  recordId: string,
  status: string
): Promise<AirtableRecord> {
  return updateAirtableRecord("线索池", recordId, {
    "线索状态": status,
  });
}
