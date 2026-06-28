import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);

// Create table if not exists
pool.query(`
  CREATE TABLE IF NOT EXISTS sea_importers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    importer_name VARCHAR(35) NOT NULL,
    address1 VARCHAR(35) NOT NULL DEFAULT '',
    address2 VARCHAR(35) NOT NULL DEFAULT '',
    address3 VARCHAR(35) NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW()
  )
`).catch((err: any) => logger.warn('SEA_IMPORTERS', 'Table init warning', err));

// GET /api/sea-importers?q=robin
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const q = String(req.query.q || '').trim();
  try {
    if (q) {
      const result = await pool.query(
        `SELECT id, importer_name, address1, address2, address3
         FROM sea_importers
         WHERE importer_name ILIKE $1
         ORDER BY importer_name ASC, created_at DESC
         LIMIT 25`,
        [`%${q}%`]
      );
      res.json(result.rows);
    } else {
      res.json([]);
    }
  } catch (error) {
    logger.error('SEA_IMPORTERS', 'GET / error', error);
    res.status(500).json({ message: 'Failed to load importers' });
  }
});

// POST /api/sea-importers — auto-deduplicates same name+address combo
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { importer_name, address1, address2, address3 } = req.body;
  const name = String(importer_name || '').trim().toUpperCase();
  if (!name) {
    res.status(400).json({ message: 'Importer name is required' });
    return;
  }
  const a1 = String(address1 || '').trim().toUpperCase();
  const a2 = String(address2 || '').trim().toUpperCase();
  const a3 = String(address3 || '').trim().toUpperCase();
  try {
    const existing = await pool.query(
      `SELECT id FROM sea_importers
       WHERE importer_name = $1 AND address1 = $2 AND address2 = $3 AND address3 = $4`,
      [name, a1, a2, a3]
    );
    if (existing.rows.length > 0) {
      res.json({ id: existing.rows[0].id, existing: true });
      return;
    }
    const result = await pool.query(
      `INSERT INTO sea_importers (importer_name, address1, address2, address3)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, a1, a2, a3]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('SEA_IMPORTERS', 'POST / error', error);
    res.status(500).json({ message: 'Failed to save importer' });
  }
});

// DELETE /api/sea-importers/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await pool.query('DELETE FROM sea_importers WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    logger.error('SEA_IMPORTERS', `DELETE /${req.params.id} error`, error);
    res.status(500).json({ message: 'Failed to delete importer' });
  }
});

export default router;
