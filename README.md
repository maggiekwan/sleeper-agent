# 🌙 Sleeper Agent

A personal AI agent that fetches nightly sleep data from the [Whoop API](https://developer.whoop.com) and emails a recommended bedtime to my boyfriend so he can remind me to go to sleep.

## How it works

1. Fetches last night's sleep data from the Whoop API
2. Calculates tonight's recommended bedtime based on sleep debt and recovery
3. Emails my boyfriend with the bedtime so he can text me a reminder
4. Runs automatically every night via GitHub Actions

## Docs

[View the full documentation →](https://sleeperagentdemo.mintlify.app/)

## Stack

- TypeScript / Node.js
- Whoop API (sleep & recovery data)
- Anthropic Claude API (bedtime summary)
- Nodemailer / Gmail SMTP (email delivery)
- GitHub Actions (scheduling)

## Setup

1. Clone the repo
2. Create a `.env` file based on the required variables in the docs
3. Run the one-time OAuth flow: `npx ts-node one-time-auth.ts`
4. Add secrets to GitHub Actions
5. Enable the workflow
