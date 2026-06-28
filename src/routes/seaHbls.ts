import { Router, Response } from 'express';
import pool from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);

const cleanText = (value: any): string | null => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};

const cleanNumber = (value: any): number | null => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '25'), 10)));
  const offset = (page - 1) * pageSize;
  const search = String(req.query.search || '').trim();
  const mblId = String(req.query.mbl_id || '').trim();
  const isAdmin = req.user?.role === 'master_admin' || req.user?.role === 'admin';
  const locationFilter = String(req.query.customs_house_code || '').trim();

  try {
    const params: any[] = [];
    const conditions: string[] = [];

    if (mblId) { params.push(mblId); conditions.push(`h.mbl_id = $${params.length}`); }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(
        h.hbl_no ILIKE $${params.length}
        OR COALESCE(h.container_no, '') ILIKE $${params.length}
        OR COALESCE(h.cargo_description, '') ILIKE $${params.length}
        OR COALESCE(h.importer_name, '') ILIKE $${params.length}
      )`);
    }

    if (locationFilter) { params.push(locationFilter); conditions.push(`m.customs_house_code = $${params.length}`); }
    if (!isAdmin) { params.push(req.user?.id); conditions.push(`m.created_by = $${params.length}`); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM sea_hbls h INNER JOIN sea_mbls m ON m.id = h.mbl_id ${whereClause}`,
      params
    );

    const result = await pool.query(
      `SELECT h.*, m.mbl_no, m.customs_house_code, m.status
       FROM sea_hbls h INNER JOIN sea_mbls m ON m.id = h.mbl_id
       ${whereClause}
       ORDER BY m.updated_at DESC, h.sort_order ASC, h.created_at ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    res.json({ data: result.rows, total: countResult.rows[0]?.count ?? 0, page, pageSize });
  } catch (error) {
    logger.error('SEA_HBLS', 'GET / error', error);
    res.status(500).json({ message: 'Failed to load sea HBL records' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT h.*, m.mbl_no, m.customs_house_code, m.status
       FROM sea_hbls h INNER JOIN sea_mbls m ON m.id = h.mbl_id
       WHERE h.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ message: 'Sea HBL not found' }); return; }
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('SEA_HBLS', `GET /${req.params.id} error`, error);
    res.status(500).json({ message: 'Failed to load sea HBL record' });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const isAdmin = req.user?.role === 'master_admin' || req.user?.role === 'admin';

  try {
    const existing = await pool.query(
      `SELECT h.id, h.hbl_no, m.created_by FROM sea_hbls h INNER JOIN sea_mbls m ON m.id = h.mbl_id WHERE h.id = $1`,
      [req.params.id]
    );
    if (existing.rows.length === 0) { res.status(404).json({ message: 'HBL not found' }); return; }
    if (!isAdmin && existing.rows[0].created_by !== req.user?.id) {
      res.status(403).json({ message: 'You cannot update this record' }); return;
    }

    const {
      hbl_no, hbl_date,
      containers, // new multi-container array
      container_no, seal_no, container_size, container_type, soc_flag, agent_code, // legacy fallback
      package_count, gross_weight, cargo_net_weight, volume_cbm,
      package_type, cargo_description, marks_numbers, hs_code, imo_code,
      item_type, invoice_value_currency,
      // v2 fields
      cargo_move, port_of_delivery, dest_cfs, subline_no,
      cargo_nature, importer_name, importer_address1, importer_address2, importer_address3,
      carrier_name, carrier_code, bond_no, transport, mlo_name, mlo_code,
    } = req.body;

    const newHblNo = String(hbl_no || '').trim().toUpperCase();
    if (!newHblNo) { res.status(400).json({ message: 'HBL number is required' }); return; }

    const dup = await pool.query('SELECT id FROM sea_hbls WHERE UPPER(hbl_no) = $1 AND id <> $2', [newHblNo, req.params.id]);
    if (dup.rows.length > 0) { res.status(400).json({ message: `HBL "${newHblNo}" already exists` }); return; }

    // Resolve first container for flat fields (backward compat)
    const firstCt = Array.isArray(containers) && containers.length > 0 ? containers[0] : null;
    const resolvedContainerNo = cleanText(firstCt?.container_no ?? container_no);
    const resolvedSealNo = cleanText(firstCt?.seal_no ?? seal_no);
    const resolvedContainerSize = cleanText(firstCt?.container_size ?? container_size);
    const resolvedContainerType = cleanText(firstCt?.container_type ?? container_type);
    const resolvedSocFlag = cleanText(firstCt?.soc_flag ?? soc_flag);
    const resolvedAgentCode = cleanText(firstCt?.agent_code ?? agent_code);
    const containersJson = Array.isArray(containers) ? JSON.stringify(containers) : null;

    const result = await pool.query(
      `UPDATE sea_hbls SET
        hbl_no=$1, hbl_date=$2,
        container_no=$3, seal_no=$4, container_size=$5, container_type=$6, soc_flag=$7, agent_code=$8,
        package_count=$9, gross_weight=$10, cargo_net_weight=$11, volume_cbm=$12,
        package_type=$13, cargo_description=$14, marks_numbers=$15, hs_code=$16, imo_code=$17,
        item_type=$18, invoice_value_currency=$19,
        cargo_move=$20, port_of_delivery=$21, dest_cfs=$22, subline_no=$23,
        cargo_nature=$24, importer_name=$25, importer_address1=$26, importer_address2=$27, importer_address3=$28,
        carrier_name=$29, carrier_code=$30, bond_no=$31, transport=$32, mlo_name=$33, mlo_code=$34,
        containers_json=$35, updated_at=NOW()
       WHERE id=$36
       RETURNING *`,
      [
        newHblNo, cleanText(hbl_date),
        resolvedContainerNo, resolvedSealNo, resolvedContainerSize, resolvedContainerType,
        resolvedSocFlag, resolvedAgentCode,
        cleanNumber(package_count) ?? 0, cleanNumber(gross_weight) ?? 0,
        cleanNumber(cargo_net_weight) ?? 0, cleanNumber(volume_cbm) ?? 0,
        cleanText(package_type), cleanText(cargo_description), cleanText(marks_numbers),
        cleanText(hs_code), cleanText(imo_code), cleanText(item_type), cleanText(invoice_value_currency),
        cleanText(cargo_move), cleanText(port_of_delivery), cleanText(dest_cfs), cleanText(subline_no),
        cleanText(cargo_nature), cleanText(importer_name),
        cleanText(importer_address1), cleanText(importer_address2), cleanText(importer_address3),
        cleanText(carrier_name), cleanText(carrier_code), cleanText(bond_no), cleanText(transport),
        cleanText(mlo_name), cleanText(mlo_code),
        containersJson,
        req.params.id,
      ]
    );

    logger.info('SEA_HBLS', `Updated HBL id=${req.params.id}`);

    const updated = await pool.query(
      `SELECT h.*, m.mbl_no, m.customs_house_code, m.status FROM sea_hbls h INNER JOIN sea_mbls m ON m.id = h.mbl_id WHERE h.id = $1`,
      [result.rows[0].id]
    );
    res.json(updated.rows[0]);
  } catch (error) {
    logger.error('SEA_HBLS', `PUT /${req.params.id} error`, error);
    res.status(500).json({ message: 'Failed to update HBL record' });
  }
});

export default router;
