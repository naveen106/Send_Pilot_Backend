import prisma from '../config/database';
import { createTransporter } from '../config/smtp';
import { emailLogger } from '../utils/logger';
import { parseJsonArray, randomDelay, sleep } from '../utils/helpers';
import { SendMode, MailAttachment } from '../types';

const DAILY_LIMIT = Math.min(parseInt(process.env.DAILY_EMAIL_LIMIT || '200'), 200);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10');
const DELAY_MIN = parseInt(process.env.RANDOM_DELAY_MIN || '60000');
const DELAY_MAX = parseInt(process.env.RANDOM_DELAY_MAX || '600000');

type MailAttachments = ReturnType<typeof buildMailAttachments>;
type Assignment = {
  id: number;
  contact: { email: string };
};

interface SendContext {
  campaignId: number;
  subject: string;
  html: string;
  attachments: MailAttachments;
  transporter: ReturnType<typeof createTransporter>;
  assignments: Map<string, Assignment>;
}

interface SendResult {
  sent: number;
  failed: number;
  paused: boolean;
}

function buildMailAttachments(attachments: MailAttachment[]) {
  return attachments.map((attachment) => ({
    filename: attachment.filename,
    content: Buffer.from(attachment.content, 'base64'),
    contentType: attachment.contentType,
  }));
}

function buildMailOptions(to: string, subject: string, html: string, attachments: MailAttachments) {
  return { from: process.env.SMTP_USER, to, subject, html, attachments };
}

function assignmentKey(email: string) {
  return email.trim().toLowerCase();
}

async function loadRecipients(campaignId: number, campaign: { isAssigned: boolean; recipients: string }) {
  const assignments = await prisma.assignedCampaigns.findMany({
    where: { campaignId },
    select: { id: true, contact: { select: { email: true } } },
  });

  return {
    recipients: campaign.isAssigned
      ? assignments.map((assignment) => assignment.contact.email)
      : parseJsonArray<string>(campaign.recipients),
    assignments: new Map(assignments.map((assignment) => [assignmentKey(assignment.contact.email), assignment])),
  };
}

async function pauseAtDailyLimit(campaignId: number, sent: number) {
  if (sent < DAILY_LIMIT) return false;

  emailLogger.warn(`Daily limit of ${DAILY_LIMIT} reached. Pausing campaign ${campaignId}`);
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
  return true;
}

async function removeAssignment(context: SendContext, email: string) {
  const assignment = context.assignments.get(assignmentKey(email));
  if (assignment) {
    await prisma.assignedCampaigns.delete({ where: { id: assignment.id } });
  }
}

async function sendOne(context: SendContext, email: string, prefix = '') {
  try {
    await context.transporter.sendMail(
      buildMailOptions(email, context.subject, context.html, context.attachments)
    );
    await removeAssignment(context, email);
    emailLogger.info(`${prefix}Sent to ${email} [campaign: ${context.campaignId}]`);
    return true;
  } catch (error) {
    emailLogger.error(`${prefix}Failed to send to ${email}: ${(error as Error).message}`);
    return false;
  }
}

async function sendAtIntervals(context: SendContext, recipients: string[]): Promise<SendResult> {
  let sent = 0;
  let failed = 0;

  for (const email of recipients) {
    if (await pauseAtDailyLimit(context.campaignId, sent)) {
      return { sent, failed, paused: true };
    }

    const successful = await sendOne(context, email, '[interval] ');
    if (successful) sent++;
    else failed++;

    if (sent + failed < recipients.length) {
      const delay = randomDelay(DELAY_MIN, DELAY_MAX);
      emailLogger.info(`[interval] Next email in ${Math.round(delay / 1000)}s`);
      await sleep(delay);
    }
  }

  return { sent, failed, paused: false };
}

async function sendInBatches(context: SendContext, recipients: string[]): Promise<SendResult> {
  let sent = 0;
  let failed = 0;

  for (let index = 0; index < recipients.length; index += BATCH_SIZE) {
    if (await pauseAtDailyLimit(context.campaignId, sent)) {
      return { sent, failed, paused: true };
    }

    const batch = recipients.slice(index, index + BATCH_SIZE);
    const results = await Promise.all(batch.map((email) => sendOne(context, email)));
    sent += results.filter(Boolean).length;
    failed += results.length - results.filter(Boolean).length;
  }

  return { sent, failed, paused: false };
}

async function updateFinishedStatus(campaignId: number, result: SendResult, mode: SendMode) {
  if (result.paused) return;

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: result.sent > 0 ? 'COMPLETED' : 'FAILED' },
  });

  emailLogger.info(
    `Campaign ${campaignId} finished [${mode}]. Sent: ${result.sent}, Failed: ${result.failed}`
  );
  if (result.sent === 0) {
    emailLogger.error(`Campaign ${campaignId} marked FAILED - no emails delivered`);
  }
}

/**
 * Sends a campaign using immediate/scheduled batch delivery or interval delivery.
 * Assigned campaigns use only their assignedCampaigns queue. Successful queue
 * rows are deleted; failed rows remain available for retry.
 */
export async function sendCampaign(campaignId: number, mode: SendMode = 'immediate'): Promise<void> {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');

    const { recipients, assignments } = await loadRecipients(campaignId, campaign);
    if (recipients.length === 0) {
      emailLogger.info(`Campaign ${campaignId}: no recipients, marking COMPLETED`);
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'COMPLETED' } });
      return;
    }

    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'RUNNING' } });

    const context: SendContext = {
      campaignId,
      subject: campaign.subject,
      html: campaign.htmlContent,
      attachments: buildMailAttachments(parseJsonArray<MailAttachment>(campaign.attachments)),
      transporter: createTransporter(),
      assignments,
    };
    const result = mode === 'interval'
      ? await sendAtIntervals(context, recipients)
      : await sendInBatches(context, recipients);

    await updateFinishedStatus(campaignId, result, mode);
  } catch (error) {
    emailLogger.error(`Campaign ${campaignId} crashed: ${(error as Error).message}`);
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'FAILED' } }).catch(() => {});
  }
}
