import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query('SELECT * FROM profiles ORDER BY company_name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  const { profile_code, company_name, address, city, state, country, phone, email, carn_number, customs_house_code, icegate_code } = req.body;
  if (!profile_code || !company_name) {
    res.status(400).json({ message: 'profile_code and company_name required' });
    return;
  }
  try {
    const result = await pool.query(
      `INSERT INTO profiles (profile_code, company_name, address, city, state, country, phone, email, carn_number, customs_house_code, icegate_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [profile_code, company_name, address, city, state, country, phone, email, carn_number, customs_house_code, icegate_code]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') res.status(400).json({ message: 'Profile code already exists' });
    else res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  const { company_name, address, city, state, country, phone, email, carn_number, customs_house_code, icegate_code } = req.body;
  try {
    const result = await pool.query(
      `UPDATE profiles SET company_name=$1, address=$2, city=$3, state=$4, country=$5, phone=$6, email=$7,
       carn_number=$8, customs_house_code=$9, icegate_code=$10, updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [company_name, address, city, state, country, phone, email, carn_number, customs_house_code, icegate_code, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
