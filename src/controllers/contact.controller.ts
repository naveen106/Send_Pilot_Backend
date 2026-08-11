import { Response } from 'express';
import { AuthRequest } from '../types';
import * as contactService from '../services/contact.service';
import * as campaignService from '../services/campaign.service';
import { getErrorMessage, getPagination, getRouteId, sendError, sendSuccess } from '../utils/http';

export async function importContacts(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.file) { sendError(res, 400, 'No file uploaded'); return; }
    const result = await contactService.importContacts(req.file.buffer, req.file.mimetype);
    const rawCampaignIds = req.body.campaignIds;
    const campaignIds = typeof rawCampaignIds === 'string'
      ? JSON.parse(rawCampaignIds)
      : Array.isArray(rawCampaignIds) ? rawCampaignIds : [];
    const assignment = Array.isArray(campaignIds) && campaignIds.length
      ? await campaignService.assignContactsToCampaigns(campaignIds.map(Number), result.emails)
      : undefined;
    sendSuccess(res, { ...result, assignment }, 'Import complete');
  } catch (error) {
    sendError(res, 400, getErrorMessage(error));
  }
}

export async function getAll(req: AuthRequest, res: Response): Promise<void> {
  const { page, limit } = getPagination(req.query, 20);
  const search = req.query.search as string | undefined;
  const result = await contactService.getContacts(page, limit, search);
  sendSuccess(res, result);
}

export async function add(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { email, name } = req.body;
    const contact = await contactService.addContact(email, name);
    sendSuccess(res, contact, undefined, 201);
  } catch (error) {
    sendError(res, 400, getErrorMessage(error));
  }
}

export async function update(req: AuthRequest, res: Response): Promise<void> {
  try {
    const contact = await contactService.updateContact(getRouteId(req.params), req.body);
    sendSuccess(res, contact);
  } catch (error) {
    sendError(res, 400, getErrorMessage(error));
  }
}

export async function remove(req: AuthRequest, res: Response): Promise<void> {
  try {
    await contactService.deleteContact(getRouteId(req.params));
    sendSuccess(res, undefined, 'Contact deleted');
  } catch (error) {
    sendError(res, 400, getErrorMessage(error));
  }
}

export async function bulkRemove(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ids: number[] = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) { sendError(res, 400, 'No ids provided'); return; }
    const result = await contactService.bulkDeleteContacts(ids);
    sendSuccess(res, result);
  } catch (error) {
    sendError(res, 400, getErrorMessage(error));
  }
}

export async function deduplicate(_req: AuthRequest, res: Response): Promise<void> {
  const result = await contactService.removeDuplicates();
  sendSuccess(res, result);
}
