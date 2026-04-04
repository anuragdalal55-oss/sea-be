/**
 * ICES 1.5 CGM (Consol General Manifest) File Generator
 * Format: CMCHI01 - Consol Manifest message
 * Field delimiter: ASCII 28 (^])
 * Record delimiter: newline (ASCII 10)
 */

const FS = '\x1c'; // ASCII 28 - field separator

export interface MawbData {
  carn_number: string;         // Consol Agent ID (PAN-based, field 2 of consmaster)
  customs_house_code: string;  // e.g. INBOM4 (field 3)
  igm_no?: string;             // field 4
  igm_date?: string;           // field 5 DDMMYYYY
  flight_no?: string;          // field 6
  flight_origin_date?: string; // field 7 DDMMYYYY
  mawb_no: string;             // field 8
  mawb_date?: string;          // field 9
  origin: string;              // field 10 (3-letter IATA)
  destination: string;         // field 11
  shipment_type: string;       // field 12 T/P/S
  total_packages: number;      // field 13
  gross_weight: number;        // field 14 (KGS)
  item_description: string;    // field 15 (always CONSOL)
  message_type?: string;       // F/A/D
}

export interface HawbData {
  carn_number: string;
  customs_house_code: string;
  igm_no?: string;
  igm_date?: string;
  flight_no?: string;
  flight_origin_date?: string;
  mawb_no: string;
  mawb_date?: string;
  hawb_no: string;             // field 10
  hawb_date?: string;          // field 11
  origin: string;              // field 12
  destination: string;         // field 13
  shipment_type: string;       // field 14
  total_packages: number;      // field 15
  gross_weight: number;        // field 16
  item_description: string;    // field 17
  message_type?: string;
}

export interface GenerateOptions {
  senderCode?: string;    // HREC sender (consol_agent_id / icegate_code)
  receiverCode?: string;  // HREC receiver (customs_house_code)
  controlNumber?: string; // UserPrefix + sequence e.g. EMU5880
  testMode?: boolean;
}

function formatDate(dateStr?: string | Date): string {
  if (!dateStr) return '';
  const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in ms
  const d = new Date(new Date().getTime() + istOffset);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

function now(): { date: string; time: string } {
  const d = new Date();

  // Convert to IST (UTC + 5:30)
  const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in ms
  const istDate = new Date(d.getTime() + istOffset);

  const date = `${String(istDate.getUTCDate()).padStart(2, '0')}${String(istDate.getUTCMonth() + 1).padStart(2, '0')}${istDate.getUTCFullYear()}`;
  const time = `${String(istDate.getUTCHours()).padStart(2, '0')}${String(istDate.getUTCMinutes()).padStart(2, '0')}`;

  return { date, time };
}

/**
 * Generate ICES 1.5 CGM file content for CONSOL manifest (CMCHI01)
 * Matches format:
 * HREC^]ZZ^]<Sender>^]ZZ^]<Receiver>^]ICES1_5^]P^]^]CMCHI01^]<CtrlNo>^]<Date>^]<Time>
 */
export function generateCGM(
  mawb: MawbData,
  hawbs: HawbData[],
  options: GenerateOptions = {}
): string {
  const { date, time } = now();
  const controlNo = options.controlNumber || Date.now().toString().slice(-6);
  const mode = 'P';
  const sender = options.senderCode || '';
  const receiver = options.receiverCode || mawb.customs_house_code;

  // ICEGATE Header line (HREC)
  const header = [
    'HREC', 'ZZ', sender, 'ZZ', receiver,
    'ICES1_5', mode, '', 'CMCHI01', controlNo, date, time
  ].join(FS);

  // Consol Master line (consmaster - 15 fields)
  const m = mawb;
  const msgType = m.message_type || 'F';
  const masterLine = [
    msgType,
    m.carn_number,
    m.customs_house_code,
    m.igm_no || '',
    m.igm_date ? formatDate(m.igm_date) : '',
    m.flight_no || '',
    m.flight_origin_date ? formatDate(m.flight_origin_date) : '',
    m.mawb_no,
    m.mawb_date ? formatDate(m.mawb_date) : '',
    m.origin,
    m.destination,
    m.shipment_type || 'T',
    String(m.total_packages),
    m.gross_weight.toFixed(2),
    m.item_description || 'CONSOL',
  ].join(FS);

  // House lines (conshouse - 17 fields each)
  const houseLines = hawbs.map(h => {
    const hMsgType = h.message_type || 'F';
    return [
      hMsgType,
      h.carn_number,
      h.customs_house_code,
      h.igm_no || '',
      h.igm_date ? formatDate(h.igm_date) : '',
      h.flight_no || '',
      h.flight_origin_date ? formatDate(h.flight_origin_date) : '',
      h.mawb_no,
      h.mawb_date ? formatDate(h.mawb_date) : '',
      h.hawb_no,
      h.hawb_date ? formatDate(h.hawb_date) : '',
      h.origin,
      h.destination,
      h.shipment_type || 'T',
      String(h.total_packages),
      h.gross_weight.toFixed(2),
      h.item_description,
    ].join(FS);
  }).join('\n');

  const content = [
    header,
    '<consoligm>',
    '<consmaster>',
    masterLine,
    '<END-consmaster>',
    '<conshouse>',
    houseLines,
    '<END-conshouse>',
    '<END-consoligm>',
    `TREC${FS}${controlNo}`,
  ].join('\n');

  return content;
}

/**
 * Generate CGM filename:
 * Format: <CustomsHouseCode><PanNumber><CompanyPrefix><ControlNum>.cgm
 * e.g. INBOM4AAACE3803EEMU5880.cgm
 */
export function generateCGMFileName(
  customsHouseCode: string,
  panNumber: string,
  companyPrefix: string,
  controlNum: number
): string {
  const pan = panNumber.substring(0, 10).toUpperCase();
  const pfx = companyPrefix.replace(/\s+/g, '').substring(0, 3).toUpperCase();
  const seq = String(controlNum).padStart(4, '0');
  return `${customsHouseCode}${pan}${pfx}${seq}.cgm`;
}
