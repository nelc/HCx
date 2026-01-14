const db = require('../db');
const { sendTestReminderEmail } = require('./emailService');
const { updateUserBadges } = require('./badgeService');

/**
 * Send reminder emails for tests pending for 7+ days
 * This should be called daily (via cron job or similar)
 */
async function sendPendingTestReminders() {
  console.log('🔔 Starting pending test reminder job...');
  
  try {
    // Find tests that have been pending for 7+ days and haven't received email reminder
    const pendingTests = await db.query(`
      SELECT 
        ta.id as assignment_id,
        ta.user_id,
        ta.due_date,
        ta.created_at,
        EXTRACT(DAY FROM (NOW() - ta.created_at)) as days_pending,
        t.title_ar,
        t.title_en,
        u.email,
        u.name_ar
      FROM test_assignments ta
      JOIN tests t ON ta.test_id = t.id
      JOIN users u ON ta.user_id = u.id
      WHERE ta.status = 'pending'
        AND ta.created_at <= NOW() - INTERVAL '7 days'
        AND (ta.email_reminder_sent = false OR ta.email_reminder_sent IS NULL)
        AND u.is_active = true
      ORDER BY ta.created_at ASC
    `);

    console.log(`📋 Found ${pendingTests.rows.length} tests pending 7+ days without reminder`);

    let sent = 0;
    let failed = 0;

    for (const test of pendingTests.rows) {
      try {
        const result = await sendTestReminderEmail(test.email, test.name_ar, {
          title_ar: test.title_ar,
          title_en: test.title_en,
          due_date: test.due_date,
          days_pending: Math.floor(test.days_pending),
          assignment_id: test.assignment_id
        });

        if (result.success) {
          // Mark reminder as sent
          await db.query(`
            UPDATE test_assignments 
            SET email_reminder_sent = true, last_reminder_at = NOW(), reminder_count = reminder_count + 1
            WHERE id = $1
          `, [test.assignment_id]);
          
          // Create in-app notification
          await db.query(`
            INSERT INTO notifications (user_id, type, title_ar, title_en, message_ar, message_en, link, metadata)
            VALUES ($1, 'test_reminder', 'تذكير: تقييم معلق', 'Reminder: Pending Assessment',
                    $2, $3, '/assessments', $4)
          `, [
            test.user_id,
            `لديك تقييم معلق منذ ${Math.floor(test.days_pending)} يوم: ${test.title_ar}`,
            `You have a pending assessment for ${Math.floor(test.days_pending)} days: ${test.title_en}`,
            JSON.stringify({ assignment_id: test.assignment_id })
          ]);
          
          sent++;
          console.log(`✅ Reminder sent to ${test.email} for "${test.title_ar}"`);
        } else {
          failed++;
          console.error(`❌ Failed to send reminder to ${test.email}:`, result.error);
        }
      } catch (err) {
        failed++;
        console.error(`❌ Error sending reminder to ${test.email}:`, err.message);
      }
    }

    console.log(`\n📊 Reminder Job Summary:`);
    console.log(`   ✅ Sent: ${sent}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📋 Total: ${pendingTests.rows.length}`);

    return { success: true, sent, failed, total: pendingTests.rows.length };
  } catch (error) {
    console.error('❌ Pending test reminder job failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update badges for all active users
 * This should be called periodically (e.g., daily) to ensure badge accuracy
 */
async function updateAllUserBadges() {
  console.log('🏅 Starting badge update job for all users...');
  
  try {
    // Get all active employees
    const users = await db.query(`
      SELECT id FROM users 
      WHERE role = 'employee' AND is_active = true
    `);

    console.log(`👥 Updating badges for ${users.rows.length} users`);

    let updated = 0;
    let badgesAwarded = 0;
    let badgesRevoked = 0;

    for (const user of users.rows) {
      try {
        const result = await updateUserBadges(user.id);
        if (result.success) {
          updated++;
          badgesAwarded += result.awarded?.length || 0;
          badgesRevoked += result.revoked?.length || 0;
        }
      } catch (err) {
        console.error(`Error updating badges for user ${user.id}:`, err.message);
      }
    }

    console.log(`\n📊 Badge Update Summary:`);
    console.log(`   👥 Users processed: ${updated}`);
    console.log(`   🏅 Badges awarded: ${badgesAwarded}`);
    console.log(`   ❌ Badges revoked: ${badgesRevoked}`);

    return { success: true, updated, badgesAwarded, badgesRevoked };
  } catch (error) {
    console.error('❌ Badge update job failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Mark expired test assignments
 * This should be called daily to update test status
 */
async function markExpiredAssignments() {
  console.log('⏰ Checking for expired test assignments...');
  
  try {
    const result = await db.query(`
      UPDATE test_assignments
      SET status = 'expired'
      WHERE status IN ('pending', 'in_progress')
        AND due_date IS NOT NULL
        AND due_date < NOW()
      RETURNING id, user_id
    `);

    console.log(`⏰ Marked ${result.rows.length} assignments as expired`);

    // Create notifications for expired assignments
    for (const assignment of result.rows) {
      await db.query(`
        INSERT INTO notifications (user_id, type, title_ar, title_en, message_ar, message_en, link)
        VALUES ($1, 'test_expired', 'انتهت مهلة التقييم', 'Assessment Expired',
                'انتهت مهلة أحد التقييمات المعينة لك', 'One of your assigned assessments has expired',
                '/assessments')
      `, [assignment.user_id]);
    }

    return { success: true, expired: result.rows.length };
  } catch (error) {
    console.error('❌ Mark expired assignments job failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Run all scheduled jobs
 */
async function runAllJobs() {
  console.log('\n====================================');
  console.log('🚀 Running all scheduled jobs...');
  console.log('====================================\n');

  const results = {
    reminders: await sendPendingTestReminders(),
    badges: await updateAllUserBadges(),
    expired: await markExpiredAssignments()
  };

  console.log('\n====================================');
  console.log('✅ All scheduled jobs completed');
  console.log('====================================\n');

  return results;
}

module.exports = {
  sendPendingTestReminders,
  updateAllUserBadges,
  markExpiredAssignments,
  runAllJobs
};

