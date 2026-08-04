import cron from 'node-cron';
import prisma from '../config/database';
import { sendCampaign } from './email.service';
import logger from '../utils/logger';

export function startScheduler(): void {
  // A process restart cannot resume an in-memory send worker. Requeue stale
  // RUNNING rows and resume their pending recipients using the persisted mode.
  recoverInterruptedCampaigns().catch((err) =>
    logger.error(`Failed to recover interrupted campaigns: ${(err as Error).message}`)
  );

  // Check every minute for campaigns whose scheduledAt has passed
  cron.schedule('* * * * *', async () => {
    try {
      const due = await prisma.campaign.findMany({
        where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
        select: { id: true, name: true, sendMode: true },
      });

      for (const campaign of due) {
        logger.info(`Scheduler: triggering campaign ${campaign.id} "${campaign.name}"`);
        // Mark running immediately so next tick doesn't pick it up again
        await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'RUNNING' } });
        const mode = campaign.sendMode === 'interval' ? 'interval' : 'immediate';
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

async function recoverInterruptedCampaigns(): Promise<void> {
  const interrupted = await prisma.campaign.findMany({
    where: { status: 'RUNNING' },
    select: { id: true, name: true, sendMode: true },
  });
  if (!interrupted.length) return;

  await prisma.campaign.updateMany({
    where: { id: { in: interrupted.map((campaign) => campaign.id) }, status: 'RUNNING' },
    data: { status: 'PAUSED' },
  });

  for (const campaign of interrupted) {
    const mode = campaign.sendMode === 'interval' ? 'interval' : 'immediate';
    logger.warn(`Resuming interrupted campaign ${campaign.id} "${campaign.name}" as ${mode}`);
    setImmediate(() => sendCampaign(campaign.id, mode));
  }
}
