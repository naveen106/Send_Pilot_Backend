-- Convert the currently deployed JSON assignment table to relational rows.
-- This is compatible with both the deployed JSON shape and a clean database
-- replaying the corrected previous migration.

SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'assignedCampaigns' AND column_name = 'contactId'
);
SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `assignedCampaigns` ADD COLUMN `contactId` INTEGER NULL',
  'SELECT 1');
PREPARE migration_stmt FROM @sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'assignedCampaigns' AND column_name = 'contactIds'
);
SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `assignedCampaigns` ADD COLUMN `contactIds` JSON NULL',
  'SELECT 1');
PREPARE migration_stmt FROM @sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @index_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'assignedCampaigns'
    AND index_name = 'assignedCampaigns_campaignId_key'
);
SET @sql = IF(@index_exists = 1,
  'ALTER TABLE `assignedCampaigns` DROP INDEX `assignedCampaigns_campaignId_key`',
  'SELECT 1');
PREPARE migration_stmt FROM @sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

CREATE TEMPORARY TABLE `assignedCampaigns_normalized` (
  `campaignId` INTEGER NOT NULL,
  `contactId` INTEGER NOT NULL,
  PRIMARY KEY (`campaignId`, `contactId`)
);

INSERT IGNORE INTO `assignedCampaigns_normalized` (`campaignId`, `contactId`)
SELECT `campaignId`, `contactId`
FROM `assignedCampaigns`
WHERE `contactId` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `contacts` WHERE `contacts`.`id` = `assignedCampaigns`.`contactId`);

INSERT IGNORE INTO `assignedCampaigns_normalized` (`campaignId`, `contactId`)
SELECT
  assignment.`campaignId`,
  CAST(JSON_UNQUOTE(JSON_EXTRACT(assignment.`contactIds`, CONCAT('$[', numbers.n, ']'))) AS UNSIGNED)
FROM `assignedCampaigns` AS assignment
JOIN (
  SELECT ones.n + tens.n * 10 + hundreds.n * 100 + thousands.n * 1000 AS n
  FROM
    (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
     UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) ones
  CROSS JOIN
    (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
     UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) tens
  CROSS JOIN
    (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
     UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) hundreds
  CROSS JOIN
    (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
     UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) thousands
) AS numbers ON assignment.`contactIds` IS NOT NULL
  AND numbers.n < JSON_LENGTH(assignment.`contactIds`)
JOIN `contacts` AS contact ON contact.`id` = CAST(JSON_UNQUOTE(JSON_EXTRACT(assignment.`contactIds`, CONCAT('$[', numbers.n, ']'))) AS UNSIGNED)
WHERE JSON_EXTRACT(assignment.`contactIds`, CONCAT('$[', numbers.n, ']')) IS NOT NULL;

DELETE FROM `assignedCampaigns`;

INSERT INTO `assignedCampaigns` (`campaignId`, `contactId`)
SELECT `campaignId`, `contactId`
FROM `assignedCampaigns_normalized`;

DROP TEMPORARY TABLE `assignedCampaigns_normalized`;

SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'assignedCampaigns' AND column_name = 'contactIds'
);
SET @sql = IF(@column_exists = 1,
  'ALTER TABLE `assignedCampaigns` DROP COLUMN `contactIds`',
  'SELECT 1');
PREPARE migration_stmt FROM @sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

ALTER TABLE `assignedCampaigns` MODIFY COLUMN `contactId` INTEGER NOT NULL;

SET @foreign_key_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE() AND table_name = 'assignedCampaigns'
    AND constraint_name = 'assignedCampaigns_contactId_fkey'
);
SET @sql = IF(@foreign_key_exists = 0,
  'ALTER TABLE `assignedCampaigns` ADD CONSTRAINT `assignedCampaigns_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1');
PREPARE migration_stmt FROM @sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @index_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'assignedCampaigns'
    AND index_name = 'assignedCampaigns_campaignId_contactId_key'
);
SET @sql = IF(@index_exists = 0,
  'CREATE UNIQUE INDEX `assignedCampaigns_campaignId_contactId_key` ON `assignedCampaigns` (`campaignId`, `contactId`)',
  'SELECT 1');
PREPARE migration_stmt FROM @sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;
