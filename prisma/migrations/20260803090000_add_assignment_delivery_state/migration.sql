ALTER TABLE `campaigns`
  ADD COLUMN `isAssigned` BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX `assignedCampaigns_campaignId_contactId_key`
  ON `assignedCampaigns`(`campaignId`, `contactId`);
