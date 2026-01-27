/**
 * Seed Script - Creates test data for ClinxChat SaaS
 * Run with: node scripts/seed.js
 */

const bcrypt = require('bcrypt');
const { pool, initializeDatabase } = require('../config/db');

const MANDATORY_GROUPS = [
    { name: 'All Staff Announcements', description: 'Company-wide announcements for all staff members', is_mandatory: true },
    { name: 'General Discussion', description: 'General discussion channel for all team members', is_mandatory: true },
    { name: 'Help & Support', description: 'Get help and support from the team', is_mandatory: true }
];

async function seed() {
    console.log('🌱 Starting seed process...\n');

    try {
        // Initialize database tables first
        await initializeDatabase();
        console.log('✅ Database tables verified\n');

        // 1. Create mandatory groups
        console.log('📁 Creating mandatory groups...');
        for (const group of MANDATORY_GROUPS) {
            const [existing] = await pool.query(
                'SELECT id FROM groups WHERE name = ? AND is_mandatory = TRUE',
                [group.name]
            );

            if (existing.length === 0) {
                await pool.query(
                    `INSERT INTO \`groups\` (name, description, group_type, is_mandatory, created_by)
                     VALUES (?, ?, 'public', TRUE, 1)`,
                    [group.name, group.description]
                );
                console.log(`   ✅ Created: ${group.name}`);
            } else {
                console.log(`   ⏭️  Already exists: ${group.name}`);
            }
        }

        // 2. Create test team
        console.log('\n🏢 Creating test team...');
        const teamSlug = 'clinxchat-healthcare';
        const [existingTeam] = await pool.query('SELECT id FROM teams WHERE slug = ?', [teamSlug]);

        let teamId;
        if (existingTeam.length === 0) {
            const [teamResult] = await pool.query(
                `INSERT INTO teams (name, slug, description, plan, member_limit)
                 VALUES ('ClinxChat Healthcare', ?, 'Primary healthcare organization workspace', 'pro', 50)`,
                [teamSlug]
            );
            teamId = teamResult.insertId;
            console.log(`   ✅ Created team: ClinxChat Healthcare (ID: ${teamId})`);
        } else {
            teamId = existingTeam[0].id;
            console.log(`   ⏭️  Team already exists (ID: ${teamId})`);
        }

        // 3. Create admin user
        console.log('\n👤 Creating admin user...');
        const adminEmail = 'admin@clinxchat.com';
        const adminPassword = 'Admin@123';
        const adminHashedPassword = await bcrypt.hash(adminPassword, 10);

        const [existingAdmin] = await pool.query('SELECT id FROM users WHERE email = ?', [adminEmail]);
        let adminId;

        if (existingAdmin.length === 0) {
            const [adminResult] = await pool.query(
                `INSERT INTO users (name, email, password, role, department, active_status, current_team_id, is_active)
                 VALUES ('System Administrator', ?, ?, 'admin', 'Administration', 'available', ?, TRUE)`,
                [adminEmail, adminHashedPassword, teamId]
            );
            adminId = adminResult.insertId;
            console.log(`   ✅ Created admin: ${adminEmail} (ID: ${adminId})`);
        } else {
            adminId = existingAdmin[0].id;
            // Update password to ensure it works
            await pool.query('UPDATE users SET password = ?, current_team_id = ? WHERE id = ?',
                [adminHashedPassword, teamId, adminId]);
            console.log(`   ⏭️  Admin already exists (ID: ${adminId}), password reset`);
        }

        // Update team owner
        await pool.query('UPDATE teams SET owner_id = ? WHERE id = ?', [adminId, teamId]);

        // 4. Create member user
        console.log('\n👤 Creating member user...');
        const memberEmail = 'user@clinxchat.com';
        const memberPassword = 'User@123';
        const memberHashedPassword = await bcrypt.hash(memberPassword, 10);

        const [existingMember] = await pool.query('SELECT id FROM users WHERE email = ?', [memberEmail]);
        let memberId;

        if (existingMember.length === 0) {
            const [memberResult] = await pool.query(
                `INSERT INTO users (name, email, password, role, department, active_status, current_team_id, is_active)
                 VALUES ('Test User', ?, ?, 'clinical_staff', 'Clinical', 'available', ?, TRUE)`,
                [memberEmail, memberHashedPassword, teamId]
            );
            memberId = memberResult.insertId;
            console.log(`   ✅ Created member: ${memberEmail} (ID: ${memberId})`);
        } else {
            memberId = existingMember[0].id;
            await pool.query('UPDATE users SET password = ?, current_team_id = ? WHERE id = ?',
                [memberHashedPassword, teamId, memberId]);
            console.log(`   ⏭️  Member already exists (ID: ${memberId}), password reset`);
        }

        // 5. Add users to team_members
        console.log('\n🔗 Adding users to team...');
        await pool.query(
            `INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'owner')
             ON DUPLICATE KEY UPDATE role = 'owner'`,
            [teamId, adminId]
        );
        console.log(`   ✅ Admin added as team owner`);

        await pool.query(
            `INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'member')
             ON DUPLICATE KEY UPDATE role = 'member'`,
            [teamId, memberId]
        );
        console.log(`   ✅ Member added to team`);

        // 6. Add users to mandatory groups
        console.log('\n📋 Adding users to mandatory groups...');
        const [mandatoryGroups] = await pool.query('SELECT id, name FROM groups WHERE is_mandatory = TRUE');

        for (const group of mandatoryGroups) {
            // Add admin
            await pool.query(
                `INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'admin')
                 ON DUPLICATE KEY UPDATE role = 'admin'`,
                [group.id, adminId]
            );
            // Add member
            await pool.query(
                `INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')
                 ON DUPLICATE KEY UPDATE role = 'member'`,
                [group.id, memberId]
            );
            console.log(`   ✅ Users added to: ${group.name}`);
        }

        // 7. Create default channels for team
        console.log('\n💬 Creating default channels...');
        const defaultChannels = [
            { name: 'general', description: 'General discussion', is_default: true },
            { name: 'announcements', description: 'Team announcements', is_default: true },
            { name: 'random', description: 'Off-topic chat', is_default: false }
        ];

        for (const channel of defaultChannels) {
            const [existing] = await pool.query(
                'SELECT id FROM channels WHERE team_id = ? AND name = ?',
                [teamId, channel.name]
            );

            if (existing.length === 0) {
                const [channelResult] = await pool.query(
                    `INSERT INTO channels (team_id, name, description, type, is_default, created_by)
                     VALUES (?, ?, ?, 'public', ?, ?)`,
                    [teamId, channel.name, channel.description, channel.is_default, adminId]
                );

                // Add both users to channel
                await pool.query(
                    'INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?), (?, ?)',
                    [channelResult.insertId, adminId, channelResult.insertId, memberId]
                );
                console.log(`   ✅ Created channel: #${channel.name}`);
            } else {
                console.log(`   ⏭️  Channel exists: #${channel.name}`);
            }
        }

        // 8. Create sample payment records
        console.log('\n💳 Creating sample payment records...');
        const payments = [
            { amount: 4.95, status: 'succeeded', description: '5 extra members - Monthly' },
            { amount: 9.90, status: 'succeeded', description: '10 extra members - Monthly' },
            { amount: 4.95, status: 'failed', description: '5 extra members - Payment declined' }
        ];

        for (const payment of payments) {
            await pool.query(
                `INSERT INTO payments (team_id, amount, currency, status, description, created_at)
                 VALUES (?, ?, 'GBP', ?, ?, DATE_SUB(NOW(), INTERVAL FLOOR(RAND() * 30) DAY))`,
                [teamId, payment.amount, payment.status, payment.description]
            );
        }
        console.log(`   ✅ Created ${payments.length} sample payments`);

        console.log('\n' + '='.repeat(50));
        console.log('🎉 SEED COMPLETE!\n');
        console.log('📧 Test Credentials:');
        console.log('─'.repeat(30));
        console.log('Admin Login:');
        console.log(`   Email:    ${adminEmail}`);
        console.log(`   Password: ${adminPassword}`);
        console.log('');
        console.log('User Login:');
        console.log(`   Email:    ${memberEmail}`);
        console.log(`   Password: ${memberPassword}`);
        console.log('='.repeat(50) + '\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Seed failed:', error);
        process.exit(1);
    }
}

seed();
