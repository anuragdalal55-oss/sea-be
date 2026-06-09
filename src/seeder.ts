import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import bcrypt from 'bcryptjs';
import pool from './db';

async function seed() {
  const client = await pool.connect();
  console.log('Connected to sea database');

  try {
    await client.query('BEGIN');

    await client.query(`
      INSERT INTO locations (iata_code, city_name, customs_house_code, country)
      VALUES
        ('NSA1', 'Nhava Sheva Port', 'INNSA1', 'India'),
        ('PAV1', 'Pipavav Port', 'INPAV1', 'India'),
        ('MUN1', 'Mundra Port', 'INMUN1', 'India'),
        ('MAA1', 'Chennai Port', 'INMAA1', 'India'),
        ('CCU1', 'Kolkata Sea', 'INCCU1', 'India'),
        ('BOM1', 'Mumbai Customs', 'INBOM1', 'India')
      ON CONFLICT (iata_code) DO UPDATE
      SET city_name = EXCLUDED.city_name,
          customs_house_code = EXCLUDED.customs_house_code,
          country = EXCLUDED.country
    `);

    const upsertProfile = async (values: any[]) => {
      const result = await client.query(`
        INSERT INTO profiles (
          profile_code, company_name, city, state, country,
          phone, email, carn_number, customs_house_code, icegate_code,
          pan_number, user_prefix, consol_agent_id, user_email,
          address1, address2, gstin, billing_company, billing_state,
          gst_rate, pan_for_invoice, sea_consol_lcl_rate, sea_consol_fcl_rate, location_code
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,
          $20,$21,$22,$23,$24
        )
        ON CONFLICT (profile_code) DO UPDATE SET
          company_name = EXCLUDED.company_name,
          customs_house_code = EXCLUDED.customs_house_code,
          icegate_code = EXCLUDED.icegate_code,
          user_email = EXCLUDED.user_email,
          location_code = EXCLUDED.location_code
        RETURNING id
      `, values);
      return result.rows[0].id as string;
    };

    const nhavaProfileId = await upsertProfile([
      'SEA-INNSA1',
      'Seven Seas Line India Pvt Ltd',
      'Navi Mumbai',
      'Maharashtra',
      'India',
      '022-66554411',
      'ops.nhava@edisssea.in',
      'AAACS7788MINSA1',
      'INNSA1',
      'SEANSA001',
      'AAACS7788M',
      'SEA',
      'NSA-CONSOL-001',
      'docs.nhava@edisssea.in',
      'Office 21, Port Users Complex',
      'Nhava Sheva, Navi Mumbai',
      '27AAACS7788M1ZQ',
      'Seven Seas Line India Pvt Ltd',
      'Maharashtra',
      18,
      'AAACS7788M',
      250,
      400,
      'INNSA1',
    ]);

    const kolkataProfileId = await upsertProfile([
      'SEA-INCCU1',
      'Eastern Ocean Logistics',
      'Kolkata',
      'West Bengal',
      'India',
      '033-22334455',
      'ops.kolkata@edisssea.in',
      'AACCE9922KINCC1',
      'INCCU1',
      'SEACCU001',
      'AACCE9922K',
      'EOL',
      'CCU-CONSOL-001',
      'docs.kolkata@edisssea.in',
      '3rd Floor, Strand Road',
      'Kolkata Port Area',
      '19AACCE9922K1Z8',
      'Eastern Ocean Logistics',
      'West Bengal',
      18,
      'AACCE9922K',
      260,
      410,
      'INCCU1',
    ]);

    const chennaiProfileId = await upsertProfile([
      'SEA-INMAA1',
      'Blue Reef Shipping',
      'Chennai',
      'Tamil Nadu',
      'India',
      '044-24556677',
      'ops.chennai@edisssea.in',
      'AACCB1122HINMA1',
      'INMAA1',
      'SEAMAA001',
      'AACCB1122H',
      'BRS',
      'MAA-CONSOL-001',
      'docs.chennai@edisssea.in',
      'Harbour Estate',
      'Chennai Port',
      '33AACCB1122H1Z2',
      'Blue Reef Shipping',
      'Tamil Nadu',
      18,
      'AACCB1122H',
      245,
      390,
      'INMAA1',
    ]);

    const adminHash = await bcrypt.hash('SeaAdmin@2026!', 10);
    const userHash = await bcrypt.hash('user123', 10);

    const upsertUser = async (
      username: string,
      passwordHash: string,
      passwordPlain: string,
      fullName: string,
      email: string,
      role: string,
      profileId: string,
      customsHouseCode: string
    ) => {
      const result = await client.query(`
        INSERT INTO users (
          username, password_hash, password_plain, full_name,
          email, role, profile_id, customs_house_code, is_active
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
        ON CONFLICT (username) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          password_plain = EXCLUDED.password_plain,
          full_name = EXCLUDED.full_name,
          email = EXCLUDED.email,
          role = EXCLUDED.role,
          profile_id = EXCLUDED.profile_id,
          customs_house_code = EXCLUDED.customs_house_code,
          is_active = TRUE
        RETURNING id
      `, [username, passwordHash, passwordPlain, fullName, email, role, profileId, customsHouseCode]);
      return result.rows[0].id as string;
    };

    const robinId = await upsertUser('robin', adminHash, 'SeaAdmin@2026!', 'Robin Kumar', 'robin@edisssea.in', 'admin', nhavaProfileId, 'INNSA1');
    const priyaId = await upsertUser('priya', userHash, 'user123', 'Priya Sharma', 'priya@edisssea.in', 'user', kolkataProfileId, 'INCCU1');
    const sureshId = await upsertUser('suresh', userHash, 'user123', 'Suresh Nair', 'suresh@edisssea.in', 'user', chennaiProfileId, 'INMAA1');
    const ankitId = await upsertUser('ankit', userHash, 'user123', 'Ankit Verma', 'ankit@edisssea.in', 'user', nhavaProfileId, 'INNSA1');
    await upsertUser('admin', adminHash, 'SeaAdmin@2026!', 'System Admin', 'admin@edisssea.in', 'master_admin', nhavaProfileId, 'INNSA1');

    await client.query('UPDATE profiles SET user_id = $1 WHERE id = $2', [robinId, nhavaProfileId]);
    await client.query('UPDATE profiles SET user_id = $1 WHERE id = $2', [priyaId, kolkataProfileId]);
    await client.query('UPDATE profiles SET user_id = $1 WHERE id = $2', [sureshId, chennaiProfileId]);

    await client.query('DELETE FROM user_locations');
    await client.query(`
      INSERT INTO user_locations (user_id, location_id)
      SELECT $1, id FROM locations WHERE customs_house_code IN ('INNSA1', 'INPAV1', 'INMUN1')
      ON CONFLICT DO NOTHING
    `, [robinId]);
    await client.query(`
      INSERT INTO user_locations (user_id, location_id)
      SELECT $1, id FROM locations WHERE customs_house_code = 'INCCU1'
      ON CONFLICT DO NOTHING
    `, [priyaId]);
    await client.query(`
      INSERT INTO user_locations (user_id, location_id)
      SELECT $1, id FROM locations WHERE customs_house_code = 'INMAA1'
      ON CONFLICT DO NOTHING
    `, [sureshId]);
    await client.query(`
      INSERT INTO user_locations (user_id, location_id)
      SELECT $1, id FROM locations WHERE customs_house_code = 'INNSA1'
      ON CONFLICT DO NOTHING
    `, [ankitId]);

    const sampleMbl = await client.query(`
      INSERT INTO sea_mbls (
        mbl_no, mbl_date, cargo_move, port_of_delivery, dest_cfs, subline_no,
        vessel_voyage_no, port_of_loading, port_of_unloading, cargo_nature, item_type,
        importer_name, importer_address1, importer_address2, importer_address3,
        description, marks_numbers, transport, bond_no,
        carrier_name, carrier_code, mlo_name, mlo_code,
        total_packages, total_gross_weight, total_volume_cbm,
        customs_house_code, profile_id, created_by, status
      ) VALUES (
        'SHACB26012109', CURRENT_DATE - INTERVAL '10 days',
        'LC-LOCAL Cargo', 'INCCU1 (Kolkata Sea)', 'INCCU1CIL2', '1',
        'VNCMT - CALMEP / 001', 'VN CMT - CAL MEP', 'INNSA1 - Nhava Sheva',
        'C-Containerized', 'OT-Other Cargo',
        'CENTURY PLYBOARDS (INDIA) LTD.',
        'DIAMOND HARBOUR ROAD KANCHOWKI',
        'BISHNUPUR 24 PARGANAS(S)',
        'INDIA PIN-743503',
        '1 PALLET STC PRINTED BASE PAPER',
        'AS PER HBL',
        'R',
        '2002381469',
        'CENTURY UP NEW CFS',
        'CENT-UP',
        'RCL CORRECT',
        'AABCC9725G',
        3,
        1560.8,
        12.75,
        'INNSA1',
        $1,
        $2,
        'draft'
      )
      ON CONFLICT (mbl_no) DO UPDATE SET
        total_packages = EXCLUDED.total_packages,
        total_gross_weight = EXCLUDED.total_gross_weight,
        total_volume_cbm = EXCLUDED.total_volume_cbm,
        updated_at = NOW()
      RETURNING id
    `, [nhavaProfileId, robinId]);

    const sampleMblId = sampleMbl.rows[0].id as string;

    await client.query('DELETE FROM sea_hbls WHERE mbl_id = $1', [sampleMblId]);
    await client.query(`
      INSERT INTO sea_hbls (
        mbl_id, hbl_no, hbl_date, container_no, seal_no, container_size,
        container_type, soc_flag, agent_code, package_count, gross_weight,
        cargo_net_weight, volume_cbm, package_type, cargo_description,
        marks_numbers, hs_code, imo_code, item_type, invoice_value_currency,
        sort_order, created_by
      ) VALUES
        ($1, 'KYCLTH2600021', CURRENT_DATE - INTERVAL '11 days', 'TXGU8259716', 'SHA2608007', '40OO',
         'LCL', 'No', 'AG001', 1, 929, 900, 4.25, 'PLT (PALLET)',
         'PRINTED BASE PAPER', 'AS PER HBL', '4810', '', 'OT-Other Cargo', 'INR', 1, $2),
        ($1, 'KYCLTH2600022', CURRENT_DATE - INTERVAL '10 days', 'TXGU8259717', 'SHA2608008', '40OO',
         'LCL', 'No', 'AG001', 1, 315, 300, 1.80, 'PLT (PALLET)',
         'LAMINATED BOARD', 'AS PER HBL', '4412', '', 'OT-Other Cargo', 'INR', 2, $2),
        ($1, 'KYCLTH2600023', CURRENT_DATE - INTERVAL '10 days', 'TXGU8259718', 'SHA2608009', '20GP',
         'LCL', 'No', 'AG001', 1, 316.8, 305, 1.95, 'PLT (PALLET)',
         'WOODEN PANELS', 'AS PER HBL', '4411', '', 'OT-Other Cargo', 'INR', 3, $2)
    `, [sampleMblId, robinId]);

    await client.query('COMMIT');

    console.log('Sea seed complete');
    console.log('admin  / SeaAdmin@2026!');
    console.log('robin  / SeaAdmin@2026!');
    console.log('priya  / user123');
    console.log('suresh / user123');
    console.log('ankit  / user123');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sea seed failed', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
