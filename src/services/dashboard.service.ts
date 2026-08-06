import prisma from '../config/database';

/**
 * Aggregates the metrics displayed on the dashboard.
 *
 * Keeping this query separate from campaign operations makes the dashboard's
 * cross-domain reporting concerns explicit and keeps the campaign service focused.
 */
export async function getDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalCampaigns, totalContacts, scheduledCampaigns, completedToday, agg] = await Promise.all([
    prisma.campaign.count(),
    prisma.contact.count(),
    prisma.campaign.count({ where: { status: 'SCHEDULED' } }),
    prisma.campaign.count({ where: { status: 'COMPLETED', updatedAt: { gte: today } } }),
    prisma.campaign.aggregate({ _sum: { totalCount: true } }),
  ]);

  return {
    totalEmails: agg._sum.totalCount ?? 0,
    sentToday: completedToday,
    scheduledCampaigns,
    totalCampaigns,
    totalContacts,
  };
}
