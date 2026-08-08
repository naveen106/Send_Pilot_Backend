import prisma from '../config/database';
import { CampaignStatus } from '@prisma/client';

/**
 * Aggregates the metrics displayed on the dashboard.
 *
 * Keeping this query separate from campaign operations makes the dashboard's
 * cross-domain reporting concerns explicit and keeps the campaign service focused.
 */
export async function getDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalCampaigns, totalContacts, scheduledCampaigns, sentToday, agg] = await Promise.all([
    prisma.campaign.count(),
    prisma.contact.count(),
    prisma.campaign.count({ where: { status: CampaignStatus.SCHEDULED } }),
    prisma.emailDelivery.count({ where: { sentAt: { gte: today } } }),
    prisma.campaign.aggregate({ _sum: { totalCount: true } }),
  ]);

  return {
    totalEmails: agg._sum.totalCount ?? 0,
    sentToday,
    scheduledCampaigns,
    totalCampaigns,
    totalContacts,
  };
}
