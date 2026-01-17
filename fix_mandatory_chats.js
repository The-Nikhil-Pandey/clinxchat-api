const { pool } = require('./config/db');

(async () => {
    try {
        console.log('Creating chats for mandatory groups...\n');

        // Get mandatory group IDs
        const [mandatoryGroups] = await pool.query(`
            SELECT id, name FROM \`groups\` WHERE is_system_group = 1
        `);
        console.log('Mandatory groups:', mandatoryGroups);

        // Get all users
        const [users] = await pool.query('SELECT id FROM users WHERE is_active = 1');
        console.log(`Total users: ${users.length}\n`);

        for (const group of mandatoryGroups) {
            // Check if chat exists
            const [existingChat] = await pool.query(
                'SELECT id FROM chats WHERE group_id = ?',
                [group.id]
            );

            let chatId;
            if (existingChat.length > 0) {
                chatId = existingChat[0].id;
                console.log(`Chat already exists for ${group.name} (Chat ID: ${chatId})`);
            } else {
                // Create chat
                const [result] = await pool.query(
                    "INSERT INTO chats (type, group_id) VALUES ('group', ?)",
                    [group.id]
                );
                chatId = result.insertId;
                console.log(`Created chat for ${group.name} (Chat ID: ${chatId})`);
            }

            // Add all users as participants
            let added = 0;
            for (const user of users) {
                try {
                    await pool.query(`
                        INSERT INTO chat_participants (chat_id, user_id)
                        VALUES (?, ?)
                        ON DUPLICATE KEY UPDATE chat_id = chat_id
                    `, [chatId, user.id]);
                    added++;
                } catch (e) {
                    // Ignore duplicates
                }
            }
            console.log(`  Added ${added} participants to ${group.name}`);
        }

        console.log('\n✓ Done! Mandatory group chats are now ready.');

    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
})();
