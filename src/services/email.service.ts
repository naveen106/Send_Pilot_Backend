import prisma from '../config/database';
import { createTransporter } from '../config/smtp';
import { emailLogger } from '../utils/logger';
import { parseJsonArray, randomDelay, sleep } from '../utils/helpers';
import { SendMode, MailAttachment } from '../types';

// ─── Config ──────────────────────────────────────────────────────────────────

const DAILY_LIMIT = Math.min(parseInt(process.env.DAILY_EMAIL_LIMIT || '200'), 200); // hard cap
const BATCH_SIZE  = parseInt(process.env.BATCH_SIZE || '10');
const DELAY_MIN   = parseInt(process.env.RANDOM_DELAY_MIN || '60000');  // 1 min default
const DELAY_MAX   = parseInt(process.env.RANDOM_DELAY_MAX || '600000'); // 10 min default

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Converts stored base64 attachments into Nodemailer-ready Buffer attachments. */
function buildMailAttachments(attachments: MailAttachment[]) {
  return attachments.map((a) => ({
    filename: a.filename,
    content: Buffer.from(a.content, 'base64'),
    contentType: a.contentType,
  }));
}

/** Builds the Nodemailer mail options for a single recipient. */
function buildMailOptions(
  to: string,
  subject: string,
  html: string,
  attachments: ReturnType<typeof buildMailAttachments>
) {
  return { from: process.env.SMTP_USER, to, subject, html, attachments };
}

/**
 * Checks if the daily send limit has been reached.
 * If so, marks the campaign as PAUSED and returns true (caller should stop).
 */
async function checkAndPauseDailyLimit(
  campaignId: number,
  sent: number
): Promise<boolean> {
  if (sent < DAILY_LIMIT) return false;

  emailLogger.warn(`Daily limit of ${DAILY_LIMIT} reached. Pausing campaign ${campaignId}`);
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
  return true;
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Sends all emails for a campaign using the specified mode:
 * - `immediate` / `scheduled` — batched parallel sends (BATCH_SIZE at a time)
 * - `interval` — one email at a time with a random delay between sends
 *
 * Updates campaign status to RUNNING → COMPLETED | FAILED | PAUSED.
 * Fire-and-forget safe: errors are caught and logged; status is always updated.
 */
export async function sendCampaign(campaignId: number, mode: SendMode = 'immediate'): Promise<void> {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');

    const recipients  = parseJsonArray<string>(campaign.recipients);
    const attachments = buildMailAttachments(parseJsonArray<MailAttachment>(campaign.attachments));

    // Nothing to send — mark complete immediately
    if (recipients.length === 0) {
      emailLogger.info(`Campaign ${campaignId}: no recipients, marking COMPLETED`);
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'COMPLETED' } });
      return;
    }

    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'RUNNING' } });

    const transporter = createTransporter();
    let sent   = 0;
    let failed = 0;

    if (mode === 'interval') {
      // ── Interval mode: one email at a time with random delays ──────────────
      for (const email of recipients) {
        if (await checkAndPauseDailyLimit(campaignId, sent)) return;

        try {
          await transporter.sendMail(buildMailOptions(email, campaign.subject, campaign.htmlContent, attachments));
          sent++;
          emailLogger.info(`[interval] Sent to ${email} [campaign: ${campaignId}] (${sent}/${DAILY_LIMIT})`);
        } catch (error) {
          failed++;
          emailLogger.error(`[interval] Failed to send to ${email}: ${(error as Error).message}`);
        }

        // Wait between emails — skip delay after the last one
        if (sent + failed < recipients.length) {
          const delay = randomDelay(DELAY_MIN, DELAY_MAX);
          emailLogger.info(`[interval] Next email in ${Math.round(delay / 1000)}s`);
          await sleep(delay);
        }
      }
    } else {
      // ── Batch mode: BATCH_SIZE emails sent in parallel ─────────────────────
      for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        if (await checkAndPauseDailyLimit(campaignId, sent)) return;

        const batch = recipients.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
          batch.map(async (email) => {
            try {
              await transporter.sendMail(buildMailOptions(email, campaign.subject, campaign.htmlContent, attachments));
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
    // Best-effort status update — swallow secondary errors
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'FAILED' } }).catch(() => {});
  }
}
