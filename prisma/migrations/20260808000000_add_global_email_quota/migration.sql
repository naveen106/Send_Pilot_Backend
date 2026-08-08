CREATE TABLE `emailQuotaLocks` (
  `id` INTEGER NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `emailQuotaLocks` (`id`, `updatedAt`)
VALUES (1, CURRENT_TIMESTAMP(3));

CREATE TABLE `emailSendReservations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `campaignId` INTEGER NOT NULL,
  `recipientEmail` VARCHAR(254) NOT NULL,
  `reservedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `emailSendReservations_reservedAt_idx`(`reservedAt`),
  UNIQUE INDEX `emailSendReservations_campaignId_recipientEmail_key`(`campaignId`, `recipientEmail`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `emailQuotaUsage` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `campaignId` INTEGER NOT NULL,
  `recipientEmail` VARCHAR(254) NOT NULL,
  `sentAt` DATETIME(3) NOT NULL,

  INDEX `emailQuotaUsage_sentAt_idx`(`sentAt`),
  INDEX `emailQuotaUsage_campaignId_sentAt_idx`(`campaignId`, `sentAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `emailQuotaUsage` (`campaignId`, `recipientEmail`, `sentAt`)
SELECT `campaignId`, `recipientEmail`, `sentAt`
FROM `emailDeliveries`;
