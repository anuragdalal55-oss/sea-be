import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { generateSeaCGM, generateSeaCGMFileName } from '../utils/seaCgmGenerator';

const router = Router();
router.use(authenticate);

// ── Profile resolution (4-level cascade) ──────────────────────────────────────
// 1. MBL's profile_id  2. creator + location  3. req.user + location  4. location only
async function resolveProfile(mblRow: any, userId: string, chc: string) {
  if (mblRow.profile_id) {
    const r = await pool.query('SELECT * FROM sea_profiles WHERE id = $1', [mblRow.profile_id]);
    if (r.rows.length) return r.rows[0];
  }
  if (mblRow.created_by) {
    const r = await pool.query(
      `SELECT * FROM sea_profiles WHERE user_id = $1 AND (location_code = $2 OR customs_house_code = $2) LIMIT 1`,
      [mblRow.created_by, chc]
    );
    if (r.rows.length) return r.rows[0];
  }
  if (userId) {
    const r = await pool.query(
      `SELECT * FROM sea_profiles WHERE user_id = $1 AND (location_code = $2 OR customs_house_code = $2) LIMIT 1`,
      [userId, chc]
    );
    if (r.rows.length) return r.rows[0];
  }
  const r = await pool.query(
    `SELECT * FROM sea_profiles WHERE (location_code = $1 OR customs_house_code = $1) LIMIT 1`,
    [chc]
  );
  return r.rows[0] || null;
}

// ── Increment and return control number ────────────────────────────────────────
async function getNextControlNumber(userId: string, locationCode: string): Promise<number> {
  const existing = await pool.query(
    `SELECT id, control_number FROM sea_file_control_numbers
     WHERE user_id = $1 AND location_code = $2 LIMIT 1`,
    [userId, locationCode]
  );
  if (existing.rows.length) {
    const next = existing.rows[0].control_number + 1;
    await pool.query(
      'UPDATE sea_file_control_numbers SET control_number = $1 WHERE id = $2',
      [next, existing.rows[0].id]
    );
    return next;
  }
  await pool.query(
    'INSERT INTO sea_file_control_numbers (user_id, location_code, control_number) VALUES ($1, $2, 1)',
    [userId, locationCode]
  );
  return 1;
}

// ── POST /generate/:id ─────────────────────────────────────────────────────────
// Generate sea CGM file for the given MBL. Increments control number each call.
router.post('/generate/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const mblResult = await client.query(
      `SELECT m.*, p.carn_number, p.icegate_code, p.user_prefix, p.consol_agent_id,
              p.profile_code, p.company_name, p.customs_house_code AS profile_chc
       FROM sea_mbls m
       LEFT JOIN sea_profiles p ON p.id = m.profile_id
       WHERE m.id = $1`,
      [req.params.id]
    );

    if (mblResult.rows.length === 0) {
      res.status(404).json({ message: 'Sea MBL not found' });
      return;
    }

    const mbl = mblResult.rows[0];
    const chc = mbl.customs_house_code || '';

    // Profile resolution
    let profile = null;
    if (mbl.carn_number) {
      profile = mbl; // profile data already joined
    } else {
      profile = await resolveProfile(mbl, req.user!.id, chc);
    }

    const carnNumber = profile?.carn_number || profile?.pan_number || '';
    if (!carnNumber) {
      res.status(400).json({
        message: 'No CARN number found. Please set a CARN number or PAN number in the profile for this location.',
      });
      return;
    }

    // HBLs
    const hblResult = await client.query(
      'SELECT * FROM sea_hbls WHERE mbl_id = $1 ORDER BY sort_order ASC, created_at ASC',
      [req.params.id]
    );

    const locationCode = chc || profile.location_code || '';
    const controlNum = await getNextControlNumber(req.user!.id, locationCode);
    const userPrefix = profile.user_prefix || profile.company_name?.substring(0, 3) || 'SEA';

    const fileName = generateSeaCGMFileName(chc, carnNumber, userPrefix, controlNum);
    const controlNumber = `${userPrefix.replace(/\s+/g, '').substring(0, 3).toUpperCase()}${String(controlNum).padStart(4, '0')}`;

    // Attach containers from containers_json to each HBL row for the CGM generator
    const hblRows = hblResult.rows.map((h: any) => ({
      ...h,
      containers: Array.isArray(h.containers_json) && h.containers_json.length > 0 ? h.containers_json : undefined,
    }));

    const fileContent = generateSeaCGM(
      {
        mbl_no:           mbl.mbl_no,
        mbl_date:         mbl.mbl_date,
        igm_no:           mbl.igm_no,
        igm_date:         mbl.igm_date,
        imo_code:         mbl.imo_code,
        vessel_code:      mbl.vessel_code,
        vessel_voyage_no: mbl.vessel_voyage_no,
        vessel_date:      mbl.vessel_date,
        vessel_name:      mbl.vessel_name,
        shipping_line:    mbl.shipping_line,
        line_no:          mbl.line_no,
        port_of_loading:  mbl.port_of_loading,
        port_of_unloading: mbl.port_of_unloading,
        customs_house_code: chc,
        carn_number:      carnNumber,
        icegate_code:     profile.icegate_code,
        user_prefix:      userPrefix,
        consol_agent_id:  profile.consol_agent_id,
      },
      hblRows,
      { controlNumber, senderCode: profile.icegate_code || profile.consol_agent_id || '' }
    );

    await client.query(
      `INSERT INTO sea_transmissions (sea_mbl_id, file_name, file_content, status, created_by)
       VALUES ($1, $2, $3, 'generated', $4)`,
      [req.params.id, fileName, fileContent, req.user!.id]
    );

    logger.info('SEA_TX', `Generated CGM ${fileName} for MBL ${mbl.mbl_no}`);
    res.json({ fileName, fileContent });
  } catch (error) {
    logger.error('SEA_TX', `POST /generate/${req.params.id} error`, error);
    res.status(500).json({ message: 'Failed to generate sea CGM file' });
  } finally {
    client.release();
  }
});

// ── GET / — transmission history ──────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const isAdmin = req.user?.role === 'master_admin' || req.user?.role === 'admin';
  try {
    const result = await pool.query(
      `SELECT t.*, m.mbl_no, u.username
       FROM sea_transmissions t
       LEFT JOIN sea_mbls m ON m.id = t.sea_mbl_id
       LEFT JOIN sea_users u ON u.id = t.created_by
       ${isAdmin ? '' : 'WHERE t.created_by = $1'}
       ORDER BY t.created_at DESC
       LIMIT 100`,
      isAdmin ? [] : [req.user?.id]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('SEA_TX', 'GET / error', error);
    res.status(500).json({ message: 'Failed to load sea transmission history' });
  }
});

// ── GET /download/:id — download stored transmission file ─────────────────────
router.get('/download/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT file_name, file_content FROM sea_transmissions WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Transmission not found' });
      return;
    }
    const { file_name, file_content } = result.rows[0];
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${file_name}"`);
    res.send(file_content);
  } catch (error) {
    logger.error('SEA_TX', `GET /download/${req.params.id} error`, error);
    res.status(500).json({ message: 'Failed to download file' });
  }
});

export default router;
