// ICES 1.5 IGM File Generator (ALCHI01)
// Message format for Import General Manifest

const SEP = '/';

const fmtDate = (d: any): string => {
  if (!d) return '';
  const s = String(d).slice(0, 10); // YYYY-MM-DD
  if (s.length < 10) return '';
  const [y, m, day] = s.split('-');
  return `${day}${m}${y}`; // DDMMYYYY
};

const fmtDateTime = (d: any): string => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  return `${dd}${mm}${yyyy} ${hh}:${mi}`;
};

export interface IgmFlightData {
  message_type: string;
  customs_house_code: string;
  flight_no: string;
  flight_origin_date: any;
  expected_arrival?: any;
  port_of_origin: string;
  port_of_destination: string;
  registration_no?: string;
  nil_cargo?: string;
  igm_no?: string;
  igm_date?: any;
}

export interface IgmMawbData {
  message_type: string;
  customs_house_code: string;
  flight_no: string;
  flight_origin_date: any;
  uld_number?: string;
  mawb_no: string;
  mawb_date?: any;
  port_of_origin: string;
  port_of_destination: string;
  shipment_type?: string;
  total_packages?: number;
  gross_weight?: number;
  item_description?: string;
  special_handling_code?: string;
  igm_no?: string;
  igm_date?: any;
}

export function generateIGM(flight: IgmFlightData, mawbs: IgmMawbData[]): string {
  const lines: string[] = [];

  // ICEGATE Header (populated at transmission time)
  lines.push('<igm>');
  lines.push('<flightigm>');

  // Part I – Flight Details
  const flightLine = [
    flight.message_type || 'F',
    flight.customs_house_code || '',
    flight.flight_no || '',
    fmtDate(flight.flight_origin_date),
    fmtDateTime(flight.expected_arrival),
    flight.port_of_origin || '',
    flight.port_of_destination || '',
    flight.registration_no || '',
    flight.nil_cargo || 'N',
    flight.igm_no || '',
    fmtDate(flight.igm_date),
  ].join(SEP);
  lines.push(flightLine);

  lines.push('<END-flightigm>');
  lines.push('<mawbigm>');

  // Part II – MAWB Details
  for (const m of mawbs) {
    const uldStr = m.uld_number ? `ULD ${m.uld_number}` : 'ULD';
    const mawbLine = [
      m.message_type || 'F',
      m.customs_house_code || '',
      m.flight_no || '',
      fmtDate(m.flight_origin_date),
      uldStr,
      m.mawb_no || '',
      fmtDate(m.mawb_date),
      m.port_of_origin || '',
      m.port_of_destination || '',
      m.shipment_type || 'T',
      String(m.total_packages || 0),
      String(m.gross_weight || 0),
      m.item_description || '',
      m.special_handling_code || '',
      m.igm_no || '',
      fmtDate(m.igm_date),
    ].join(SEP);
    lines.push(mawbLine);
  }

  lines.push('<END-mawbigm>');
  lines.push('<END-igm>');

  return lines.join('\n');
}

export function generateIGMFileName(customsCode: string, airlineCode: string): string {
  const unique = Date.now().toString().slice(-6);
  return `${customsCode}${airlineCode}${unique}.igm`;
}
