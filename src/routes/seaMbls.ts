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

const cleanDate = (value: any): string | null => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};

const cleanNumber = (value: any): number | null => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

type PreparedHblRow = {
  rowNo: number;
  hbl_no: string;
  hbl_date: string | null;
  // container
  container_no: string | null;
  seal_no: string | null;
  container_size: string | null;
  container_type: string | null;
  soc_flag: string | null;
  agent_code: string | null;
  // measures
  package_count: number;
  gross_weight: number;
  cargo_net_weight: number;
  volume_cbm: number;
  package_type: string | null;
  // descriptions
  cargo_description: string | null;
  marks_numbers: string | null;
  hs_code: string | null;
  imo_code: string | null;
  item_type: string | null;
  invoice_value_currency: string | null;
  // v2 fields (moved from MBL)
  cargo_move: string | null;
  port_of_delivery: string | null;
  dest_cfs: string | null;
  subline_no: string | null;
  cargo_nature: string | null;
  importer_name: string | null;
  importer_address1: string | null;
  importer_address2: string | null;
  importer_address3: string | null;
  carrier_name: string | null;
  carrier_code: string | null;
  bond_no: string | null;
  transport: string | null;
  mlo_name: string | null;
  mlo_code: string | null;
  hasData: boolean;
};

function prepareHblRows(rows: any[], fallbackItemType: string | null): PreparedHblRow[] {
  return rows.map((row, index) => {
    const hblNo = String(row?.hbl_no ?? '').trim().toUpperCase();
    const packageCount = cleanNumber(row?.package_count) ?? 0;
    const grossWeight = cleanNumber(row?.gross_weight) ?? 0;
    const volumeCbm = cleanNumber(row?.volume_cbm) ?? 0;
    const cargoDescription = cleanText(row?.cargo_description);
    const containerNo = cleanText(row?.container_no);

    return {
      rowNo: index + 1,
      hbl_no: hblNo,
      hbl_date: cleanDate(row?.hbl_date),
      container_no: containerNo,
      seal_no: cleanText(row?.seal_no),
      container_size: cleanText(row?.container_size),
      container_type: cleanText(row?.container_type),
      soc_flag: cleanText(row?.soc_flag),
      agent_code: cleanText(row?.agent_code),
      package_count: packageCount,
      gross_weight: grossWeight,
      cargo_net_weight: cleanNumber(row?.cargo_net_weight) ?? 0,
      volume_cbm: volumeCbm,
      package_type: cleanText(row?.package_type),
      cargo_description: cargoDescription,
      marks_numbers: cleanText(row?.marks_numbers),
      hs_code: cleanText(row?.hs_code),
      imo_code: cleanText(row?.imo_code),
      item_type: cleanText(row?.item_type) || fallbackItemType,
      invoice_value_currency: cleanText(row?.invoice_value_currency),
      // v2 HBL fields
      cargo_move: cleanText(row?.cargo_move),
      port_of_delivery: cleanText(row?.port_of_delivery),
      dest_cfs: cleanText(row?.dest_cfs),
      subline_no: cleanText(row?.subline_no) || String(index + 1),
      cargo_nature: cleanText(row?.cargo_nature),
      importer_name: cleanText(row?.importer_name),
      importer_address1: cleanText(row?.importer_address1),
      importer_address2: cleanText(row?.importer_address2),
      importer_address3: cleanText(row?.importer_address3),
      carrier_name: cleanText(row?.carrier_name),
      carrier_code: cleanText(row?.carrier_code),
      bond_no: cleanText(row?.bond_no),
      transport: cleanText(row?.transport),
      mlo_name: cleanText(row?.mlo_name),
      mlo_code: cleanText(row?.mlo_code),
      hasData: Boolean(hblNo || containerNo || cargoDescription || packageCount || grossWeight || volumeCbm),
    };
  }).filter((row) => row.hasData);
}

