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

    const [rows] = await pool.query(`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='groups' AND COLUMN_NAME='group_type'`);
    const exists = rows[0] && rows[0].cnt > 0;
    if (exists) {
      console.log('Column group_type already exists.');
    } else {
      console.log('Column group_type not found. Adding now...');
      await pool.query(`ALTER TABLE \`groups\` ADD COLUMN group_type ENUM('public','private','secret') DEFAULT 'public' AFTER image`);
      console.log('Added column group_type.');
    }

    await pool.end();
  } catch (e) {
    console.error('Failed to ensure column exists:', e.message);
    process.exit(1);
  }
})();