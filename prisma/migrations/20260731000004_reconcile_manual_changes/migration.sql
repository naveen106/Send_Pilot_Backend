-- -----------------------------------------------------------------------------
-- Reconciliation migration — records manual changes already applied to the DB.
-- This migration is intentionally a no-op: every statement below was already
-- executed directly via MySQL. It exists solely to bring Prisma's migration
-- history in sync with the actual database schema.
--
-- Changes recorded:
--   1. email_logs table was dropped manually (recorded in 20260731000001 comment)
--   2. campaigns.attachments column was added manually
--   3. campaigns.createdBy changed from INT NOT NULL → INT NULL (SetNull FK)
-- -----------------------------------------------------------------------------

-- [already applied] Add attachments column if it doesn't exist yet
-- ALTER TABLE `campaigns` ADD COLUMN `attachments` MEDIUMTEXT NULL;

-- [already applied] Drop the old RESTRICT foreign key
-- ALTER TABLE `campaigns` DROP FOREIGN KEY `campaigns_createdBy_fkey`;

-- [already applied] Make createdBy nullable
-- ALTER TABLE `campaigns` MODIFY COLUMN `createdBy` INT NULL;

-- [already applied] Recreate FK with SET NULL on delete
-- ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_createdBy_fkey`
--   FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`)
--   ON DELETE SET NULL ON UPDATE CASCADE;
