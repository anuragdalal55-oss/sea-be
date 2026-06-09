import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /locations — returns locations the current user is allowed to access.
// Admins/master_admins always get all active locations.
// Regular users get only their assigned locations (user_locations table).
// If a regular user has NO assignments, they still get all (no restriction set yet).
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const isAdmin = req.user?.role === 'master_admin' || req.user?.role === 'admin';
    if (isAdmin) {
      // Admins see all active Indian locations only
      const result = await pool.query(
        `SELECT * FROM locations WHERE is_active=TRUE AND country = 'India' ORDER BY iata_code`
      );
      res.json(result.rows);
      return;
    }

    // Check if user has specific location assignments
    const assignResult = await pool.query(
      `SELECT ul.location_id FROM user_locations ul
       JOIN locations l ON l.id = ul.location_id
       WHERE ul.user_id = $1 AND l.country = $2
       ORDER BY l.iata_code`,
      [req.user?.id, 'India']
    );

    if (assignResult.rows.length === 0) {
      // No restrictions assigned — show all Indian locations
      const result = await pool.query(
        `SELECT * FROM locations WHERE is_active=TRUE AND country = 'India' ORDER BY iata_code`
      );
      res.json(result.rows);
    } else {
      // Show only assigned Indian locations
      const locationIds = assignResult.rows.map(r => r.location_id);
      const placeholders = locationIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      const result = await pool.query(
        `SELECT * FROM locations WHERE id IN (${placeholders}) AND is_active=TRUE AND country = 'India' ORDER BY iata_code`,
        locationIds
      );
      res.json(result.rows);
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /locations/user/:userId — get assigned locations for a user (admin only)
router.get('/user/:userId', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT l.* FROM locations l
       JOIN user_locations ul ON l.id = ul.location_id
       WHERE ul.user_id = $1 AND l.is_active = TRUE
       ORDER BY l.iata_code`,
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /locations/user/:userId — set allowed locations for a user (admin only)
// Pass locationIds: [] to remove all restrictions (user gets all locations)
router.put('/user/:userId', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  const { locationIds } = req.body; // array of location UUIDs
  if (!Array.isArray(locationIds)) {
    res.status(400).json({ message: 'locationIds must be an array' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Remove all current assignments
    await client.query('DELETE FROM user_locations WHERE user_id = $1', [req.params.userId]);
    // Insert new assignments
    for (const locId of locationIds) {
      await client.query(
        'INSERT INTO user_locations (user_id, location_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.params.userId, locId]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Locations updated', count: locationIds.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// POST /locations — add new location (admin+)
router.post('/', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  const { iata_code, city_name, country, customs_house_code } = req.body;
  if (!iata_code || !city_name) {
    res.status(400).json({ message: 'iata_code and city_name required' });
    return;
  }
  try {
    const code = String(iata_code).trim().toUpperCase();
    const chc = String(customs_house_code || '').trim().toUpperCase() || code;
    const result = await pool.query(
      'INSERT INTO locations (iata_code, city_name, country, customs_house_code) VALUES ($1, $2, $3, $4) RETURNING *',
      [code, city_name, country || 'India', chc]
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
