import prisma from '../config/database';
import logger from '../utils/logger';
import { parseJsonArray, sanitizeLog } from '../utils/helpers';
import { appendUniqueTrimmedStrings, uniquePositiveIds, uniqueTrimmedStrings } from '../utils/collections';
import { sendCampaign } from './email.service';
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
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { name: true, email: true } },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parses the JSON recipients and attachments fields and spreads them onto a campaign row. */
function deserializeCampaign<T extends { recipients: string; attachments: string | null }>(row: T) {
  const { recipients, attachments, ...rest } = row;
  return {
    ...rest,
    recipients:  parseJsonArray<string>(recipients),
    attachments: parseJsonArray<MailAttachment>(attachments),
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Creates a new campaign record.
 * If not scheduled, kicks off sending immediately via setImmediate (fire-and-forget).
 */
export async function createCampaign(data: CreateCampaignInput) {
  if (!data.recipients || data.recipients.length === 0)
    throw new Error('At least one recipient is required');

  const isScheduled = data.sendMode === 'scheduled' && !!data.scheduledAt;
  const mode: SendMode = data.sendMode || 'immediate';

  const campaign = await prisma.campaign.create({
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

  // Sanitize name before logging to prevent log injection (CWE-117)
  logger.info(`Campaign created: ${sanitizeLog(campaign.name)} [id: ${campaign.id}] mode: ${mode}`);

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
export async function getCampaigns(page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.campaign.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' }, select: CAMPAIGN_SELECT }),
    prisma.campaign.count(),
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
 * Triggers an immediate send for an existing campaign.
 * Throws if the campaign is not found or already running.
 */
export async function sendCampaignNow(campaignId: number) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'RUNNING') throw new Error('Campaign already running');

  logger.info(`Triggering instant send for campaign ${campaignId}`);
  setImmediate(() => sendCampaign(campaignId, 'immediate'));
  return { message: 'Campaign send initiated' };
}

/**
 * Assigns contact emails as recipients on one or more existing campaigns.
 * Merges with existing recipients (case-insensitive dedupe) and updates totalCount.
 * RUNNING campaigns are skipped so an in-flight send is not mutated mid-run.
 */
export async function assignContactsToCampaigns(campaignIds: number[], emails: string[]) {
  if (!campaignIds.length) throw new Error('At least one campaign is required');
  if (!emails.length) throw new Error('At least one contact email is required');

  const normalizedEmails = uniqueTrimmedStrings(emails);
  if (!normalizedEmails.length) throw new Error('At least one valid contact email is required');

  const uniqueIds = uniquePositiveIds(campaignIds);
  if (!uniqueIds.length) throw new Error('At least one valid campaign id is required');

  const campaigns = await prisma.campaign.findMany({ where: { id: { in: uniqueIds } } });
  if (!campaigns.length) throw new Error('No campaigns found');

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

    const existing = parseJsonArray<string>(campaign.recipients);
    const merged = appendUniqueTrimmedStrings(existing, normalizedEmails);

    const added = merged.length - existing.length;
    if (added > 0) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          recipients: JSON.stringify(merged),
          totalCount: merged.length,
        },
      });
    }

    results.push({
      id: campaign.id,
      name: campaign.name,
      added,
      total: merged.length,
    });
  }

  const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
  logger.info(
    `Assigned contacts to ${results.length} campaign(s): ${totalAdded} new recipient link(s) ` +
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
