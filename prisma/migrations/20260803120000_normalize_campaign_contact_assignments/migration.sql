-- Normalize campaign assignments back to one row per campaign/contact.
-- The metadata checks make this recoverable after a partially-applied attempt
-- on MySQL versions that do not support ADD COLUMN IF NOT EXISTS.

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

SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'assignedCampaigns' AND column_name = 'createdAt'
);
SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `assignedCampaigns` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)',
  'SELECT 1');
PREPARE migration_stmt FROM @sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'assignedCampaigns' AND column_name = 'updatedAt'
);
SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `assignedCampaigns` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)',
  'SELECT 1');
PREPARE migration_stmt FROM @sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

-- Remove the temporary one-row-per-campaign constraint before rebuilding rows.
SET @index_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'assignedCampaigns'
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

-- Preserve the original relational rows.
INSERT IGNORE INTO `assignedCampaigns_normalized` (`campaignId`, `contactId`)
SELECT `campaignId`, `contactId`
FROM `assignedCampaigns`
WHERE `contactId` IS NOT NULL;

-- Expand JSON arrays from any partially-applied version. The generated
-- numbers cover contact lists up to 10,000 entries without JSON_TABLE.
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
) AS numbers ON numbers.n < JSON_LENGTH(assignment.`contactIds`)
WHERE assignment.`contactIds` IS NOT NULL
  AND JSON_EXTRACT(assignment.`contactIds`, CONCAT('$[', numbers.n, ']')) IS NOT NULL;

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

SET @index_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'assignedCampaigns'
    AND index_name = 'assignedCampaigns_campaignId_key'
);
SET @sql = IF(@index_exists = 1,
  'ALTER TABLE `assignedCampaigns` DROP INDEX `assignedCampaigns_campaignId_key`',
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
SET @sql = IF(@index_exists = 0,
  'CREATE UNIQUE INDEX `assignedCampaigns_campaignId_contactId_key` ON `assignedCampaigns` (`campaignId`, `contactId`)',
  'SELECT 1');
PREPARE migration_stmt FROM @sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;
