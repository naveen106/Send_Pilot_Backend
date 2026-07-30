import { Response } from 'express';
import { AuthRequest } from '../types';
import * as contactService from '../services/contact.service';

export async function importContacts(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: 'No file uploaded' }); return; }
    const result = await contactService.importContacts(req.file.buffer, req.file.mimetype);
    res.json({ success: true, message: 'Import complete', data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
}

export async function getAll(req: AuthRequest, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = req.query.search as string | undefined;
  const result = await contactService.getContacts(page, limit, search);
  res.json({ success: true, data: result });
}

export async function add(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { email, name } = req.body;
    const contact = await contactService.addContact(email, name);
    res.status(201).json({ success: true, data: contact });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
}

export async function update(req: AuthRequest, res: Response): Promise<void> {
  try {
    const contact = await contactService.updateContact(parseInt(req.params.id), req.body);
    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
}

export async function remove(req: AuthRequest, res: Response): Promise<void> {
  try {
    await contactService.deleteContact(parseInt(req.params.id));
    res.json({ success: true, message: 'Contact deleted' });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
}

export async function bulkRemove(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ids: number[] = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ success: false, message: 'No ids provided' }); return; }
    const result = await contactService.bulkDeleteContacts(ids);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
}

export async function deduplicate(_req: AuthRequest, res: Response): Promise<void> {
  const result = await contactService.removeDuplicates();
  res.json({ success: true, data: result });
}
