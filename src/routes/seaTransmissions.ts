import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);

function makeFileName(mblNo: string) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `SEA_${mblNo}_${stamp}.txt`;
}

router.post('/generate/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const mblResult = await pool.query(
      `SELECT m.*, p.profile_code, p.company_name
       FROM sea_mbls m
       LEFT JOIN profiles p ON p.id = m.profile_id
       WHERE m.id = $1`,
      [req.params.id]
    );

    if (mblResult.rows.length === 0) {
      res.status(404).json({ message: 'Sea MBL not found' });
      return;
    }

    const hblResult = await pool.query(
      `SELECT *
       FROM sea_hbls
       WHERE mbl_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [req.params.id]
    );

    const mbl = mblResult.rows[0];
    const fileName = makeFileName(mbl.mbl_no);
    const fileContent = [
      'EDISS SEA PLACEHOLDER FILE',
      'The final sea manifest generation logic is intentionally left pending.',
      `MBL No: ${mbl.mbl_no}`,
      `MBL Date: ${mbl.mbl_date ?? ''}`,
      `Location: ${mbl.customs_house_code ?? ''}`,
      `Importer: ${mbl.importer_name ?? ''}`,
      `Profile: ${mbl.profile_code ?? ''}`,
      `HBL Count: ${hblResult.rows.length}`,
      '',
      'This file exists so the frontend and API flow can be tested now.',
    ].join('\n');

    await pool.query(
      `INSERT INTO sea_transmissions (sea_mbl_id, file_name, file_content, status, created_by)
       VALUES ($1, $2, $3, 'placeholder', $4)`,
      [req.params.id, fileName, fileContent, req.user?.id]
    );

    logger.info('SEA_TX', `Generated placeholder file for sea MBL ${mbl.mbl_no}`);
    res.json({
      fileName,
      fileContent,
      placeholder: true,
      message: 'Sea file generation logic is pending. This is a placeholder download.',
    });
  } catch (error) {
    logger.error('SEA_TX', `POST /generate/${req.params.id} error`, error);
    res.status(500).json({ message: 'Failed to generate placeholder sea file' });
  }
});

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const isAdmin = req.user?.role === 'master_admin' || req.user?.role === 'admin';
  try {
    const result = await pool.query(
      `SELECT t.*, m.mbl_no, u.username
       FROM sea_transmissions t
       LEFT JOIN sea_mbls m ON m.id = t.sea_mbl_id
       LEFT JOIN users u ON u.id = t.created_by
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

export default router;
