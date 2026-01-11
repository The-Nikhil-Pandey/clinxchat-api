const mysql = require('mysql2/promise');
(async () => {
  try {
    const pool = await mysql.createPool({
      host: process.env.DB_HOST || '31.97.56.234',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'MySecurePass@123',
      database: process.env.DB_NAME || 'clinxchat',
      port: process.env.DB_PORT || 3306,
    });

    const [rows] = await pool.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='groups'`);
    console.log('Columns in groups table:', rows.map(r => r.COLUMN_NAME));
    await pool.end();
  } catch (e) {
    console.error('DB query failed:', e.message);
    process.exit(1);
  }
})();