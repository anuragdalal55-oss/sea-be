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
      conditions.push(`(mlo_name ILIKE $${params.length} OR mlo_code ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT * FROM sea_mlos ${whereClause} ORDER BY mlo_name ASC`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('SEA_MLOS', 'GET / error', error);
    res.status(500).json({ message: 'Failed to load MLOs' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query('SELECT * FROM sea_mlos WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ message: 'MLO not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('SEA_MLOS', `GET /${req.params.id} error`, error);
    res.status(500).json({ message: 'Failed to load MLO' });
  }
});

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { mlo_name, mlo_code, agent_code } = req.body;

  const name = cleanText(mlo_name);
  const code = cleanText(mlo_code);

  if (!name || !code) {
    res.status(400).json({ message: 'MLO name and code are required' });
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO sea_mlos (mlo_name, mlo_code, agent_code, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, code, cleanText(agent_code), req.user?.id]
    );
    logger.info('SEA_MLOS', `Created MLO: ${name}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('SEA_MLOS', 'POST / error', error);
    res.status(500).json({ message: 'Failed to create MLO' });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { mlo_name, mlo_code, agent_code } = req.body;

  const name = cleanText(mlo_name);
  const code = cleanText(mlo_code);

  if (!name || !code) {
    res.status(400).json({ message: 'MLO name and code are required' });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE sea_mlos SET mlo_name = $1, mlo_code = $2, agent_code = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [name, code, cleanText(agent_code), req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ message: 'MLO not found' });
      return;
    }
    logger.info('SEA_MLOS', `Updated MLO id=${req.params.id}`);
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('SEA_MLOS', `PUT /${req.params.id} error`, error);
    res.status(500).json({ message: 'Failed to update MLO' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query('DELETE FROM sea_mlos WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ message: 'MLO not found' });
      return;
    }
    logger.info('SEA_MLOS', `Deleted MLO id=${req.params.id}`);
    res.json({ message: 'Deleted' });
  } catch (error) {
    logger.error('SEA_MLOS', `DELETE /${req.params.id} error`, error);
    res.status(500).json({ message: 'Failed to delete MLO' });
  }
});

export default router;
