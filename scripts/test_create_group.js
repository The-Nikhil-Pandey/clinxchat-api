const jwt = require('jsonwebtoken');
(async ()=>{
  try {
    const token = jwt.sign({ id: 11 }, process.env.JWT_SECRET || 'clinxchat-super-secret-jwt-key-2024', { expiresIn: '1h' });
    console.log('Using token for user id 11');
    const res = await fetch('http://localhost:4000/api/groups', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Test group from script', description: 'Testing group create via script', disappearingDays: 7, groupType: 'public' })
    });
    const data = await res.json();
    console.log('Status:', res.status, 'Response:', data);
  } catch (e) {
    console.error('Request failed:', e.message);
  }
})();