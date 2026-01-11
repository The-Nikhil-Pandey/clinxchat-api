const mysql = require('mysql2/promise');
(async ()=>{
  try{
    const pool = await mysql.createPool({
      host: process.env.DB_HOST || '31.97.56.234',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'MySecurePass@123',
      database: process.env.DB_NAME || 'clinxchat',
      port: process.env.DB_PORT || 3306,
      connectionLimit: 2
    });

    const [rows] = await pool.query('SELECT id, name, is_active FROM users WHERE id = ?', [11]);
    console.log('User rows:', rows);
    await pool.end();
  }catch(e){
    console.error('DB error:', e.message);
    process.exit(1);
  }
})();