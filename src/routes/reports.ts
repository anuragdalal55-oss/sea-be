import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);

// ─── Checklist Report ─────────────────────────────────────────────────────────
// Returns paginated MAWBs with their HAWB counts and transmission status
router.get('/checklist', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { from_date, to_date, profile_id, status } = req.query;
    const page     = Math.max(1, parseInt(String(req.query.page     || '1')));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '25'))));
    const offset   = (page - 1) * pageSize;
    const isAdmin  = req.user?.role === 'master_admin' || req.user?.role === 'admin';

    const base = `
      FROM mawbs m
      LEFT JOIN profiles p ON m.profile_id = p.id
      LEFT JOIN users u ON m.created_by = u.id
      WHERE 1=1`;
    const params: any[] = [];
    let filters = '';
    let idx = 1;
    if (from_date) { filters += ` AND m.created_at >= $${idx++}`; params.push(from_date); }
    if (to_date)   { filters += ` AND m.created_at <= $${idx++}`; params.push(to_date + ' 23:59:59'); }
    if (profile_id){ filters += ` AND m.profile_id = $${idx++}`; params.push(profile_id); }
    if (status)    { filters += ` AND m.status = $${idx++}`; params.push(status); }
    if (!isAdmin)  { filters += ` AND m.created_by = $${idx++}`; params.push(req.user?.id); }

    const countResult = await pool.query(`SELECT COUNT(*) ${base}${filters}`, params);
    const total = parseInt(countResult.rows[0].count);

    const dataResult = await pool.query(
      `SELECT m.*,
         p.profile_code, p.company_name,
         (SELECT COUNT(*) FROM hawbs h WHERE h.mawb_id = m.id) as hawb_count,
         (SELECT COALESCE(SUM(h.total_packages), 0) FROM hawbs h WHERE h.mawb_id = m.id) as hawb_total_packages,
         (SELECT COALESCE(SUM(h.gross_weight), 0) FROM hawbs h WHERE h.mawb_id = m.id) as hawb_total_weight,
         u.username as created_by_name
       ${base}${filters}
       ORDER BY m.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    );
    res.json({ data: dataResult.rows, total, page, pageSize });
  } catch (err) {
    logger.error('REPORTS', 'GET /checklist error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Account Statement ────────────────────────────────────────────────────────
router.get('/account-statement', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const isAdmin = req.user?.role === 'master_admin' || req.user?.role === 'admin';
    const { from_date, to_date, location_code, sort_field, sort_dir } = req.query;
    const exportAll = req.query.export === 'true';
    const page     = Math.max(1, parseInt(String(req.query.page || '1')));
    const pageSize = 100; // fixed at 100 per page

    // Admins can filter by user; non-admins always see only their own records
    const user_id = isAdmin ? (req.query.user_id as string || '') : req.user?.id;

    const dir = sort_dir === 'asc' ? 'ASC' : 'DESC';
    const orderBy = sort_field === 'transmission_date' ? `m.transmission_date ${dir}`
      : sort_field === 'location' ? `m.customs_house_code ${dir}`
      : sort_field === 'user' ? `u.username ${dir}`
      : `m.created_at ${dir}`;

    const base = `
      FROM mawbs m
      LEFT JOIN profiles p ON m.profile_id = p.id
      LEFT JOIN users u ON m.created_by = u.id
      WHERE 1=1`;

    const params: any[] = [];
    let filters = '';
    let idx = 1;
    if (from_date)     { filters += ` AND m.created_at >= $${idx++}`; params.push(from_date); }
    if (to_date)       { filters += ` AND m.created_at <= $${idx++}`; params.push(to_date + ' 23:59:59'); }
    if (user_id)       { filters += ` AND m.created_by = $${idx++}`; params.push(user_id); }
    if (location_code) { filters += ` AND m.customs_house_code = $${idx++}`; params.push(location_code); }

    const selectCols = `
      SELECT m.id, m.mawb_no, m.created_at, m.transmission_date,
             m.customs_house_code, m.status, m.message_type,
             p.pan_number, p.company_name, u.username,
             (SELECT COUNT(*) FROM hawbs h WHERE h.mawb_id = m.id) AS hawb_count`;

    if (exportAll) {
      // No pagination — return all matching rows for CSV export
      const result = await pool.query(`${selectCols} ${base}${filters} ORDER BY ${orderBy}`, params);
      res.json(result.rows);
      return;
    }

    // Count total
    const countResult = await pool.query(`SELECT COUNT(*) ${base}${filters}`, params);
    const total = parseInt(countResult.rows[0].count);

    const offset = (page - 1) * pageSize;
    const dataResult = await pool.query(
      `${selectCols} ${base}${filters} ORDER BY ${orderBy} LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    );

    res.json({ data: dataResult.rows, total, page, pageSize });
  } catch (err) {
    logger.error('REPORTS', 'GET /account-statement error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Statement by Consol User ─────────────────────────────────────────────────
router.get('/statement-by-consol', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const isAdmin = req.user?.role === 'master_admin' || req.user?.role === 'admin';
    const { from_date, to_date, user_id } = req.query;

    const params: any[] = [];
    const conditions: string[] = ['1=1'];
    let idx = 1;

    if (from_date) { conditions.push(`m.created_at >= $${idx++}`); params.push(from_date); }
    if (to_date)   { conditions.push(`m.created_at <= $${idx++}`); params.push(to_date + ' 23:59:59'); }
    // Admins can filter by user; non-admins see only their own
    if (isAdmin && user_id) {
      conditions.push(`m.created_by = $${idx++}`);
      params.push(user_id);
    } else if (!isAdmin) {
      conditions.push(`m.created_by = $${idx++}`);
      params.push(req.user?.id);
    }
    const where = conditions.join(' AND ');

    const result = await pool.query(`
      SELECT
        u.id as user_id, u.username, u.full_name,
        COUNT(DISTINCT m.id) as total_mawbs,
        COUNT(DISTINCT h.id) as total_hawbs,
        COALESCE(SUM(m.total_packages), 0) as total_packages,
        COALESCE(SUM(m.gross_weight)::numeric, 0) as total_weight,
        COUNT(DISTINCT t.id) as total_transmissions,
        MAX(t.sent_at) as last_transmission
      FROM mawbs m
      JOIN users u ON m.created_by = u.id
      LEFT JOIN hawbs h ON h.mawb_id = m.id
      LEFT JOIN transmissions t ON t.mawb_id = m.id
      WHERE ${where}
      GROUP BY u.id, u.username, u.full_name
      ORDER BY total_transmissions DESC
    `, params);
    res.json(result.rows);
  } catch (err) {
    logger.error('REPORTS', 'GET /statement-by-consol error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Statement by Consol (user-friendly, accessible to all) ───────────────────
router.get('/consol-statement', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const isAdmin = req.user?.role === 'master_admin' || req.user?.role === 'admin';
    const { from_date, to_date, user_id } = req.query;
    const exportAll = req.query.export === 'true';
    const page     = Math.max(1, parseInt(String(req.query.page     || '1')));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '25'))));

    const params: any[] = [];
    let filters = '';
    let idx = 1;
    if (from_date) { filters += ` AND m.created_at >= $${idx++}`; params.push(from_date); }
    if (to_date)   { filters += ` AND m.created_at <= $${idx++}`; params.push(to_date + ' 23:59:59'); }
    // Admins can filter by user; non-admins always see only their own
    const effectiveUserId = isAdmin ? (user_id as string || '') : req.user?.id;
    if (effectiveUserId) { filters += ` AND m.created_by = $${idx++}`; params.push(effectiveUserId); }

    const base = `
      FROM mawbs m
      LEFT JOIN profiles p ON m.profile_id = p.id
      LEFT JOIN users u ON m.created_by = u.id
      WHERE 1=1${filters}`;

    const selectCols = `
      SELECT m.id, m.mawb_no, m.created_at, m.transmission_date,
             m.customs_house_code, m.status, m.message_type, m.origin, m.destination,
             m.total_packages, m.gross_weight,
             p.pan_number, p.company_name, p.profile_code,
             u.username,
             (SELECT COUNT(*) FROM hawbs h WHERE h.mawb_id = m.id) AS hawb_count,
             (SELECT COALESCE(SUM(h.total_packages),0) FROM hawbs h WHERE h.mawb_id = m.id) AS hawb_total_packages,
             (SELECT COALESCE(SUM(h.gross_weight),0)  FROM hawbs h WHERE h.mawb_id = m.id) AS hawb_total_weight`;

    if (exportAll) {
      const result = await pool.query(`${selectCols} ${base} ORDER BY m.created_at DESC`, params);
      res.json(result.rows);
      return;
    }

    const countResult = await pool.query(`SELECT COUNT(*) ${base}`, params);
    const total = parseInt(countResult.rows[0].count);
    const offset = (page - 1) * pageSize;
    const dataResult = await pool.query(
      `${selectCols} ${base} ORDER BY m.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    );
    res.json({ data: dataResult.rows, total, page, pageSize });
  } catch (err) {
    logger.error('REPORTS', 'GET /statement-by-consol error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Statement with HAWB ──────────────────────────────────────────────────────
router.get('/statement-with-hawb', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { from_date, to_date } = req.query;
    let query = `
      SELECT m.mawb_no, m.origin, m.destination, m.status as mawb_status,
        m.flight_no, m.created_at as mawb_date,
        h.hawb_no, h.total_packages, h.gross_weight, h.item_description,
        h.consignee_name, h.created_at as hawb_date,
        p.profile_code, p.company_name
      FROM mawbs m
      LEFT JOIN hawbs h ON h.mawb_id = m.id
      LEFT JOIN profiles p ON m.profile_id = p.id
      WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;
    if (from_date) { query += ` AND m.created_at >= $${idx++}`; params.push(from_date); }
    if (to_date) { query += ` AND m.created_at <= $${idx++}`; params.push(to_date + ' 23:59:59'); }
    query += ' ORDER BY m.created_at DESC, h.created_at ASC LIMIT 500';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Download file list ───────────────────────────────────────────────────────
router.get('/download-files', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const isAdmin = req.user?.role === 'master_admin' || req.user?.role === 'admin';
    // Non-admins can only see their own files
    const filterUserId = isAdmin ? (req.query.user_id as string || null) : req.user?.id;
    const filterMawbNo = req.query.mawb_no as string || null;

    const params: any[] = [];
    const conditions: string[] = [];
    let idx = 1;

    if (filterUserId)  { conditions.push(`t.sent_by = $${idx++}`); params.push(filterUserId); }
    if (filterMawbNo)  { conditions.push(`m.mawb_no ILIKE $${idx++}`); params.push(`%${filterMawbNo}%`); }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await pool.query(
      `SELECT t.id, t.transmission_type, t.file_name, t.sent_at, t.status,
              m.mawb_no, u.id as user_id, u.username
       FROM transmissions t
       LEFT JOIN mawbs m ON t.mawb_id = m.id
       LEFT JOIN users u ON t.sent_by = u.id
       ${where}
       ORDER BY t.sent_at DESC LIMIT 500`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Download specific file content
router.get('/download-files/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query('SELECT * FROM transmissions WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ message: 'File not found' }); return; }
    const t = result.rows[0];
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${t.file_name}"`);
    res.send(t.file_content || '');
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── CAN / DO ─────────────────────────────────────────────────────────────────

router.get('/can-do', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type } = req.query;
    let query = `SELECT c.*, u.username as created_by_name FROM can_do c LEFT JOIN users u ON c.created_by = u.id WHERE 1=1`;
    const params: any[] = [];
    if (type) { query += ` AND c.type = $1`; params.push(type); }
    query += ' ORDER BY c.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/can-do', async (req: AuthRequest, res: Response): Promise<void> => {
  const { type, reference_no, mawb_no, hawb_no, consignee_name, consignee_address,
    issue_date, valid_till, customs_house_code, remarks } = req.body;
  if (!type || !['CAN', 'DO'].includes(type)) {
    res.status(400).json({ message: 'type must be CAN or DO' });
    return;
  }
  const toD = (v: any) => (v && String(v).trim() !== '' ? v : null);
  try {
    const result = await pool.query(
      `INSERT INTO can_do (type, reference_no, mawb_no, hawb_no, consignee_name, consignee_address,
        issue_date, valid_till, customs_house_code, remarks, profile_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [type, reference_no || null, mawb_no || null, hawb_no || null,
       consignee_name || null, consignee_address || null,
       toD(issue_date), toD(valid_till), customs_house_code || null,
       remarks || null, req.user?.profile_id, req.user?.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/can-do/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { type, reference_no, mawb_no, hawb_no, consignee_name, consignee_address,
    issue_date, valid_till, customs_house_code, remarks, status } = req.body;
  const toD = (v: any) => (v && String(v).trim() !== '' ? v : null);
  try {
    const result = await pool.query(
      `UPDATE can_do SET type=$1, reference_no=$2, mawb_no=$3, hawb_no=$4, consignee_name=$5,
       consignee_address=$6, issue_date=$7, valid_till=$8, customs_house_code=$9, remarks=$10,
       status=$11, updated_at=NOW() WHERE id=$12 RETURNING *`,
      [type, reference_no || null, mawb_no || null, hawb_no || null, consignee_name || null,
       consignee_address || null, toD(issue_date), toD(valid_till), customs_house_code || null,
       remarks || null, status || 'active', req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/can-do/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await pool.query('DELETE FROM can_do WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Invoices (Accounting) ────────────────────────────────────────────────────

router.get('/invoices', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.query;
    let query = `SELECT i.*, u.username as created_by_name FROM invoices i LEFT JOIN users u ON i.created_by = u.id WHERE 1=1`;
    const params: any[] = [];
    if (status) { query += ' AND i.status = $1'; params.push(status); }
    query += ' ORDER BY i.created_at DESC LIMIT 200';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/invoices', async (req: AuthRequest, res: Response): Promise<void> => {
  const { invoice_no, invoice_date, mawb_no, hawb_no, consignee_name,
    amount, currency, description } = req.body;
  if (!invoice_no || !invoice_date) {
    res.status(400).json({ message: 'invoice_no and invoice_date required' });
    return;
  }
  const toD = (v: any) => (v && String(v).trim() !== '' ? v : null);
  try {
    const result = await pool.query(
      `INSERT INTO invoices (invoice_no, invoice_date, mawb_no, hawb_no, consignee_name,
        amount, currency, description, profile_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [invoice_no, toD(invoice_date), mawb_no || null, hawb_no || null, consignee_name || null,
       amount || 0, currency || 'INR', description || null, req.user?.profile_id, req.user?.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') { res.status(400).json({ message: 'Invoice number already exists' }); return; }
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/invoices/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { invoice_no, invoice_date, mawb_no, hawb_no, consignee_name,
    amount, currency, description, status } = req.body;
  const toD = (v: any) => (v && String(v).trim() !== '' ? v : null);
  try {
    const result = await pool.query(
      `UPDATE invoices SET invoice_no=$1, invoice_date=$2, mawb_no=$3, hawb_no=$4,
       consignee_name=$5, amount=$6, currency=$7, description=$8, status=$9, updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [invoice_no, toD(invoice_date), mawb_no || null, hawb_no || null, consignee_name || null,
       amount || 0, currency || 'INR', description || null, status || 'pending', req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/invoices/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await pool.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
