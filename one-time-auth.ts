import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.WHOOP_CLIENT_ID!;
const CLIENT_SECRET = process.env.WHOOP_CLIENT_SECRET!;
const REDIRECT_URI = 'http://localhost:3000/callback';
const SCOPES = 'offline read:sleep read:recovery';

const app = express();

const authUrl = `https://api.prod.whoop.com/oauth/oauth2/auth?` +
  `client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&state=supersecretstate123`;

console.log('Open this URL in your browser:\n', authUrl);

app.get('/callback', async (req, res) => {
  console.log('Full query params:', req.query);
  const code = req.query.code as string;
  console.log('Got code:', code);

  try {
    const { data } = await axios.post(
      'https://api.prod.whoop.com/oauth/oauth2/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
  
    console.log('\n✅ Success! Add these to your .env:\n');
    console.log('WHOOP_ACCESS_TOKEN=' + data.access_token);
    console.log('WHOOP_REFRESH_TOKEN=' + data.refresh_token);
  
    res.send('Done! Check your terminal.');
    process.exit(0);
  } catch (err: any) {
    console.error('Error status:', err.response?.status);
    console.error('Error data:', JSON.stringify(err.response?.data, null, 2));
    res.send('Error - check terminal');
  }
});

app.listen(3000, () => console.log('Waiting for Whoop redirect on :3000...'));