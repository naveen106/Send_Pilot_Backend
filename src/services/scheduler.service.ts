import cron, { ScheduledTask } from 'node-cron';
import prisma from '../config/database';
import { sendCampaign } from './email.service';
import { schedulerLogger } from '../utils/logger';

let schedulerTask: ScheduledTask | null = null;

export function startScheduler(): void {
  if (process.env.SCHEDULER_ENABLED !== 'true') {
    schedulerLogger.info('Scheduler is disabled via SCHEDULER_ENABLED env');
    return;
  }

  // Run every minute to check for due campaigns
  schedulerTask = cron.schedule('* * * * *', async () => {
    schedulerLogger.debug('Scheduler tick: checking for due campaigns');

    try {
      const now = new Date();
      const dueCampaigns = await prisma.campaign.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledAt: { lte: now },
        },
      });

      for (const campaign of dueCampaigns) {
        schedulerLogger.info(`Triggering scheduled campaign: ${campaign.name} [id: ${campaign.id}]`);
        await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'RUNNING' } });
        sendCampaign(campaign.id).catch((err) =>
          schedulerLogger.error(`Campaign ${campaign.id} failed: ${err.message}`)
        );
      }

      // Resume paused campaigns from previous day
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const pausedCampaigns = await prisma.campaign.findMany({
        where: { status: 'PAUSED', updatedAt: { lt: today } },
      });

      for (const campaign of pausedCampaigns) {
        schedulerLogger.info(`Resuming paused campaign: ${campaign.name} [id: ${campaign.id}]`);
        sendCampaign(campaign.id).catch((err) =>
          schedulerLogger.error(`Resume failed for campaign ${campaign.id}: ${err.message}`)
        );
      }
    } catch (error) {
      schedulerLogger.error(`Scheduler error: ${(error as Error).message}`);
    }
  });

  schedulerLogger.info('Scheduler started');
}

export function stopScheduler(): void {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    schedulerLogger.info('Scheduler stopped');
  }
}

export function getSchedulerStatus(): boolean {
  return schedulerTask !== null;
}
