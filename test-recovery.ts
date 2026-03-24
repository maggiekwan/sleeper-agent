import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function getData() {
  const sleep = await axios.get(
    'https://api.prod.whoop.com/developer/v2/activity/sleep',
    { headers: { Authorization: `Bearer ${process.env.WHOOP_ACCESS_TOKEN}` } }
  );

  const recovery = await axios.get(
    'https://api.prod.whoop.com/developer/v2/recovery',
    { headers: { Authorization: `Bearer ${process.env.WHOOP_ACCESS_TOKEN}` } }
  );

  console.log('Latest sleep:');
  console.log(JSON.stringify(sleep.data.records[0], null, 2));
  console.log('\nLatest recovery:');
  console.log(JSON.stringify(recovery.data.records[0], null, 2));
}

getData();