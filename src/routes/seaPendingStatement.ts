import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);

// GET /api/sea-pending — list of pending (draft) MBLs, available to every logged-in user.
// Admins can see and filter across all users; regular users only ever see their own records.
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const isAdmin = req.user?.role === 'master_admin' || req.user?.role === 'admin';
  const search = String(req.query.search || '').trim();
  const userId = String(req.query.user_id || '').trim();
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSize = Math.max(1, parseInt(String(req.query.pageSize || '50'), 10) || 50);
  const offset = (page - 1) * pageSize;

  try {
    const params: any[] = [];
    const conditions: string[] = ["m.status = 'draft'"];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`m.mbl_no ILIKE $${params.length}`);
    }

    if (isAdmin) {
      if (userId) {
        params.push(userId);
        conditions.push(`m.created_by = $${params.length}`);
      }
    } else {
      params.push(req.user?.id);
      conditions.push(`m.created_by = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM sea_mbls m ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `SELECT
         m.id,
         m.mbl_no,
         m.vessel_date,
         COALESCE(NULLIF(lp.port_name, ''), m.port_of_loading) AS gateway_port,
         m.vessel_name,
         m.description AS remarks,
         m.created_at,
         u.username AS created_by,
         u.id AS created_by_id,
         h.port_of_delivery AS delivery_port
       FROM sea_mbls m
       LEFT JOIN sea_users u ON u.id = m.created_by
       LEFT JOIN sea_loading_ports lp ON lp.port_code = m.port_of_loading
       LEFT JOIN LATERAL (
         SELECT port_of_delivery FROM sea_hbls
         WHERE mbl_id = m.id
         ORDER BY sort_order ASC, created_at ASC
         LIMIT 1
       ) h ON TRUE
       ${where}
       ORDER BY m.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    res.json({ data: result.rows, total });
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
