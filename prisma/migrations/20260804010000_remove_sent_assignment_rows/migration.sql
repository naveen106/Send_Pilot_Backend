-- Successful assignment deliveries are now represented by emailDeliveries.
-- Keep assignedCampaigns limited to pending work items.
DELETE FROM `assignedCampaigns`
WHERE `deliveryStatus` = 'SENT';
