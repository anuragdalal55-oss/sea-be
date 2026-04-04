import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// Login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ message: 'Username and password required' });
    return;
  }
  try {
    const result = await pool.query(
      `SELECT u.*, p.profile_code, p.company_name,
              COALESCE(u.customs_house_code, p.customs_house_code) as customs_house_code,
              p.carn_number
       FROM users u
       LEFT JOIN profiles p ON u.profile_id = p.id
       WHERE u.username = $1 AND u.is_active = TRUE`,
      [username]
    );
    if (result.rows.length === 0) {
      logger.warn('AUTH', `Login failed — user not found: ${username}`);
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      logger.warn('AUTH', `Login failed — wrong password for user: ${username}`);
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }
    logger.info('AUTH', `Login successful: ${username} (${user.role})`);
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, profile_id: user.profile_id },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '8h' }
    );
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        profile_id: user.profile_id,
        profile_code: user.profile_code,
        company_name: user.company_name,
        customs_house_code: user.customs_house_code,
        carn_number: user.carn_number,
      }
    });
  } catch (err) {
    logger.error('AUTH', 'Login error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.role,
              p.profile_code, p.company_name, p.customs_house_code, p.carn_number
       FROM users u LEFT JOIN profiles p ON u.profile_id = p.id
       WHERE u.id = $1`,
      [req.user?.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('AUTH', 'GET /me error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Change password
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { current_password, new_password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user?.id]);
    const user = result.rows[0];
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) {
      logger.warn('AUTH', `Change password failed — wrong current password for user: ${req.user?.username}`);
      res.status(400).json({ message: 'Current password incorrect' });
      return;
    }
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user?.id]);
    logger.info('AUTH', `Password changed for user: ${req.user?.username}`);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    logger.error('AUTH', 'Change password error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
