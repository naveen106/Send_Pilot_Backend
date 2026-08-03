-- The previous JSON migration could leave the old index name attached only
-- to campaignId after contactId was removed. Replace it with the intended
-- composite uniqueness constraint.
SET @foreign_key_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'assignedCampaigns'
    AND constraint_name = 'assignedCampaigns_campaignId_fkey'
);
SET @sql = IF(@foreign_key_exists = 1,
  'ALTER TABLE `assignedCampaigns` DROP FOREIGN KEY `assignedCampaigns_campaignId_fkey`',
  'SELECT 1');
PREPARE migration_stmt FROM @sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @index_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'assignedCampaigns'
    AND index_name = 'assignedCampaigns_campaignId_contactId_key'
);
SET @sql = IF(@index_exists = 1,
  'ALTER TABLE `assignedCampaigns` DROP INDEX `assignedCampaigns_campaignId_contactId_key`',
  'SELECT 1');
PREPARE migration_stmt FROM @sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

CREATE UNIQUE INDEX `assignedCampaigns_campaignId_contactId_key`
  ON `assignedCampaigns` (`campaignId`, `contactId`);

SET @foreign_key_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'assignedCampaigns'
    AND constraint_name = 'assignedCampaigns_campaignId_fkey'
);
SET @sql = IF(@foreign_key_exists = 0,
  'ALTER TABLE `assignedCampaigns` ADD CONSTRAINT `assignedCampaigns_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1');
PREPARE migration_stmt FROM @sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;
