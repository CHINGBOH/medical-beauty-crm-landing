import Airtable from 'airtable';

export class AirtableService {
  private base: Airtable.Base;

  constructor(apiKey: string, baseId: string) {
    Airtable.configure({ apiKey });
    this.base = new Airtable({ apiKey }).base(baseId);
  }

  // 创建线索记录
  async createLead(data: {
    name?: string;
    phone: string;
    wechat?: string;
    interest?: string;
    budget?: string;
    source?: string;
    conversationId?: string;
    psychologicalType?: string;
  }) {
    try {
      const record = await this.base('leads').create([
        {
          fields: {
            '姓名': data.name || '',
            '手机号': data.phone,
            '微信': data.wechat || '',
            '意向项目': data.interest || '',
            '预算': data.budget || '',
            '来源渠道': data.source || 'chat',
            '对话ID': data.conversationId || '',
            '心理类型': data.psychologicalType || '',
            '状态': '新线索',
            '创建时间': new Date().toISOString()
          }
        }
      ]);

      return record[0].getId();
    } catch (error) {
      console.error('Airtable创建记录失败:', error);
      throw error;
    }
  }

  // 读取客户历史记录
  async getCustomerHistory(phone: string) {
    try {
      const records = await this.base('leads')
        .select({
          filterByFormula: `{手机号} = '${phone}'`,
          sort: [{ field: '创建时间', direction: 'desc' }]
        })
        .all();

      return records.map(record => ({
        id: record.id,
        ...record.fields
      }));
    } catch (error) {
      console.error('读取Airtable记录失败:', error);
      return [];
    }
  }
}