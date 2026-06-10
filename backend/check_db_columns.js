const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'gaytri_erp',
});

async function check() {
  await client.connect();
  console.log("Connected to PostgreSQL");
  
  // List all tables
  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema='public'
  `);
  console.log("\nTables in database:", tables.rows.map(r => r.table_name));

  for (const table of tables.rows.map(r => r.table_name)) {
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1
    `, [table]);
    console.log(`\nColumns in ${table}:`);
    for (const col of cols.rows) {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    }
  }

  await client.end();
}

check().catch(console.error);
