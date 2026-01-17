const { pool } = require('./config/db');

(async () => {
    try {
        // Fetch group 6 details
        const [group] = await pool.query(`
            SELECT g.*, u.name as creator_name
            FROM \`groups\` g
            JOIN users u ON g.created_by = u.id
            WHERE g.id = 6
        `);
        console.log('Group 6:');
        console.log(JSON.stringify(group[0], null, 2));

    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
})();
