import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query('SELECT * FROM locations WHERE is_active=TRUE ORDER BY iata_code');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  const { iata_code, city_name, country } = req.body;
  if (!iata_code || !city_name) {
    res.status(400).json({ message: 'iata_code and city_name required' });
    return;
  }
  try {
    const result = await pool.query(
      'INSERT INTO locations (iata_code, city_name, country) VALUES ($1, $2, $3) RETURNING *',
      [iata_code.toUpperCase(), city_name, country]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') res.status(400).json({ message: 'IATA code already exists' });
    else res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', requireRole(['master_admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await pool.query('UPDATE locations SET is_active=FALSE WHERE id=$1', [req.params.id]);
    res.json({ message: 'Removed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
