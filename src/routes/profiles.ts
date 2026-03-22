import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.username as user_username, u.full_name as user_full_name
      FROM profiles p
      LEFT JOIN users u ON u.profile_id = p.id
      ORDER BY p.company_name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query('SELECT * FROM profiles WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ message: 'Profile not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    profile_code, company_name, address, city, state, country, phone, email,
    carn_number, customs_house_code, icegate_code,
    // New fields
    pan_number, user_prefix, consol_agent_id, user_email, agent_name,
    address1, address2, gstin, billing_company, billing_state, gst_rate,
    pan_for_invoice, air_igm_rate, sea_consol_lcl_rate, sea_consol_fcl_rate,
    air_manifest_rate, air_manifest_min_bill, location_code,
    user_id,
  } = req.body;

  if (!company_name) {
    res.status(400).json({ message: 'company_name required' });
    return;
  }
  // Auto-generate profile_code if not provided
  const pCode = profile_code || customs_house_code || `PROF${Date.now().toString().slice(-6)}`;

  try {
    const result = await pool.query(
      `INSERT INTO profiles (
        profile_code, company_name, address, city, state, country, phone, email,
        carn_number, customs_house_code, icegate_code,
        pan_number, user_prefix, consol_agent_id, user_email, agent_name,
        address1, address2, gstin, billing_company, billing_state, gst_rate,
        pan_for_invoice, air_igm_rate, sea_consol_lcl_rate, sea_consol_fcl_rate,
        air_manifest_rate, air_manifest_min_bill, location_code
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
        $23,$24,$25,$26,$27,$28,$29
      ) RETURNING *`,
      [pCode, company_name, address || null, city || null, state || null,
       country || 'India', phone || null, email || null,
       carn_number || null, customs_house_code || null, icegate_code || null,
       pan_number || null, user_prefix || null, consol_agent_id || null,
       user_email || null, agent_name || null, address1 || null, address2 || null,
       gstin || null, billing_company || null, billing_state || null,
       gst_rate || 18, pan_for_invoice || null,
       air_igm_rate || null, sea_consol_lcl_rate || null, sea_consol_fcl_rate || null,
       air_manifest_rate || null, air_manifest_min_bill || null, location_code || null]
    );
    const profile = result.rows[0];

    // Link user to this profile if user_id provided
    if (user_id) {
      await pool.query(
        'UPDATE users SET profile_id = $1 WHERE id = $2',
        [profile.id, user_id]
      );
    }

    res.status(201).json(profile);
  } catch (err: any) {
    if (err.code === '23505') res.status(400).json({ message: 'Profile code already exists' });
    else { console.error(err); res.status(500).json({ message: 'Server error' }); }
  }
});

router.put('/:id', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    company_name, address, city, state, country, phone, email,
    carn_number, customs_house_code, icegate_code,
    pan_number, user_prefix, consol_agent_id, user_email, agent_name,
    address1, address2, gstin, billing_company, billing_state, gst_rate,
    pan_for_invoice, air_igm_rate, sea_consol_lcl_rate, sea_consol_fcl_rate,
    air_manifest_rate, air_manifest_min_bill, location_code,
    user_id,
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE profiles SET
        company_name=$1, address=$2, city=$3, state=$4, country=$5, phone=$6, email=$7,
        carn_number=$8, customs_house_code=$9, icegate_code=$10,
        pan_number=$11, user_prefix=$12, consol_agent_id=$13, user_email=$14, agent_name=$15,
        address1=$16, address2=$17, gstin=$18, billing_company=$19, billing_state=$20,
        gst_rate=$21, pan_for_invoice=$22, air_igm_rate=$23, sea_consol_lcl_rate=$24,
        sea_consol_fcl_rate=$25, air_manifest_rate=$26, air_manifest_min_bill=$27,
        location_code=$28, updated_at=NOW()
       WHERE id=$29 RETURNING *`,
      [company_name, address || null, city || null, state || null, country || 'India',
       phone || null, email || null, carn_number || null, customs_house_code || null, icegate_code || null,
       pan_number || null, user_prefix || null, consol_agent_id || null,
       user_email || null, agent_name || null, address1 || null, address2 || null,
       gstin || null, billing_company || null, billing_state || null,
       gst_rate || 18, pan_for_invoice || null,
       air_igm_rate || null, sea_consol_lcl_rate || null, sea_consol_fcl_rate || null,
       air_manifest_rate || null, air_manifest_min_bill || null,
       location_code || null, req.params.id]
    );

    if (user_id) {
      await pool.query('UPDATE users SET profile_id = $1 WHERE id = $2', [req.params.id, user_id]);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await pool.query('DELETE FROM profiles WHERE id = $1', [req.params.id]);
    res.json({ message: 'Profile deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
