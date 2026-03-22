// ICES 1.5 EGM File Generator (ALCHE01)
// Message format for Export General Manifest

const SEP = '/';

const fmtDate = (d: any): string => {
  if (!d) return '';
  const s = String(d).slice(0, 10); // YYYY-MM-DD
  if (s.length < 10) return '';
  const [y, m, day] = s.split('-');
  return `${day}${m}${y}`; // DDMMYYYY
};

export interface EgmFlightData {
  message_type: string;
  customs_house_code: string;
  egm_no?: string;
  egm_date?: any;
  flight_no: string;
  flight_departure_date: any;
  port_of_origin: string;
  port_of_destination: string;
  registration_no?: string;
  nil_cargo?: string;
}

export interface EgmMawbData {
  message_type: string;
  customs_house_code: string;
  egm_no?: string;
  egm_date?: any;
  mawb_no: string;
  mawb_date?: any;
  port_of_loading?: string;
  port_of_destination?: string;
  shipment_type?: string;
  total_packages?: number;
  gross_weight?: number;
  item_description?: string;
}

export interface EgmHawbData {
  message_type: string;
  customs_house_code: string;
  egm_no?: string;
  egm_date?: any;
  mawb_no?: string;
  mawb_date?: any;
  hawb_no: string;
  hawb_date?: any;
  port_of_origin?: string;
  port_of_destination?: string;
  shipment_type?: string;
  total_packages?: number;
  gross_weight?: number;
  item_description?: string;
}

export function generateEGM(
  flight: EgmFlightData,
  mawbs: EgmMawbData[],
  hawbs: EgmHawbData[]
): string {
  const lines: string[] = [];

  lines.push('<egm>');
  lines.push('<flightegm>');

  // Part I – Flight Details
  const flightLine = [
    flight.message_type || 'F',
    flight.customs_house_code || '',
    flight.egm_no || '',
    fmtDate(flight.egm_date),
    flight.flight_no || '',
    fmtDate(flight.flight_departure_date),
    flight.port_of_origin || '',
    flight.port_of_destination || '',
    flight.registration_no || '',
    flight.nil_cargo || 'N',
  ].join(SEP);
  lines.push(flightLine);

  lines.push('<END-flightegm>');
  lines.push('<mawbegm>');

  // Part II – MAWB Details
  for (const m of mawbs) {
    const mawbLine = [
      m.message_type || 'F',
      m.customs_house_code || '',
      m.egm_no || '',
      fmtDate(m.egm_date),
      m.mawb_no || '',
      fmtDate(m.mawb_date),
      m.port_of_loading || '',
      m.port_of_destination || '',
      m.shipment_type || 'T',
      String(m.total_packages || 0),
      String(m.gross_weight || 0),
      m.item_description || '',
    ].join(SEP);
    lines.push(mawbLine);
  }

  lines.push('<END-mawbegm>');
  lines.push('<hawbegm>');

  // Part III – HAWB Details
  for (const h of hawbs) {
    const hawbLine = [
      h.message_type || 'F',
      h.customs_house_code || '',
      h.egm_no || '',
      fmtDate(h.egm_date),
      h.mawb_no || '',
      fmtDate(h.mawb_date),
      h.hawb_no || '',
      fmtDate(h.hawb_date),
      h.port_of_origin || '',
      h.port_of_destination || '',
      h.shipment_type || 'T',
      String(h.total_packages || 0),
      String(h.gross_weight || 0),
      h.item_description || '',
    ].join(SEP);
    lines.push(hawbLine);
  }

  lines.push('<END-hawbegm>');
  lines.push('<END-egm>');

  return lines.join('\n');
}

export function generateEGMFileName(customsCode: string, airlineCode: string): string {
  const unique = Date.now().toString().slice(-6);
  return `${customsCode}${airlineCode}${unique}.egm`;
}
