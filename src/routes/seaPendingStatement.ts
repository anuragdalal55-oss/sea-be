import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);

// GET /api/sea-pending — admin-only list of pending (draft) MBLs grouped by user
router.get('/', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  const search = String(req.query.search || '').trim();
  const userId = String(req.query.user_id || '').trim();

  try {
    const params: any[] = [];
    const conditions: string[] = ["m.status = 'draft'"];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`m.mbl_no ILIKE $${params.length}`);
    }

    if (userId) {
      params.push(userId);
      conditions.push(`m.created_by = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         m.id,
         m.mbl_no,
         m.vessel_date,
         m.port_of_loading AS gateway_port,
         m.vessel_name,
         m.description AS remarks,
         m.created_at,
         u.username AS created_by,
         u.id AS created_by_id,
         h.port_of_delivery AS delivery_port
       FROM sea_mbls m
       LEFT JOIN sea_users u ON u.id = m.created_by
       LEFT JOIN LATERAL (
         SELECT port_of_delivery FROM sea_hbls
         WHERE mbl_id = m.id
         ORDER BY sort_order ASC, created_at ASC
         LIMIT 1
       ) h ON TRUE
       ${where}
       ORDER BY m.created_at DESC`,
      params
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('SEA_PENDING', 'GET / error', error);
    res.status(500).json({ message: 'Failed to load pending statements' });
  }
});

// GET /api/sea-pending/users — list of users who have created MBLs (for filter dropdown)
router.get('/users', requireRole(['master_admin', 'admin']), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT u.id, u.username
       FROM sea_users u
       INNER JOIN sea_mbls m ON m.created_by = u.id AND m.status = 'draft'
       ORDER BY u.username`
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('SEA_PENDING', 'GET /users error', error);
    res.status(500).json({ message: 'Failed to load users' });
  }
});

export default router;
