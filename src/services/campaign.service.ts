import prisma from '../config/database';
import logger from '../utils/logger';
import { sendCampaign } from './email.service';

export async function createCampaign(data: {
  name: string;
  subject: string;
  htmlContent: string;
  scheduledAt?: Date;
  createdBy: number;
}) {
  const contacts = await prisma.contact.findMany({ where: { isActive: true } });
  if (contacts.length === 0) throw new Error('No active contacts found');

  const campaign = await prisma.campaign.create({
    data: {
      name: data.name,
      subject: data.subject,
      htmlContent: data.htmlContent,
      scheduledAt: data.scheduledAt || null,
      status: data.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      totalCount: contacts.length,
      createdBy: data.createdBy,
    },
  });

  await prisma.emailLog.createMany({
    data: contacts.map((c) => ({ campaignId: campaign.id, contactId: c.id })),
  });

  logger.info(`Campaign created: ${campaign.name} [id: ${campaign.id}]`);
  return campaign;
}

export async function getCampaigns(page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.campaign.count(),
  ]);
  return { campaigns, total, page, limit };
}

export async function getCampaignById(id: number) {
  return prisma.campaign.findUnique({
    where: { id },
    include: {
      emailLogs: { include: { contact: true }, take: 50 },
      user: { select: { name: true, email: true } },
    },
  });
}

export async function sendCampaignNow(campaignId: number) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'RUNNING') throw new Error('Campaign already running');

  logger.info(`Triggering instant send for campaign ${campaignId}`);
  setImmediate(() => sendCampaign(campaignId));
  return { message: 'Campaign send initiated' };
}

export async function getDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalEmails, sentToday, scheduledCampaigns, totalCampaigns] = await Promise.all([
    prisma.emailLog.count(),
    prisma.emailLog.count({ where: { status: 'SENT', sentAt: { gte: today } } }),
    prisma.campaign.count({ where: { status: 'SCHEDULED' } }),
    prisma.campaign.count(),
  ]);

  return { totalEmails, sentToday, scheduledCampaigns, totalCampaigns };
}
