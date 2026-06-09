# EDISS Sea Backend

Use only one SQL file for first-time database setup:

- Schema file: `sea-backend/src/schema.sql`

Manual first-time setup:

1. Create your PostgreSQL database manually.
   Example database name: `ediss_sea_db`
2. Open `sea-backend/src/schema.sql` in pgAdmin, DBeaver, or `psql`.
3. Run the full file once.
4. Update `sea-backend/.env` with your database connection values.
5. Start the backend.

What `schema.sql` does:

- Creates all sea backend tables
- Creates indexes and constraints
- Inserts default sea locations
- Creates one default admin login

Default admin login after running `schema.sql`:

- Username: `admin`
- Password: `SeaAdmin@2026!`

Optional demo data:

- If you also want sample profiles, users, and sample MBL/HBL data, run:
  `npm run seed`

If you already ran an older version of `schema.sql` and login is failing:

- Run `sea-backend/src/fix_admin_login.sql`
- Then login with:
  Username: `admin`
  Password: `SeaAdmin@2026!`

Important:

- Ignore old air-project migration files. The sea project now uses only `src/schema.sql` for first-time setup.