async function loadMblWithHbls(id: string) {
  const mblResult = await pool.query(
    `SELECT m.*, p.profile_code, p.company_name,
            COALESCE(h.hbl_count, 0) AS hbl_count
     FROM sea_mbls m
     LEFT JOIN profiles p ON m.profile_id = p.id
     LEFT JOIN (
       SELECT mbl_id, COUNT(*)::int AS hbl_count
       FROM sea_hbls
       GROUP BY mbl_id
     ) h ON h.mbl_id = m.id
     WHERE m.id = $1`,
    [id]
  );

  if (mblResult.rows.length === 0) return null;

  const hblResult = await pool.query(
    `SELECT * FROM sea_hbls WHERE mbl_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [id]
  );

  return { ...mblResult.rows[0], hbls: hblResult.rows };
}

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const search = String(req.query.search || '').trim();
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '10'), 10)));
  const offset = (page - 1) * pageSize;
  const isAdmin = req.user?.role === 'master_admin' || req.user?.role === 'admin';
  const locationFilter = String(req.query.customs_house_code || '').trim();

  try {
    const params: any[] = [];
    const conditions: string[] = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(
        m.mbl_no ILIKE $${params.length}
        OR COALESCE(m.importer_name, '') ILIKE $${params.length}
        OR COALESCE(m.shipping_line, '') ILIKE $${params.length}
        OR EXISTS (
          SELECT 1 FROM sea_hbls h
          WHERE h.mbl_id = m.id AND h.hbl_no ILIKE $${params.length}
        )
      )`);
    }

    if (locationFilter) {
      params.push(locationFilter);
      conditions.push(`m.customs_house_code = $${params.length}`);
    }

    if (!isAdmin) {
      params.push(req.user?.id);
      conditions.push(`m.created_by = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM sea_mbls m ${whereClause}`,
      params
    );

    const result = await pool.query(
      `SELECT m.*, p.profile_code, p.company_name,
              COALESCE(h.hbl_count, 0) AS hbl_count
       FROM sea_mbls m
       LEFT JOIN profiles p ON m.profile_id = p.id
       LEFT JOIN (
         SELECT mbl_id, COUNT(*)::int AS hbl_count
         FROM sea_hbls GROUP BY mbl_id
       ) h ON h.mbl_id = m.id
       ${whereClause}
       ORDER BY m.updated_at DESC, m.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    res.json({ data: result.rows, total: countResult.rows[0]?.count ?? 0, page, pageSize });
  } catch (error) {
    logger.error('SEA_MBLS', 'GET / error', error);
    res.status(500).json({ message: 'Failed to load sea MBL records' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const record = await loadMblWithHbls(req.params.id);
    if (!record) { res.status(404).json({ message: 'Sea MBL not found' }); return; }
    res.json(record);
  } catch (error) {
    logger.error('SEA_MBLS', `GET /${req.params.id} error`, error);
    res.status(500).json({ message: 'Failed to load sea MBL record' });
  }
});

async function saveMbl(req: AuthRequest, res: Response, mode: 'create' | 'update'): Promise<void> {
  const {
    mbl_no, mbl_date,
    // v2 MBL fields
    igm_no, igm_date, vessel_date, vessel_code, vessel_name, line_no, shipping_line, imo_code,
    vessel_voyage_no, port_of_loading, description,
    // backward-compat MBL fields
    cargo_move, port_of_delivery, dest_cfs, subline_no,
    port_of_unloading, cargo_nature, item_type,
    importer_name, importer_address1, importer_address2, importer_address3,
    marks_numbers, transport, bond_no, carrier_name, carrier_code, mlo_name, mlo_code,
    total_packages, total_gross_weight, total_volume_cbm,
    customs_house_code, profile_id, hbls,
  } = req.body;

  const mblNo = String(mbl_no || '').trim().toUpperCase();
  if (!mblNo) { res.status(400).json({ message: 'MBL number is required' }); return; }

  const preparedHbls = prepareHblRows(Array.isArray(hbls) ? hbls : [], cleanText(item_type));
  const seen = new Set<string>();
  for (const row of preparedHbls) {
    if (!row.hbl_no) { res.status(400).json({ message: `HBL number required for row ${row.rowNo}` }); return; }
    if (seen.has(row.hbl_no)) { res.status(400).json({ message: `Duplicate HBL "${row.hbl_no}"` }); return; }
    seen.add(row.hbl_no);
  }

  const derivedPkg = preparedHbls.reduce((s, r) => s + r.package_count, 0);
  const derivedWt = preparedHbls.reduce((s, r) => s + r.gross_weight, 0);
  const derivedVol = preparedHbls.reduce((s, r) => s + r.volume_cbm, 0);
  const safePkg = cleanNumber(total_packages) ?? derivedPkg;
  const safeWt = cleanNumber(total_gross_weight) ?? derivedWt;
  const safeVol = cleanNumber(total_volume_cbm) ?? derivedVol;
  const isAdmin = req.user?.role === 'master_admin' || req.user?.role === 'admin';

  const client = await pool.connect();
  let txStarted = false;

  try {
    await client.query('BEGIN');
    txStarted = true;

    if (mode === 'update') {
      const existing = await client.query('SELECT id, created_by FROM sea_mbls WHERE id = $1', [req.params.id]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK'); txStarted = false;
        res.status(404).json({ message: 'Sea MBL not found' }); return;
      }
      if (!isAdmin && existing.rows[0].created_by !== req.user?.id) {
        await client.query('ROLLBACK'); txStarted = false;
        res.status(403).json({ message: 'You cannot update this record' }); return;
      }
    }

    const dupMblParams = [mblNo];
    let dupMblSql = 'SELECT id FROM sea_mbls WHERE UPPER(mbl_no) = $1';
    if (mode === 'update') { dupMblParams.push(req.params.id); dupMblSql += ' AND id <> $2'; }
    if ((await client.query(dupMblSql, dupMblParams)).rows.length > 0) {
      await client.query('ROLLBACK'); txStarted = false;
      res.status(400).json({ message: 'MBL number already exists' }); return;
    }

    if (preparedHbls.length > 0) {
      const dupVals = preparedHbls.map((r) => r.hbl_no.toUpperCase());
      const dupPh = dupVals.map((_, i) => `$${i + 1}`).join(',');
      const dupHblParams: any[] = [...dupVals];
      let dupHblSql = `SELECT hbl_no FROM sea_hbls WHERE UPPER(hbl_no) IN (${dupPh})`;
      if (mode === 'update') { dupHblParams.push(req.params.id); dupHblSql += ` AND mbl_id <> $${dupHblParams.length}`; }
      const dupHbl = await client.query(dupHblSql, dupHblParams);
      if (dupHbl.rows.length > 0) {
        await client.query('ROLLBACK'); txStarted = false;
        res.status(400).json({ message: `HBL "${dupHbl.rows[0].hbl_no}" already exists` }); return;
      }
    }

    // MBL values array (28 fields + created_by on create)
    const mblValues = [
      mblNo,
      cleanDate(mbl_date),
      // v2 new fields
      cleanText(igm_no),
      cleanDate(igm_date),
      cleanDate(vessel_date),
      cleanText(vessel_code),
      cleanText(vessel_name),
      cleanText(line_no),
      cleanText(shipping_line),
      cleanText(imo_code),
      cleanText(vessel_voyage_no),
      cleanText(port_of_loading),
      cleanText(description),
      // backward-compat fields
      cleanText(cargo_move),
      cleanText(port_of_delivery),
      cleanText(dest_cfs),
      cleanText(subline_no),
      cleanText(port_of_unloading),
      cleanText(cargo_nature),
      cleanText(item_type),
      cleanText(importer_name),
      cleanText(importer_address1),
      cleanText(importer_address2),
      cleanText(importer_address3),
      cleanText(marks_numbers),
      cleanText(transport),
      cleanText(bond_no),
      cleanText(carrier_name),
      cleanText(carrier_code),
      cleanText(mlo_name),
      cleanText(mlo_code),
      safePkg,
      safeWt,
      safeVol,
      cleanText(customs_house_code),
      cleanText(profile_id),
    ];

    let mblId = req.params.id;

    if (mode === 'create') {
      const insertResult = await client.query(
        `INSERT INTO sea_mbls (
          mbl_no, mbl_date,
          igm_no, igm_date, vessel_date, vessel_code, vessel_name, line_no, shipping_line, imo_code,
          vessel_voyage_no, port_of_loading, description,
          cargo_move, port_of_delivery, dest_cfs, subline_no,
          port_of_unloading, cargo_nature, item_type,
          importer_name, importer_address1, importer_address2, importer_address3,
          marks_numbers, transport, bond_no, carrier_name, carrier_code, mlo_name, mlo_code,
          total_packages, total_gross_weight, total_volume_cbm,
          customs_house_code, profile_id, created_by, status
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
          $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,'draft'
        ) RETURNING id`,
        [...mblValues, req.user?.id]
      );
      mblId = insertResult.rows[0].id;
    } else {
      await client.query(
        `UPDATE sea_mbls SET
          mbl_no=$1, mbl_date=$2,
          igm_no=$3, igm_date=$4, vessel_date=$5, vessel_code=$6, vessel_name=$7,
          line_no=$8, shipping_line=$9, imo_code=$10,
          vessel_voyage_no=$11, port_of_loading=$12, description=$13,
          cargo_move=$14, port_of_delivery=$15, dest_cfs=$16, subline_no=$17,
          port_of_unloading=$18, cargo_nature=$19, item_type=$20,
          importer_name=$21, importer_address1=$22, importer_address2=$23, importer_address3=$24,
          marks_numbers=$25, transport=$26, bond_no=$27,
          carrier_name=$28, carrier_code=$29, mlo_name=$30, mlo_code=$31,
          total_packages=$32, total_gross_weight=$33, total_volume_cbm=$34,
          customs_house_code=$35, profile_id=$36,
          updated_at=NOW()
        WHERE id=$37`,
        [...mblValues, req.params.id]
      );
      await client.query('DELETE FROM sea_hbls WHERE mbl_id = $1', [req.params.id]);
    }

    for (let i = 0; i < preparedHbls.length; i++) {
      const row = preparedHbls[i];
      await client.query(
        `INSERT INTO sea_hbls (
          mbl_id, hbl_no, hbl_date,
          container_no, seal_no, container_size, container_type, soc_flag, agent_code,
          package_count, gross_weight, cargo_net_weight, volume_cbm,
          package_type, cargo_description, marks_numbers, hs_code, imo_code,
          item_type, invoice_value_currency,
          cargo_move, port_of_delivery, dest_cfs, subline_no,
          cargo_nature, importer_name, importer_address1, importer_address2, importer_address3,
          carrier_name, carrier_code, bond_no, transport, mlo_name, mlo_code,
          sort_order, created_by
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37
        )`,
        [
          mblId, row.hbl_no, row.hbl_date,
          row.container_no, row.seal_no, row.container_size, row.container_type, row.soc_flag, row.agent_code,
          row.package_count, row.gross_weight, row.cargo_net_weight, row.volume_cbm,
          row.package_type, row.cargo_description, row.marks_numbers, row.hs_code, row.imo_code,
          row.item_type, row.invoice_value_currency,
          row.cargo_move, row.port_of_delivery, row.dest_cfs, row.subline_no,
          row.cargo_nature, row.importer_name, row.importer_address1, row.importer_address2, row.importer_address3,
          row.carrier_name, row.carrier_code, row.bond_no, row.transport, row.mlo_name, row.mlo_code,
          i + 1, req.user?.id,
        ]
      );
    }

    await client.query('COMMIT');
    txStarted = false;

    const payload = await loadMblWithHbls(mblId);
    logger.info('SEA_MBLS', `${mode === 'create' ? 'Created' : 'Updated'} MBL ${mblNo}`);
    res.status(mode === 'create' ? 201 : 200).json(payload);
  } catch (error) {
    if (txStarted) await client.query('ROLLBACK');
    logger.error('SEA_MBLS', `${mode.toUpperCase()} save error`, error);
    res.status(500).json({ message: 'Failed to save sea MBL record' });
  } finally {
    client.release();
  }
}

router.post('/', (req: AuthRequest, res: Response) => saveMbl(req, res, 'create'));
router.put('/:id', (req: AuthRequest, res: Response) => saveMbl(req, res, 'update'));

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const isAdmin = req.user?.role === 'master_admin' || req.user?.role === 'admin';
  try {
    const result = await pool.query(
      isAdmin
        ? 'DELETE FROM sea_mbls WHERE id = $1 RETURNING id'
        : 'DELETE FROM sea_mbls WHERE id = $1 AND created_by = $2 RETURNING id',
      isAdmin ? [req.params.id] : [req.params.id, req.user?.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ message: 'Sea MBL not found or not allowed' }); return; }
    logger.info('SEA_MBLS', `Deleted MBL id=${req.params.id}`);
    res.json({ message: 'Deleted' });
  } catch (error) {
    logger.error('SEA_MBLS', `DELETE /${req.params.id} error`, error);
    res.status(500).json({ message: 'Failed to delete sea MBL record' });
  }
});

export default router;
