const express = require('express');
const db = require('../db');
const { authenticate, isAdmin, isTrainingOfficer } = require('../middleware/auth');
const { sendPendingTestReminders, updateAllUserBadges, markExpiredAssignments, runAllJobs } = require('../services/scheduledJobs');

const router = express.Router();

// Get my notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const { unread_only, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT * FROM notifications
      WHERE user_id = $1
    `;
    const params = [req.user.id];
    
    if (unread_only === 'true') {
      query += ' AND is_read = false';
    }
    
    query += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    // Get unread count
    const unreadCount = await db.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );
    
    res.json({
      notifications: result.rows,
      unread_count: parseInt(unreadCount.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// Mark notification as read
router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      UPDATE notifications
      SET is_read = true, read_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [req.params.id, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.post('/mark-all-read', authenticate, async (req, res) => {
  try {
    await db.query(`
      UPDATE notifications
      SET is_read = true, read_at = NOW()
      WHERE user_id = $1 AND is_read = false
    `, [req.user.id]);
    
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// Delete notification
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Delete all read notifications
router.delete('/clear/read', authenticate, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM notifications WHERE user_id = $1 AND is_read = true',
      [req.user.id]
    );
    
    res.json({ message: 'Read notifications cleared' });
  } catch (error) {
    console.error('Clear notifications error:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

// ==========================================
// ADMIN: Scheduled Jobs Management
// ==========================================

// Send test reminders for pending tests (7+ days)
router.post('/admin/send-reminders', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    console.log('📧 Admin triggered: Send pending test reminders');
    const result = await sendPendingTestReminders();
    res.json({
      message: 'تم إرسال التذكيرات',
      ...result
    });
  } catch (error) {
    console.error('Send reminders error:', error);
    res.status(500).json({ error: 'Failed to send reminders' });
  }
});

// Update badges for all users
router.post('/admin/update-badges', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    console.log('🏅 Admin triggered: Update all user badges');
    const result = await updateAllUserBadges();
    res.json({
      message: 'تم تحديث الأوسمة',
      ...result
    });
  } catch (error) {
    console.error('Update badges error:', error);
    res.status(500).json({ error: 'Failed to update badges' });
  }
});

// Mark expired assignments
router.post('/admin/mark-expired', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    console.log('⏰ Admin triggered: Mark expired assignments');
    const result = await markExpiredAssignments();
    res.json({
      message: 'تم تحديث التقييمات المنتهية',
      ...result
    });
  } catch (error) {
    console.error('Mark expired error:', error);
    res.status(500).json({ error: 'Failed to mark expired assignments' });
  }
});

// Run all scheduled jobs
router.post('/admin/run-all-jobs', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    console.log('🚀 Admin triggered: Run all scheduled jobs');
    const results = await runAllJobs();
    res.json({
      message: 'تم تنفيذ جميع المهام المجدولة',
      results
    });
  } catch (error) {
    console.error('Run all jobs error:', error);
    res.status(500).json({ error: 'Failed to run scheduled jobs' });
  }
});

// Get email notification statistics
router.get('/admin/stats', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    // Get pending tests awaiting reminders
    const pendingReminders = await db.query(`
      SELECT COUNT(*) as count
      FROM test_assignments
      WHERE status = 'pending'
        AND created_at <= NOW() - INTERVAL '7 days'
        AND (email_reminder_sent = false OR email_reminder_sent IS NULL)
    `);

    // Get badge statistics
    const badgeStats = await db.query(`
      SELECT 
        badge_id,
        COUNT(*) as active_count
      FROM user_badges
      WHERE status = 'active'
      GROUP BY badge_id
      ORDER BY active_count DESC
    `);

    // Get recent notification counts by type
    const notificationStats = await db.query(`
      SELECT 
        type,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE is_read = false) as unread_count
      FROM notifications
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY type
      ORDER BY count DESC
    `);

    // Get email reminder history
    const reminderHistory = await db.query(`
      SELECT 
        DATE(last_reminder_at) as date,
        COUNT(*) as reminders_sent
      FROM test_assignments
      WHERE last_reminder_at IS NOT NULL
        AND last_reminder_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(last_reminder_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    res.json({
      pending_reminders: parseInt(pendingReminders.rows[0]?.count || 0),
      badge_distribution: badgeStats.rows,
      notification_stats: notificationStats.rows,
      reminder_history: reminderHistory.rows
    });
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({ error: 'Failed to get notification stats' });
  }
});

module.exports = router;

