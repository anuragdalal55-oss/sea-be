/**
 * ICES 1.5 CGM (Consol General Manifest) File Generator
 * Format: CMCHI01 - Consol Manifest message
 * Field delimiter: ASCII 28 (^\])
 * Record delimiter: newline (ASCII 10)
 */

const FS = '\x1c'; // ASCII 28 - field separator (^])

export interface MawbData {
  carn_number: string;         // Consol Agent ID (16-char CARN/PAN-based)
  customs_house_code: string;  // e.g. INDEL4
  igm_no?: string;
  igm_date?: string;           // DDMMYYYY
  flight_no?: string;
  flight_origin_date?: string; // DDMMYYYY
  mawb_no: string;
  mawb_date?: string;          // DDMMYYYY
  origin: string;              // Port of Origin (3-letter IATA)
  destination: string;         // Port of Destination (3-letter IATA)
  shipment_type: string;       // T/P/S
  total_packages: number;
  gross_weight: number;
  item_description: string;
  message_type?: string;       // F/A/D (default F)
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
  hawb_no: string;
  hawb_date?: string;
  origin: string;
  destination: string;
  shipment_type: string;
  total_packages: number;
  gross_weight: number;
  item_description: string;
  message_type?: string;
}

export interface GenerateOptions {
  senderCode?: string;
  receiverCode?: string;
  controlNumber?: string;
  testMode?: boolean;
}

function formatDate(dateStr?: string | Date): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

function now(): { date: string; time: string } {
  const d = new Date();
  const date = `${String(d.getDate()).padStart(2,'0')}${String(d.getMonth()+1).padStart(2,'0')}${d.getFullYear()}`;
  const time = `${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
  return { date, time };
}

/**
 * Generate ICES 1.5 CGM file content for CONSOL manifest (CMCHI01)
 */
export function generateCGM(
  mawb: MawbData,
  hawbs: HawbData[],
  options: GenerateOptions = {}
): string {
  const { date, time } = now();
  const controlNo = options.controlNumber || Date.now().toString().slice(-8);
  const mode = options.testMode ? 'T' : 'P';
  const sender = options.senderCode || '';
  const receiver = options.receiverCode || '';

  // ICEGATE Header
  const header = `HREC${FS}ZZ${FS}${sender}${FS}ZZ${FS}${receiver}${FS}ICES1_5${FS}${mode}${FS}${FS}CMCHI01${FS}${controlNo}${FS}${date}${FS}${time}`;

  // Consol Master line
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
    m.item_description,
  ].join(FS);

  // House lines
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

  // Assemble full file
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
 * Generate filename per ICES 1.5 naming convention
 * Format: <CustomsHouseCode><ConsolAgentCode><UniqueNo>.cgm
 */
export function generateCGMFileName(customsHouseCode: string, consolAgentCode: string): string {
  const unique = Date.now().toString().slice(-6);
  return `${customsHouseCode}${consolAgentCode}${unique}.cgm`;
}
