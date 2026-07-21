const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'gaytri_erp',
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT email, password_hash FROM admins WHERE email = 'amit8340@gmail.com'");
  if (res.rows.length === 0) {
    console.log("No user found");
  } else {
    const row = res.rows[0];
    console.log("Found user:", row.email);
    const passwords = ['workforce@2026', 'amit8340', 'password', 'password123', 'admin', 'admin123', 'Amit@123', 'Amit@8340'];
    for (const p of passwords) {
      const match = bcrypt.compareSync(p, row.password_hash);
      console.log(`Password "${p}":`, match);
    }
  }
  await client.end();
}
run().catch(console.error);
