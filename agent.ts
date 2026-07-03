import axios from 'axios';
import nodemailer from 'nodemailer';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

let access_token = process.env.WHOOP_ACCESS_TOKEN!;
let refresh_token = process.env.WHOOP_REFRESH_TOKEN!;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function refreshAccessToken(): Promise<string> {
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refresh_token);
  params.append('client_id', process.env.WHOOP_CLIENT_ID!);
  params.append('client_secret', process.env.WHOOP_CLIENT_SECRET!);

  const { data } = await axios.post(
    'https://api.prod.whoop.com/oauth/oauth2/token',
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  access_token = data.access_token;
  refresh_token = data.refresh_token;

  // Update GitHub secrets so next run has fresh tokens
  await updateGithubSecret('WHOOP_ACCESS_TOKEN', access_token);
  await updateGithubSecret('WHOOP_REFRESH_TOKEN', refresh_token);

  return access_token;
}

async function updateGithubSecret(name: string, value: string) {
  // Get repo public key for encrypting secrets
  const { data: keyData } = await axios.get(
    `https://api.github.com/repos/${process.env.GITHUB_REPO}/actions/secrets/public-key`,
    { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } }
  );

  // GitHub requires secrets to be encrypted with libsodium
  const sodium = await import('libsodium-wrappers');
  await sodium.ready;
  const binkey = sodium.from_base64(keyData.key, sodium.base64_variants.ORIGINAL);
  const binsec = sodium.from_string(value);
  const encBytes = sodium.crypto_box_seal(binsec, binkey);
  const encrypted = sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);

  await axios.put(
    `https://api.github.com/repos/${process.env.GITHUB_REPO}/actions/secrets/${name}`,
    { encrypted_value: encrypted, key_id: keyData.key_id },
    { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } }
  );

  console.log(`Updated GitHub secret: ${name}`);
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
    model: 'claude-sonnet-5',
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
    subject: `Bedtime reminder`,
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

  // Send immediately. Scheduling is handled by the GitHub Actions cron
  // (the workflow fires at the intended reminder time) — we must NOT wait
  // in-process, because Actions kills any job after 6 hours.
  console.log('Sending email...');
  await sendEmail(message);
}

run();
