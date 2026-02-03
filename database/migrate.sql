-- 医美智能营销管理系统数据库迁移脚本

-- 使用现有表结构，添加必要的扩展字段
ALTER TABLE leads ADD COLUMN IF NOT EXISTS psychological_type ENUM('fear', 'greed', 'security', 'sensitive') DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consumption_level ENUM('high', 'medium', 'low') DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS customer_tier ENUM('A', 'B', 'C', 'D') DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags JSON DEFAULT NULL;

-- 创建内容发布表
CREATE TABLE IF NOT EXISTS content_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  tags VARCHAR(500),
  project_type VARCHAR(100),
  images JSON,
  status ENUM('draft', 'published') DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 创建客户标签表
CREATE TABLE IF NOT EXISTS customer_tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  tag_type ENUM('psychology', 'behavior', 'lifecycle', 'event') NOT NULL,
  tag_name VARCHAR(100) NOT NULL,
  tag_value VARCHAR(200),
  confidence FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

-- 创建客户事件表
CREATE TABLE IF NOT EXISTS customer_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  event_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

-- 创建触发规则表
CREATE TABLE IF NOT EXISTS trigger_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_name VARCHAR(200) NOT NULL,
  trigger_type ENUM('time', 'behavior', 'weather') NOT NULL,
  trigger_condition JSON NOT NULL,
  action_type ENUM('wechat_push', 'ai_chat', 'assign_consultant', 'sms') NOT NULL,
  action_config JSON,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 创建触发日志表
CREATE TABLE IF NOT EXISTS trigger_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_id INT NOT NULL,
  lead_id INT,
  trigger_time TIMESTAMP NOT NULL,
  action_result JSON,
  status ENUM('success', 'failed') NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rule_id) REFERENCES trigger_rules(id) ON DELETE CASCADE
);

-- 创建小红书发布表
CREATE TABLE IF NOT EXISTS xiaohongshu_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(200),
  content TEXT,
  images JSON,
  views INT DEFAULT 0,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  collects INT DEFAULT 0,
  shares INT DEFAULT 0,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 创建小红书评论表
CREATE TABLE IF NOT EXISTS xiaohongshu_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id VARCHAR(100) NOT NULL,
  comment_id VARCHAR(100) UNIQUE NOT NULL,
  user_name VARCHAR(100),
  content TEXT,
  replied BOOLEAN DEFAULT FALSE,
  is_potential_lead BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES xiaohongshu_posts(post_id) ON DELETE CASCADE
);

-- 创建系统配置表
CREATE TABLE IF NOT EXISTS system_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  config_key VARCHAR(100) UNIQUE NOT NULL,
  config_value TEXT,
  config_type VARCHAR(50) DEFAULT 'string',
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 插入默认配置
INSERT IGNORE INTO system_config (config_key, config_value, config_type, description) VALUES
('airtable_api_key', '', 'string', 'Airtable API密钥'),
('airtable_base_id', '', 'string', 'Airtable Base ID'),
('deepseek_api_key', '', 'string', 'DeepSeek API密钥'),
('qwen_api_key', '', 'string', 'Qwen API密钥'),
('clinic_name', '深圳妍美医疗美容门诊部', 'string', '诊所名称'),
('clinic_phone', '', 'string', '联系电话'),
('clinic_address', '', 'string', '诊所地址');

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_customer_tier ON leads(customer_tier);
CREATE INDEX IF NOT EXISTS idx_leads_psychological_type ON leads(psychological_type);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_content_posts_status ON content_posts(status);
CREATE INDEX IF NOT EXISTS idx_content_posts_project_type ON content_posts(project_type);
CREATE INDEX IF NOT EXISTS idx_customer_tags_lead_id ON customer_tags(lead_id);
CREATE INDEX IF NOT EXISTS idx_customer_events_lead_id ON customer_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_trigger_rules_is_active ON trigger_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_rule_id ON trigger_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_xiaohongshu_posts_published_at ON xiaohongshu_posts(published_at);
