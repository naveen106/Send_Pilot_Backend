import cron from 'node-cron';
import prisma from '../config/database';
import { sendCampaign } from './email.service';
import logger from '../utils/logger';

export function startScheduler(): void {
  // Check every minute for campaigns whose scheduledAt has passed
  cron.schedule('* * * * *', async () => {
    try {
      const due = await prisma.campaign.findMany({
        where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
        select: { id: true, name: true },
      });

      for (const campaign of due) {
        logger.info(`Scheduler: triggering campaign ${campaign.id} "${campaign.name}"`);
        // Mark running immediately so next tick doesn't pick it up again
        await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'RUNNING' } });
        // Run as interval send (same random-delay behaviour)
        sendCampaign(campaign.id, 'interval').catch((err) =>
          logger.error(`Scheduler: campaign ${campaign.id} failed: ${err.message}`)
        );
      }
    } catch (err) {
      logger.error(`Scheduler tick error: ${(err as Error).message}`);
    }
  });

  logger.info('Campaign scheduler started');
}
