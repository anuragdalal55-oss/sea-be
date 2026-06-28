/**
 * Sea CGM (Consol General Manifest) File Generator
 * Format: CMCHI2 / ICES 1.5 - Sea Consol Manifest
 * Field separator: ASCII 28 (\x1d)
 * Sections: <conscargo> (per HBL) + <conscont> (per container)
 */

const GS = '\x1d';

export interface SeaMblData {
  mbl_no: string;
  mbl_date?: string;
  igm_no?: string;
  igm_date?: string;
  vessel_voyage_no?: string;
  vessel_date?: string;
  vessel_code?: string;
  vessel_name?: string;
  shipping_line?: string;
  port_of_loading?: string;
  port_of_unloading?: string;
  customs_house_code?: string;
  // from profile
  carn_number?: string;
  icegate_code?: string;
  user_prefix?: string;
  consol_agent_id?: string;
  message_type?: string;
}

export interface SeaHblData {
  hbl_no: string;
  hbl_date?: string;
  subline_no?: string;
  cargo_move?: string;
  port_of_delivery?: string;
  importer_name?: string;
  importer_address1?: string;
  importer_address2?: string;
  importer_address3?: string;
  cargo_description?: string;
  marks_numbers?: string;
  hs_code?: string;
  package_count: number;
  package_type?: string;
  gross_weight: number;
  cargo_net_weight?: number;
  volume_cbm?: number;
  cargo_nature?: string;
  item_type?: string;
  // Single container (legacy / backward compat)
  container_no?: string;
  seal_no?: string;
  container_size?: string;
  container_type?: string;
  soc_flag?: string;
  agent_code?: string;
  // Multiple containers (new format — preferred over single fields)
  containers?: Array<{
    container_no?: string;
    seal_no?: string;
    container_size?: string;
    container_type?: string;
    soc_flag?: string;
    agent_code?: string;
  }>;
  carrier_name?: string;
  carrier_code?: string;
  bond_no?: string;
  transport?: string;
  mlo_name?: string;
  mlo_code?: string;
}

