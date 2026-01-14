#!/usr/bin/env node

/**
 * Standalone script to run scheduled jobs
 * Can be triggered via cron job, e.g.:
 * 
 * # Run daily at 9:00 AM
 * 0 9 * * * cd /path/to/backend && node run-scheduled-jobs.js
 * 
 * Or run specific jobs:
 * node run-scheduled-jobs.js --reminders
 * node run-scheduled-jobs.js --badges
 * node run-scheduled-jobs.js --expired
 * node run-scheduled-jobs.js --all
 */

require('dotenv').config();

const { 
  sendPendingTestReminders, 
  updateAllUserBadges, 
  markExpiredAssignments, 
  runAllJobs 
} = require('./src/services/scheduledJobs');

const args = process.argv.slice(2);

async function main() {
  console.log('='.repeat(50));
  console.log('📅 Running scheduled jobs at:', new Date().toISOString());
  console.log('='.repeat(50));

  try {
    if (args.includes('--reminders') || args.includes('-r')) {
      console.log('\n📧 Running: Send pending test reminders');
      await sendPendingTestReminders();
    } else if (args.includes('--badges') || args.includes('-b')) {
      console.log('\n🏅 Running: Update all user badges');
      await updateAllUserBadges();
    } else if (args.includes('--expired') || args.includes('-e')) {
      console.log('\n⏰ Running: Mark expired assignments');
      await markExpiredAssignments();
    } else if (args.includes('--all') || args.includes('-a') || args.length === 0) {
      console.log('\n🚀 Running: All scheduled jobs');
      await runAllJobs();
    } else {
      console.log(`
Usage: node run-scheduled-jobs.js [options]

Options:
  --reminders, -r   Send reminder emails for pending tests (7+ days)
  --badges, -b      Update badges for all users
  --expired, -e     Mark expired test assignments
  --all, -a         Run all scheduled jobs (default)

Examples:
  node run-scheduled-jobs.js              # Run all jobs
  node run-scheduled-jobs.js --reminders  # Only send reminders
  node run-scheduled-jobs.js -b -e        # Update badges and mark expired
`);
      process.exit(0);
    }

    console.log('\n✅ Jobs completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Job execution failed:', error);
    process.exit(1);
  }
}

main();

