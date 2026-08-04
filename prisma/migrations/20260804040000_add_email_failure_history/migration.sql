CREATE TABLE `emailFailures` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `campaignId` INTEGER NOT NULL,
  `contactId` INTEGER NULL,
  `recipientEmail` VARCHAR(254) NOT NULL,
  `reason` TEXT NOT NULL,
  `failedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `emailFailures_campaignId_failedAt_idx`(`campaignId`, `failedAt`),
  INDEX `emailFailures_contactId_idx`(`contactId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `emailFailures_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `emailFailures_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
