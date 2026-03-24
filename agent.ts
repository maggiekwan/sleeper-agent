import axios from 'axios';
import nodemailer from 'nodemailer';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function refreshAccessToken(): Promise<string> {
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', process.env.WHOOP_REFRESH_TOKEN!);
  params.append('client_id', process.env.WHOOP_CLIENT_ID!);
  params.append('client_secret', process.env.WHOOP_CLIENT_SECRET!);

  const { data } = await axios.post(
    'https://api.prod.whoop.com/oauth/oauth2/token',
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  // Save the new refresh token back to use next time
  process.env.WHOOP_REFRESH_TOKEN = data.refresh_token;
  process.env.WHOOP_ACCESS_TOKEN = data.access_token;

  return data.access_token;
}

async function getLastNightSleep(accessToken: string) {
  const { data } = await axios.get(
    'https://api.prod.whoop.com/developer/v2/activity/sleep',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return data.records.find((r: any) => !r.nap);
}

async function generateSummary(sleep: any): Promise<string> {
  const msToHours = (ms: number) => (ms / 3600000).toFixed(1);

  const sleepData = {
    date: new Date(sleep.start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    bedtime: new Date(sleep.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }),
    wakeTime: new Date(sleep.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }),
    totalSleep: msToHours(sleep.score.stage_summary.total_in_bed_time_milli - sleep.score.stage_summary.total_awake_time_milli),
    sleepNeeded: msToHours(sleep.score.sleep_needed.baseline_milli + sleep.score.sleep_needed.need_from_sleep_debt_milli + sleep.score.sleep_needed.need_from_recent_strain_milli),
    performance: sleep.score.sleep_performance_percentage,
    rem: msToHours(sleep.score.stage_summary.total_rem_sleep_time_milli),
    deepSleep: msToHours(sleep.score.stage_summary.total_slow_wave_sleep_time_milli),
    disturbances: sleep.score.stage_summary.disturbance_count,
    respiratoryRate: sleep.score.respiratory_rate.toFixed(1),
  };

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `State her suggested bedtime based on sleep data. Her usual bedtime should be 8pm PT. If she got less than 8 hours of sleep the night before, make the bedtime earlier by the difference.

Here is her sleep data:
${JSON.stringify(sleepData, null, 2)}`
    }]
  });

  return (message.content[0] as any).text;
}

async function sendEmail(summary: string) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.BOYFRIEND_EMAIL,
    subject: `Sweep Warning`,
    text: summary,
  });

  console.log('Email sent!');
}

async function run() {
  console.log('Refreshing token...');
  const accessToken = await refreshAccessToken();

  console.log('Fetching sleep data...');
  const sleep = await getLastNightSleep(accessToken);

  console.log('Calculating bedtime...');
  const message = await generateSummary(sleep);
  console.log('Message:', message);

  const msToHours = (ms: number) => ms / 3600000;
  // Calculate bedtime in Eastern time
  const now = new Date();

  // Fixed 11pm ET bedtime target (ET = UTC-4 in daylight saving)
  const bedtime = new Date();
  bedtime.setUTCHours(23 + 4, 0, 0, 0); // 11pm ET = 3am UTC next day
  
  // If bedtime already passed today, use tomorrow
  if (bedtime < now) bedtime.setUTCDate(bedtime.getUTCDate() + 1);

  const reminderTime = new Date(bedtime.getTime() - 20 * 60 * 1000);
  const waitMs = reminderTime.getTime() - now.getTime();

  console.log(`Bedtime: ${bedtime.toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}`);
  console.log(`Sending email at: ${reminderTime.toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}`);
  console.log(`Waiting ${Math.round(waitMs / 60000)} minutes...`);

  await new Promise(resolve => setTimeout(resolve, waitMs));

  console.log('Sending email...');
  await sendEmail(message);
}

run();