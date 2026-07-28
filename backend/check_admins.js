const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'Gaytri_Commercial',
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT id, email, role, is_active FROM admins");
  console.log("Admins in database:", res.rows);
  await client.end();
}
run().catch(console.error);
