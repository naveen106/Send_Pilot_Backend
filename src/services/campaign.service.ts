import prisma from '../config/database';
import logger from '../utils/logger';
import { parseJsonArray, sanitizeLog } from '../utils/helpers';
import { uniquePositiveIds, uniqueTrimmedStrings } from '../utils/collections';
import { sendCampaign } from './email.service';
import { createMissingContacts } from './contact.service';
import { SendMode, MailAttachment } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateCampaignInput {
  name: string;
  subject: string;
  htmlContent: string;
  recipients: string[];
  scheduledAt?: Date;
  sendMode?: SendMode;
  createdBy: number;
  attachments?: MailAttachment[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Prisma select shape reused by all campaign queries to keep responses consistent. */
const CAMPAIGN_SELECT = {
  id: true,
  name: true,
  subject: true,
  htmlContent: true,
  status: true,
  scheduledAt: true,
  totalCount: true,
  recipients: true,
  attachments: true,   // included so the frontend can display attachment filenames
  isAssigned: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { name: true, email: true } },
  
  assignedCampaigns: {
    where: { deliveryStatus: 'PENDING' },
    select: {
      id: true,
      contactId: true,
      contact: {
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          createdAt: true,
        },
      },
    },
  },
  deliveries: {
    orderBy: { sentAt: 'desc' as const },
    select: {
      id: true,
      recipientEmail: true,
      subject: true,
      sentAt: true,
      contact: { select: { id: true, email: true, name: true } },
    },
  },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parses the JSON recipients and attachments fields and spreads them onto a campaign row. */
function deserializeCampaign<T extends {
  id: number;
  name: string;
  subject: string;
  status: string;
  recipients: string;
  attachments: string | null;
  assignedCampaigns?: Array<{
    id: number;
    contactId: number;
    contact: {
      id: number;
      email: string;
      name: string | null;
      isActive: boolean;
      createdAt: Date;
    };
  }>;
  deliveries?: Array<{
    id: number;
    recipientEmail: string;
    subject: string;
    sentAt: Date;
    contact: { id: number; email: string; name: string | null } | null;
  }>;
}>(row: T) {
  const { recipients, attachments, assignedCampaigns, deliveries, ...rest } = row;

  return {
    ...rest,
    recipients: parseJsonArray<string>(recipients),
    attachments: parseJsonArray<MailAttachment>(attachments),

    assignedCampaigns: (assignedCampaigns ?? []).map((assignment) => ({
      id: assignment.id,
      contactId: assignment.contactId,
      contacts: assignment.contact,
      campaignId: row.id,
      campaign: {
        id: row.id,
        name: row.name,
        subject: row.subject,
        status: row.status,
      },
    })),

    sentDeliveries: (deliveries ?? []).map((delivery) => ({
      id: delivery.id,
      email: delivery.recipientEmail,
      subject: delivery.subject,
      sentAt: delivery.sentAt,
      contact: delivery.contact,
    })),
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Creates a new campaign record and stores its recipients as contacts.
 * Both writes occur in one transaction, so they cannot get out of sync.
 * If not scheduled, kicks off sending immediately via setImmediate (fire-and-forget).
 */
export async function createCampaign(data: CreateCampaignInput) {
  if (!data.recipients || data.recipients.length === 0)
    throw new Error('At least one recipient is required');

  const isScheduled = data.sendMode === 'scheduled' && !!data.scheduledAt;
  const mode: SendMode = data.sendMode || 'immediate';

  const { campaign, contactsAdded } = await prisma.$transaction(async (transaction) => {
    const createdCampaign = await transaction.campaign.create({
      data: {
        name: data.name,
        subject: data.subject,
        htmlContent: data.htmlContent,
        scheduledAt: isScheduled ? data.scheduledAt! : null,
        status: isScheduled ? 'SCHEDULED' : 'DRAFT',
        totalCount: data.recipients.length,
        recipients: JSON.stringify(data.recipients),
        attachments: JSON.stringify(data.attachments ?? []),
        createdBy: data.createdBy,
      },
    });

    const addedContacts = await createMissingContacts(transaction, data.recipients);
    return { campaign: createdCampaign, contactsAdded: addedContacts };
  });

  // Sanitize name before logging to prevent log injection (CWE-117)
  logger.info(`Campaign created: ${sanitizeLog(campaign.name)} [id: ${campaign.id}] mode: ${mode}`);
  logger.info(`Campaign ${campaign.id}: added ${contactsAdded} recipient contact(s)`);

  if (!isScheduled) {
    // Fire-and-forget — HTTP response returns immediately
    setImmediate(() =>
      sendCampaign(campaign.id, mode).catch((err) =>
        logger.error(`Campaign ${campaign.id} send failed: ${err.message}`)
      )
    );
  }

  return { ...campaign, recipients: data.recipients };
}

/**
 * Returns a paginated list of campaigns with parsed recipients.
 */
export async function getCampaigns(page = 1, limit = 10, search?: string) {
  const skip = (page - 1) * limit;
  // Apply the same filter to both queries so the returned page and total
  // count describe the same name/subject search result set.
  const where = search
    ? { OR: [{ name: { contains: search } }, { subject: { contains: search } }] }
    : undefined;
  const [rows, total] = await Promise.all([
    prisma.campaign.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, select: CAMPAIGN_SELECT }),
    prisma.campaign.count({ where }),
  ]);

  return { campaigns: rows.map(deserializeCampaign), total, page, limit };
}

/**
 * Returns a single campaign by ID, or null if not found.
 */
export async function getCampaignById(id: number) {
  const row = await prisma.campaign.findUnique({ where: { id }, select: CAMPAIGN_SELECT });
  return row ? deserializeCampaign(row) : null;
}

/** Deletes a single campaign by ID. */
export async function deleteCampaign(id: number) {
  return prisma.campaign.delete({ where: { id } });
}

/**
 * Deletes multiple campaigns by ID array.
 * Returns the count of deleted records.
 */
export async function bulkDeleteCampaigns(ids: number[]) {
  const { count } = await prisma.campaign.deleteMany({ where: { id: { in: ids } } });
  logger.info(`Bulk deleted ${count} campaigns`);
  return { deleted: count };
}

/**
 * Triggers an existing campaign using the requested delivery mode.
 * Scheduled sends are persisted as SCHEDULED and picked up by the scheduler;
 * immediate and interval sends are dispatched in the background.
 */
export async function sendCampaignNow(campaignId: number, mode: SendMode = 'immediate', scheduledAt?: Date) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'RUNNING') throw new Error('Campaign already running');
  if (!['immediate', 'scheduled', 'interval'].includes(mode)) throw new Error('Invalid send mode');

  if (mode === 'scheduled') {
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) throw new Error('A valid schedule date is required');
    if (scheduledAt.getTime() <= Date.now()) throw new Error('Schedule date must be in the future');

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'SCHEDULED', scheduledAt },
    });
    logger.info(`Scheduled assigned campaign ${campaignId} for ${scheduledAt.toISOString()}`);
    return { message: 'Campaign scheduled' };
  }

  logger.info(`Triggering ${mode} send for campaign ${campaignId}`);
  setImmediate(() => sendCampaign(campaignId, mode));
  return { message: 'Campaign send initiated' };
}

