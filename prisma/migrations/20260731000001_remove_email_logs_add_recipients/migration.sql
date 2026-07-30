-- email_logs table was already dropped manually via SQL
-- Add recipients column to campaigns
ALTER TABLE `campaigns` ADD COLUMN `recipients` LONGTEXT NOT NULL;
