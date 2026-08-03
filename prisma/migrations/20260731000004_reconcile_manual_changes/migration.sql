-- Reconciliation of changes that were first applied manually on some environments.
-- Safe for fresh installs; already recorded as applied on existing DBs.

ALTER TABLE `campaigns` ADD COLUMN `attachments` MEDIUMTEXT NULL;

ALTER TABLE `campaigns` DROP FOREIGN KEY `campaigns_createdBy_fkey`;
ALTER TABLE `campaigns` MODIFY COLUMN `createdBy` INT NULL;
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_createdBy_fkey`
  FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Align htmlContent with schema (@db.Text)
ALTER TABLE `campaigns` MODIFY COLUMN `htmlContent` TEXT NOT NULL;