/**
 * Assigns contacts to one or more reusable campaigns.
 * Assignment rows are the source of truth when a campaign is sent. A unique
 * campaign/contact key makes repeated assignments idempotent.
 */
export async function assignContactsToCampaigns(campaignIds: number[], emails: string[]) {
  if (!campaignIds.length) throw new Error('At least one campaign is required');
  if (!emails.length) throw new Error('At least one contact email is required');

  const normalizedEmails = uniqueTrimmedStrings(emails);
  if (!normalizedEmails.length) throw new Error('At least one valid contact email is required');

  const uniqueIds = uniquePositiveIds(campaignIds);
  if (!uniqueIds.length) throw new Error('At least one valid campaign id is required');

  const [campaigns, contacts] = await Promise.all([
    prisma.campaign.findMany({ where: { id: { in: uniqueIds } } }),
    prisma.contact.findMany({ where: { email: { in: normalizedEmails } }, select: { id: true, email: true } }),
  ]);
  if (!campaigns.length) throw new Error('No campaigns found');
  if (!contacts.length) throw new Error('No matching contacts found');

  const contactByEmail = new Map(contacts.map((contact) => [contact.email.trim().toLowerCase(), contact]));
  const matchedContacts = normalizedEmails
    .map((email) => contactByEmail.get(email.toLowerCase()))
    .filter((contact): contact is { id: number; email: string } => !!contact);
  if (!matchedContacts.length) throw new Error('No matching contacts found');

  const results: {
    id: number;
    name: string;
    added: number;
    total: number;
    skipped?: boolean;
    reason?: string;
  }[] = [];

  for (const campaign of campaigns) {
    if (campaign.status === 'RUNNING') {
      results.push({
        id: campaign.id,
        name: campaign.name,
        added: 0,
        total: campaign.totalCount,
        skipped: true,
        reason: 'Campaign is currently running',
      });
      continue;
    }

    const existingAssignments = await prisma.assignedCampaigns.findMany({
      where: {
        campaignId: campaign.id,
        contactId: { in: matchedContacts.map((contact) => contact.id) },
      },
      select: { contactId: true, deliveryStatus: true },
    });
    const sentContactIds = new Set(
      existingAssignments
        .filter((assignment) => assignment.deliveryStatus === 'SENT')
        .map((assignment) => assignment.contactId)
    );
    const pendingContactIds = new Set(
      existingAssignments
        .filter((assignment) => assignment.deliveryStatus === 'PENDING')
        .map((assignment) => assignment.contactId)
    );
    const originalRecipientEmails = new Set(
      parseJsonArray<string>(campaign.recipients).map((email) => email.trim().toLowerCase())
    );
    const contactsToAssign = matchedContacts.filter((contact) =>
      !sentContactIds.has(contact.id) &&
      !pendingContactIds.has(contact.id) &&
      !originalRecipientEmails.has(contact.email.trim().toLowerCase())
    );

    const assignmentResult = await prisma.assignedCampaigns.createMany({
      data: contactsToAssign.map((contact) => ({ campaignId: campaign.id, contactId: contact.id })),
      skipDuplicates: true,
    });

    await prisma.campaign.update({ where: { id: campaign.id }, data: { isAssigned: true } });

    const assignedTotal = await prisma.assignedCampaigns.count({
      where: { campaignId: campaign.id, deliveryStatus: 'PENDING' },
    });
    const added = assignmentResult.count;
    if (assignedTotal > campaign.totalCount) {
      await prisma.campaign.update({ where: { id: campaign.id }, data: { totalCount: assignedTotal } });
    }

    results.push({
      id: campaign.id,
      name: campaign.name,
      added,
      total: assignedTotal,
    });
  }

  const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
  logger.info(
    `Queued contacts for ${results.length} campaign(s): ${totalAdded} new assignment(s) ` +
    `(emails: ${normalizedEmails.length})`
  );

  return {
    campaigns: results,
    emailsAssigned: normalizedEmails.length,
    totalAdded,
  };
}

/**
 * Aggregates dashboard statistics across all campaigns.
 */
export async function getDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalCampaigns, scheduledCampaigns, completedToday, agg] = await Promise.all([
    prisma.campaign.count(),
    prisma.campaign.count({ where: { status: 'SCHEDULED' } }),
    prisma.campaign.count({ where: { status: 'COMPLETED', updatedAt: { gte: today } } }),
    prisma.campaign.aggregate({ _sum: { totalCount: true } }),
  ]);

  return {
    totalEmails: agg._sum.totalCount ?? 0,
    sentToday: completedToday,
    scheduledCampaigns,
    totalCampaigns,
  };
}
