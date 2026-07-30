import prisma from '../config/database';
import { createTransporter } from '../config/smtp';
import { emailLogger } from '../utils/logger';

const DAILY_LIMIT = parseInt(process.env.DAILY_EMAIL_LIMIT || '500');
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10');

export async function sendCampaign(campaignId: number): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaign not found');

  const recipients: string[] = JSON.parse(campaign.recipients || '[]');
  if (recipients.length === 0) {
    emailLogger.info(`Campaign ${campaignId}: no recipients`);
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'COMPLETED' } });
    return;
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'RUNNING' } });

  const transporter = createTransporter();
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    if (sent >= DAILY_LIMIT) {
      emailLogger.warn(`Daily limit of ${DAILY_LIMIT} reached. Pausing campaign ${campaignId}`);
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
      return;
    }

    const batch = recipients.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (email) => {
        try {
          await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: email,
            subject: campaign.subject,
            html: campaign.htmlContent,
          });
          sent++;
          emailLogger.info(`Sent to ${email} [campaign: ${campaignId}]`);
        } catch (error) {
          failed++;
          emailLogger.error(`Failed to send to ${email}: ${(error as Error).message}`);
        }
      })
    );
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'COMPLETED' },
  });

  emailLogger.info(`Campaign ${campaignId} finished. Sent: ${sent}, Failed: ${failed}`);
}
