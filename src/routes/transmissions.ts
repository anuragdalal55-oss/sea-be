import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { generateCGM, generateCGMFileName, MawbData, HawbData } from '../utils/cgmGenerator';

const router = Router();
router.use(authenticate);

// Generate CGM file for a MAWB
router.post('/generate-cgm/:mawbId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const mawbResult = await pool.query(
      `SELECT m.*, p.carn_number, p.customs_house_code as p_customs_code, p.profile_code
       FROM mawbs m LEFT JOIN profiles p ON m.profile_id = p.id
       WHERE m.id = $1`,
      [req.params.mawbId]
    );
    if (mawbResult.rows.length === 0) {
      res.status(404).json({ message: 'MAWB not found' });
      return;
    }
    const mawbRow = mawbResult.rows[0];

    const hawbResult = await pool.query(
      'SELECT * FROM hawbs WHERE mawb_id = $1 ORDER BY created_at ASC',
      [req.params.mawbId]
    );

    const customsCode = mawbRow.customs_house_code || mawbRow.p_customs_code || 'INDEL4';
    const carnNumber = mawbRow.carn_number || '';

    const mawbData: MawbData = {
      carn_number: carnNumber,
      customs_house_code: customsCode,
      igm_no: mawbRow.igm_no || '',
      igm_date: mawbRow.igm_date,
      flight_no: mawbRow.flight_no || '',
      flight_origin_date: mawbRow.flight_origin_date,
      mawb_no: mawbRow.mawb_no,
      mawb_date: mawbRow.mawb_date,
      origin: mawbRow.origin,
      destination: mawbRow.destination,
      shipment_type: mawbRow.shipment_type || 'T',
      total_packages: mawbRow.total_packages,
      gross_weight: parseFloat(mawbRow.gross_weight),
      item_description: mawbRow.item_description || 'CONSOL',
      message_type: 'F',
    };

    const hawbData: HawbData[] = hawbResult.rows.map(h => ({
      carn_number: carnNumber,
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
      shipment_type: h.shipment_type || 'T',
      total_packages: h.total_packages,
      gross_weight: parseFloat(h.gross_weight),
      item_description: h.item_description || 'AS PER INVOICE',
      message_type: 'F',
    }));

    const fileContent = generateCGM(mawbData, hawbData);
    const fileName = generateCGMFileName(customsCode, mawbRow.profile_code || 'CONS');

    // Save transmission record
    await pool.query(
      `INSERT INTO transmissions (transmission_type, file_name, file_content, mawb_id, customs_house_code, profile_id, sent_by)
       VALUES ('CGM', $1, $2, $3, $4, $5, $6)`,
      [fileName, fileContent, req.params.mawbId, customsCode, mawbRow.profile_id, req.user?.id]
    );

    // Update MAWB transmission date
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
      `SELECT m.*, p.carn_number, p.customs_house_code as p_customs_code, p.profile_code
       FROM mawbs m LEFT JOIN profiles p ON m.profile_id = p.id WHERE m.id = $1`,
      [req.params.mawbId]
    );
    if (mawbResult.rows.length === 0) { res.status(404).json({ message: 'MAWB not found' }); return; }
    const mawbRow = mawbResult.rows[0];
    const hawbResult = await pool.query('SELECT * FROM hawbs WHERE mawb_id = $1', [req.params.mawbId]);
    const customsCode = mawbRow.customs_house_code || mawbRow.p_customs_code || 'INDEL4';
    const carnNumber = mawbRow.carn_number || '';

    const mawbData: MawbData = {
      carn_number: carnNumber, customs_house_code: customsCode,
      igm_no: mawbRow.igm_no, igm_date: mawbRow.igm_date,
      flight_no: mawbRow.flight_no, flight_origin_date: mawbRow.flight_origin_date,
      mawb_no: mawbRow.mawb_no, mawb_date: mawbRow.mawb_date,
      origin: mawbRow.origin, destination: mawbRow.destination,
      shipment_type: mawbRow.shipment_type || 'T',
      total_packages: mawbRow.total_packages, gross_weight: parseFloat(mawbRow.gross_weight),
      item_description: mawbRow.item_description || 'CONSOL', message_type: 'F',
    };
    const hawbData: HawbData[] = hawbResult.rows.map(h => ({
      carn_number: carnNumber, customs_house_code: customsCode,
      igm_no: mawbRow.igm_no, igm_date: mawbRow.igm_date,
      flight_no: mawbRow.flight_no, flight_origin_date: mawbRow.flight_origin_date,
      mawb_no: mawbRow.mawb_no, mawb_date: mawbRow.mawb_date,
      hawb_no: h.hawb_no, hawb_date: h.hawb_date,
      origin: h.origin, destination: h.destination,
      shipment_type: h.shipment_type || 'T',
      total_packages: h.total_packages, gross_weight: parseFloat(h.gross_weight),
      item_description: h.item_description || 'AS PER INVOICE', message_type: 'F',
    }));

    const fileContent = generateCGM(mawbData, hawbData);
    const fileName = generateCGMFileName(customsCode, mawbRow.profile_code || 'CONS');
    res.json({ file_name: fileName, content: fileContent, hawb_count: hawbResult.rows.length });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get transmission history
router.get('/history', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT t.*, m.mawb_no, u.username FROM transmissions t
       LEFT JOIN mawbs m ON t.mawb_id = m.id
       LEFT JOIN users u ON t.sent_by = u.id
       ORDER BY t.sent_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
