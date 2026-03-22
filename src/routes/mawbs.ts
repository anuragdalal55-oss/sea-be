import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const toDateOrNull = (v: any) => (v && String(v).trim() !== '' ? v : null);
const toNumOrNull = (v: any) => (v !== '' && v !== null && v !== undefined ? Number(v) : null);

// Helper: get base MAWB number (strip -A1, -P2, -D3 suffixes)
function getBaseNo(mawbNo: string): string {
  return mawbNo.replace(/-[APD]\d+$/, '');
}

// Helper: get next sequence for a suffix type
async function getNextSeq(baseNo: string, suffix: 'A' | 'P' | 'D'): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*) as cnt FROM mawbs WHERE mawb_no LIKE $1`,
    [`${baseNo}-${suffix}%`]
  );
  return parseInt(result.rows[0].cnt) + 1;
}

// List MAWBs (server-side pagination)
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search } = req.query;
    const page     = Math.max(1, parseInt(String(req.query.page  || '1')));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '25'))));
    const offset   = (page - 1) * pageSize;

    const params: any[] = [];
    let where = '';
    if (search) {
      params.push(`%${search}%`);
      where = ' WHERE m.mawb_no ILIKE $1 OR m.origin ILIKE $1';
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM mawbs m${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const dataParams = [...params, pageSize, offset];
    const limitIdx   = params.length + 1;
    const offsetIdx  = params.length + 2;

    const result = await pool.query(
      `SELECT m.*, p.profile_code, p.company_name,
              (SELECT COUNT(*) FROM hawbs h WHERE h.mawb_id = m.id) as hawb_count
       FROM mawbs m LEFT JOIN profiles p ON m.profile_id = p.id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      dataParams
    );

    res.json({ data: result.rows, total, page, pageSize });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single MAWB with HAWBs
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
    const hawbs = await pool.query(
      'SELECT * FROM hawbs WHERE mawb_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ ...result.rows[0], hawbs: hawbs.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create MAWB (Fresh - message_type F)
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { mawb_no, mawb_date, origin, destination, total_packages, gross_weight, customs_house_code, profile_id } = req.body;
  if (!mawb_no || !origin || !destination) {
    res.status(400).json({ message: 'mawb_no, origin, destination required' });
    return;
  }
  try {
    // Enforce unique MAWB number
    const existing = await pool.query('SELECT id FROM mawbs WHERE mawb_no = $1', [mawb_no]);
    if (existing.rows.length > 0) {
      res.status(400).json({ message: 'MAWB number already exists. Please use a unique MAWB number.' });
      return;
    }
    const result = await pool.query(
      `INSERT INTO mawbs (mawb_no, mawb_date, origin, destination, shipment_type,
        total_packages, gross_weight, item_description, customs_house_code,
        profile_id, created_by, message_type, status)
       VALUES ($1,$2,$3,$4,'T',$5,$6,'CONSOL',$7,$8,$9,'F','draft') RETURNING *`,
      [mawb_no, toDateOrNull(mawb_date), origin, destination,
       toNumOrNull(total_packages) || 0, toNumOrNull(gross_weight) || 0,
       customs_house_code || null, profile_id || null, req.user?.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Edit MAWB (same number, message_type stays F, can update flight details)
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { mawb_date, origin, destination, total_packages, gross_weight,
    flight_no, flight_origin_date, igm_no, igm_date, customs_house_code, profile_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE mawbs SET mawb_date=$1, origin=$2, destination=$3,
       total_packages=$4, gross_weight=$5, item_description='CONSOL',
       flight_no=$6, flight_origin_date=$7, igm_no=$8, igm_date=$9,
       customs_house_code=$10, profile_id=$11, updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [toDateOrNull(mawb_date), origin, destination,
       toNumOrNull(total_packages) || 0, toNumOrNull(gross_weight) || 0,
       flight_no || null, toDateOrNull(flight_origin_date),
       igm_no || null, toDateOrNull(igm_date),
       customs_house_code || null, profile_id || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Amend MAWB – creates new MAWB with suffix -A1, -A2… message_type=A
router.post('/amend/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orig = await pool.query('SELECT * FROM mawbs WHERE id = $1', [req.params.id]);
    if (orig.rows.length === 0) { res.status(404).json({ message: 'MAWB not found' }); return; }
    const m = orig.rows[0];
    const baseNo = getBaseNo(m.mawb_no);
    const seq = await getNextSeq(baseNo, 'A');
    const newNo = `${baseNo}-A${seq}`;

    const { mawb_date, origin, destination, total_packages, gross_weight,
      flight_no, flight_origin_date, igm_no, igm_date, customs_house_code, profile_id } = req.body;

    const result = await pool.query(
      `INSERT INTO mawbs (mawb_no, mawb_date, origin, destination, shipment_type,
        total_packages, gross_weight, item_description, flight_no, flight_origin_date,
        igm_no, igm_date, customs_house_code, profile_id, created_by,
        message_type, parent_mawb_id, amendment_seq, status)
       VALUES ($1,$2,$3,$4,'T',$5,$6,'CONSOL',$7,$8,$9,$10,$11,$12,$13,'A',$14,$15,'draft') RETURNING *`,
      [newNo,
       toDateOrNull(mawb_date || m.mawb_date), origin || m.origin, destination || m.destination,
       toNumOrNull(total_packages) !== null ? toNumOrNull(total_packages) : m.total_packages,
       toNumOrNull(gross_weight) !== null ? toNumOrNull(gross_weight) : parseFloat(m.gross_weight),
       flight_no || m.flight_no || null, toDateOrNull(flight_origin_date || m.flight_origin_date),
       igm_no || m.igm_no || null, toDateOrNull(igm_date || m.igm_date),
       customs_house_code || m.customs_house_code || null,
       profile_id || m.profile_id || null, req.user?.id, m.id, seq]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Part MAWB – creates new MAWB with suffix -P1, -P2… message_type=F
router.post('/part/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orig = await pool.query('SELECT * FROM mawbs WHERE id = $1', [req.params.id]);
    if (orig.rows.length === 0) { res.status(404).json({ message: 'MAWB not found' }); return; }
    const m = orig.rows[0];
    const baseNo = getBaseNo(m.mawb_no);
    const seq = await getNextSeq(baseNo, 'P');
    const newNo = `${baseNo}-P${seq}`;

    const { mawb_date, origin, destination, total_packages, gross_weight,
      flight_no, flight_origin_date, igm_no, igm_date, customs_house_code, profile_id } = req.body;

    const result = await pool.query(
      `INSERT INTO mawbs (mawb_no, mawb_date, origin, destination, shipment_type,
        total_packages, gross_weight, item_description, flight_no, flight_origin_date,
        igm_no, igm_date, customs_house_code, profile_id, created_by,
        message_type, parent_mawb_id, amendment_seq, status)
       VALUES ($1,$2,$3,$4,'T',$5,$6,'CONSOL',$7,$8,$9,$10,$11,$12,$13,'F',$14,$15,'draft') RETURNING *`,
      [newNo,
       toDateOrNull(mawb_date || m.mawb_date), origin || m.origin, destination || m.destination,
       toNumOrNull(total_packages) !== null ? toNumOrNull(total_packages) : m.total_packages,
       toNumOrNull(gross_weight) !== null ? toNumOrNull(gross_weight) : parseFloat(m.gross_weight),
       flight_no || m.flight_no || null, toDateOrNull(flight_origin_date || m.flight_origin_date),
       igm_no || m.igm_no || null, toDateOrNull(igm_date || m.igm_date),
       customs_house_code || m.customs_house_code || null,
       profile_id || m.profile_id || null, req.user?.id, m.id, seq]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete-Copy MAWB – creates new MAWB with suffix -D1, -D2… message_type=D
router.post('/delete-copy/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orig = await pool.query('SELECT * FROM mawbs WHERE id = $1', [req.params.id]);
    if (orig.rows.length === 0) { res.status(404).json({ message: 'MAWB not found' }); return; }
    const m = orig.rows[0];
    const baseNo = getBaseNo(m.mawb_no);
    const seq = await getNextSeq(baseNo, 'D');
    const newNo = `${baseNo}-D${seq}`;

    const { mawb_date, origin, destination, total_packages, gross_weight,
      flight_no, flight_origin_date, igm_no, igm_date, customs_house_code, profile_id } = req.body;

    const result = await pool.query(
      `INSERT INTO mawbs (mawb_no, mawb_date, origin, destination, shipment_type,
        total_packages, gross_weight, item_description, flight_no, flight_origin_date,
        igm_no, igm_date, customs_house_code, profile_id, created_by,
        message_type, parent_mawb_id, amendment_seq, status)
       VALUES ($1,$2,$3,$4,'T',$5,$6,'CONSOL',$7,$8,$9,$10,$11,$12,$13,'D',$14,$15,'draft') RETURNING *`,
      [newNo,
       toDateOrNull(mawb_date || m.mawb_date), origin || m.origin, destination || m.destination,
       toNumOrNull(total_packages) !== null ? toNumOrNull(total_packages) : m.total_packages,
       toNumOrNull(gross_weight) !== null ? toNumOrNull(gross_weight) : parseFloat(m.gross_weight),
       flight_no || m.flight_no || null, toDateOrNull(flight_origin_date || m.flight_origin_date),
       igm_no || m.igm_no || null, toDateOrNull(igm_date || m.igm_date),
       customs_house_code || m.customs_house_code || null,
       profile_id || m.profile_id || null, req.user?.id, m.id, seq]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Permanent Delete MAWB
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await pool.query('DELETE FROM mawbs WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
