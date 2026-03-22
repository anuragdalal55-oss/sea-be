-- EDISS Schema v2 Migration
-- Run this AFTER schema.sql to add new tables
-- Safe to run multiple times (uses IF NOT EXISTS)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- IGM Flights (ALCHI01 Part I)
CREATE TABLE IF NOT EXISTS igm_flights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_type CHAR(1) NOT NULL DEFAULT 'F',        -- F=Fresh, A=Amendment
  customs_house_code VARCHAR(6),
  flight_no VARCHAR(15) NOT NULL,
  flight_origin_date DATE NOT NULL,
  expected_arrival TIMESTAMP,
  port_of_origin VARCHAR(3) NOT NULL,
  port_of_destination VARCHAR(3) NOT NULL,
  registration_no VARCHAR(10),
  nil_cargo CHAR(1) DEFAULT 'N',                    -- Y/N
  igm_no VARCHAR(7),
  igm_date DATE,
  profile_id UUID REFERENCES profiles(id),
  created_by UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'draft',               -- draft, transmitted, acknowledged
  transmitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- IGM MAWBs (ALCHI01 Part II)
CREATE TABLE IF NOT EXISTS igm_mawbs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  igm_flight_id UUID NOT NULL REFERENCES igm_flights(id) ON DELETE CASCADE,
  message_type CHAR(1) NOT NULL DEFAULT 'F',        -- F/S/A/D
  customs_house_code VARCHAR(6),
  flight_no VARCHAR(15),
  flight_origin_date DATE,
  uld_number VARCHAR(15),
  mawb_no VARCHAR(20) NOT NULL,
  mawb_date DATE,
  port_of_origin VARCHAR(3) NOT NULL,
  port_of_destination VARCHAR(3) NOT NULL,
  shipment_type CHAR(1) DEFAULT 'T',                -- T/P/S
  total_packages INTEGER DEFAULT 0,
  gross_weight DECIMAL(12,3) DEFAULT 0,
  item_description VARCHAR(30),
  special_handling_code VARCHAR(15),
  igm_no VARCHAR(7),
  igm_date DATE,
  profile_id UUID REFERENCES profiles(id),
  created_by UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- EGM Flights (ALCHE01 Part I)
CREATE TABLE IF NOT EXISTS egm_flights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_type CHAR(1) NOT NULL DEFAULT 'F',        -- F=Fresh, A/D=Amendment/Delete
  customs_house_code VARCHAR(6),
  egm_no VARCHAR(7),
  egm_date DATE,
  flight_no VARCHAR(15) NOT NULL,
  flight_departure_date DATE NOT NULL,
  port_of_origin VARCHAR(3) NOT NULL,
  port_of_destination VARCHAR(3) NOT NULL,
  registration_no VARCHAR(10),
  nil_cargo CHAR(1) DEFAULT 'N',
  profile_id UUID REFERENCES profiles(id),
  created_by UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'draft',
  transmitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- EGM MAWBs (ALCHE01 Part II)
CREATE TABLE IF NOT EXISTS egm_mawbs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  egm_flight_id UUID NOT NULL REFERENCES egm_flights(id) ON DELETE CASCADE,
  message_type CHAR(1) NOT NULL DEFAULT 'F',        -- F/S/A/D
  customs_house_code VARCHAR(6),
  egm_no VARCHAR(7),
  egm_date DATE,
  mawb_no VARCHAR(20) NOT NULL,
  mawb_date DATE,
  port_of_loading VARCHAR(3),
  port_of_destination VARCHAR(3),
  shipment_type CHAR(1) DEFAULT 'T',
  total_packages INTEGER DEFAULT 0,
  gross_weight DECIMAL(13,3) DEFAULT 0,
  item_description VARCHAR(60),
  profile_id UUID REFERENCES profiles(id),
  created_by UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- EGM HAWBs (ALCHE01 Part III)
CREATE TABLE IF NOT EXISTS egm_hawbs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  egm_mawb_id UUID NOT NULL REFERENCES egm_mawbs(id) ON DELETE CASCADE,
  message_type CHAR(1) NOT NULL DEFAULT 'F',        -- F/S/A/M(delete)
  customs_house_code VARCHAR(6),
  egm_no VARCHAR(7),
  egm_date DATE,
  mawb_no VARCHAR(20),
  mawb_date DATE,
  hawb_no VARCHAR(20) NOT NULL,
  hawb_date DATE,
  port_of_origin VARCHAR(3),
  port_of_destination VARCHAR(3),
  shipment_type CHAR(1) DEFAULT 'T',
  total_packages INTEGER DEFAULT 0,
  gross_weight DECIMAL(9,3) DEFAULT 0,
  item_description VARCHAR(30),
  profile_id UUID REFERENCES profiles(id),
  created_by UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- CAN / DO (Cancel / Delivery Orders)
CREATE TABLE IF NOT EXISTS can_do (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(3) NOT NULL,                         -- CAN or DO
  reference_no VARCHAR(30),
  mawb_no VARCHAR(20),
  hawb_no VARCHAR(20),
  consignee_name VARCHAR(200),
  consignee_address TEXT,
  issue_date DATE,
  valid_till DATE,
  customs_house_code VARCHAR(6),
  remarks TEXT,
  profile_id UUID REFERENCES profiles(id),
  created_by UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'active',              -- active, cancelled
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Invoices (Accounting)
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_no VARCHAR(30) UNIQUE NOT NULL,
  invoice_date DATE NOT NULL,
  mawb_no VARCHAR(20),
  hawb_no VARCHAR(20),
  consignee_name VARCHAR(200),
  amount DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'INR',
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending',             -- pending, paid, cancelled
  profile_id UUID REFERENCES profiles(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
