const { Client } = require('pg');
const bcrypt = require('bcryptjs');
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
  const hash = bcrypt.hashSync('workforce@2026', 10);
  await client.query("UPDATE admins SET password_hash = $1 WHERE email = 'admin@gaytri.com'", [hash]);
  console.log("Password hash for admin@gaytri.com reset to workforce@2026");
  await client.end();
}
run().catch(console.error);
