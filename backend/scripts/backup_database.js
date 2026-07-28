const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'Gaytri_Commercial',
});

async function backup() {
  await client.connect();
  console.log('[Backup] Connected to database to create pre-cleanup backup...');

  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  let dumpSql = `-- GAYTRI COMMERCIAL ERP PRE-CLEANUP DATABASE BACKUP\n`;
  dumpSql += `-- Backup Date: ${new Date().toISOString()}\n\n`;

  let totalRowsDumped = 0;

  for (const tableRow of tablesRes.rows) {
    const tableName = tableRow.table_name;
    const dataRes = await client.query(`SELECT * FROM "${tableName}"`);
    console.log(`[Backup] Table '${tableName}': ${dataRes.rows.length} rows`);
    totalRowsDumped += dataRes.rows.length;

    if (dataRes.rows.length > 0) {
      dumpSql += `-- Data for ${tableName}\n`;
      const colsRes = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      const columns = colsRes.rows.map(c => `"${c.column_name}"`).join(', ');

      for (const row of dataRes.rows) {
        const values = colsRes.rows.map(c => {
          const val = row[c.column_name];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'boolean' || typeof val === 'number') return val;
          if (val instanceof Date) return `'${val.toISOString()}'`;
          if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
          return `'${String(val).replace(/'/g, "''")}'`;
        }).join(', ');

        dumpSql += `INSERT INTO "${tableName}" (${columns}) VALUES (${values}) ON CONFLICT DO NOTHING;\n`;
      }
      dumpSql += `\n`;
    }
  }

  const backupPath = path.join(__dirname, '../database/backup_pre_cleanup.sql');
  fs.writeFileSync(backupPath, dumpSql, 'utf8');

  console.log(`\n✔ Backup created successfully at: ${backupPath}`);
  console.log(`✔ Backup file size: ${fs.statSync(backupPath).size} bytes`);
  console.log(`✔ Total rows backed up: ${totalRowsDumped}`);

  // Verification step
  if (!fs.existsSync(backupPath) || fs.statSync(backupPath).size === 0) {
    throw new Error('Backup verification failed: File is missing or empty!');
  }
  console.log('✔ Backup verification passed.');

  await client.end();
}

backup().catch((err) => {
  console.error('[Backup Error]', err);
  process.exit(1);
});
