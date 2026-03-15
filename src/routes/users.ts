import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// List users (admin+)
router.get('/', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.role, u.is_active, u.created_at,
              p.profile_code, p.company_name
       FROM users u LEFT JOIN profiles p ON u.profile_id = p.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Register user (admin+)
router.post('/register', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  const { username, password, full_name, email, role, profile_id } = req.body;
  if (!username || !password || !full_name) {
    res.status(400).json({ message: 'username, password, full_name required' });
    return;
  }
  // Admins cannot create master_admin
  if (req.user?.role === 'admin' && role === 'master_admin') {
    res.status(403).json({ message: 'Cannot create master_admin' });
    return;
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, email, role, profile_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, full_name, role`,
      [username, hash, full_name, email, role || 'user', profile_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(400).json({ message: 'Username already exists' });
    } else {
      res.status(500).json({ message: 'Server error' });
    }
  }
});

// Update user
router.put('/:id', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  const { full_name, email, role, is_active, profile_id } = req.body;
  try {
    await pool.query(
      `UPDATE users SET full_name=$1, email=$2, role=$3, is_active=$4, profile_id=$5, updated_at=NOW()
       WHERE id=$6`,
      [full_name, email, role, is_active, profile_id, req.params.id]
    );
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete user
router.delete('/:id', requireRole(['master_admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await pool.query('UPDATE users SET is_active=FALSE WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deactivated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
