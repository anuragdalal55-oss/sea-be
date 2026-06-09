import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);

const cleanText = (value: any): string | null => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const search = String(req.query.search || '').trim();
  try {
    const params: any[] = [];
    const conditions: string[] = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(carrier_name ILIKE $${params.length} OR carrier_code ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT * FROM sea_carriers ${whereClause} ORDER BY carrier_name ASC`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('SEA_CARRIERS', 'GET / error', error);
    res.status(500).json({ message: 'Failed to load carriers' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query('SELECT * FROM sea_carriers WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Carrier not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('SEA_CARRIERS', `GET /${req.params.id} error`, error);
    res.status(500).json({ message: 'Failed to load carrier' });
  }
});

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { carrier_name, carrier_code, bond_number, transport, dest, address, description } = req.body;

  const name = cleanText(carrier_name);
  const code = cleanText(carrier_code);

  if (!name || !code) {
    res.status(400).json({ message: 'Carrier name and code are required' });
    return;
  }

  if (address && String(address).length > 35) {
    res.status(400).json({ message: 'Address must be 35 characters or less' });
    return;
  }

  if (description && String(description).length > 150) {
    res.status(400).json({ message: 'Description must be 150 characters or less' });
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO sea_carriers (carrier_name, carrier_code, bond_number, transport, dest, address, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, code, cleanText(bond_number), cleanText(transport), cleanText(dest), cleanText(address), cleanText(description), req.user?.id]
    );
    logger.info('SEA_CARRIERS', `Created carrier: ${name}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('SEA_CARRIERS', 'POST / error', error);
    res.status(500).json({ message: 'Failed to create carrier' });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { carrier_name, carrier_code, bond_number, transport, dest, address, description } = req.body;

  const name = cleanText(carrier_name);
  const code = cleanText(carrier_code);

  if (!name || !code) {
    res.status(400).json({ message: 'Carrier name and code are required' });
    return;
  }

  if (address && String(address).length > 35) {
    res.status(400).json({ message: 'Address must be 35 characters or less' });
    return;
  }

  if (description && String(description).length > 150) {
    res.status(400).json({ message: 'Description must be 150 characters or less' });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE sea_carriers SET
        carrier_name = $1, carrier_code = $2, bond_number = $3, transport = $4,
        dest = $5, address = $6, description = $7, updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [name, code, cleanText(bond_number), cleanText(transport), cleanText(dest), cleanText(address), cleanText(description), req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Carrier not found' });
      return;
    }
    logger.info('SEA_CARRIERS', `Updated carrier id=${req.params.id}`);
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('SEA_CARRIERS', `PUT /${req.params.id} error`, error);
    res.status(500).json({ message: 'Failed to update carrier' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query('DELETE FROM sea_carriers WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Carrier not found' });
      return;
    }
    logger.info('SEA_CARRIERS', `Deleted carrier id=${req.params.id}`);
    res.json({ message: 'Deleted' });
  } catch (error) {
    logger.error('SEA_CARRIERS', `DELETE /${req.params.id} error`, error);
    res.status(500).json({ message: 'Failed to delete carrier' });
  }
});

export default router;
