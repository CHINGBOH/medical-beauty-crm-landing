import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

interface AccessToken {
  token: string;
  expiresAt: number;
}

interface WechatCustomer {
  external_userid: string;
  name: string;
  avatar: string;
  gender: number;
  unionid?: string;
  position?: string;
  corp_name?: string;
  corp_full_name?: string;
  type: number;
  follow_info: {
    userid: string;
    remark: string;
    description: string;
    createtime: number;
    tag_id: string[];
    remark_corp_name: string;
    remark_mobiles: string[];
    state: string;
    add_way: number;
  };
}

export class WechatService {
  private corpId: string;
  private corpSecret: string;
  private agentId: string;
  
  private accessToken: AccessToken | null = null;
  private tokenRefreshTimeout: NodeJS.Timeout | null = null;

  constructor(corpId?: string, corpSecret?: string, agentId?: string) {
    this.corpId = corpId || config.weworkCorpId || '';
    this.corpSecret = corpSecret || config.weworkSecret || '';
    this.agentId = agentId || (process.env.WEWORK_AGENT_ID || '');
  }

  // 初始化服务
  async initialize() {
    await this.refreshAccessToken();
    
    // 设置定时刷新token
    this.tokenRefreshTimeout = setInterval(() => {
      this.refreshAccessToken().catch(error => {
        logger.error('刷新企业微信token失败:', error);
      });
    }, 90 * 60 * 1000); // 90分钟刷新一次
    
    logger.info('企业微信服务初始化完成');
  }

  // 刷新access_token
  private async refreshAccessToken(): Promise<void> {
    try {
      const response = await axios.get(
        'https://qyapi.weixin.qq.com/cgi-bin/gettoken',
        {
          params: {
            corpid: this.corpId,
            corpsecret: this.corpSecret
          }
        }
      );

      if (response.data.errcode !== 0) {
        throw new Error(`获取token失败: ${response.data.errmsg}`);
      }

      this.accessToken = {
        token: response.data.access_token,
        expiresAt: Date.now() + (response.data.expires_in - 300) * 1000 // 提前5分钟过期
      };

      logger.info('企业微信access_token刷新成功');
    } catch (error) {
      logger.error('刷新企业微信token失败:', error);
      throw error;
    }
  }

