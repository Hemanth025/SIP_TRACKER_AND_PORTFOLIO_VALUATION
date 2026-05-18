const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE
});

const query = (text, params) => pool.query(text, params);
const connect = () => pool.connect();

// Rename 'run' to something descriptive and don't call it globally
async function connectDB() {
    try {
        const client = await pool.connect();
        console.log("Connected to POSTGRE.. ->SUPABASE");
        client.release(); // Very important: release the client back to the pool!
    } catch (error) {
        console.error("Database Connection Error:", error);
    }
}

// Only run automatically if this file is executed directly (node pgManager.js)
if (require.main === module) {
    connectDB();
}

module.exports = { pool, query, connect, connectDB };
