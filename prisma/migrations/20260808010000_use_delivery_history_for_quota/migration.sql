ALTER TABLE `emailDeliveries`
  DROP FOREIGN KEY `emailDeliveries_campaignId_fkey`;

ALTER TABLE `emailDeliveries`
  MODIFY `campaignId` INTEGER NULL;

ALTER TABLE `emailDeliveries`
  ADD CONSTRAINT `emailDeliveries_campaignId_fkey`
  FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

DROP TABLE `emailQuotaUsage`;
