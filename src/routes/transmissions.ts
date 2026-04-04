import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { generateCGM, generateCGMFileName, MawbData, HawbData } from '../utils/cgmGenerator';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);

// Get or increment file control number for a user+location
async function getNextControlNumber(userId: string, locationCode: string): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT id, control_number FROM file_control_numbers WHERE user_id = $1 AND location_code = $2',
      [userId, locationCode]
    );
    let controlNum: number;
    if (existing.rows.length > 0) {
      controlNum = existing.rows[0].control_number + 1;
      await client.query(
        'UPDATE file_control_numbers SET control_number = $1 WHERE id = $2',
        [controlNum, existing.rows[0].id]
      );
    } else {
      controlNum = 1;
      await client.query(
        'INSERT INTO file_control_numbers (user_id, location_code, control_number) VALUES ($1, $2, 1)',
        [userId, locationCode]
      );
    }
    await client.query('COMMIT');
    return controlNum;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Generate CGM file for a MAWB
router.post('/generate-cgm/:mawbId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const mawbResult = await pool.query(
      `SELECT m.*, p.carn_number, p.pan_number, p.user_prefix, p.consol_agent_id,
              p.customs_house_code as p_customs_code, p.profile_code,
              p.company_name, p.icegate_code, p.location_code as p_location
       FROM mawbs m LEFT JOIN profiles p ON m.profile_id = p.id
       WHERE m.id = $1`,
      [req.params.mawbId]
    );
    if (mawbResult.rows.length === 0) { res.status(404).json({ message: 'MAWB not found' }); return; }
    const mawbRow = mawbResult.rows[0];

    const hawbResult = await pool.query(
      'SELECT * FROM hawbs WHERE mawb_id = $1 ORDER BY created_at ASC',
      [req.params.mawbId]
    );

    // Auto-derive customs house code: IN{DEST3}4 (e.g. DEL → INDEL4)
    const dest3 = (mawbRow.destination || '').trim().substring(0, 3).toUpperCase();
    const derivedChc = dest3.length === 3 ? `IN${dest3}4` : '';
    const customsCode = (mawbRow.customs_house_code || mawbRow.p_customs_code || derivedChc || '').trim();
    const locationCode = mawbRow.p_location || customsCode;
    // Consol Agent ID for consmaster/conshouse field 2 (PAN-based, max 16 chars)
    const consolAgentId = (mawbRow.pan_number || mawbRow.carn_number || '').trim();
    // Sender ID for HREC — icegate_code preferred, fallback to consol_agent_id / carn_number
    const senderCode = (mawbRow.icegate_code || mawbRow.consol_agent_id || mawbRow.carn_number || '').trim();
    // Username prefix: first 3 chars of username in uppercase
    const userPrefix = (req.user?.username?.substring(0, 3).toUpperCase() || '').trim();

    // Get control number per user+location
    const profileId = mawbRow.profile_id;
    const userId = req.user?.id;
    let controlNum = 1;
    if (userId) {
      controlNum = await getNextControlNumber(userId, locationCode);
    }
    const controlNumber = `${userPrefix}${controlNum}`;

    const mawbData: MawbData = {
      carn_number: consolAgentId,
      customs_house_code: customsCode,
      igm_no: mawbRow.igm_no || '',
      igm_date: mawbRow.igm_date,
      flight_no: mawbRow.flight_no || '',
      flight_origin_date: mawbRow.flight_origin_date,
      mawb_no: mawbRow.mawb_no,
      mawb_date: mawbRow.mawb_date,
      origin: mawbRow.origin,
      destination: mawbRow.destination,
      shipment_type: 'T',
      total_packages: mawbRow.total_packages,
      gross_weight: parseFloat(mawbRow.gross_weight),
      item_description: 'CONSOL',
      message_type: mawbRow.message_type || 'F',
    };

    const hawbData: HawbData[] = hawbResult.rows.map(h => ({
      carn_number: consolAgentId,
      customs_house_code: customsCode,
      igm_no: mawbRow.igm_no || '',
      igm_date: mawbRow.igm_date,
      flight_no: mawbRow.flight_no || '',
      flight_origin_date: mawbRow.flight_origin_date,
      mawb_no: mawbRow.mawb_no,
      mawb_date: mawbRow.mawb_date,
      hawb_no: h.hawb_no,
      hawb_date: h.hawb_date,
      origin: h.origin,
      destination: h.destination,
      shipment_type: 'T',
      total_packages: h.total_packages,
      gross_weight: parseFloat(h.gross_weight),
      item_description: h.item_description || 'AS PER INVOICE',
      message_type: h.message_type || mawbRow.message_type || 'F',
    }));

    const fileContent = generateCGM(mawbData, hawbData, {
      senderCode,
      receiverCode: customsCode,
      controlNumber,
      testMode: false,
    });

    // Build filename: CustomsCode + PAN + UserPrefix + ControlNum + .cgm
    const panStr = (mawbRow.pan_number || mawbRow.carn_number || '').substring(0, 10).toUpperCase();
    const companyPrefix = userPrefix || (mawbRow.company_name || '').replace(/\s+/g, '').substring(0, 3).toUpperCase();
    const fileName = generateCGMFileName(customsCode, panStr, companyPrefix, controlNum);

    // Save transmission record
    await pool.query(
      `INSERT INTO transmissions (transmission_type, file_name, file_content, mawb_id, customs_house_code, profile_id, sent_by)
       VALUES ('CGM',$1,$2,$3,$4,$5,$6)`,
      [fileName, fileContent, req.params.mawbId, customsCode, profileId, req.user?.id]
    );

    // Update MAWB status
    await pool.query(
      'UPDATE mawbs SET transmission_date=NOW(), status=$1 WHERE id=$2',
      ['transmitted', req.params.mawbId]
    );

    logger.info('TRANSMISSIONS', `CGM generated: ${fileName} for mawb_id=${req.params.mawbId} by user=${req.user?.id}`);
    res.json({ fileName, fileContent });
  } catch (err) {
    logger.error('TRANSMISSIONS', `POST /generate-cgm/${req.params.mawbId} error`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Preview CGM (returns JSON with content + filename)
router.get('/preview-cgm/:mawbId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const mawbResult = await pool.query(
      `SELECT m.*, p.carn_number, p.pan_number, p.user_prefix, p.consol_agent_id,
              p.customs_house_code as p_customs_code, p.profile_code,
              p.company_name, p.icegate_code, p.location_code as p_location
       FROM mawbs m LEFT JOIN profiles p ON m.profile_id = p.id WHERE m.id = $1`,
      [req.params.mawbId]
    );
    if (mawbResult.rows.length === 0) { res.status(404).json({ message: 'MAWB not found' }); return; }
    const mawbRow = mawbResult.rows[0];
    const hawbResult = await pool.query('SELECT * FROM hawbs WHERE mawb_id = $1', [req.params.mawbId]);

    const dest3p = (mawbRow.destination || '').trim().substring(0, 3).toUpperCase();
    const derivedChcP = dest3p.length === 3 ? `IN${dest3p}4` : '';
    const customsCode = (mawbRow.customs_house_code || mawbRow.p_customs_code || derivedChcP || '').trim();
    const consolAgentId = (mawbRow.pan_number || mawbRow.carn_number || '').trim();
    const senderCode = (mawbRow.icegate_code || mawbRow.consol_agent_id || mawbRow.carn_number || '').trim();
    const userPrefix = (req.user?.username?.substring(0, 3).toUpperCase() || '').trim();
    const controlNumber = `${userPrefix}PREVIEW`;

    const mawbData: MawbData = {
      carn_number: consolAgentId, customs_house_code: customsCode,
      igm_no: mawbRow.igm_no, igm_date: mawbRow.igm_date,
      flight_no: mawbRow.flight_no, flight_origin_date: mawbRow.flight_origin_date,
      mawb_no: mawbRow.mawb_no, mawb_date: mawbRow.mawb_date,
      origin: mawbRow.origin, destination: mawbRow.destination,
      shipment_type: 'T', total_packages: mawbRow.total_packages,
      gross_weight: parseFloat(mawbRow.gross_weight),
      item_description: 'CONSOL', message_type: mawbRow.message_type || 'F',
    };
    const hawbData: HawbData[] = hawbResult.rows.map(h => ({
      carn_number: consolAgentId, customs_house_code: customsCode,
      igm_no: mawbRow.igm_no, igm_date: mawbRow.igm_date,
      flight_no: mawbRow.flight_no, flight_origin_date: mawbRow.flight_origin_date,
      mawb_no: mawbRow.mawb_no, mawb_date: mawbRow.mawb_date,
      hawb_no: h.hawb_no, hawb_date: h.hawb_date,
      origin: h.origin, destination: h.destination,
      shipment_type: 'T', total_packages: h.total_packages,
      gross_weight: parseFloat(h.gross_weight),
      item_description: h.item_description || 'AS PER INVOICE',
      message_type: h.message_type || mawbRow.message_type || 'F',
    }));

    const fileContent = generateCGM(mawbData, hawbData, {
      senderCode, receiverCode: customsCode, controlNumber, testMode: false,
    });
    const panStr = (mawbRow.pan_number || mawbRow.carn_number || '').substring(0, 10).toUpperCase();
    const companyPrefix = userPrefix || (mawbRow.company_name || '').replace(/\s+/g, '').substring(0, 3).toUpperCase();
    const fileName = generateCGMFileName(customsCode, panStr, companyPrefix, 0);
    res.json({ file_name: fileName, content: fileContent, hawb_count: hawbResult.rows.length });
  } catch (err) {
    logger.error('TRANSMISSIONS', `GET /preview-cgm/${req.params.mawbId} error`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get transmission history (users see only their own; admins see all)
router.get('/history', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const isAdmin = req.user?.role === 'master_admin' || req.user?.role === 'admin';
    const params: any[] = [];
    let where = '';
    if (!isAdmin) {
      where = 'WHERE t.sent_by = $1';
      params.push(req.user?.id);
    }
    const result = await pool.query(
      `SELECT t.id, t.transmission_type, t.file_name, t.sent_at, t.status,
              t.mawb_id, m.mawb_no, u.username,
              (SELECT COUNT(*) FROM hawbs WHERE mawb_id = t.mawb_id) as hawb_count,
              p.customs_house_code as location, p.pan_number
       FROM transmissions t
       LEFT JOIN mawbs m ON t.mawb_id = m.id
       LEFT JOIN users u ON t.sent_by = u.id
       LEFT JOIN profiles p ON t.profile_id = p.id
       ${where}
       ORDER BY t.sent_at DESC LIMIT 200`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    logger.error('TRANSMISSIONS', 'GET /history error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Re-download a stored transmission file by ID (uses stored filename)
router.get('/download/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query('SELECT * FROM transmissions WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ message: 'File not found' }); return; }
    const t = result.rows[0];
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${t.file_name}"`);
    res.send(t.file_content || '');
  } catch (err) {
    logger.error('TRANSMISSIONS', `GET /download/${req.params.id} error`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
