ALTER TABLE `assignedCampaigns`
  ADD COLUMN `deliveryStatus` ENUM('PENDING', 'SENT') NOT NULL DEFAULT 'PENDING';

CREATE INDEX `assignedCampaigns_deliveryStatus_idx`
  ON `assignedCampaigns` (`campaignId`, `deliveryStatus`);
