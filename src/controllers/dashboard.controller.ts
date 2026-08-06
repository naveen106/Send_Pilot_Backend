import { Response } from 'express';
import { AuthRequest } from '../types';
import * as dashboardService from '../services/dashboard.service';
import { sendSuccess } from '../utils/http';

/** Returns the aggregated metrics displayed on the dashboard. */
export async function getStats(_req: AuthRequest, res: Response): Promise<void> {
  const stats = await dashboardService.getDashboardStats();
  sendSuccess(res, stats);
}
