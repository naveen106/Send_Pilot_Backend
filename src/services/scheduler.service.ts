import cron from 'node-cron';
import prisma from '../config/database';
import { sendCampaign } from './email.service';
import logger from '../utils/logger';
import { appConfig } from '../config/app.config';
import { CampaignPauseReason, CampaignStatus } from '@prisma/client';
import { SEND_MODES } from '../types';

const ROLLING_DAY_MS = 24 * 60 * 60 * 1000;

export function startScheduler(): void {
  // A process restart cannot resume an in-memory send worker. Requeue stale
  // RUNNING rows and resume their pending recipients using the persisted mode.
  recoverInterruptedCampaigns().catch((err) =>
    logger.error(`Failed to recover interrupted campaigns: ${(err as Error).message}`)
  );
  resumeQuotaPausedCampaigns().catch((err) =>
    logger.error(`Failed to resume quota-paused campaigns: ${(err as Error).message}`)
  );

  // Check every minute for campaigns whose scheduledAt has passed
  cron.schedule('* * * * *', async () => {
    try {
      await resumeQuotaPausedCampaigns();

      const due = await prisma.campaign.findMany({
        where: { status: CampaignStatus.SCHEDULED, scheduledAt: { lte: new Date() } },
        select: { id: true, name: true, sendMode: true },
      });

      for (const campaign of due) {
        logger.info(`Scheduler: triggering campaign ${campaign.id} "${campaign.name}"`);
        // Mark running immediately so next tick doesn't pick it up again
        await prisma.campaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.RUNNING, pauseReason: null } });
        const mode = resolveExecutionMode(campaign.sendMode);
        sendCampaign(campaign.id, mode).catch((err) =>
          logger.error(`Scheduler: campaign ${campaign.id} failed: ${err.message}`)
        );
      }
    } catch (err) {
      logger.error(`Scheduler tick error: ${(err as Error).message}`);
    }
  });

  logger.info('Campaign scheduler started');
}

/**
 * Resumes campaigns paused by a rolling 24-hour quota.
 *
 * The check includes both completed deliveries and active reservations so a
 * campaign is only resumed when it can safely reserve its next email. The
 * conditional update prevents two scheduler ticks from starting the same
 * campaign concurrently.
 */
async function resumeQuotaPausedCampaigns(): Promise<void> {
  const pausedCampaigns = await prisma.campaign.findMany({
    where: { status: CampaignStatus.PAUSED, pauseReason: CampaignPauseReason.DAILY_LIMIT },
    select: { id: true, name: true, sendMode: true, dailyLimit: true },
  });
  if (!pausedCampaigns.length) return;

  const since = new Date(Date.now() - ROLLING_DAY_MS);
  const [globalUsage, activeReservations] = await Promise.all([
    prisma.emailDelivery.count({ where: { sentAt: { gte: since } } }),
    prisma.emailSendReservation.count({ where: { reservedAt: { gte: since } } }),
  ]);

  for (const campaign of pausedCampaigns) {
    const [campaignUsage, campaignReservations] = await Promise.all([
      prisma.emailDelivery.count({ where: { campaignId: campaign.id, sentAt: { gte: since } } }),
      prisma.emailSendReservation.count({ where: { campaignId: campaign.id, reservedAt: { gte: since } } }),
    ]);
    const mode = resolveExecutionMode(campaign.sendMode);
    const campaignLimit = Math.min(campaign.dailyLimit, appConfig.email.globalDailyLimit);
    const hasCampaignCapacity = mode === SEND_MODES.IMMEDIATE
      || campaignUsage + campaignReservations < campaignLimit;
    const hasCapacity = globalUsage + activeReservations < appConfig.email.globalDailyLimit
      && hasCampaignCapacity;
    if (!hasCapacity) continue;

    const resumed = await prisma.campaign.updateMany({
      where: { id: campaign.id, status: CampaignStatus.PAUSED, pauseReason: CampaignPauseReason.DAILY_LIMIT },
      data: { status: CampaignStatus.RUNNING, pauseReason: null },
    });
    if (resumed.count === 0) continue;

    logger.info(`Resuming quota-paused campaign ${campaign.id} "${campaign.name}" as ${mode}`);
    setImmediate(() => sendCampaign(campaign.id, mode));
  }
}

async function recoverInterruptedCampaigns(): Promise<void> {
  const interrupted = await prisma.campaign.findMany({
    where: { status: CampaignStatus.RUNNING },
    select: { id: true, name: true, sendMode: true },
  });
  if (!interrupted.length) return;

  await prisma.campaign.updateMany({
    where: { id: { in: interrupted.map((campaign) => campaign.id) }, status: CampaignStatus.RUNNING },
    data: { status: CampaignStatus.PAUSED, pauseReason: CampaignPauseReason.INTERRUPTED },
  });

  for (const campaign of interrupted) {
    const mode = resolveExecutionMode(campaign.sendMode);
    logger.warn(`Resuming interrupted campaign ${campaign.id} "${campaign.name}" as ${mode}`);
    setImmediate(() => sendCampaign(campaign.id, mode));
  }
}

/** Scheduled campaigns retain their campaign-level limit after their start time. */
function resolveExecutionMode(sendMode: string): typeof SEND_MODES[keyof typeof SEND_MODES] {
  return sendMode === SEND_MODES.INTERVAL
    ? SEND_MODES.INTERVAL
    : sendMode === SEND_MODES.SCHEDULED
      ? SEND_MODES.SCHEDULED
      : SEND_MODES.IMMEDIATE;
}
