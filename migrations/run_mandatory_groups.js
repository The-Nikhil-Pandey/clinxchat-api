/**
 * Migration: Create Mandatory Groups System
 * Run: node migrations/run_mandatory_groups.js
 */
const { pool } = require('../config/db');

async function runMigration() {
    const connection = await pool.getConnection();

    try {
        console.log('Starting mandatory groups migration...\n');

        // Step 1: Add is_system_group column
        console.log('Step 1: Adding is_system_group column...');
        try {
            await connection.query(`
                ALTER TABLE \`groups\` 
                ADD COLUMN is_system_group BOOLEAN DEFAULT FALSE AFTER group_type
            `);
            console.log('  ✓ Column added');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('  ✓ Column already exists');
            } else {
                throw e;
            }
        }

        // Step 2: Add system_group_code column
        console.log('Step 2: Adding system_group_code column...');
        try {
            await connection.query(`
                ALTER TABLE \`groups\` 
                ADD COLUMN system_group_code VARCHAR(50) NULL AFTER is_system_group
            `);
            console.log('  ✓ Column added');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('  ✓ Column already exists');
            } else {
                throw e;
            }
        }

        // Step 3: Create Super Admin user
        console.log('Step 3: Creating Super Admin user...');
        const hashedPassword = '$2a$10$8K1p/a0dL1LXMIgoEDFrOOqHe7bq3R7wRF8T/WR8uX4P.UFMiMSyO'; // SuperAdmin@123

        const [existingAdmin] = await connection.query(
            'SELECT id FROM users WHERE email = ?',
            ['superadmin@clinxchat.com']
        );

        let superAdminId;
        if (existingAdmin.length > 0) {
            superAdminId = existingAdmin[0].id;
            console.log(`  ✓ Super Admin already exists (ID: ${superAdminId})`);
        } else {
            const [result] = await connection.query(`
                INSERT INTO users (name, email, password, role, department, is_active)
                VALUES ('System Admin', 'superadmin@clinxchat.com', ?, 'admin', 'System', TRUE)
            `, [hashedPassword]);
            superAdminId = result.insertId;
            console.log(`  ✓ Super Admin created (ID: ${superAdminId})`);
        }

        // Step 4: Create mandatory groups
        console.log('Step 4: Creating mandatory groups...');
        const groupNames = [
            { name: 'Group 1', code: 'MANDATORY_GROUP_1' },
            { name: 'Group 2', code: 'MANDATORY_GROUP_2' },
            { name: 'Group 3', code: 'MANDATORY_GROUP_3' }
        ];

        const groupIds = [];
        for (const group of groupNames) {
            // Check if already exists
            const [existing] = await connection.query(
                'SELECT id FROM `groups` WHERE system_group_code = ?',
                [group.code]
            );

            if (existing.length > 0) {
                groupIds.push(existing[0].id);
                console.log(`  ✓ ${group.name} already exists (ID: ${existing[0].id})`);
            } else {
                const [result] = await connection.query(`
                    INSERT INTO \`groups\` (name, description, image, group_type, is_system_group, system_group_code, created_by)
                    VALUES (?, 'Mandatory system group - All users are members', NULL, 'public', TRUE, ?, ?)
                `, [group.name, group.code, superAdminId]);
                groupIds.push(result.insertId);
                console.log(`  ✓ ${group.name} created (ID: ${result.insertId})`);

                // Create group permissions
                await connection.query(
                    'INSERT INTO group_permissions (group_id) VALUES (?)',
                    [result.insertId]
                );
            }
        }

        // Step 5: Add super admin as admin of mandatory groups
        console.log('Step 5: Adding Super Admin as group admin...');
        for (const groupId of groupIds) {
            await connection.query(`
                INSERT INTO group_members (group_id, user_id, role)
                VALUES (?, ?, 'admin')
                ON DUPLICATE KEY UPDATE role = 'admin'
            `, [groupId, superAdminId]);
        }
        console.log('  ✓ Super Admin added to all groups');

        // Step 6: Add all existing users to mandatory groups
        console.log('Step 6: Adding all users to mandatory groups...');
        const [users] = await connection.query(
            'SELECT id FROM users WHERE is_active = TRUE AND id != ?',
            [superAdminId]
        );

        let addedCount = 0;
        for (const user of users) {
            for (const groupId of groupIds) {
                try {
                    await connection.query(`
                        INSERT INTO group_members (group_id, user_id, role)
                        VALUES (?, ?, 'member')
                        ON DUPLICATE KEY UPDATE group_id = group_id
                    `, [groupId, user.id]);
                    addedCount++;
                } catch (e) {
                    // Ignore duplicates
                }
            }
        }
        console.log(`  ✓ Added ${users.length} users to ${groupIds.length} groups`);

        // Step 7: Create group chats
        console.log('Step 7: Creating group chats...');
        for (const groupId of groupIds) {
            const [existingChat] = await connection.query(
                'SELECT id FROM chats WHERE group_id = ?',
                [groupId]
            );

            let chatId;
            if (existingChat.length > 0) {
                chatId = existingChat[0].id;
            } else {
                const [result] = await connection.query(
                    "INSERT INTO chats (chat_type, group_id) VALUES ('group', ?)",
                    [groupId]
                );
                chatId = result.insertId;
            }

            // Add all users to chat participants
            const [allUsers] = await connection.query('SELECT id FROM users WHERE is_active = TRUE');
            for (const user of allUsers) {
                await connection.query(`
                    INSERT INTO chat_participants (chat_id, user_id)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE chat_id = chat_id
                `, [chatId, user.id]);
            }
        }
        console.log('  ✓ Group chats created and users added');

        console.log('\n========================================');
        console.log('Migration completed successfully! ✓');
        console.log('========================================');
        console.log('\nSummary:');
        console.log(`  - Super Admin ID: ${superAdminId}`);
        console.log(`  - Super Admin Email: superadmin@clinxchat.com`);
        console.log(`  - Super Admin Password: SuperAdmin@123`);
        console.log(`  - Mandatory Groups: ${groupIds.join(', ')}`);
        console.log(`  - Users added: ${users.length}`);

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        throw error;
    } finally {
        connection.release();
        process.exit(0);
    }
}

runMigration();
