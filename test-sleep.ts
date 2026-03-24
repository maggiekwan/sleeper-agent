import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function getSleepData() {
  const { data } = await axios.get(
    'https://api.prod.whoop.com/developer/v2/activity/sleep',
    {
      headers: {
        Authorization: `Bearer ${process.env.WHOOP_ACCESS_TOKEN}`,
      },
    }
  );

  console.log(JSON.stringify(data, null, 2));
}

getSleepData();