export interface SeaCGMOptions {
  controlNumber?: string;
  senderCode?: string;
  receiverCode?: string;
  messageType?: string;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}${mm}${yyyy}`;
}

function nowIST(): { date: string; time: string } {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const date = `${String(ist.getUTCDate()).padStart(2, '0')}${String(ist.getUTCMonth() + 1).padStart(2, '0')}${ist.getUTCFullYear()}`;
  const time = `${String(ist.getUTCHours()).padStart(2, '0')}${String(ist.getUTCMinutes()).padStart(2, '0')}`;
  return { date, time };
}

function pad(val: string | undefined | null, len: number): string {
  const s = String(val || '').substring(0, len);
  return s.padEnd(len, ' ');
}

function cargoNatureCode(cn?: string): string {
  // "C-Containerized" → "C", "L-LCL" → "L", etc.
  return (cn || 'C').split('-')[0].trim() || 'C';
}

function socFlagCode(sf?: string): string {
  return (sf || 'N-NO').startsWith('Y') ? 'Y' : 'N';
}

/**
 * Generate Sea CGM file (CMCHI2 format, ICES 1.5).
 *
 * Sections:
 *   <conscargo>  — one line per HBL (cargo details)
 *   <conscont>   — one line per container per HBL
 */
export function generateSeaCGM(
  mbl: SeaMblData,
  hbls: SeaHblData[],
  opts: SeaCGMOptions = {}
): string {
  const { date, time } = nowIST();
  const controlNo = opts.controlNumber || Date.now().toString().slice(-6);
  const msgType   = opts.messageType || mbl.message_type || 'F';
  const sender    = opts.senderCode  || mbl.icegate_code || mbl.consol_agent_id || '';
  const receiver  = opts.receiverCode || mbl.customs_house_code || '';
  const carn      = mbl.carn_number || '';
  const chc       = mbl.customs_house_code || '';

  // ── HREC header (CMCHI2 for sea manifest) ─────────────────────────────────
  const header = [
    'HREC', 'ZZ', sender, 'ZZ', receiver,
    'ICES1_5', 'P', '', 'CMCHI2', controlNo, date, time,
  ].join(GS);

  // ── <conscargo> — one line per HBL ────────────────────────────────────────
  const cargoLines = hbls.map((hbl, i) => {
    const subline  = hbl.subline_no || String(i + 1);
    const contType = hbl.container_type || 'LCL';
    const pkgType  = hbl.package_type  || 'PKG';
    const marks    = hbl.marks_numbers || 'NM';
    const cn       = cargoNatureCode(hbl.cargo_nature);
    const cargoMove = (hbl.cargo_move || '').split('-')[0].trim() || 'TI';

    return [
      msgType,
      carn,
      chc,
      mbl.igm_no    || '',
      formatDate(mbl.igm_date),
      mbl.mbl_no,
      formatDate(mbl.mbl_date),
      mbl.vessel_voyage_no || '',
      formatDate(mbl.vessel_date),
      mbl.port_of_loading  || '',
      mbl.port_of_unloading || chc,
      mbl.vessel_name  || '',
      mbl.vessel_code  || '',
      mbl.shipping_line || '',
      hbl.hbl_no,
      formatDate(hbl.hbl_date),
      cargoMove,
      subline,
      // consignee (importer) — 4 × 35 chars
      pad(hbl.importer_name,      35),
      pad(hbl.importer_address1,  35),
      pad(hbl.importer_address2,  35),
      pad(hbl.importer_address3,  35),
      // shipper = same as consignee for import consols
      pad(hbl.importer_name,      35),
      pad(hbl.importer_address1,  35),
      pad(hbl.importer_address2,  35),
      pad(hbl.importer_address3,  35),
      cn,
      contType,
      String(parseInt(String(hbl.package_count ?? 0), 10) || 0),
      pkgType,
      parseFloat(String(hbl.gross_weight ?? 0)).toFixed(3),
      'KGS',
      marks,
      hbl.cargo_description || '',
      hbl.hs_code || '',
      hbl.bond_no || '',
      hbl.carrier_code || hbl.mlo_code || '',
    ].join(GS);
  });

  // ── <conscont> — one line per container per HBL ───────────────────────────
  const contLines: string[] = [];
  hbls.forEach((hbl, i) => {
    const subline = hbl.subline_no || String(i + 1);
    // Use containers array if present (new format), else fall back to single flat fields
    const containerList = hbl.containers && hbl.containers.length > 0
      ? hbl.containers
      : (hbl.container_no ? [{ container_no: hbl.container_no, seal_no: hbl.seal_no, container_size: hbl.container_size, container_type: hbl.container_type, soc_flag: hbl.soc_flag, agent_code: hbl.agent_code }] : []);
    containerList.forEach(ct => {
      if (!ct.container_no) return;
      contLines.push([
        msgType,
        carn,
        chc,
        mbl.igm_no || '',
        formatDate(mbl.igm_date),
        mbl.mbl_no,
        mbl.vessel_voyage_no || '',
        hbl.hbl_no,
        subline,
        ct.container_no,
        ct.seal_no           || '',
        hbl.carrier_code     || hbl.mlo_code || '',
        ct.container_size    || '',
        ct.container_type    || 'LCL',
        String(parseInt(String(hbl.package_count ?? 0), 10) || 0),
        parseFloat(String(hbl.volume_cbm ?? 0)).toFixed(3),
        socFlagCode(ct.soc_flag),
      ].join(GS));
    });
  });

  // ── Assemble file ─────────────────────────────────────────────────────────
  const lines: string[] = [
    header,
    '<consoligm>',
    '<conscargo>',
    ...cargoLines,
    '<END-conscargo>',
    '<conscont>',
    ...contLines,
    '<END-conscont>',
    '<END-consoligm>',
    `TREC${GS}${controlNo}`,
  ];

  return lines.join('\n');
}

/**
 * Generate sea CGM filename.
 * Pattern: {CHC}{CARN[0:10]}{PREFIX[0:3]}{controlNum padded 4}.cgm
 * e.g. INNSA1AABCT2696PACC0012.cgm
 */
export function generateSeaCGMFileName(
  customsHouseCode: string,
  carnNumber: string,
  userPrefix: string,
  controlNum: number
): string {
  const carn = (carnNumber || '').substring(0, 10).toUpperCase();
  const pfx  = (userPrefix  || '').replace(/\s+/g, '').substring(0, 3).toUpperCase() || 'SEA';
  const seq  = String(controlNum).padStart(4, '0');
  return `${customsHouseCode}${carn}${pfx}${seq}.cgm`;
}
