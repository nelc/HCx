const nodemailer = require('nodemailer');

// Create reusable transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Base email template wrapper
 */
function getEmailTemplate(title, content) {
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f4f4f7;
          margin: 0;
          padding: 20px;
          direction: rtl;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
          background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
          padding: 40px 30px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 40px 30px;
        }
        .greeting {
          font-size: 18px;
          color: #1e293b;
          margin-bottom: 20px;
        }
        .message {
          color: #475569;
          line-height: 1.8;
          font-size: 16px;
          margin-bottom: 30px;
        }
        .highlight-box {
          background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
          border-radius: 12px;
          padding: 24px;
          margin: 20px 0;
          border-right: 4px solid #0ea5e9;
        }
        .highlight-box.success {
          background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
          border-right-color: #22c55e;
        }
        .highlight-box.warning {
          background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
          border-right-color: #f59e0b;
        }
        .highlight-box.badge {
          background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
          border-right-color: #8b5cf6;
        }
        .highlight-box.badge-removed {
          background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
          border-right-color: #ef4444;
        }
        .stat-value {
          font-size: 32px;
          font-weight: 700;
          color: #0ea5e9;
        }
        .stat-value.success {
          color: #22c55e;
        }
        .stat-label {
          font-size: 14px;
          color: #64748b;
          margin-top: 4px;
        }
        .button-container {
          text-align: center;
          margin: 30px 0;
        }
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          color: #ffffff !important;
          text-decoration: none;
          padding: 16px 40px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          box-shadow: 0 4px 14px rgba(139, 92, 246, 0.4);
        }
        .button.primary {
          background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
          box-shadow: 0 4px 14px rgba(14, 165, 233, 0.4);
        }
        .button.success {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          box-shadow: 0 4px 14px rgba(34, 197, 94, 0.4);
        }
        .note {
          background-color: #f8fafc;
          border-radius: 12px;
          padding: 20px;
          margin-top: 30px;
          font-size: 14px;
          color: #64748b;
        }
        .note-title {
          color: #475569;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .footer {
          background-color: #f8fafc;
          padding: 25px 30px;
          text-align: center;
          border-top: 1px solid #e2e8f0;
        }
        .footer p {
          color: #94a3b8;
          font-size: 13px;
          margin: 0;
        }
        .badge-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        .score-circle {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
          font-size: 24px;
          font-weight: bold;
        }
        .score-high { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; }
        .score-medium { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; }
        .score-low { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${title}</h1>
        </div>
        ${content}
        <div class="footer">
          <p>هذه رسالة آلية من نظام تقييم الاحتياجات التدريبية. يرجى عدم الرد عليها.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send invitation email to a new user
 * @param {string} email - Recipient email address
 * @param {string} name - User's name (Arabic)
 * @param {string} token - Invitation token
 * @returns {Promise<object>} - Email send result
 */
async function sendInvitationEmail(email, name, token) {
  const invitationLink = `${frontendUrl}/accept-invitation/${token}`;
  
  const mailOptions = {
    from: {
      name: 'نظام تقييم الاحتياجات التدريبية',
      address: process.env.GMAIL_USER,
    },
    to: email,
    subject: 'دعوة للانضمام إلى نظام تقييم الاحتياجات التدريبية',
    html: `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f4f4f7;
            margin: 0;
            padding: 20px;
            direction: rtl;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
            padding: 40px 30px;
            text-align: center;
          }
          .header h1 {
            color: #ffffff;
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }
          .content {
            padding: 40px 30px;
          }
          .greeting {
            font-size: 18px;
            color: #1e293b;
            margin-bottom: 20px;
          }
          .message {
            color: #475569;
            line-height: 1.8;
            font-size: 16px;
            margin-bottom: 30px;
          }
          .button-container {
            text-align: center;
            margin: 30px 0;
          }
          .button {
            display: inline-block;
            background-color: #8b5cf6;
            background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
            color: #ffffff !important;
            text-decoration: none;
            padding: 16px 40px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            box-shadow: 0 4px 14px rgba(139, 92, 246, 0.4);
          }
          .note {
            background-color: #f8fafc;
            border-radius: 12px;
            padding: 20px;
            margin-top: 30px;
            font-size: 14px;
            color: #64748b;
          }
          .note-title {
            color: #475569;
            font-weight: 600;
            margin-bottom: 8px;
          }
          .footer {
            background-color: #f8fafc;
            padding: 25px 30px;
            text-align: center;
            border-top: 1px solid #e2e8f0;
          }
          .footer p {
            color: #94a3b8;
            font-size: 13px;
            margin: 0;
          }
          .link-text {
            word-break: break-all;
            color: #0ea5e9;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>نظام تقييم الاحتياجات التدريبية</h1>
          </div>
          
          <div class="content">
            <p class="greeting">مرحباً ${name}،</p>
            
            <p class="message">
              تمت دعوتك للانضمام إلى نظام تقييم الاحتياجات التدريبية.
              <br><br>
              للبدء في استخدام النظام، يرجى النقر على الزر أدناه لإنشاء كلمة المرور الخاصة بك وتفعيل حسابك.
            </p>
            
            <div class="button-container">
              <a href="${invitationLink}" class="button" style="display: inline-block; background-color: #8b5cf6; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: #ffffff !important; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-size: 16px; font-weight: 600;">قبول الدعوة</a>
            </div>
            
            <div class="note">
              <p class="note-title">ملاحظة:</p>
              <p>هذه الدعوة صالحة لمدة 7 أيام. إذا لم تتمكن من النقر على الزر، يمكنك نسخ الرابط التالي ولصقه في متصفحك:</p>
              <p class="link-text">${invitationLink}</p>
            </div>
          </div>
          
          <div class="footer">
            <p>هذه رسالة آلية من نظام تقييم الاحتياجات التدريبية. يرجى عدم الرد عليها.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
مرحباً ${name}،

تمت دعوتك للانضمام إلى نظام تقييم الاحتياجات التدريبية.

للبدء في استخدام النظام، يرجى زيارة الرابط التالي لإنشاء كلمة المرور الخاصة بك وتفعيل حسابك:

${invitationLink}

ملاحظة: هذه الدعوة صالحة لمدة 7 أيام.

---
نظام تقييم الاحتياجات التدريبية
    `.trim(),
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log('Invitation email sent successfully to:', email);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Failed to send invitation email:', error);
    throw new Error(`Failed to send invitation email: ${error.message}`);
  }
}

/**
 * Verify email service configuration
 * @returns {Promise<boolean>} - True if configuration is valid
 */
async function verifyEmailConfig() {
  try {
    await transporter.verify();
    console.log('Email service configured successfully');
    return true;
  } catch (error) {
    console.error('Email service configuration error:', error);
    return false;
  }
}

/**
 * Send test assignment notification email
 * @param {string} email - Recipient email
 * @param {string} name - User's name
 * @param {object} testInfo - Test details {title_ar, title_en, due_date, duration_minutes}
 * @returns {Promise<object>}
 */
async function sendTestAssignedEmail(email, name, testInfo) {
  const assessmentLink = `${frontendUrl}/assessments`;
  const dueDate = testInfo.due_date ? new Date(testInfo.due_date).toLocaleDateString('ar-SA') : 'غير محدد';
  
  const content = `
    <div class="content">
      <p class="greeting">مرحباً ${name}،</p>
      
      <p class="message">
        تم تعيين تقييم جديد لك. يرجى إكماله في الوقت المحدد.
      </p>
      
      <div class="highlight-box">
        <h3 style="margin: 0 0 12px 0; color: #0284c7;">📋 ${testInfo.title_ar || testInfo.title_en}</h3>
        <p style="margin: 8px 0; color: #475569;">
          <strong>تاريخ الاستحقاق:</strong> ${dueDate}
        </p>
        ${testInfo.duration_minutes ? `
          <p style="margin: 8px 0; color: #475569;">
            <strong>المدة:</strong> ${testInfo.duration_minutes} دقيقة
          </p>
        ` : ''}
      </div>
      
      <div class="button-container">
        <a href="${assessmentLink}" class="button primary">بدء التقييم</a>
      </div>
      
      <div class="note">
        <p class="note-title">ملاحظة:</p>
        <p>يرجى إكمال التقييم قبل تاريخ الاستحقاق للحصول على أفضل النتائج والتوصيات.</p>
      </div>
    </div>
  `;

  const mailOptions = {
    from: {
      name: 'نظام تقييم الاحتياجات التدريبية',
      address: process.env.GMAIL_USER,
    },
    to: email,
    subject: `📋 تقييم جديد: ${testInfo.title_ar || testInfo.title_en}`,
    html: getEmailTemplate('تقييم جديد متاح', content),
    text: `مرحباً ${name}،\n\nتم تعيين تقييم جديد لك: ${testInfo.title_ar || testInfo.title_en}\nتاريخ الاستحقاق: ${dueDate}\n\nيرجى زيارة النظام لإكمال التقييم: ${assessmentLink}\n\n---\nنظام تقييم الاحتياجات التدريبية`,
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log('Test assigned email sent to:', email);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Failed to send test assigned email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send course completion congratulation email
 * @param {string} email - Recipient email
 * @param {string} name - User's name
 * @param {object} courseInfo - Course details {name_ar, name_en, provider}
 * @returns {Promise<object>}
 */
async function sendCourseCompletedEmail(email, name, courseInfo) {
  const dashboardLink = `${frontendUrl}/dashboard`;
  
  const content = `
    <div class="content">
      <p class="greeting">مرحباً ${name}،</p>
      
      <p class="message">
        تهانينا! 🎉 لقد أكملت دورة تدريبية بنجاح.
      </p>
      
      <div class="highlight-box success" style="text-align: center;">
        <div style="font-size: 48px; margin-bottom: 16px;">🎓</div>
        <h3 style="margin: 0 0 12px 0; color: #16a34a;">${courseInfo.name_ar || courseInfo.name_en}</h3>
        ${courseInfo.provider ? `
          <p style="margin: 0; color: #475569; font-size: 14px;">
            المزود: ${courseInfo.provider}
          </p>
        ` : ''}
      </div>
      
      <p class="message">
        نحن فخورون بإنجازك! استمر في تطوير مهاراتك واستكشاف المزيد من الدورات التدريبية.
      </p>
      
      <div class="button-container">
        <a href="${dashboardLink}" class="button success">عرض إنجازاتي</a>
      </div>
    </div>
  `;

  const mailOptions = {
    from: {
      name: 'نظام تقييم الاحتياجات التدريبية',
      address: process.env.GMAIL_USER,
    },
    to: email,
    subject: `🎉 تهانينا! أكملت دورة: ${courseInfo.name_ar || courseInfo.name_en}`,
    html: getEmailTemplate('تهانينا على إكمال الدورة!', content),
    text: `مرحباً ${name}،\n\nتهانينا! 🎉 لقد أكملت دورة "${courseInfo.name_ar || courseInfo.name_en}" بنجاح.\n\nاستمر في تطوير مهاراتك!\n\n---\nنظام تقييم الاحتياجات التدريبية`,
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log('Course completed email sent to:', email);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Failed to send course completed email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send test submission results email
 * @param {string} email - Recipient email
 * @param {string} name - User's name
 * @param {object} resultInfo - Result details {test_title_ar, test_title_en, percentage, total_score, max_score}
 * @returns {Promise<object>}
 */
async function sendTestResultsEmail(email, name, resultInfo) {
  const resultsLink = `${frontendUrl}/my-results`;
  const percentage = Math.round(resultInfo.percentage || 0);
  
  let scoreClass = 'score-low';
  let feedbackMessage = 'يمكنك تحسين أدائك من خلال الدورات التدريبية الموصى بها.';
  
  if (percentage >= 80) {
    scoreClass = 'score-high';
    feedbackMessage = 'أداء ممتاز! استمر في التميز.';
  } else if (percentage >= 60) {
    scoreClass = 'score-medium';
    feedbackMessage = 'أداء جيد! يمكنك تحسين بعض المهارات.';
  }
  
  const content = `
    <div class="content">
      <p class="greeting">مرحباً ${name}،</p>
      
      <p class="message">
        تم تقييم نتائج اختبارك بنجاح. إليك ملخص النتائج:
      </p>
      
      <div class="highlight-box" style="text-align: center;">
        <h3 style="margin: 0 0 20px 0; color: #0284c7;">${resultInfo.test_title_ar || resultInfo.test_title_en}</h3>
        <div class="score-circle ${scoreClass}">
          ${percentage}%
        </div>
        <p style="margin: 16px 0 0 0; color: #475569; font-size: 16px;">
          ${feedbackMessage}
        </p>
      </div>
      
      <div class="button-container">
        <a href="${resultsLink}" class="button primary">عرض التفاصيل</a>
      </div>
      
      <div class="note">
        <p class="note-title">التوصيات:</p>
        <p>بناءً على نتائجك، تم إعداد توصيات تدريبية مخصصة لك. يمكنك الاطلاع عليها من لوحة التحكم.</p>
      </div>
    </div>
  `;

  const mailOptions = {
    from: {
      name: 'نظام تقييم الاحتياجات التدريبية',
      address: process.env.GMAIL_USER,
    },
    to: email,
    subject: `📊 نتائج التقييم: ${resultInfo.test_title_ar || resultInfo.test_title_en} - ${percentage}%`,
    html: getEmailTemplate('نتائج التقييم', content),
    text: `مرحباً ${name}،\n\nتم تقييم نتائج اختبارك "${resultInfo.test_title_ar || resultInfo.test_title_en}".\n\nالنتيجة: ${percentage}%\n\nلمشاهدة التفاصيل: ${resultsLink}\n\n---\nنظام تقييم الاحتياجات التدريبية`,
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log('Test results email sent to:', email);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Failed to send test results email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send badge awarded notification email
 * @param {string} email - Recipient email
 * @param {string} name - User's name
 * @param {object} badgeInfo - Badge details {title_ar, title_en, description_ar, icon, color}
 * @returns {Promise<object>}
 */
async function sendBadgeAwardedEmail(email, name, badgeInfo) {
  const dashboardLink = `${frontendUrl}/dashboard`;
  
  const badgeEmojis = {
    trophy: '🏆',
    medal: '🥇',
    star: '⭐',
    clipboard: '📋',
    fire: '🔥',
    academic: '🎓',
    'trending-up': '📈',
    book: '📚',
    spark: '✨',
    default: '🏅'
  };
  
  const badgeEmoji = badgeEmojis[badgeInfo.icon] || badgeEmojis.default;
  
  const content = `
    <div class="content">
      <p class="greeting">مرحباً ${name}،</p>
      
      <p class="message">
        تهانينا! 🎊 لقد حصلت على وسام جديد تقديراً لإنجازاتك.
      </p>
      
      <div class="highlight-box badge" style="text-align: center;">
        <div class="badge-icon">${badgeEmoji}</div>
        <h3 style="margin: 0 0 12px 0; color: #7c3aed;">${badgeInfo.title_ar || badgeInfo.title_en}</h3>
        <p style="margin: 0; color: #475569;">
          ${badgeInfo.description_ar || badgeInfo.description_en || 'وسام تقدير لإنجازاتك المتميزة'}
        </p>
      </div>
      
      <p class="message">
        نحن فخورون بإنجازك! استمر في التميز والتطوير.
      </p>
      
      <div class="button-container">
        <a href="${dashboardLink}" class="button">عرض جميع الأوسمة</a>
      </div>
    </div>
  `;

  const mailOptions = {
    from: {
      name: 'نظام تقييم الاحتياجات التدريبية',
      address: process.env.GMAIL_USER,
    },
    to: email,
    subject: `${badgeEmoji} وسام جديد: ${badgeInfo.title_ar || badgeInfo.title_en}`,
    html: getEmailTemplate('تهانينا! وسام جديد', content),
    text: `مرحباً ${name}،\n\nتهانينا! 🎊 لقد حصلت على وسام جديد: ${badgeInfo.title_ar || badgeInfo.title_en}\n\n${badgeInfo.description_ar || ''}\n\n---\nنظام تقييم الاحتياجات التدريبية`,
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log('Badge awarded email sent to:', email);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Failed to send badge awarded email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send badge revoked notification email
 * @param {string} email - Recipient email
 * @param {string} name - User's name
 * @param {object} badgeInfo - Badge details {title_ar, title_en, reason_ar}
 * @returns {Promise<object>}
 */
async function sendBadgeRevokedEmail(email, name, badgeInfo) {
  const dashboardLink = `${frontendUrl}/dashboard`;
  
  const content = `
    <div class="content">
      <p class="greeting">مرحباً ${name}،</p>
      
      <p class="message">
        نود إعلامك بأنه تم سحب أحد الأوسمة من حسابك.
      </p>
      
      <div class="highlight-box badge-removed" style="text-align: center;">
        <div class="badge-icon">🏅</div>
        <h3 style="margin: 0 0 12px 0; color: #dc2626;">${badgeInfo.title_ar || badgeInfo.title_en}</h3>
        ${badgeInfo.reason_ar ? `
          <p style="margin: 0; color: #475569;">
            السبب: ${badgeInfo.reason_ar}
          </p>
        ` : ''}
      </div>
      
      <p class="message">
        لا تقلق! يمكنك استعادة هذا الوسام من خلال تحسين أدائك واستكمال المزيد من التقييمات والدورات التدريبية.
      </p>
      
      <div class="button-container">
        <a href="${dashboardLink}" class="button primary">تحسين أدائي</a>
      </div>
    </div>
  `;

  const mailOptions = {
    from: {
      name: 'نظام تقييم الاحتياجات التدريبية',
      address: process.env.GMAIL_USER,
    },
    to: email,
    subject: `إشعار: تم سحب وسام ${badgeInfo.title_ar || badgeInfo.title_en}`,
    html: getEmailTemplate('تحديث على الأوسمة', content),
    text: `مرحباً ${name}،\n\nنود إعلامك بأنه تم سحب وسام "${badgeInfo.title_ar || badgeInfo.title_en}" من حسابك.\n\n${badgeInfo.reason_ar ? `السبب: ${badgeInfo.reason_ar}` : ''}\n\nيمكنك استعادة هذا الوسام من خلال تحسين أدائك.\n\n---\nنظام تقييم الاحتياجات التدريبية`,
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log('Badge revoked email sent to:', email);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Failed to send badge revoked email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send pending test reminder email (for tests pending 7+ days)
 * @param {string} email - Recipient email
 * @param {string} name - User's name
 * @param {object} testInfo - Test details {title_ar, title_en, due_date, days_pending, assignment_id}
 * @returns {Promise<object>}
 */
async function sendTestReminderEmail(email, name, testInfo) {
  const assessmentLink = `${frontendUrl}/assessments`;
  const dueDate = testInfo.due_date ? new Date(testInfo.due_date).toLocaleDateString('ar-SA') : 'غير محدد';
  
  const content = `
    <div class="content">
      <p class="greeting">مرحباً ${name}،</p>
      
      <p class="message">
        نود تذكيرك بأن لديك تقييماً معلقاً منذ ${testInfo.days_pending} يوم. يرجى إكماله في أقرب وقت ممكن.
      </p>
      
      <div class="highlight-box warning">
        <h3 style="margin: 0 0 12px 0; color: #d97706;">⏰ تذكير: ${testInfo.title_ar || testInfo.title_en}</h3>
        <p style="margin: 8px 0; color: #475569;">
          <strong>معلق منذ:</strong> ${testInfo.days_pending} يوم
        </p>
        <p style="margin: 8px 0; color: #475569;">
          <strong>تاريخ الاستحقاق:</strong> ${dueDate}
        </p>
      </div>
      
      <p class="message">
        إكمال التقييمات في الوقت المحدد يساعدك في الحصول على توصيات تدريبية أفضل وتحسين مستواك المهني.
      </p>
      
      <div class="button-container">
        <a href="${assessmentLink}" class="button primary">إكمال التقييم الآن</a>
      </div>
    </div>
  `;

  const mailOptions = {
    from: {
      name: 'نظام تقييم الاحتياجات التدريبية',
      address: process.env.GMAIL_USER,
    },
    to: email,
    subject: `⏰ تذكير: لديك تقييم معلق - ${testInfo.title_ar || testInfo.title_en}`,
    html: getEmailTemplate('تذكير بتقييم معلق', content),
    text: `مرحباً ${name}،\n\nتذكير: لديك تقييم معلق منذ ${testInfo.days_pending} يوم.\n\nالتقييم: ${testInfo.title_ar || testInfo.title_en}\nتاريخ الاستحقاق: ${dueDate}\n\nيرجى إكماله من خلال: ${assessmentLink}\n\n---\nنظام تقييم الاحتياجات التدريبية`,
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log('Test reminder email sent to:', email);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Failed to send test reminder email:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendInvitationEmail,
  verifyEmailConfig,
  sendTestAssignedEmail,
  sendCourseCompletedEmail,
  sendTestResultsEmail,
  sendBadgeAwardedEmail,
  sendBadgeRevokedEmail,
  sendTestReminderEmail,
};