  // 获取当前有效的token
  private async getValidToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.accessToken.expiresAt) {
      await this.refreshAccessToken();
    }
    return this.accessToken!.token;
  }

  // 发送消息给客户
  async sendMessageToCustomer(externalUserId: string, message: string): Promise<boolean> {
    try {
      const token = await this.getValidToken();
      
      const response = await axios.post(
        'https://qyapi.weixin.qq.com/cgi-bin/externalcontact/message/send',
        {
          to_external_user: [externalUserId],
          msgtype: 'text',
          text: {
            content: message
          },
          agentid: this.agentId
        },
        {
          params: { access_token: token }
        }
      );

      if (response.data.errcode !== 0) {
        throw new Error(`发送消息失败: ${response.data.errmsg}`);
      }

      logger.info(`消息发送成功: ${externalUserId}`);
      return true;
    } catch (error) {
      logger.error('发送企业微信消息失败:', error);
      return false;
    }
  }

  // 获取客户列表
  async getCustomerList(userId?: string): Promise<WechatCustomer[]> {
    try {
      const token = await this.getValidToken();
      
      let url = 'https://qyapi.weixin.qq.com/cgi-bin/externalcontact/list';
      if (userId) {
        url += `?userid=${userId}`;
      }
      
      const response = await axios.get(url, {
        params: { access_token: token }
      });

      if (response.data.errcode !== 0) {
        throw new Error(`获取客户列表失败: ${response.data.errmsg}`);
      }

      const externalUserIds = response.data.external_userid || [];
      
      // 批量获取客户详情
      const customers: WechatCustomer[] = [];
      for (const externalUserId of externalUserIds) {
        try {
          const customer = await this.getCustomerDetail(externalUserId);
          if (customer) {
            customers.push(customer);
          }
        } catch (error) {
          logger.error(`获取客户详情失败: ${externalUserId}`, error);
        }
      }

      return customers;
    } catch (error) {
      logger.error('获取企业微信客户列表失败:', error);
      return [];
    }
  }

  // 获取客户详情
  async getCustomerDetail(externalUserId: string): Promise<WechatCustomer | null> {
    try {
      const token = await this.getValidToken();
      
      const response = await axios.get(
        'https://qyapi.weixin.qq.com/cgi-bin/externalcontact/get',
        {
          params: {
            external_userid: externalUserId,
            access_token: token
          }
        }
      );

      if (response.data.errcode !== 0) {
        throw new Error(`获取客户详情失败: ${response.data.errmsg}`);
      }

      return response.data;
    } catch (error) {
      logger.error('获取企业微信客户详情失败:', error);
      return null;
    }
  }

  // 同步客户到数据库
  async syncCustomersToDatabase(): Promise<number> {
    try {
      const customers = await this.getCustomerList();
      let syncedCount = 0;

      for (const wechatCustomer of customers) {
        const existingCustomer = await Lead.findOne({
          wechat: wechatCustomer.external_userid
        });

        if (!existingCustomer) {
          // 创建新客户记录
          await Lead.create({
            name: wechatCustomer.name || wechatCustomer.follow_info?.remark || '',
            phone: wechatCustomer.follow_info?.remark_mobiles?.[0] || '',
            wechat: wechatCustomer.external_userid,
            source: 'wechat_work',
            wechatInfo: {
              avatar: wechatCustomer.avatar,
              gender: wechatCustomer.gender,
              corpName: wechatCustomer.corp_name,
              addWay: wechatCustomer.follow_info?.add_way,
              remark: wechatCustomer.follow_info?.remark,
              tagIds: wechatCustomer.follow_info?.tag_id || []
            }
          });
          syncedCount++;
        } else {
          // 更新现有客户信息
          await Lead.findByIdAndUpdate(existingCustomer._id, {
            name: wechatCustomer.name || wechatCustomer.follow_info?.remark || existingCustomer.name,
            phone: wechatCustomer.follow_info?.remark_mobiles?.[0] || existingCustomer.phone,
            wechatInfo: {
              avatar: wechatCustomer.avatar,
              gender: wechatCustomer.gender,
              corpName: wechatCustomer.corp_name,
              addWay: wechatCustomer.follow_info?.add_way,
              remark: wechatCustomer.follow_info?.remark,
              tagIds: wechatCustomer.follow_info?.tag_id || []
            },
            updatedAt: new Date()
          });
        }
      }

      logger.info(`同步了 ${syncedCount} 个新客户`);
      return syncedCount;
    } catch (error) {
      logger.error('同步企业微信客户失败:', error);
      return 0;
    }
  }

  // 创建「联系我」二维码
  async createContactMeQRCode(config: {
    type: number;
    scene: number;
    style?: number;
    remark?: string;
    skip_verify?: boolean;
    state?: string;
    user?: string[];
  }): Promise<{ qr_code: string }> {
    try {
      const token = await this.getValidToken();
      
      const response = await axios.post(
        'https://qyapi.weixin.qq.com/cgi-bin/externalcontact/add_contact_way',
        {
          type: config.type || 1,
          scene: config.scene || 2,
          style: config.style || 1,
          remark: config.remark || '医美咨询',
          skip_verify: config.skip_verify || true,
          state: config.state || 'med_beauty',
          user: config.user || []
        },
        {
          params: { access_token: token }
        }
      );

      if (response.data.errcode !== 0) {
        throw new Error(`创建联系二维码失败: ${response.data.errmsg}`);
      }

      return {
        qr_code: response.data.qr_code
      };
    } catch (error) {
      logger.error('创建企业微信联系二维码失败:', error);
      throw error;
    }
  }

  // 处理回调消息
  handleCallback(data: any, msgSignature: string, timestamp: string, nonce: string): any {
    // 验证签名
    const valid = this.verifySignature(msgSignature, timestamp, nonce, data.Encrypt);
    if (!valid) {
      throw new Error('签名验证失败');
    }

    // 解密消息
    const decrypted = this.decryptMessage(data.Encrypt);
    
    // 处理不同类型的回调
    switch (decrypted.InfoType) {
      case 'change_external_contact':
        return this.handleCustomerChange(decrypted);
        
      case 'change_external_chat':
        return this.handleChatChange(decrypted);
        
      case 'change_external_tag':
        return this.handleTagChange(decrypted);
        
      default:
        logger.warn('未知的回调类型:', decrypted.InfoType);
        return { status: 'ignored' };
    }
  }

  // 处理客户变更回调
  private async handleCustomerChange(data: any) {
    const { ChangeType, ExternalUserID, UserID } = data;
    
    switch (ChangeType) {
      case 'add_external_contact':
        // 新客户添加
        logger.info(`新客户添加: ${ExternalUserID}, 接待员工: ${UserID}`);
        await this.syncSingleCustomer(ExternalUserID);
        break;
        
      case 'edit_external_contact':
        // 客户信息修改
        logger.info(`客户信息修改: ${ExternalUserID}`);
        await this.syncSingleCustomer(ExternalUserID);
        break;
        
      case 'del_external_contact':
        // 客户删除
        logger.info(`客户删除: ${ExternalUserID}`);
        await this.markCustomerAsDeleted(ExternalUserID);
        break;
        
      case 'del_follow_user':
        // 员工删除客户
        logger.info(`员工 ${UserID} 删除了客户 ${ExternalUserID}`);
        break;
    }
    
    return { status: 'processed' };
  }

  // 同步单个客户
  private async syncSingleCustomer(externalUserId: string) {
    try {
      const customer = await this.getCustomerDetail(externalUserId);
      if (customer) {
        await this.updateCustomerInDatabase(customer);
      }
    } catch (error) {
      logger.error('同步单个客户失败:', error);
    }
  }

  // 更新数据库中的客户信息
  private async updateCustomerInDatabase(wechatCustomer: WechatCustomer) {
    const existingCustomer = await Lead.findOne({
      wechat: wechatCustomer.external_userid
    });

    const updateData = {
      name: wechatCustomer.name || wechatCustomer.follow_info?.remark || '',
      phone: wechatCustomer.follow_info?.remark_mobiles?.[0] || '',
      wechatInfo: {
        avatar: wechatCustomer.avatar,
        gender: wechatCustomer.gender,
        corpName: wechatCustomer.corp_name,
        addWay: wechatCustomer.follow_info?.add_way,
        remark: wechatCustomer.follow_info?.remark,
        tagIds: wechatCustomer.follow_info?.tag_id || []
      },
      updatedAt: new Date()
    };

    if (existingCustomer) {
      await Lead.findByIdAndUpdate(existingCustomer._id, updateData);
    } else {
      await Lead.create({
        ...updateData,
        wechat: wechatCustomer.external_userid,
        source: 'wechat_work'
      });
    }
  }

  // 标记客户为已删除
  private async markCustomerAsDeleted(externalUserId: string) {
    await Lead.findOneAndUpdate(
      { wechat: externalUserId },
      { 
        status: 'deleted',
        deletedAt: new Date(),
        updatedAt: new Date()
      }
    );
  }

  // 验证签名
  private verifySignature(signature: string, timestamp: string, nonce: string, encrypt: string): boolean {
    const token = config.wechatCallbackToken;
    const array = [token, timestamp, nonce, encrypt].sort();
    const str = array.join('');
    const sha1 = crypto.createHash('sha1');
    sha1.update(str);
    const computedSignature = sha1.digest('hex');
    return computedSignature === signature;
  }

  // 解密消息
  private decryptMessage(encrypt: string): any {
    // 这里需要实现解密逻辑
    // 企业微信使用AES加密，需要对应的密钥
    // 简化处理，返回示例数据
    return {
      InfoType: 'change_external_contact',
      ChangeType: 'add_external_contact',
      ExternalUserID: 'external_userid_example',
      UserID: 'userid_example'
    };
  }

  // 清理资源
  cleanup() {
    if (this.tokenRefreshTimeout) {
      clearInterval(this.tokenRefreshTimeout);
      this.tokenRefreshTimeout = null;
    }
    logger.info('企业微信服务已清理');
  }
}
