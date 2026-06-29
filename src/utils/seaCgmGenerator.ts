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
  imo_code?: string;
  vessel_code?: string;
  vessel_voyage_no?: string;
  vessel_date?: string;
  vessel_name?: string;
  shipping_line?: string;
  line_no?: string;
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
  dest_cfs?: string;
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
    package_count?: string | number;
    weight?: string | number;
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


function cargoNatureCode(cn?: string): string {
  // "C-Containerized" → "C", "L-LCL" → "L", etc.
  return (cn || 'C').split('-')[0].trim() || 'C';
}

function itemTypeCode(it?: string): string {
  // "OT-Other Cargo" → "OT", "DG-Dangerous Goods" → "DG", etc.
  return (it || 'OT').split('-')[0].trim() || 'OT';
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

  // ── HREC header (CMCHI21 for sea manifest) ─────────────────────────────────
  const header = [
    'HREC', 'ZZ', sender, 'ZZ', receiver,
    'ICES1_5', 'P', '', 'CMCHI21', controlNo, date, time,
  ].join(GS);

  // ── <conscargo> — one line per HBL ────────────────────────────────────────
  const cargoLines = hbls.map((hbl, i) => {
    const subline   = hbl.subline_no || String(i + 1);
    const pkgType   = hbl.package_type || 'PKG';
    const marks     = hbl.marks_numbers || 'NM';
    const cn        = cargoNatureCode(hbl.cargo_nature);
    const itCode    = itemTypeCode(hbl.item_type);
    const cargoMove = (hbl.cargo_move || '').split('-')[0].trim() || 'TI';

    return [
      msgType,                                                              // 1.  F
      chc,                                                                  // 2.  login location
      carn,                                                                 // 3.  carn number
      mbl.igm_no           || '',                                           // 4.  igm number
      formatDate(mbl.igm_date),                                             // 5.  igm date
      mbl.imo_code         || '',                                           // 6.  imo code
      mbl.vessel_code      || '',                                           // 7.  vessel code
      mbl.vessel_voyage_no || '',                                           // 8.  voyage number
      mbl.line_no          || '',                                           // 9.  line number
      subline,                                                              // 10. subline number
      mbl.mbl_no,                                                           // 11. mbl number
      formatDate(mbl.mbl_date),                                             // 12. mbl date
      mbl.port_of_loading  || '',                                           // 13. port of loading
      hbl.port_of_delivery || '',                                           // 14. port of delivery
      hbl.hbl_no,                                                           // 15. hbl number
      formatDate(hbl.hbl_date),                                             // 16. hbl date
      hbl.importer_name      || '',                                          // 17. importer name
      hbl.importer_address1  || '',                                          // 18. importer address 1
      hbl.importer_address2  || '',                                          // 19. importer address 2
      hbl.importer_address3  || '',                                          // 20. importer address 3
      hbl.importer_name      || '',                                          // 21. shipper name (= importer for import consol)
      hbl.importer_address1  || '',                                          // 22. shipper address 1
      hbl.importer_address2  || '',                                          // 23. shipper address 2
      hbl.importer_address3  || '',                                          // 24. shipper address 3
      cn,                                                                   // 25. cargo nature → 'C'
      itCode,                                                               // 26. item type → 'OT'
      cargoMove,                                                            // 27. cargo move
      hbl.dest_cfs         || '',                                           // 28. destination cfs
      String(parseInt(String(hbl.package_count ?? 0), 10) || 0),           // 29. package
      pkgType,                                                              // 30. package code
      parseFloat(String(hbl.gross_weight ?? 0)).toFixed(3),                // 31. weight
      'KGS',                                                                // 32. weight unit
      '',                                                                   // 33. empty
      '',                                                                   // 34. empty
      marks,                                                                // 35. marks and numbers
      hbl.cargo_description || '',                                          // 36. description
      'ZZZZZ',                                                              // 37. ZZZZZ
      'ZZZ',                                                                // 38. ZZZ
      hbl.bond_no          || '',                                           // 39. bond number
      hbl.carrier_code     || '',                                           // 40. carrier code
      hbl.transport        || '',                                           // 41. mode of transport
      hbl.mlo_code         || '',                                           // 42. mlo code
    ].join(GS);
  });

  // ── <conscont> — one line per container per HBL ───────────────────────────
  const contLines: string[] = [];
  hbls.forEach((hbl, i) => {
    const subline = hbl.subline_no || String(i + 1);
    const containerList = hbl.containers && hbl.containers.length > 0
      ? hbl.containers
      : (hbl.container_no
          ? [{ container_no: hbl.container_no, seal_no: hbl.seal_no, container_size: hbl.container_size, container_type: hbl.container_type, soc_flag: hbl.soc_flag, agent_code: hbl.agent_code }]
          : []);
    containerList.forEach(ct => {
      if (!ct.container_no) return;
      const ctPkg    = String(parseInt(String((ct as any).package_count ?? hbl.package_count ?? 0), 10) || 0);
      const ctWeight = parseFloat(String((ct as any).weight ?? hbl.gross_weight ?? 0)).toFixed(3);
      contLines.push([
        msgType,                       // 1.  F
        chc,                           // 2.  login location
        carn,                          // 3.  carn number
        mbl.igm_no || '',              // 4.  igm number
        formatDate(mbl.igm_date),      // 5.  igm date
        mbl.imo_code || '',            // 6.  imo number
        mbl.vessel_code || '',         // 7.  vessel code
        mbl.vessel_voyage_no || '',    // 8.  voyage number
        mbl.line_no || '',             // 9.  line number
        subline,                       // 10. subline number
        ct.container_no,               // 11. container number
        ct.seal_no        || '',       // 12. seal number
        hbl.mlo_code      || '',       // 13. mlo code
        ct.container_type || 'FCL',    // 14. container status
        ctPkg,                         // 15. package
        ctWeight,                      // 16. weight
        ct.container_size || '',       // 17. container size
        socFlagCode(ct.soc_flag),      // 18. soc flag
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
