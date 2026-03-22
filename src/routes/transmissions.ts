import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { generateCGM, generateCGMFileName, MawbData, HawbData } from '../utils/cgmGenerator';

const router = Router();
router.use(authenticate);

// Get or increment file control number for a profile+location
async function getNextControlNumber(profileId: string, locationCode: string): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO file_control_numbers (profile_id, location_code, control_number)
       VALUES ($1, $2, 1)
       ON CONFLICT (profile_id, location_code)
       DO UPDATE SET control_number = file_control_numbers.control_number + 1`,
      [profileId, locationCode]
    );
    const result = await client.query(
      'SELECT control_number FROM file_control_numbers WHERE profile_id = $1 AND location_code = $2',
      [profileId, locationCode]
    );
    await client.query('COMMIT');
    return result.rows[0]?.control_number || 1;
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

    const customsCode = mawbRow.customs_house_code || mawbRow.p_customs_code || 'INXXX4';
    const locationCode = mawbRow.p_location || customsCode;
    // Consol Agent ID for consmaster/conshouse field 2 (PAN-based, max 16 chars)
    const consolAgentId = mawbRow.pan_number || mawbRow.carn_number || '';
    // Sender ID for HREC (full consol agent registration code)
    const senderCode = mawbRow.consol_agent_id || mawbRow.icegate_code || mawbRow.carn_number || '';
    const userPrefix = mawbRow.user_prefix || '';

    // Get control number
    const profileId = mawbRow.profile_id;
    let controlNum = 1;
    if (profileId) {
      controlNum = await getNextControlNumber(profileId, locationCode);
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
    const panStr = (mawbRow.pan_number || mawbRow.carn_number || 'XXXXXXXXXX').substring(0, 10).toUpperCase();
    const companyPrefix = (mawbRow.company_name || 'XXX').replace(/\s+/g, '').substring(0, 3).toUpperCase();
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

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(fileContent);
  } catch (err) {
    console.error(err);
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

    const customsCode = mawbRow.customs_house_code || mawbRow.p_customs_code || 'INXXX4';
    const consolAgentId = mawbRow.pan_number || mawbRow.carn_number || '';
    const senderCode = mawbRow.consol_agent_id || mawbRow.icegate_code || mawbRow.carn_number || '';
    const userPrefix = mawbRow.user_prefix || '';
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
    const panStr = (mawbRow.pan_number || mawbRow.carn_number || 'XXXXXXXXXX').substring(0, 10).toUpperCase();
    const companyPrefix = (mawbRow.company_name || 'XXX').replace(/\s+/g, '').substring(0, 3).toUpperCase();
    const fileName = generateCGMFileName(customsCode, panStr, companyPrefix, 0);
    res.json({ file_name: fileName, content: fileContent, hawb_count: hawbResult.rows.length });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get transmission history
router.get('/history', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT t.*, m.mawb_no, u.username,
              (SELECT COUNT(*) FROM hawbs WHERE mawb_id = t.mawb_id) as hawb_count,
              p.customs_house_code as location, p.pan_number
       FROM transmissions t
       LEFT JOIN mawbs m ON t.mawb_id = m.id
       LEFT JOIN users u ON t.sent_by = u.id
       LEFT JOIN profiles p ON t.profile_id = p.id
       ORDER BY t.sent_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
