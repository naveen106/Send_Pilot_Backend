import prisma from '../config/database';
import { createTransporter } from '../config/smtp';
import { appConfig } from '../config/app.config';
import { emailLogger } from '../utils/logger';
import { parseJsonArray, randomDelay, sleep } from '../utils/helpers';
import { SendMode, MailAttachment } from '../types';

const MAX_DAILY_LIMIT = Math.min(appConfig.email.dailyLimit, 200);
const BATCH_SIZE = appConfig.email.batchSize;
const DELAY_MIN = appConfig.email.randomDelayMinMs;
const DELAY_MAX = appConfig.email.randomDelayMaxMs;

type MailAttachments = ReturnType<typeof buildMailAttachments>;
type Assignment = {
  id: number;
  contact: { id: number; email: string };
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

async function loadRecipients(campaignId: number, campaign: { isAssigned: boolean; recipients: string }, retryFailed: boolean) {
  const assignments = await prisma.assignedCampaigns.findMany({
    where: { campaignId, deliveryStatus: 'PENDING' },
    select: { id: true, contact: { select: { id: true, email: true } } },
  });

  const assignedRecipients = assignments.map((assignment) => assignment.contact.email);
  const [failures, deliveries] = await Promise.all([
    prisma.emailFailure.findMany({ where: { campaignId }, select: { recipientEmail: true } }),
    prisma.emailDelivery.findMany({ where: { campaignId }, select: { recipientEmail: true } }),
  ]);
  const failedEmails = new Set(failures.map((failure) => assignmentKey(failure.recipientEmail)));
  const sentEmails = new Set(deliveries.map((delivery) => assignmentKey(delivery.recipientEmail)));
  const selectByRetryState = (email: string) => {
    const key = assignmentKey(email);
    if (sentEmails.has(key)) return false;
    return retryFailed ? failedEmails.has(key) : !failedEmails.has(key);
  };
  if (campaign.isAssigned) {
    const selectedAssignments = assignments.filter((assignment) => selectByRetryState(assignment.contact.email));
    return {
      recipients: selectedAssignments.map((assignment) => assignment.contact.email),
      assignments: new Map(selectedAssignments.map((assignment) => [assignmentKey(assignment.contact.email), assignment])),
    };
  }

  // A non-assigned campaign has no queue rows, so delivery history is its
  // pending-state source of truth and prevents duplicate sends on retry.
  return {
    recipients: parseJsonArray<string>(campaign.recipients).filter(selectByRetryState),
    assignments: new Map(assignments.map((assignment) => [assignmentKey(assignment.contact.email), assignment])),
  };
}

async function pauseAtDailyLimit(campaignId: number, sent: number) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { dailyLimit: true } });
  const dailyLimit = Math.min(campaign?.dailyLimit ?? 50, MAX_DAILY_LIMIT);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sentInLast24Hours = await prisma.emailDelivery.count({ where: { campaignId, sentAt: { gte: since } } });
  if (sent + sentInLast24Hours < dailyLimit) return false;

  emailLogger.warn(`24-hour limit of ${dailyLimit} reached. Pausing campaign ${campaignId}`);
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
  return true;
}

async function recordDelivery(context: SendContext, email: string, assignment?: Assignment) {
  //The recipient email is always retained in the history.
  const contact = assignment?.contact ?? await prisma.contact.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  await prisma.$transaction(async (transaction) => {
    await transaction.emailDelivery.create({
      data: {
        campaignId: context.campaignId,
        contactId: contact?.id,
        recipientEmail: email,
        subject: context.subject
      },
    });

    if (assignment) {
      // Assignment rows are the pending queue only. Once delivery succeeds,
      // remove the queue row; EmailDelivery is the durable audit history.
      await transaction.assignedCampaigns.delete({
        where: { id: assignment.id },
      });
    }
  });
}

async function sendOne(context: SendContext, email: string, prefix = '') {
  try {
    await context.transporter.sendMail(
      buildMailOptions(email, context.subject, context.html, context.attachments)
    );
    await recordDelivery(context, email, context.assignments.get(assignmentKey(email)));
    emailLogger.success(`${prefix}Sent to ${email} [campaign: ${context.campaignId}]`);
    return true;
  } catch (error) {
    const reason = (error as Error).message;
    await recordFailure(context, email, reason);
    emailLogger.error(`${prefix}Failed to send to ${email}: ${reason}`);
    return false;
  }
}

async function recordFailure(context: SendContext, email: string, reason: string) {
  const assignment = context.assignments.get(assignmentKey(email));
  const contact = assignment?.contact ?? await prisma.contact.findUnique({
    where: { email },
    select: { id: true },
  });

  await prisma.emailFailure.create({
    data: {
      campaignId: context.campaignId,
      contactId: contact?.id,
      recipientEmail: email,
      reason,
    },
  });
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
 * rows are removed and every successful delivery is written to history;
 * failed queue rows remain available for retry.
 */
export async function sendCampaign(campaignId: number, mode: SendMode = 'immediate', retryFailed = false): Promise<void> {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');

    const { recipients, assignments } = await loadRecipients(campaignId, campaign, retryFailed);
    if (recipients.length === 0) {
      emailLogger.info(`Campaign ${campaignId}: no recipients, marking COMPLETED`);
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'COMPLETED' } });
      return;
    }

    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'RUNNING' } });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sentInLast24Hours = await prisma.emailDelivery.count({ where: { campaignId, sentAt: { gte: since } } });
    const dailyLimit = Math.min(campaign.dailyLimit ?? 50, MAX_DAILY_LIMIT);
    const available = dailyLimit - sentInLast24Hours;
    if (available <= 0) {
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
      emailLogger.warn(`Campaign ${campaignId} has no 24-hour capacity remaining`);
      return;
    }
    const sendableRecipients = recipients.slice(0, available);

    const context: SendContext = {
      campaignId,
      subject: campaign.subject,
      html: campaign.htmlContent,
      attachments: buildMailAttachments(parseJsonArray<MailAttachment>(campaign.attachments)),
      transporter: createTransporter(),
      assignments,
    };
    const result = mode === 'interval'
      ? await sendAtIntervals(context, sendableRecipients)
      : await sendInBatches(context, sendableRecipients);

    // Keep the campaign paused when the 24-hour capacity truncated the
    // pending queue. The remaining recipients must be retried after capacity
    // becomes available instead of being reported as completed.
    await updateFinishedStatus(
      campaignId,
      sendableRecipients.length < recipients.length ? { ...result, paused: true } : result,
      mode,
    );
  } catch (error) {
    emailLogger.error(`Campaign ${campaignId} crashed: ${(error as Error).message}`);
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'FAILED' } }).catch(() => {});
  }
}
