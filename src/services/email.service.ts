import prisma from '../config/database';
import { createTransporter } from '../config/smtp';
import { emailLogger } from '../utils/logger';

const DAILY_LIMIT = parseInt(process.env.DAILY_EMAIL_LIMIT || '500');
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10');
const DELAY_MIN = parseInt(process.env.RANDOM_DELAY_MIN || '1000');
const DELAY_MAX = parseInt(process.env.RANDOM_DELAY_MAX || '3000');

function randomDelay(): Promise<void> {
  const ms = Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN + 1)) + DELAY_MIN;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTodaySentCount(): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prisma.emailLog.count({
    where: { status: 'SENT', sentAt: { gte: today } },
  });
}

export async function sendCampaign(campaignId: number): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaign not found');

  const pendingLogs = await prisma.emailLog.findMany({
    where: { campaignId, status: { in: ['PENDING', 'RETRYING'] } },
    include: { contact: true },
  });

  if (pendingLogs.length === 0) {
    emailLogger.info(`Campaign ${campaignId}: no pending emails`);
    return;
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'RUNNING' } });

  const transporter = createTransporter();
  let sentToday = await getTodaySentCount();

  for (let i = 0; i < pendingLogs.length; i += BATCH_SIZE) {
    const batch = pendingLogs.slice(i, i + BATCH_SIZE);

    for (const log of batch) {
      if (sentToday >= DAILY_LIMIT) {
        emailLogger.warn(`Daily limit of ${DAILY_LIMIT} reached. Pausing campaign ${campaignId}`);
        await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
        return;
      }

      try {
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: log.contact.email,
          subject: campaign.subject,
          html: campaign.htmlContent,
        });

        await prisma.emailLog.update({
          where: { id: log.id },
          data: { status: 'SENT', sentAt: new Date() },
        });

        await prisma.campaign.update({
          where: { id: campaignId },
          data: { sentCount: { increment: 1 } },
        });

        sentToday++;
        emailLogger.info(`Sent to ${log.contact.email} [campaign: ${campaignId}]`);
      } catch (error) {
        const msg = (error as Error).message;
        emailLogger.error(`Failed to send to ${log.contact.email}: ${msg}`);

        await prisma.emailLog.update({
          where: { id: log.id },
          data: {
            status: log.retryCount < 3 ? 'RETRYING' : 'FAILED',
            errorMessage: msg,
            retryCount: { increment: 1 },
          },
        });

        await prisma.campaign.update({
          where: { id: campaignId },
          data: { failedCount: { increment: 1 } },
        });
      }

      await randomDelay();
    }
  }

  const remaining = await prisma.emailLog.count({
    where: { campaignId, status: { in: ['PENDING', 'RETRYING'] } },
  });

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: remaining === 0 ? 'COMPLETED' : 'PAUSED' },
  });

  emailLogger.info(`Campaign ${campaignId} finished. Status: ${remaining === 0 ? 'COMPLETED' : 'PAUSED'}`);
}

export async function retryFailedEmails(campaignId: number): Promise<void> {
  await prisma.emailLog.updateMany({
    where: { campaignId, status: 'FAILED', retryCount: { lt: 3 } },
    data: { status: 'RETRYING' },
  });
  await sendCampaign(campaignId);
}
