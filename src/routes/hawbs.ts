import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// List HAWBs (optionally filtered by mawb_id)
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { mawb_id } = req.query;
  try {
    let query = `SELECT h.*, m.mawb_no FROM hawbs h LEFT JOIN mawbs m ON h.mawb_id = m.id`;
    const params: any[] = [];
    if (mawb_id) {
      query += ' WHERE h.mawb_id = $1';
      params.push(mawb_id);
    }
    query += ' ORDER BY h.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single HAWB
router.get('/:id', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT h.*, m.mawb_no FROM hawbs h LEFT JOIN mawbs m ON h.mawb_id = m.id WHERE h.id = $1`,
      [_req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ message: 'Not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create HAWB
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    mawb_id, hawb_no, hawb_date, origin, destination,
    shipment_type, total_packages, gross_weight, item_description,
    consignee_name, consignee_address, shipper_name, shipper_address, profile_id
  } = req.body;
  if (!mawb_id || !hawb_no || !origin || !destination) {
    res.status(400).json({ message: 'mawb_id, hawb_no, origin, destination required' });
    return;
  }
  try {

    console.log('req.user', req.user);
    

    // const proileId = await pool.query('SELECT id FROM profiles WHERE profile_id = $1', [req.user?.profile_id]);

    const result = await pool.query(
      `INSERT INTO hawbs (mawb_id, hawb_no, hawb_date, origin, destination,
        shipment_type, total_packages, gross_weight, item_description,
        consignee_name, consignee_address, shipper_name, shipper_address, profile_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [mawb_id, hawb_no, hawb_date, origin, destination,
       shipment_type || 'T', total_packages, gross_weight, item_description,
       consignee_name, consignee_address, shipper_name, shipper_address, req.user?.profile_id, req.user?.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update HAWB
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    hawb_no, hawb_date, origin, destination, shipment_type,
    total_packages, gross_weight, item_description,
    consignee_name, consignee_address, shipper_name, shipper_address
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE hawbs SET hawb_no=$1, hawb_date=$2, origin=$3, destination=$4, shipment_type=$5,
       total_packages=$6, gross_weight=$7, item_description=$8,
       consignee_name=$9, consignee_address=$10, shipper_name=$11, shipper_address=$12, updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [hawb_no, hawb_date, origin, destination, shipment_type,
       total_packages, gross_weight, item_description,
       consignee_name, consignee_address, shipper_name, shipper_address, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete HAWB
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await pool.query('DELETE FROM hawbs WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
