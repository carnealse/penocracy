import { claimQueuedJobs } from "@/server/exports";

async function loop() {
  for (;;) {
    await claimQueuedJobs();
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

loop().catch((error) => {
  console.error(error);
  process.exit(1);
});
