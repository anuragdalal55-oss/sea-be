import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);

const cleanText = (value: any): string => String(value ?? '').trim();

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const search = String(req.query.search || '').trim();
  try {
    const params: any[] = [];
    let where = '';
    if (search) {
      params.push(`%${search}%`);
      where = `WHERE (port_code ILIKE $1 OR port_name ILIKE $1)`;
    }
    const result = await pool.query(
      `SELECT * FROM sea_delivery_ports ${where} ORDER BY port_code ASC`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('SEA_DELIVERY_PORTS', 'GET / error', error);
    res.status(500).json({ message: 'Failed to load delivery ports' });
  }
});

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const port_code = cleanText(req.body.port_code).toUpperCase();
  const port_name = cleanText(req.body.port_name).toUpperCase();

  if (!port_code) {
    res.status(400).json({ message: 'Port code is required' });
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO sea_delivery_ports (port_code, port_name, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (port_code) DO UPDATE SET port_name = EXCLUDED.port_name, updated_at = NOW()
       RETURNING *`,
      [port_code, port_name, req.user?.id]
    );
    logger.info('SEA_DELIVERY_PORTS', `Created/updated delivery port: ${port_code}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('SEA_DELIVERY_PORTS', 'POST / error', error);
    res.status(500).json({ message: 'Failed to create delivery port' });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const port_code = cleanText(req.body.port_code).toUpperCase();
  const port_name = cleanText(req.body.port_name).toUpperCase();

  if (!port_code) {
    res.status(400).json({ message: 'Port code is required' });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE sea_delivery_ports SET port_code = $1, port_name = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [port_code, port_name, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Delivery port not found' });
      return;
    }
    logger.info('SEA_DELIVERY_PORTS', `Updated delivery port id=${req.params.id}`);
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('SEA_DELIVERY_PORTS', `PUT /${req.params.id} error`, error);
    res.status(500).json({ message: 'Failed to update delivery port' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query('DELETE FROM sea_delivery_ports WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Delivery port not found' });
      return;
    }
    logger.info('SEA_DELIVERY_PORTS', `Deleted delivery port id=${req.params.id}`);
    res.json({ message: 'Deleted' });
  } catch (error) {
    logger.error('SEA_DELIVERY_PORTS', `DELETE /${req.params.id} error`, error);
    res.status(500).json({ message: 'Failed to delete delivery port' });
  }
});

export default router;
