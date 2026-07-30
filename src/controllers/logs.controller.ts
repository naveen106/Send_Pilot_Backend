import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../config/database';
import { getSchedulerStatus, startScheduler, stopScheduler } from '../services/scheduler.service';

export async function getLogs(req: AuthRequest, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const level = req.query.level as string | undefined;
  const skip = (page - 1) * limit;

  const where = level ? { level } : {};
  const [logs, total] = await Promise.all([
    prisma.appLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.appLog.count({ where }),
  ]);

  res.json({ success: true, data: { logs, total, page, limit } });
}

export async function getSchedulerInfo(_req: AuthRequest, res: Response): Promise<void> {
  res.json({ success: true, data: { running: getSchedulerStatus() } });
}

export async function toggleScheduler(req: AuthRequest, res: Response): Promise<void> {
  const { enable } = req.body;
  if (enable) {
    startScheduler();
  } else {
    stopScheduler();
  }
  res.json({ success: true, message: `Scheduler ${enable ? 'started' : 'stopped'}` });
}
