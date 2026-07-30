import prisma from '../config/database';
import { createTransporter } from '../config/smtp';
import { emailLogger } from '../utils/logger';

const DAILY_LIMIT = Math.min(parseInt(process.env.DAILY_EMAIL_LIMIT || '200'), 200);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10');
const DELAY_MIN = parseInt(process.env.RANDOM_DELAY_MIN || '60000');  // 1 min default
const DELAY_MAX = parseInt(process.env.RANDOM_DELAY_MAX || '600000'); // 10 min default

function randomDelay(): number {
  return Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN + 1)) + DELAY_MIN;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendCampaign(
  campaignId: number,
  mode: 'immediate' | 'scheduled' | 'interval' = 'immediate'
): Promise<void> {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');

    const recipients: string[] = JSON.parse(campaign.recipients || '[]');
    const attachments: { filename: string; content: string; contentType: string }[] =
      JSON.parse(campaign.attachments ?? '[]');

    const mailAttachments = attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content, 'base64'),
      contentType: a.contentType,
    }));
    if (recipients.length === 0) {
      emailLogger.info(`Campaign ${campaignId}: no recipients`);
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'COMPLETED' } });
      return;
    }

    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'RUNNING' } });

    const transporter = createTransporter();
    let sent = 0;
    let failed = 0;

    if (mode === 'interval') {
      for (const email of recipients) {
        if (sent >= DAILY_LIMIT) {
          emailLogger.warn(`Daily limit of ${DAILY_LIMIT} reached. Pausing campaign ${campaignId}`);
          await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
          return;
        }

        try {
          await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: email,
            subject: campaign.subject,
            html: campaign.htmlContent,
            attachments: mailAttachments,
          });
          sent++;
          emailLogger.info(`[interval] Sent to ${email} [campaign: ${campaignId}] (${sent}/${DAILY_LIMIT})`);
        } catch (error) {
          failed++;
          emailLogger.error(`[interval] Failed to send to ${email}: ${(error as Error).message}`);
        }

        if (sent + failed < recipients.length) {
          const delay = randomDelay();
          emailLogger.info(`[interval] Next email in ${Math.round(delay / 1000)}s`);
          await sleep(delay);
        }
      }
    } else {
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
                attachments: mailAttachments,
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
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: sent > 0 ? 'COMPLETED' : 'FAILED' },
    });

    emailLogger.info(`Campaign ${campaignId} finished [${mode}]. Sent: ${sent}, Failed: ${failed}`);
    if (sent === 0) emailLogger.error(`Campaign ${campaignId} marked FAILED — no emails delivered`);
  } catch (err) {
    emailLogger.error(`Campaign ${campaignId} crashed: ${(err as Error).message}`);
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'FAILED' } }).catch(() => {});
  }
}
