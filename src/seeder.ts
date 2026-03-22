/**
 * EDISS Database Seeder
 * Run: npm run seed
 */

import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import pool from './db';
import bcrypt from 'bcryptjs';

async function seed() {
  const client = await pool.connect();
  console.log('✅ Connected to database');

  try {
    await client.query('BEGIN');

    // ── 1. Profiles ──────────────────────────────────────────────────────────
    console.log('Seeding profiles...');

    const p1 = await client.query(`
      INSERT INTO profiles (
        profile_code, company_name, address, city, state, country,
        phone, email, carn_number, customs_house_code, icegate_code,
        pan_number, user_prefix, consol_agent_id, user_email, agent_name,
        address1, address2, gstin, billing_company, billing_state,
        gst_rate, pan_for_invoice, air_igm_rate, sea_consol_lcl_rate,
        sea_consol_fcl_rate, air_manifest_rate, air_manifest_min_bill, location_code
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
      ON CONFLICT (profile_code) DO UPDATE SET
        company_name = EXCLUDED.company_name, pan_number = EXCLUDED.pan_number,
        user_prefix = EXCLUDED.user_prefix, consol_agent_id = EXCLUDED.consol_agent_id,
        location_code = EXCLUDED.location_code
      RETURNING id
    `, [
      'INDEL4','Swift Air Cargo Delhi','15, Cargo Complex, IGI Airport','New Delhi','Delhi','India',
      '011-25675890','delhi@swiftcargo.in','AGSYE7618HCNDEL4','INDEL4','SWIFTDEL001',
      'AGSYE7618H','SWIFT','DEL-CONSOL-001','ops.delhi@swiftcargo.in','Rajesh Kumar',
      '15, Cargo Complex','IGI Airport, New Delhi','07AGSYE7618H1ZX','Swift Air Cargo Pvt Ltd','Delhi',
      18,'AGSYE7618H',150.00,200.00,180.00,120.00,5000.00,'INDEL4'
    ]);
    const delProfileId = p1.rows[0].id;

    const p2 = await client.query(`
      INSERT INTO profiles (
        profile_code, company_name, address, city, state, country,
        phone, email, carn_number, customs_house_code, icegate_code,
        pan_number, user_prefix, consol_agent_id, user_email, agent_name,
        address1, address2, gstin, billing_company, billing_state,
        gst_rate, pan_for_invoice, air_igm_rate, sea_consol_lcl_rate,
        sea_consol_fcl_rate, air_manifest_rate, air_manifest_min_bill, location_code
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
      ON CONFLICT (profile_code) DO UPDATE SET
        company_name = EXCLUDED.company_name, pan_number = EXCLUDED.pan_number,
        location_code = EXCLUDED.location_code
      RETURNING id
    `, [
      'INBOM4','Speedy Freight Mumbai','Unit 4, Air Cargo Complex, CSIA','Mumbai','Maharashtra','India',
      '022-66754321','mumbai@speedyfreight.in','BFSPY1234HCNBOM4','INBOM4','SPEEDYBOM001',
      'BFSPY1234H','SPDY','BOM-CONSOL-001','ops.mumbai@speedyfreight.in','Priya Sharma',
      'Unit 4, Air Cargo Complex','CSIA, Mumbai','27BFSPY1234H1ZY','Speedy Freight Pvt Ltd','Maharashtra',
      18,'BFSPY1234H',140.00,190.00,170.00,110.00,4500.00,'INBOM4'
    ]);
    const bomProfileId = p2.rows[0].id;

    const p3 = await client.query(`
      INSERT INTO profiles (
        profile_code, company_name, address, city, state, country,
        phone, email, carn_number, customs_house_code, icegate_code,
        pan_number, user_prefix, consol_agent_id, user_email, agent_name,
        address1, address2, gstin, billing_company, billing_state,
        gst_rate, pan_for_invoice, air_igm_rate, sea_consol_lcl_rate,
        sea_consol_fcl_rate, air_manifest_rate, air_manifest_min_bill, location_code
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
      ON CONFLICT (profile_code) DO UPDATE SET
        company_name = EXCLUDED.company_name, pan_number = EXCLUDED.pan_number,
        location_code = EXCLUDED.location_code
      RETURNING id
    `, [
      'INBLR4','Global Logistics Bangalore','Cargo Terminal, KIAL','Bangalore','Karnataka','India',
      '080-25234567','blr@globallogistics.in','GLBLR5678HCNBLR4','INBLR4','GLOBALBLR001',
      'GLBLR5678H','GLBL','BLR-CONSOL-001','ops.blr@globallogistics.in','Suresh Nair',
      'Cargo Terminal','KIAL, Bangalore','29GLBLR5678H1ZZ','Global Logistics Pvt Ltd','Karnataka',
      18,'GLBLR5678H',145.00,195.00,175.00,115.00,4800.00,'INBLR4'
    ]);
    const blrProfileId = p3.rows[0].id;

    console.log('  → 3 profiles upserted');

    // ── 2. Users ──────────────────────────────────────────────────────────────
    console.log('Seeding users...');

    const adminHash = await bcrypt.hash('admin123', 10);
    const userHash  = await bcrypt.hash('user123', 10);

    const insertUser = async (username: string, hash: string, full_name: string, email: string, role: string, profile_id: string) => {
      const r = await client.query(`
        INSERT INTO users (username, password_hash, full_name, email, role, profile_id, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        ON CONFLICT (username) DO UPDATE SET
          full_name = EXCLUDED.full_name, role = EXCLUDED.role, profile_id = EXCLUDED.profile_id
        RETURNING id, username
      `, [username, hash, full_name, email, role, profile_id]);
      return r.rows[0];
    };

    const uAdmin  = await insertUser('admin',  adminHash, 'System Admin',   'admin@ediss.in',   'master_admin', delProfileId);
    const uRobin  = await insertUser('robin',  adminHash, 'Robin Kumar',    'robin@ediss.in',   'admin',        delProfileId);
    const uPriya  = await insertUser('priya',  userHash,  'Priya Sharma',   'priya@ediss.in',   'user',         bomProfileId);
    const uSuresh = await insertUser('suresh', userHash,  'Suresh Nair',    'suresh@ediss.in',  'user',         blrProfileId);
    const uAnkit  = await insertUser('ankit',  userHash,  'Ankit Verma',    'ankit@ediss.in',   'user',         delProfileId);

    console.log(`  → 5 users upserted`);

    // ── 3. MAWBs ──────────────────────────────────────────────────────────────
    console.log('Seeding MAWBs...');

    const insertMawb = async (
      mawb_no: string, origin: string, dest: string, pkgs: number, wt: number,
      status: string, profile_id: string, created_by: string, msg_type: string,
      customs_code: string, days_ago: number, flight_no: string
    ) => {
      const hasTransmDate = status === 'transmitted' || status === 'acknowledged';
      const r = await client.query(`
        INSERT INTO mawbs (
          mawb_no, mawb_date, origin, destination, flight_no, flight_origin_date,
          total_packages, gross_weight, item_description,
          customs_house_code, profile_id, created_by,
          transmission_date, status, message_type
        ) VALUES (
          $1,
          NOW() - ($2 * INTERVAL '1 day'),
          $3, $4, $5,
          NOW() - ($2 * INTERVAL '1 day'),
          $6, $7, 'CONSOL',
          $8, $9, $10,
          ${hasTransmDate ? `NOW() - ($2 * INTERVAL '1 day') + INTERVAL '2 hours'` : 'NULL'},
          $11, $12
        )
        RETURNING id, mawb_no
      `, [mawb_no, days_ago, origin, dest, flight_no, pkgs, wt, customs_code, profile_id, created_by, status, msg_type]);
      return r.rows[0];
    };

    const m1  = await insertMawb('17625678901',    'PVG','DEL',45,512.500,'transmitted', delProfileId, uRobin.id,  'F','INDEL4',5, 'AI308');
    const m2  = await insertMawb('17625678902',    'HKG','DEL',30,320.000,'draft',        delProfileId, uRobin.id,  'F','INDEL4',3, 'AI312');
    const m3  = await insertMawb('17625678903',    'SIN','DEL',60,780.250,'transmitted', delProfileId, uAnkit.id,  'F','INDEL4',7, 'AI402');
    const m4  = await insertMawb('17625678904',    'DXB','DEL',25,210.000,'acknowledged',delProfileId, uAnkit.id,  'F','INDEL4',10,'AI217');
    const m5  = await insertMawb('17625679001',    'PEK','BOM',55,643.750,'transmitted', bomProfileId, uPriya.id,  'F','INBOM4',4, 'AI865');
    const m6  = await insertMawb('17625679002',    'NRT','BOM',18,195.500,'draft',        bomProfileId, uPriya.id,  'F','INBOM4',2, 'AI872');
    const m7  = await insertMawb('17625679003',    'ICN','BOM',40,458.000,'error',        bomProfileId, uPriya.id,  'F','INBOM4',6, 'AI143');
    const m8  = await insertMawb('17625679101',    'SYD','BLR',22,276.000,'transmitted', blrProfileId, uSuresh.id, 'F','INBLR4',3, 'AI554');
    const m9  = await insertMawb('17625679102',    'BKK','BLR',35,392.250,'draft',        blrProfileId, uSuresh.id, 'F','INBLR4',1, 'AI556');
    const m10 = await insertMawb('17625678901-A1', 'PVG','DEL',46,515.000,'transmitted', delProfileId, uRobin.id,  'A','INDEL4',4, 'AI308');

    console.log('  → 10 MAWBs inserted');

    // ── 4. HAWBs ──────────────────────────────────────────────────────────────
    console.log('Seeding HAWBs...');

    const insertHawb = async (
      mawb_id: string, hawb_no: string, origin: string, dest: string,
      pkgs: number, wt: number, desc: string, msg_type = 'F'
    ) => {
      await client.query(`
        INSERT INTO hawbs (mawb_id, hawb_no, origin, destination, total_packages, gross_weight, item_description, message_type, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
      `, [mawb_id, hawb_no, origin, dest, pkgs, wt, desc, msg_type]);
    };

    // HAWBs for MAWB 17625678901 (PVG→DEL, transmitted)
    await insertHawb(m1.id, 'HAWK00100001', 'PVG', 'DEL', 10, 112.500, 'ELECTRONIC GOODS');
    await insertHawb(m1.id, 'HAWK00100002', 'PVG', 'DEL', 15, 180.000, 'GARMENTS');
    await insertHawb(m1.id, 'HAWK00100003', 'PVG', 'DEL',  8,  95.500, 'SPARE PARTS');
    await insertHawb(m1.id, 'HAWK00100004', 'PVG', 'DEL', 12, 124.500, 'MACHINE PARTS');

    // HAWBs for MAWB 17625678903 (SIN→DEL, transmitted)
    await insertHawb(m3.id, 'HAWK00300001', 'SIN', 'DEL', 20, 258.750, 'TEXTILES');
    await insertHawb(m3.id, 'HAWK00300002', 'SIN', 'DEL', 18, 210.500, 'CHEMICALS NON-HAZ');
    await insertHawb(m3.id, 'HAWK00300003', 'SIN', 'DEL', 22, 311.000, 'AUTOMOTIVE PARTS');

    // HAWBs for MAWB 17625678904 (DXB→DEL, acknowledged)
    await insertHawb(m4.id, 'HAWK00400001', 'DXB', 'DEL', 10,  95.000, 'JEWELRY ITEMS');
    await insertHawb(m4.id, 'HAWK00400002', 'DXB', 'DEL', 15, 115.000, 'LEATHER GOODS');

    // HAWBs for MAWB 17625679001 (PEK→BOM, transmitted)
    await insertHawb(m5.id, 'HAWK00501', 'PEK', 'BOM', 18, 210.250, 'PHARMACEUTICAL');
    await insertHawb(m5.id, 'HAWK00502', 'PEK', 'BOM', 22, 265.500, 'MEDICAL EQUIPMENT');
    await insertHawb(m5.id, 'HAWK00503', 'PEK', 'BOM', 15, 168.000, 'LABORATORY SUPPLIES');

    // HAWBs for MAWB 17625679101 (SYD→BLR, transmitted)
    await insertHawb(m8.id, 'HAWK00701', 'SYD', 'BLR', 12, 148.000, 'COMPUTER HARDWARE');
    await insertHawb(m8.id, 'HAWK00702', 'SYD', 'BLR', 10, 128.000, 'NETWORKING EQUIPMENT');

    // HAWBs for MAWB 17625678901-A1 (amendment)
    await insertHawb(m10.id, 'HAWK00100001', 'PVG', 'DEL', 10, 112.500, 'ELECTRONIC GOODS', 'A');
    await insertHawb(m10.id, 'HAWK00100002', 'PVG', 'DEL', 15, 180.000, 'GARMENTS',         'A');
    await insertHawb(m10.id, 'HAWK00100003', 'PVG', 'DEL',  9,  98.000, 'SPARE PARTS',      'A');
    await insertHawb(m10.id, 'HAWK00100004', 'PVG', 'DEL', 12, 124.500, 'MACHINE PARTS',    'A');

    console.log('  → 18 HAWBs inserted');

    await client.query('COMMIT');

    console.log('\n✅ Seeding complete!\n');
    console.log('─────────────────────────────────────────────────');
    console.log('  Login credentials:');
    console.log('  admin  / admin123  → master_admin (Delhi)');
    console.log('  robin  / admin123  → admin        (Delhi)');
    console.log('  priya  / user123   → user         (Mumbai)');
    console.log('  suresh / user123   → user         (Bangalore)');
    console.log('  ankit  / user123   → user         (Delhi)');
    console.log('─────────────────────────────────────────────────');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
