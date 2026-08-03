CREATE TABLE `emailDeliveries` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `campaignId` INTEGER NOT NULL,
  `contactId` INTEGER NULL,
  `recipientEmail` VARCHAR(254) NOT NULL,
  `subject` VARCHAR(998) NOT NULL,
  `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `emailDeliveries_campaignId_sentAt_idx`(`campaignId`, `sentAt`),
  INDEX `emailDeliveries_contactId_idx`(`contactId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `emailDeliveries`
  ADD CONSTRAINT `emailDeliveries_campaignId_fkey`
  FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `emailDeliveries`
  ADD CONSTRAINT `emailDeliveries_contactId_fkey`
  FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve the history already represented by successful assignment rows.
INSERT INTO `emailDeliveries`
  (`campaignId`, `contactId`, `recipientEmail`, `subject`, `sentAt`, `createdAt`)
SELECT
  assignment.`campaignId`,
  assignment.`contactId`,
  contact.`email`,
  campaign.`subject`,
  assignment.`updatedAt`,
  assignment.`createdAt`
FROM `assignedCampaigns` AS assignment
INNER JOIN `campaigns` AS campaign ON campaign.`id` = assignment.`campaignId`
INNER JOIN `contacts` AS contact ON contact.`id` = assignment.`contactId`
WHERE assignment.`deliveryStatus` = 'SENT';
