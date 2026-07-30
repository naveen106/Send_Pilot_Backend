import prisma from '../config/database';
import logger from '../utils/logger';
import { sendCampaign } from './email.service';

type SendMode = 'immediate' | 'scheduled' | 'interval';

export async function createCampaign(data: {
  name: string;
  subject: string;
  htmlContent: string;
  recipients: string[];
  scheduledAt?: Date;
  sendMode?: 'immediate' | 'scheduled' | 'interval';
  createdBy: number;
  attachments?: { filename: string; content: string; contentType: string }[];
}) {
  if (!data.recipients || data.recipients.length === 0)
    throw new Error('At least one recipient is required');

  const isScheduled = data.sendMode === 'scheduled' && !!data.scheduledAt;
  const recipients = data.recipients;

  const campaign = await prisma.campaign.create({
    data: {
      name: data.name,
      subject: data.subject,
      htmlContent: data.htmlContent,
      scheduledAt: isScheduled ? data.scheduledAt! : null,
      status: isScheduled ? 'SCHEDULED' : 'DRAFT',
      totalCount: recipients.length,
      recipients: JSON.stringify(recipients),
      attachments: JSON.stringify(data.attachments ?? []),
      createdBy: data.createdBy,
    },
  });

  const mode: SendMode = data.sendMode || 'immediate';
  logger.info(`Campaign created: ${campaign.name} [id: ${campaign.id}] mode: ${mode}`);

  if (!isScheduled) {
    setImmediate(() =>
      sendCampaign(campaign.id, mode).catch((err) =>
        logger.error(`Campaign ${campaign.id} send failed: ${err.message}`)
      )
    );
  }

  return { ...campaign, recipients };
}

const campaignSelect = {
  id: true,
  name: true,
  subject: true,
  htmlContent: true,
  status: true,
  scheduledAt: true,
  totalCount: true,
  recipients: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { name: true, email: true } },
} as const;

export async function getCampaigns(page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.campaign.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' }, select: campaignSelect }),
    prisma.campaign.count(),
  ]);

  const campaigns = rows.map(({ recipients, ...rest }) => ({
    ...rest,
    recipients: JSON.parse(recipients || '[]') as string[],
  }));

  return { campaigns, total, page, limit };
}

export async function getCampaignById(id: number) {
  const c = await prisma.campaign.findUnique({ where: { id }, select: campaignSelect });
  if (!c) return null;
  const { recipients, ...rest } = c;
  return { ...rest, recipients: JSON.parse(recipients || '[]') as string[] };
}

export async function deleteCampaign(id: number) {
  return prisma.campaign.delete({ where: { id } });
}

export async function sendCampaignNow(campaignId: number) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'RUNNING') throw new Error('Campaign already running');

  logger.info(`Triggering instant send for campaign ${campaignId}`);
  setImmediate(() => sendCampaign(campaignId, 'immediate'));
  return { message: 'Campaign send initiated' };
}

export async function getDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalCampaigns, scheduledCampaigns, completedToday] = await Promise.all([
    prisma.campaign.count(),
    prisma.campaign.count({ where: { status: 'SCHEDULED' } }),
    prisma.campaign.count({ where: { status: 'COMPLETED', updatedAt: { gte: today } } }),
  ]);

  // totalEmails = sum of totalCount across all campaigns
  const agg = await prisma.campaign.aggregate({ _sum: { totalCount: true } });

  return {
    totalEmails: agg._sum.totalCount ?? 0,
    sentToday: completedToday,
    scheduledCampaigns,
    totalCampaigns,
  };
}
