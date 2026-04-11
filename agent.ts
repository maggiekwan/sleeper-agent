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