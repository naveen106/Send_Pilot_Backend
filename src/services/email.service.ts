import prisma from '../config/database';
import { createTransporter } from '../config/smtp';
import { appConfig } from '../config/app.config';
import { emailLogger } from '../utils/logger';
import { parseJsonArray, randomDelay, sleep } from '../utils/helpers';
import { SEND_MODES, SendMode, MailAttachment } from '../types';
import { AssignmentDeliveryStatus, CampaignPauseReason, CampaignStatus } from '@prisma/client';

const GLOBAL_DAILY_LIMIT = appConfig.email.globalDailyLimit;
const DELAY_MIN = appConfig.email.randomDelayMinMs;
const DELAY_MAX = appConfig.email.randomDelayMaxMs;

type MailAttachments = ReturnType<typeof buildMailAttachments>;
type Assignment = {
  id: number;
  contact: { id: number; email: string };
};

interface SendContext {
  campaignId: number;
  dailyLimit: number;
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

type SendOutcome = 'sent' | 'failed' | 'limit' | 'busy' | 'pending';

type MailResponse = Awaited<ReturnType<SendContext['transporter']['sendMail']>>;

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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getRecipientAddress(recipient: string | { address?: string }) {
  return typeof recipient === 'string' ? recipient : recipient.address ?? '';
}

function wasAcceptedBySmtp(mailResponse: MailResponse, email: string) {
  const key = normalizeEmail(email);
  const accepted = mailResponse.accepted?.some(
    (recipient) => normalizeEmail(getRecipientAddress(recipient)) === key,
  );
  const rejected = mailResponse.rejected?.some(
    (recipient) => normalizeEmail(getRecipientAddress(recipient)) === key,
  );

  return accepted && !rejected;
}

function smtpRejectionReason(mailResponse: MailResponse, email: string) {
  const wasRejected = mailResponse.rejected?.some(
    (recipient) => normalizeEmail(getRecipientAddress(recipient)) === normalizeEmail(email),
  );

  return wasRejected
    ? `Recipient rejected by SMTP server (response: ${mailResponse.response ?? 'no response'})`
    : `Recipient not accepted by SMTP server (response: ${mailResponse.response ?? 'no response'})`;
}

async function loadRecipients(campaignId: number, campaign: { isAssigned: boolean; recipients: string }, retryFailed: boolean) {
  const assignments = await prisma.assignedCampaigns.findMany({
    where: { campaignId, deliveryStatus: AssignmentDeliveryStatus.PENDING },
    select: { id: true, contact: { select: { id: true, email: true } } },
  });

  const [failures, reservations] = await Promise.all([
    prisma.emailFailure.findMany({ where: { campaignId }, select: { recipientEmail: true } }),
    prisma.emailSendReservation.findMany({
      where: { campaignId, reservedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      select: { recipientEmail: true },
    }),
  ]);
  const failedEmails = new Set(failures.map((failure) => normalizeEmail(failure.recipientEmail)));
  const reservedEmails = new Set(reservations.map((reservation) => normalizeEmail(reservation.recipientEmail)));
  const selectByRetryState = (email: string) => {
    const key = normalizeEmail(email);
    // A previous successful send does not exclude this recipient. The same
    // contact may receive the campaign again; only an active send reservation
    // prevents concurrent duplicate sends.
    if (reservedEmails.has(key)) return false;
    return retryFailed ? failedEmails.has(key) : !failedEmails.has(key);
  };
  if (campaign.isAssigned) {
    const selectedAssignments = assignments.filter((assignment) => selectByRetryState(assignment.contact.email));
    return {
      recipients: selectedAssignments.map((assignment) => assignment.contact.email),
      assignments: new Map(selectedAssignments.map((assignment) => [normalizeEmail(assignment.contact.email), assignment])),
      hasActiveReservations: reservations.length > 0,
    };
  }

  // A non-assigned campaign has no queue rows, so delivery history is its
  // pending-state source of truth and prevents duplicate sends on retry.
  return {
    recipients: parseJsonArray<string>(campaign.recipients).filter(selectByRetryState),
    assignments: new Map(assignments.map((assignment) => [normalizeEmail(assignment.contact.email), assignment])),
    hasActiveReservations: reservations.length > 0,
  };
}

class DailyLimitReachedError extends Error {}
class RecipientAlreadyReservedError extends Error {}

// Reserves an email slot and checks the daily limit and duplicate reservations.
// If any of these conditions are not met, it throws an error.
async function reserveEmailSlot(context: SendContext, email: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recipientEmail = normalizeEmail(email);

  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM emailQuotaLocks WHERE id = 1 FOR UPDATE`;
    await transaction.emailSendReservation.deleteMany({ where: { reservedAt: { lt: since } } });

    const existingReservation = await transaction.emailSendReservation.findUnique({
      where: { campaignId_recipientEmail: { campaignId: context.campaignId, recipientEmail } },
    });
    if (existingReservation) throw new RecipientAlreadyReservedError();

    const [globalUsage, activeReservations, campaignUsage, campaignReservations] = await Promise.all([
      transaction.emailDelivery.count({ where: { sentAt: { gte: since } } }),
      transaction.emailSendReservation.count({ where: { reservedAt: { gte: since } } }),
      transaction.emailDelivery.count({ where: { campaignId: context.campaignId, sentAt: { gte: since } } }),
      transaction.emailSendReservation.count({ where: { campaignId: context.campaignId, reservedAt: { gte: since } } }),
    ]);
    if (globalUsage + activeReservations >= GLOBAL_DAILY_LIMIT
      || campaignUsage + campaignReservations >= context.dailyLimit) {
      throw new DailyLimitReachedError();
    }

    return transaction.emailSendReservation.create({
      data: { campaignId: context.campaignId, recipientEmail },
    });
  });
}

async function releaseEmailSlot(reservationId: number) {
  await prisma.emailSendReservation.delete({ where: { id: reservationId } }).catch((error) => {
    emailLogger.error(`Failed to release email reservation ${reservationId}: ${(error as Error).message}`);
  });
}

async function recordDelivery(context: SendContext, email: string, reservationId: number, assignment?: Assignment) {
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

    // After the mail is sent successfully, delete the reservation and assignment
    // (if any) to free up the slot for future sends.
    await transaction.emailSendReservation.delete({ where: { id: reservationId } });

    if (assignment) {
      // Assignment rows are the pending queue only. Once delivery succeeds,
      // remove the queue row; EmailDelivery is the durable audit history.
      await transaction.assignedCampaigns.delete({
        where: { id: assignment.id },
      });
    }
  });
}


async function sendOne(context: SendContext, email: string, prefix = ''): Promise<SendOutcome> {

  let reservation;
  try {
    // Reserve the slot first so sending cannot cross the global daily limit.
    reservation = await reserveEmailSlot(context, email);
  } catch (error) {
    if (error instanceof DailyLimitReachedError) return 'limit';
    if (error instanceof RecipientAlreadyReservedError) return 'busy';
    // Record reservation failures so they can be retried later.
    await recordSendFailure(context, email, (error as Error).message, prefix, 'quota reservation failure');
    return 'failed';
  }

  let mailResponse: MailResponse;

  try {
    mailResponse = await context.transporter.sendMail(
      buildMailOptions(email, context.subject, context.html, context.attachments)
    );
  } catch (error) {
    const reason = (error as Error).message;
    // If sending fails, release the reservation slot.
    await releaseEmailSlot(reservation.id);

    //if some error occured while sending.
    await recordSendFailure(context, email, reason, prefix, 'SMTP failure');
    return 'failed';
  }

  // The SMTP request completed, but the server rejected the recipient.
  if (!wasAcceptedBySmtp(mailResponse, email)) {
    const reason = smtpRejectionReason(mailResponse, email);
    //if failed, remove slot.
    await releaseEmailSlot(reservation.id);
    await recordSendFailure(context, email, reason, prefix, 'SMTP rejection');
    return 'failed';
  }

  const assignment = context.assignments.get(normalizeEmail(email));
  try {
    //if successfully sent, record delievry and inside it, we also remove the reservation.
    await recordDelivery(context, email, reservation.id, assignment);
  } catch (error) {
    // The message was accepted by SMTP, so count it as sent even if the
    // delivery history could not be saved.
    emailLogger.error(
      `${prefix}SMTP accepted ${email}, but delivery history could not be saved: ${(error as Error).message}`
    );
    return 'pending';
  }

  emailLogger.success(`${prefix}Sent to ${email} [campaign: ${context.campaignId}]`);
  return 'sent';
}

async function recordSendFailure(
  context: SendContext,
  email: string,
  reason: string,
  prefix: string,
  failureType: string,
) {
  try {
    await recordFailure(context, email, reason);
  } catch (persistenceError) {
    emailLogger.error(
      `${prefix}Failed to record ${failureType.toLowerCase()} for ${email}: `
      + `${(persistenceError as Error).message} (original reason: ${reason})`
    );
  }
  emailLogger.error(`${prefix}Failed to send to ${email}: ${reason}`);
}

async function recordFailure(context: SendContext, email: string, reason: string) {
  const assignment = context.assignments.get(normalizeEmail(email));
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
    const outcome = await sendOne(context, email, '[interval] ');
    if (outcome === 'limit') {
      await pauseAtDailyLimit(context.campaignId);
      return { sent, failed, paused: true };
    }
    if (outcome === 'busy') {
      await pauseForActiveSend(context.campaignId);
      return { sent, failed, paused: true };
    }
    if (outcome === 'pending') {
      await pauseForPersistenceFailure(context.campaignId);
      return { sent, failed, paused: true };
    }
    if (outcome === 'sent') sent++;
    else failed++;

    if (sent + failed < recipients.length) {
      const delay = randomDelay(DELAY_MIN, DELAY_MAX);
      emailLogger.info(`[interval] Next email in ${Math.round(delay / 1000)}s`);
      await sleep(delay);
    }
  }

  return { sent, failed, paused: false };
}

async function sendImmediately(context: SendContext, recipients: string[]): Promise<SendResult> {
  let sent = 0;
  let failed = 0;

  for (const email of recipients) {
    const outcome = await sendOne(context, email);
    if (outcome === 'limit') {
      await pauseAtDailyLimit(context.campaignId);
      return { sent, failed, paused: true };
    }
    if (outcome === 'busy') {
      await pauseForActiveSend(context.campaignId);
      return { sent, failed, paused: true };
    }
    if (outcome === 'pending') {
      await pauseForPersistenceFailure(context.campaignId);
      return { sent, failed, paused: true };
    }
    if (outcome === 'sent') sent++;
    else failed++;
  }

  return { sent, failed, paused: false };
}

async function pauseAtDailyLimit(campaignId: number) {
  emailLogger.warn(`24-hour email limit reached. Pausing campaign ${campaignId}`);
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: CampaignStatus.PAUSED, pauseReason: CampaignPauseReason.DAILY_LIMIT } });
}

async function pauseForActiveSend(campaignId: number) {
  emailLogger.info(`Another send is processing campaign ${campaignId}. Pausing this run.`);
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: CampaignStatus.PAUSED, pauseReason: CampaignPauseReason.ACTIVE_SEND } });
}

async function pauseForPersistenceFailure(campaignId: number) {
  emailLogger.warn(`Campaign ${campaignId} paused because an accepted email could not be recorded safely.`);
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: CampaignStatus.PAUSED, pauseReason: CampaignPauseReason.PERSISTENCE_FAILURE } });
}

async function updateFinishedStatus(campaignId: number, result: SendResult, mode: SendMode) {
  if (result.paused) return;

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: result.sent > 0 ? CampaignStatus.COMPLETED : CampaignStatus.FAILED, pauseReason: null },
  });

  emailLogger.info(
    `Campaign ${campaignId} finished [${mode}]. Sent: ${result.sent}, Failed: ${result.failed}`
  );
  if (result.sent === 0) {
    emailLogger.error(`Campaign ${campaignId} marked FAILED - no emails delivered`);
  }
}

/**
 * Sends a campaign using immediate or interval delivery.
 * Assigned campaigns use only their assignedCampaigns queue. Successful queue
 * rows are removed and every successful delivery is written to history;
 * failed queue rows remain available for retry.
 */
export async function sendCampaign(campaignId: number, mode: SendMode = SEND_MODES.IMMEDIATE, retryFailed = false): Promise<void> {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');

    const { recipients, assignments, hasActiveReservations } = await loadRecipients(campaignId, campaign, retryFailed);
    if (recipients.length === 0) {
      if (hasActiveReservations) {
        emailLogger.info(`Campaign ${campaignId}: waiting for an active email reservation`);
        return;
      }
      emailLogger.info(`Campaign ${campaignId}: no recipients, marking COMPLETED`);
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: CampaignStatus.COMPLETED } });
      return;
    }

    await prisma.campaign.update({ where: { id: campaignId }, data: { status: CampaignStatus.RUNNING, pauseReason: null } });

    const context: SendContext = {
      campaignId,
      // Immediate sends are governed only by the global quota. Scheduled and
      // interval sends also enforce the campaign-level 24-hour limit.
      dailyLimit: mode === SEND_MODES.IMMEDIATE
        ? GLOBAL_DAILY_LIMIT
        : Math.min(campaign.dailyLimit ?? 50, GLOBAL_DAILY_LIMIT),
      subject: campaign.subject,
      html: campaign.htmlContent,
      attachments: buildMailAttachments(parseJsonArray<MailAttachment>(campaign.attachments)),
      transporter: createTransporter(),
      assignments,
    };
    const result = mode === SEND_MODES.INTERVAL
      ? await sendAtIntervals(context, recipients)
      : await sendImmediately(context, recipients);

    await updateFinishedStatus(campaignId, result, mode);
  } catch (error) {
    emailLogger.error(`Campaign ${campaignId} crashed: ${(error as Error).message}`);
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: CampaignStatus.FAILED, pauseReason: null } }).catch(() => {});
  }
}
