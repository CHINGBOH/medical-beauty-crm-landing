-- 使用现有表结构，添加必要的扩展字段
ALTER TABLE leads ADD COLUMN IF NOT EXISTS psychological_type ENUM('fear', 'greed', 'security', 'sensitive') DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consumption_level ENUM('high', 'medium', 'low') DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS customer_tier ENUM('A', 'B', 'C', 'D') DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags JSON DEFAULT NULL;
