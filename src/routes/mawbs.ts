import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// List MAWBs
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search } = req.query;
    let query = `SELECT m.*, p.profile_code, p.company_name,
                   (SELECT COUNT(*) FROM hawbs h WHERE h.mawb_id = m.id) as hawb_count
                 FROM mawbs m LEFT JOIN profiles p ON m.profile_id = p.id`;
    const params: any[] = [];
    if (search) {
      query += ' WHERE m.mawb_no ILIKE $1 OR m.origin ILIKE $1';
      params.push(`%${search}%`);
    }
    query += ' ORDER BY m.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single MAWB
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT m.*, p.profile_code, p.company_name
       FROM mawbs m LEFT JOIN profiles p ON m.profile_id = p.id
       WHERE m.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ message: 'MAWB not found' });
      return;
    }
    // Get HAWBs
    const hawbs = await pool.query('SELECT * FROM hawbs WHERE mawb_id = $1 ORDER BY created_at ASC', [req.params.id]);
    res.json({ ...result.rows[0], hawbs: hawbs.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create MAWB
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    mawb_no, mawb_date, airline_code, origin, destination,
    flight_no, flight_origin_date, igm_no, igm_date,
    shipment_type, total_packages, gross_weight, item_description,
    special_handling_code, uld_number, customs_house_code, profile_id
  } = req.body;

  if (!mawb_no || !origin || !destination) {
    res.status(400).json({ message: 'mawb_no, origin, destination required' });
    return;
  }
  try {
    const result = await pool.query(
      `INSERT INTO mawbs (mawb_no, mawb_date, airline_code, origin, destination,
        flight_no, flight_origin_date, igm_no, igm_date, shipment_type,
        total_packages, gross_weight, item_description, special_handling_code,
        uld_number, customs_house_code, profile_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [mawb_no, mawb_date, airline_code, origin, destination,
       flight_no, flight_origin_date, igm_no, igm_date, shipment_type || 'T',
       total_packages, gross_weight, item_description, special_handling_code,
       uld_number, customs_house_code, profile_id, req.user?.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update MAWB
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    mawb_no, mawb_date, airline_code, origin, destination,
    flight_no, flight_origin_date, igm_no, igm_date,
    shipment_type, total_packages, gross_weight, item_description,
    special_handling_code, uld_number, customs_house_code, profile_id
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE mawbs SET mawb_no=$1, mawb_date=$2, airline_code=$3, origin=$4, destination=$5,
       flight_no=$6, flight_origin_date=$7, igm_no=$8, igm_date=$9, shipment_type=$10,
       total_packages=$11, gross_weight=$12, item_description=$13, special_handling_code=$14,
       uld_number=$15, customs_house_code=$16, profile_id=$17, updated_at=NOW()
       WHERE id=$18 RETURNING *`,
      [mawb_no, mawb_date, airline_code, origin, destination,
       flight_no, flight_origin_date, igm_no, igm_date, shipment_type,
       total_packages, gross_weight, item_description, special_handling_code,
       uld_number, customs_house_code, profile_id, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete MAWB
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await pool.query('DELETE FROM mawbs WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
