import { Router, Response } from 'express';
import pool from '../db';
import invoicesPool from '../invoicesDb';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { INVOICE_SUPPLIER, INVOICE_BANK, INVOICE_SAC_CODE, numberToWordsINR } from '../utils/invoiceConstants';

const router = Router();
router.use(authenticate);

// ─── Invoices (manual, Accounting) ────────────────────────────────────────────

router.get('/invoices', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.query;
    let query = `SELECT * FROM invoices WHERE module = 'sea'`;
    const params: any[] = [];
    if (status) { query += ' AND status = $1'; params.push(status); }
    query += ' ORDER BY created_at DESC LIMIT 200';
    const result = await invoicesPool.query(query, params);

    // invoices live in a separate database from sea_users, so resolve
    // created_by_name with a second lookup instead of a SQL join.
    const userIds = [...new Set(result.rows.map((r) => r.created_by).filter(Boolean))];
    const namesById: Record<string, string> = {};
    if (userIds.length > 0) {
      const usersResult = await pool.query('SELECT id, username FROM sea_users WHERE id = ANY($1)', [userIds]);
      for (const u of usersResult.rows) namesById[u.id] = u.username;
    }
    res.json(result.rows.map((r) => ({ ...r, created_by_name: namesById[r.created_by] || null })));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/invoices', async (req: AuthRequest, res: Response): Promise<void> => {
  const { invoice_no, invoice_date, mbl_no, hbl_no, consignee_name,
    amount, currency, description } = req.body;
  if (!invoice_no || !invoice_date) {
    res.status(400).json({ message: 'invoice_no and invoice_date required' });
    return;
  }
  const toD = (v: any) => (v && String(v).trim() !== '' ? v : null);
  try {
    const result = await invoicesPool.query(
      `INSERT INTO invoices (module, invoice_no, invoice_date, mbl_no, hbl_no, consignee_name,
        amount, currency, description, profile_id, created_by)
       VALUES ('sea',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [invoice_no, toD(invoice_date), mbl_no || null, hbl_no || null, consignee_name || null,
       amount || 0, currency || 'INR', description || null, req.user?.profile_id, req.user?.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') { res.status(400).json({ message: 'Invoice number already exists' }); return; }
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/invoices/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { invoice_no, invoice_date, mbl_no, hbl_no, consignee_name,
    amount, currency, description, status } = req.body;
  const toD = (v: any) => (v && String(v).trim() !== '' ? v : null);
  try {
    const result = await invoicesPool.query(
      `UPDATE invoices SET invoice_no=$1, invoice_date=$2, mbl_no=$3, hbl_no=$4,
       consignee_name=$5, amount=$6, currency=$7, description=$8, status=$9, updated_at=NOW()
       WHERE id=$10 AND module='sea' RETURNING *`,
      [invoice_no, toD(invoice_date), mbl_no || null, hbl_no || null, consignee_name || null,
       amount || 0, currency || 'INR', description || null, status || 'pending', req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/invoices/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await invoicesPool.query(`DELETE FROM invoices WHERE id = $1 AND module='sea'`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Sea Invoice (auto-generated from the customer's profile billing plan) ────
// A profile carries exactly one of: monthly_rate, per_mbl_rate, per_hbl_rate.
// Generation sums the user's transmitted MBL/HBL activity for the chosen
// period, applies the profile's GST rate, and always rounds the final total
// UP to the next whole rupee (e.g. 849.60 -> 850.00).

function roundUpToRupee(amount: number): { total: number; roundOff: number } {
  const total = Math.ceil(amount - 1e-9); // epsilon guard against float noise
  const roundOff = Math.round((total - amount) * 100) / 100;
  return { total, roundOff };
}

async function findBillingProfile(userId: string): Promise<any> {
  const r = await pool.query(
    `SELECT * FROM sea_profiles WHERE user_id = $1
       AND (monthly_rate IS NOT NULL OR per_mbl_rate IS NOT NULL OR per_hbl_rate IS NOT NULL)
     ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

async function nextInvoiceNo(): Promise<string> {
  const r = await invoicesPool.query(`SELECT nextval('invoice_no_seq') AS n`);
  return String(r.rows[0].n).padStart(5, '0');
}

async function computeSeaInvoice(userId: string, fromDate: string, toDate: string): Promise<any> {
  const profile = await findBillingProfile(userId);
  if (!profile) {
    throw { status: 400, message: 'No billing rate (Monthly / Per MBL / Per HBL) is configured on any profile for this user.' };
  }
  const ratesSet = [profile.monthly_rate, profile.per_mbl_rate, profile.per_hbl_rate]
    .filter((v: any) => v !== null && v !== undefined);
  if (ratesSet.length !== 1) {
    throw { status: 400, message: `Exactly one billing rate (Monthly / Per MBL / Per HBL) must be set on the profile — found ${ratesSet.length}.` };
  }

  const toDateEnd = `${toDate} 23:59:59`;
  let rateType: string, quantity: number, rate: number, description: string;

  if (profile.monthly_rate !== null && profile.monthly_rate !== undefined) {
    rateType = 'monthly';
    quantity = 1;
    rate = Number(profile.monthly_rate);
    description = 'SEA CONSOL MANIFEST - MONTHLY CHARGES';
  } else if (profile.per_mbl_rate !== null && profile.per_mbl_rate !== undefined) {
    rateType = 'mbl';
    rate = Number(profile.per_mbl_rate);
    // "Billable" = the MBL has at least one transmission in the period.
    // sea_mbls has no transmission_date column — sea_transmissions is the
    // real source of truth, joined on sea_mbl_id.
    const r = await pool.query(
      `SELECT COUNT(DISTINCT m.id) FROM sea_mbls m
       JOIN sea_transmissions t ON t.sea_mbl_id = m.id
       WHERE m.created_by = $1 AND t.created_at >= $2 AND t.created_at <= $3`,
      [userId, fromDate, toDateEnd]
    );
    quantity = parseInt(r.rows[0].count);
    description = 'SEA CONSOL MANIFEST (MBL)';
  } else {
    rateType = 'hbl';
    rate = Number(profile.per_hbl_rate);
    const r = await pool.query(
      `SELECT COUNT(DISTINCT h.id) FROM sea_hbls h
       JOIN sea_mbls m ON h.mbl_id = m.id
       JOIN sea_transmissions t ON t.sea_mbl_id = m.id
       WHERE m.created_by = $1 AND t.created_at >= $2 AND t.created_at <= $3`,
      [userId, fromDate, toDateEnd]
    );
    quantity = parseInt(r.rows[0].count);
    description = 'SEA CONSOL MANIFEST (HBL)';
  }

  const gstRate = Number(profile.gst_rate ?? 18);
  const taxableAmount = Math.round(quantity * rate * 100) / 100;
  const gstAmount = Math.round(taxableAmount * gstRate) / 100;
  const beforeRound = Math.round((taxableAmount + gstAmount) * 100) / 100;
  const { total, roundOff } = roundUpToRupee(beforeRound);

  const buyer = {
    company_name: profile.billing_company || profile.company_name,
    address1: profile.address1 || '',
    address2: profile.address2 || '',
    billing_state: profile.billing_state || '',
    gstin: profile.gstin || '',
    email: profile.user_email || '',
  };

  return { profile_id: profile.id, rateType, quantity, rate, description, taxableAmount, gstRate, gstAmount, roundOff, total, buyer };
}

// Preview a would-be invoice without persisting anything
router.get('/sea-invoice/preview', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { user_id, from_date, to_date } = req.query;
    if (!user_id || !from_date || !to_date) {
      res.status(400).json({ message: 'user_id, from_date and to_date are required' });
      return;
    }
    const calc = await computeSeaInvoice(String(user_id), String(from_date), String(to_date));
    const suggestedInvoiceNo = await nextInvoiceNo();
    res.json({
      ...calc,
      suggested_invoice_no: suggestedInvoiceNo,
      invoice_date: new Date().toISOString().slice(0, 10),
      period_from: from_date,
      period_to: to_date,
      supplier: INVOICE_SUPPLIER,
      bank: INVOICE_BANK,
      sac_code: INVOICE_SAC_CODE,
      amount_in_words: numberToWordsINR(calc.total),
    });
  } catch (err: any) {
    if (err?.status) { res.status(err.status).json({ message: err.message }); return; }
    logger.error('INVOICES', 'GET /sea-invoice/preview error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Persist the invoice (admin picks the final Invoice No. / Date, defaulting to the suggestion)
router.post('/sea-invoice/generate', requireRole(['master_admin', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { user_id, from_date, to_date, invoice_no, invoice_date } = req.body;
    if (!user_id || !from_date || !to_date) {
      res.status(400).json({ message: 'user_id, from_date and to_date are required' });
      return;
    }
    const calc = await computeSeaInvoice(user_id, from_date, to_date);
    const finalInvoiceNo = (invoice_no && String(invoice_no).trim()) || await nextInvoiceNo();
    const finalInvoiceDate = (invoice_date && String(invoice_date).trim()) || new Date().toISOString().slice(0, 10);

    const result = await invoicesPool.query(
      `INSERT INTO invoices (
         module, invoice_no, invoice_date, amount, currency, description, status,
         profile_id, created_by, user_id, period_from, period_to, rate_type,
         quantity, rate, taxable_amount, gst_rate, gst_amount, round_off, total_amount, buyer_snapshot
       ) VALUES ('sea',$1,$2,$3,'INR',$4,'pending',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [finalInvoiceNo, finalInvoiceDate, calc.total, calc.description,
       calc.profile_id, req.user?.id, user_id, from_date, to_date, calc.rateType,
       calc.quantity, calc.rate, calc.taxableAmount, calc.gstRate, calc.gstAmount,
       calc.roundOff, calc.total, JSON.stringify(calc.buyer)]
    );

    logger.info('INVOICES', `Generated Sea invoice ${finalInvoiceNo} for user=${user_id} (${from_date}..${to_date}) total=${calc.total}`);
    res.status(201).json({
      ...result.rows[0],
      buyer: calc.buyer,
      supplier: INVOICE_SUPPLIER,
      bank: INVOICE_BANK,
      sac_code: INVOICE_SAC_CODE,
      amount_in_words: numberToWordsINR(calc.total),
    });
  } catch (err: any) {
    if (err?.status) { res.status(err.status).json({ message: err.message }); return; }
    if (err.code === '23505') { res.status(400).json({ message: 'Invoice number already exists' }); return; }
    logger.error('INVOICES', 'POST /sea-invoice/generate error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Fetch a previously generated Sea invoice for reprinting
router.get('/sea-invoice/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await invoicesPool.query(`SELECT * FROM invoices WHERE id = $1 AND module='sea'`, [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ message: 'Invoice not found' }); return; }
    const inv = result.rows[0];
    res.json({
      ...inv,
      buyer: inv.buyer_snapshot,
      supplier: INVOICE_SUPPLIER,
      bank: INVOICE_BANK,
      sac_code: INVOICE_SAC_CODE,
      amount_in_words: numberToWordsINR(Number(inv.total_amount || inv.amount)),
    });
  } catch (err) {
    logger.error('INVOICES', `GET /sea-invoice/${req.params.id} error`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
