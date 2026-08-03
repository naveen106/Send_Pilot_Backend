-- Drop email_logs (may already be gone on some envs that dropped it manually)
DROP TABLE IF EXISTS `email_logs`;

-- Add recipients column to campaigns
ALTER TABLE `campaigns` ADD COLUMN `recipients` LONGTEXT NOT NULL;
