# Database Migrations

## Running the Employee Profile Migration

To add employee profile fields to the database, run:

```bash
cd backend
node src/db/run-migration.js
```

This will add the following fields to the `users` table:
- `years_of_experience` - Number of years of work experience
- `interests` - Array of skill IDs (JSONB)
- `specialization_ar` - Specialization in Arabic
- `specialization_en` - Specialization in English
- `last_qualification_ar` - Last qualification in Arabic
- `last_qualification_en` - Last qualification in English
- `willing_to_change_career` - Boolean indicating career change willingness

## Manual Migration

If you prefer to run the migration manually, you can execute the SQL file directly:

```bash
psql -d your_database_name -f backend/src/db/migrations/add_employee_profile.sql
```

Or connect to your database and copy-paste the SQL commands from the migration file.

