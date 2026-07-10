import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const queuePath = './src/scripts/officialDrugInteractionIngredientQueue.json';

function getPendingCount() {
  if (!fs.existsSync(queuePath)) return 0;
  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
  return queue.filter((e) => e.status === 'pending').length;
}

async function run() {
  let batchCount = 1;
  const env = { ...process.env, NODE_USE_ENV_PROXY: '1' };

  while (true) {
    const pending = getPendingCount();
    console.log(`==================================================`);
    console.log(`  Starting Batch #${batchCount} (Pending remaining: ${pending})`);
    console.log(`==================================================`);

    if (pending === 0) {
      console.log('All pending items have been processed! Exiting.');
      break;
    }

    // 1. Run fetch
    console.log('--> Running fetch (limit=40)...');
    try {
      execSync('node --import tsx src/scripts/fetchOfficialDrugInteractionLabels.ts --limit=40', {
        env,
        stdio: 'inherit',
      });
    } catch (err) {
      console.error('Fetch execution failed:', err);
      process.exit(1);
    }

    // 2. Run verification
    console.log('--> Running verification (sample=15)...');
    try {
      execSync('node --import tsx src/scripts/verifyOfficialDrugInteractionLabels.ts --sample=15', {
        env,
        stdio: 'inherit',
      });
    } catch (err) {
      console.error('Verification failed. Stopping batch process to prevent corruption.', err);
      process.exit(1);
    }

    console.log('Batch completed successfully. Waiting 5 seconds before next batch...');
    await new Promise((resolve) => setTimeout(resolve, 5000));
    batchCount++;
  }
}

run().catch((err) => {
  console.error('Auto batch runner failed:', err);
  process.exit(1);
});
