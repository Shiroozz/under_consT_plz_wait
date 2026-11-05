export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = 'Shiroozz/under_consT_plz_wait';
  const issueNumber = 1;

  if (req.method === 'GET') {
    try {
      const headers = { 'Accept': 'application/vnd.github.v3+json' };
      if (token) headers['Authorization'] = `token ${token}`;

      const ghRes = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}/comments?per_page=30&sort=created&direction=desc`, {
        headers,
      });

      if (!ghRes.ok) {
        return res.status(200).json({ messages: [] });
      }

      const comments = await ghRes.json();
      const messages = comments.map((c) => {
        try {
          const data = JSON.parse(c.body);
          return {
            id: c.id,
            name: String(data.name || 'ANON').slice(0, 24),
            text: String(data.text || '').slice(0, 140),
            time: data.time || new Date(c.created_at).getTime(),
          };
        } catch {
          return {
            id: c.id,
            name: 'DRIFTER',
            text: String(c.body || '').slice(0, 140),
            time: new Date(c.created_at).getTime(),
          };
        }
      }).filter((m) => m.text.trim().length > 0);

      res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
      return res.status(200).json({ messages });
    } catch {
      return res.status(200).json({ messages: [] });
    }
  }

  if (req.method === 'POST') {
    if (!token) {
      return res.status(500).json({ error: 'Token not configured' });
    }

    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const cleanText = String(body.text || '').trim().slice(0, 120);
      const cleanName = String(body.name || 'DRIFTER-0451').trim().slice(0, 24);

      if (!cleanText) {
        return res.status(400).json({ error: 'Message cannot be empty' });
      }

      const payload = {
        name: cleanName,
        text: cleanText,
        time: Date.now(),
      };

      const ghRes = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: JSON.stringify(payload) }),
      });

      if (!ghRes.ok) {
        return res.status(ghRes.status).json({ error: 'Failed to post message' });
      }

      const comment = await ghRes.json();
      return res.status(201).json({ success: true, message: { id: comment.id, ...payload } });
    } catch (err) {
      return res.status(500).json({ error: 'Server error', details: String(err) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
