import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);

// List users (admin+) — includes password_plain for admin display
router.get('/', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.role, u.is_active, u.created_at,
              u.password_plain,
              p.profile_code, p.company_name
       FROM users u LEFT JOIN profiles p ON u.profile_id = p.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    logger.error('USERS', 'GET / error', err);
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
      `INSERT INTO users (username, password_hash, password_plain, full_name, email, role, profile_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, full_name, role`,
      [username, hash, password, full_name, email, role || 'user', profile_id || null]
    );
    logger.info('USERS', `User registered: ${username} (${role || 'user'}) by ${req.user?.username}`);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      logger.warn('USERS', `Register failed — username already exists: ${username}`);
      res.status(400).json({ message: 'Username already exists' });
    } else {
      logger.error('USERS', 'Register error', err);
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
      [full_name, email, role, is_active, profile_id || null, req.params.id]
    );
    logger.info('USERS', `User updated: id=${req.params.id} by ${req.user?.username}`);
    res.json({ message: 'Updated' });
  } catch (err) {
    logger.error('USERS', `PUT /${req.params.id} error`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user's customs house location
router.put('/:id/location', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  const { customs_house_code } = req.body;
  try {
    await pool.query(
      `UPDATE users SET customs_house_code=$1, updated_at=NOW() WHERE id=$2`,
      [customs_house_code || null, req.params.id]
    );
    logger.info('USERS', `Location updated: id=${req.params.id} by ${req.user?.username}`);
    res.json({ message: 'Location updated' });
  } catch (err) {
    logger.error('USERS', `PUT /${req.params.id}/location error`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin reset password for any user
router.put('/:id/reset-password', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    res.status(400).json({ message: 'Password must be at least 6 characters' });
    return;
  }
  try {
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query(
      'UPDATE users SET password_hash=$1, password_plain=$2, updated_at=NOW() WHERE id=$3',
      [hash, new_password, req.params.id]
    );
    logger.info('USERS', `Password reset for user id=${req.params.id} by ${req.user?.username}`);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    logger.error('USERS', `PUT /${req.params.id}/reset-password error`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete user
router.delete('/:id', requireRole(['master_admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await pool.query('UPDATE users SET is_active=FALSE WHERE id=$1', [req.params.id]);
    logger.info('USERS', `User deactivated: id=${req.params.id} by ${req.user?.username}`);
    res.json({ message: 'Deactivated' });
  } catch (err) {
    logger.error('USERS', `DELETE /${req.params.id} error`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
