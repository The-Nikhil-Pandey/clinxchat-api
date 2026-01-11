const jwt = require('jsonwebtoken');
// Use experimental fetch available on node 18+ via --experimental-fetch flag; fallback to global fetch if present
const fetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API = process.env.API_URL || 'http://localhost:4000';
const JWT_SECRET = process.env.JWT_SECRET || 'clinxchat-super-secret-jwt-key-2024';

(async () => {
  try {
    // 1) prepare token for user 11
    const token = jwt.sign({ id: 11 }, JWT_SECRET, { expiresIn: '1h' });

    console.log('Checking auth (/api/auth/me) as user 11...');
    const meResp = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const meJson = await meResp.json();
    console.log('/api/auth/me response:', meResp.status, meJson);

    if (!meJson || !meJson.id) {
      console.error('Auth failed for token - aborting');
      process.exit(1);
    }

    console.log('Creating group as user 11...');
    const createResp = await fetch(`${API}/api/groups`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `E2E Test Group ${Date.now()}`,
        description: 'Created by e2e script',
        disappearingDays: 7,
        groupType: 'public',
        permissions: { send_message: true, add_members: true }
      })
    });

    const createJson = await createResp.json();
    console.log('Create group response:', createResp.status, createJson);

    if (!createJson.success || !createJson.data) {
      console.error('Group creation failed');
      process.exit(1);
    }

    const group = createJson.data;

    // 2) fetch all users and pick a user that's not 11
    console.log('Fetching users...');
    const usersResp = await fetch(`${API}/api/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const usersJson = await usersResp.json();
    if (!usersJson.success || !usersJson.data || usersJson.data.length < 2) {
      console.error('Not enough users to run test');
      process.exit(1);
    }

    const otherUser = usersJson.data.find(u => u.id !== 11);
    if (!otherUser) {
      console.error('Could not find other user');
      process.exit(1);
    }

    console.log('Adding user', otherUser.id, 'to group', group.id);
    const addResp = await fetch(`${API}/api/groups/${group.id}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: otherUser.id, role: 'member' })
    });
    const addJson = await addResp.json();
    console.log('Add member response:', addResp.status, addJson);

    // 3) Get group details and verify
    const getResp = await fetch(`${API}/api/groups/${group.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const getJson = await getResp.json();
    console.log('Get group response:', getResp.status, getJson);

    if (getJson.success && getJson.data) {
      const members = getJson.data.members || [];
      const memberIds = members.map(m => m.user_id || m.id || m.member_id || m.member_id);
      console.log('Member ids on group:', memberIds);
      if (!memberIds.includes(otherUser.id)) {
        console.error('Member not present after add');
        process.exit(1);
      }
      console.log('E2E test succeeded');
    } else {
      console.error('Failed to fetch group after add');
      process.exit(1);
    }

  } catch (e) {
    console.error('E2E script failed:', e.message);
    process.exit(1);
  }
})();