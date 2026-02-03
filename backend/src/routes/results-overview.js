const express = require('express');
const db = require('../db');
const { authenticate, isTrainingOfficer } = require('../middleware/auth');

const router = express.Router();

// Get all results with filters (admin and training_officer only)
router.get('/', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { department_id, test_id, search } = req.query;
    
    let query = `
      SELECT 
        ta.id as assignment_id,
        u.id as user_id,
        u.name_ar as employee_name,
        u.employee_number,
        d.name_ar as department_name,
        d.id as department_id,
        t.id as test_id,
        t.title_ar as test_name,
        ar.overall_score as grade,
        ar.id as analysis_id,
        ar.analyzed_at,
        ta.completed_at,
        -- Check for open_text questions needing grading
        (
          SELECT COUNT(*) FROM responses r
          JOIN questions q ON r.question_id = q.id
          WHERE r.assignment_id = ta.id
          AND q.question_type = 'open_text'
          AND r.score IS NULL
        ) as ungraded_open_questions,
        -- Get total open_text questions
        (
          SELECT COUNT(*) FROM responses r
          JOIN questions q ON r.question_id = q.id
          WHERE r.assignment_id = ta.id
          AND q.question_type = 'open_text'
        ) as total_open_questions
      FROM test_assignments ta
      JOIN users u ON ta.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      JOIN tests t ON ta.test_id = t.id
      LEFT JOIN analysis_results ar ON ta.id = ar.assignment_id
      WHERE ta.status = 'completed'
    `;
    
    const params = [];
    let paramCount = 1;
    
    // Filter by department
    if (department_id) {
      query += ` AND u.department_id = $${paramCount}`;
      params.push(department_id);
      paramCount++;
    }
    
    // Filter by test
    if (test_id) {
      query += ` AND t.id = $${paramCount}`;
      params.push(test_id);
      paramCount++;
    }
    
    // Search by employee name
    if (search) {
      query += ` AND (u.name_ar ILIKE $${paramCount} OR u.name_en ILIKE $${paramCount} OR u.employee_number ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }
    
    query += ' ORDER BY ta.completed_at DESC';
    
    const result = await db.query(query, params);
    
    // Calculate actual grade based on weighted responses
    const resultsWithCorrectGrade = await Promise.all(result.rows.map(async (row) => {
      // Get weighted score breakdown
      const responsesData = await db.query(`
        SELECT 
          r.score,
          q.question_type,
          q.options,
          q.weight
        FROM responses r
        JOIN questions q ON r.question_id = q.id
        WHERE r.assignment_id = $1
      `, [row.assignment_id]);
      
      let totalScore = 0;
      let totalMaxScore = 0;
      
      for (const response of responsesData.rows) {
        let maxScore = 10;
        
        if (response.question_type === 'mcq' && response.options && Array.isArray(response.options) && response.options.length > 0) {
          const optionScores = response.options.map(o => parseFloat(o.score) || 0);
          maxScore = Math.max(...optionScores, 10);
        } else if (response.question_type === 'likert_scale' || response.question_type === 'self_rating') {
          maxScore = 10;
        } else if (response.question_type === 'open_text') {
          maxScore = 10;
        }
        
        const weight = parseFloat(response.weight) || 1;
        const score = parseFloat(response.score) || 0;
        
        totalScore += score * weight;
        totalMaxScore += maxScore * weight;
      }
      
      const calculatedGrade = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;
      
      return {
        ...row,
        grade: calculatedGrade,
        needs_grading: parseInt(row.ungraded_open_questions) > 0,
        ungraded_count: parseInt(row.ungraded_open_questions),
        total_open_questions: parseInt(row.total_open_questions)
      };
    }));
    
    res.json(resultsWithCorrectGrade);
  } catch (error) {
    console.error('Get results overview error:', error);
    res.status(500).json({ error: 'Failed to get results overview' });
  }
});

// Get filter options (departments and tests)
router.get('/filters', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    // Get all departments
    const departments = await db.query(`
      SELECT DISTINCT d.id, d.name_ar
      FROM departments d
      JOIN users u ON d.id = u.department_id
      JOIN test_assignments ta ON u.id = ta.user_id
      WHERE ta.status = 'completed'
      ORDER BY d.name_ar
    `);
    
    // Get all tests that have completed assignments
    const tests = await db.query(`
      SELECT DISTINCT t.id, t.title_ar
      FROM tests t
      JOIN test_assignments ta ON t.id = ta.test_id
      WHERE ta.status = 'completed'
      ORDER BY t.title_ar
    `);
    
    res.json({
      departments: departments.rows,
      tests: tests.rows
    });
  } catch (error) {
    console.error('Get filter options error:', error);
    res.status(500).json({ error: 'Failed to get filter options' });
  }
});

// Recalculate grade for an assignment after grading open questions
router.post('/recalculate/:assignmentId', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { assignmentId } = req.params;
    
    // Verify assignment exists
    const assignment = await db.query(
      'SELECT id FROM test_assignments WHERE id = $1 AND status = $2',
      [assignmentId, 'completed']
    );
    
    if (assignment.rows.length === 0) {
      return res.status(404).json({ error: 'Completed assignment not found' });
    }
    
    // Get weighted score breakdown
    const responsesData = await db.query(`
      SELECT 
        r.score,
        q.question_type,
        q.options,
        q.weight
      FROM responses r
      JOIN questions q ON r.question_id = q.id
      WHERE r.assignment_id = $1
    `, [assignmentId]);
    
    let totalScore = 0;
    let totalMaxScore = 0;
    
    for (const response of responsesData.rows) {
      let maxScore = 10;
      
      if (response.question_type === 'mcq' && response.options && Array.isArray(response.options) && response.options.length > 0) {
        const optionScores = response.options.map(o => parseFloat(o.score) || 0);
        maxScore = Math.max(...optionScores, 10);
      } else if (response.question_type === 'likert_scale' || response.question_type === 'self_rating') {
        maxScore = 10;
      } else if (response.question_type === 'open_text') {
        maxScore = 10;
      }
      
      const weight = parseFloat(response.weight) || 1;
      const score = parseFloat(response.score) || 0;
      
      totalScore += score * weight;
      totalMaxScore += maxScore * weight;
    }
    
    const newGrade = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;
    
    // Update analysis_results with new grade
    await db.query(`
      UPDATE analysis_results 
      SET overall_score = $1, updated_at = NOW()
      WHERE assignment_id = $2
    `, [newGrade, assignmentId]);
    
    res.json({ 
      message: 'Grade recalculated successfully',
      new_grade: newGrade,
      total_score: Math.round(totalScore * 10) / 10,
      max_score: Math.round(totalMaxScore * 10) / 10
    });
  } catch (error) {
    console.error('Recalculate grade error:', error);
    res.status(500).json({ error: 'Failed to recalculate grade' });
  }
});

// Helper function to escape CSV values
const escapeCSV = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

// Helper function to format date for CSV
const formatDateForCSV = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Helper function to calculate grade for an assignment
const calculateGradeForAssignment = async (assignmentId) => {
  const responsesData = await db.query(`
    SELECT 
      r.score,
      q.question_type,
      q.options,
      q.weight
    FROM responses r
    JOIN questions q ON r.question_id = q.id
    WHERE r.assignment_id = $1
  `, [assignmentId]);
  
  let totalScore = 0;
  let totalMaxScore = 0;
  
  for (const response of responsesData.rows) {
    let maxScore = 10;
    
    if (response.question_type === 'mcq' && response.options && Array.isArray(response.options) && response.options.length > 0) {
      const optionScores = response.options.map(o => parseFloat(o.score) || 0);
      maxScore = Math.max(...optionScores, 10);
    } else if (response.question_type === 'likert_scale' || response.question_type === 'self_rating') {
      maxScore = 10;
    } else if (response.question_type === 'open_text') {
      maxScore = 10;
    }
    
    const weight = parseFloat(response.weight) || 1;
    const score = parseFloat(response.score) || 0;
    
    totalScore += score * weight;
    totalMaxScore += maxScore * weight;
  }
  
  return totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;
};

// Export all user results as CSV
router.get('/export/users-results', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        ta.id as assignment_id,
        u.name_ar as employee_name,
        d.name_ar as department_name,
        t.title_ar as test_name,
        ta.completed_at
      FROM test_assignments ta
      JOIN users u ON ta.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      JOIN tests t ON ta.test_id = t.id
      WHERE ta.status = 'completed'
      ORDER BY ta.completed_at DESC
    `);
    
    // Calculate grades for each result
    const resultsWithGrades = await Promise.all(result.rows.map(async (row) => {
      const grade = await calculateGradeForAssignment(row.assignment_id);
      return { ...row, grade };
    }));
    
    // Build CSV
    const headers = ['اسم الموظف', 'القسم', 'اسم التقييم', 'الدرجة', 'تاريخ الإكمال'];
    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel
    csvContent += headers.map(escapeCSV).join(',') + '\r\n';
    
    resultsWithGrades.forEach(row => {
      const values = [
        row.employee_name || 'غير محدد',
        row.department_name || 'غير محدد',
        row.test_name,
        `${row.grade}%`,
        formatDateForCSV(row.completed_at)
      ];
      csvContent += values.map(escapeCSV).join(',') + '\r\n';
    });
    
    const filename = `نتائج-الموظفين-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Export users results error:', error);
    res.status(500).json({ error: 'Failed to export users results' });
  }
});

// Export tests summary as CSV
router.get('/export/tests-summary', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    // Get all tests with their assignment statistics
    const result = await db.query(`
      SELECT 
        t.id as test_id,
        t.title_ar as test_name,
        COUNT(ta.id) as total_assigned,
        COUNT(CASE WHEN ta.status = 'completed' THEN 1 END) as total_completed
      FROM tests t
      LEFT JOIN test_assignments ta ON t.id = ta.test_id
      GROUP BY t.id, t.title_ar
      ORDER BY t.title_ar
    `);
    
    // Calculate average grade for each test
    const testsWithAverages = await Promise.all(result.rows.map(async (test) => {
      // Get all completed assignments for this test
      const completedAssignments = await db.query(`
        SELECT ta.id as assignment_id
        FROM test_assignments ta
        WHERE ta.test_id = $1 AND ta.status = 'completed'
      `, [test.test_id]);
      
      if (completedAssignments.rows.length === 0) {
        return { ...test, average_grade: 0 };
      }
      
      // Calculate grades for all completed assignments
      let totalGrade = 0;
      for (const assignment of completedAssignments.rows) {
        const grade = await calculateGradeForAssignment(assignment.assignment_id);
        totalGrade += grade;
      }
      
      const averageGrade = Math.round(totalGrade / completedAssignments.rows.length);
      return { ...test, average_grade: averageGrade };
    }));
    
    // Build CSV
    const headers = ['اسم التقييم', 'عدد المكلفين', 'عدد المنجزين', 'متوسط الدرجات'];
    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel
    csvContent += headers.map(escapeCSV).join(',') + '\r\n';
    
    testsWithAverages.forEach(row => {
      const values = [
        row.test_name,
        row.total_assigned,
        row.total_completed,
        `${row.average_grade}%`
      ];
      csvContent += values.map(escapeCSV).join(',') + '\r\n';
    });
    
    const filename = `ملخص-التقييمات-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Export tests summary error:', error);
    res.status(500).json({ error: 'Failed to export tests summary' });
  }
});

// Export filtered results as CSV
router.get('/export/filtered', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { department_id, test_id, search } = req.query;
    
    let query = `
      SELECT 
        ta.id as assignment_id,
        u.name_ar as employee_name,
        u.employee_number,
        d.name_ar as department_name,
        t.title_ar as test_name,
        ta.completed_at,
        (
          SELECT COUNT(*) FROM responses r
          JOIN questions q ON r.question_id = q.id
          WHERE r.assignment_id = ta.id
          AND q.question_type = 'open_text'
          AND r.score IS NULL
        ) as ungraded_open_questions,
        (
          SELECT COUNT(*) FROM responses r
          JOIN questions q ON r.question_id = q.id
          WHERE r.assignment_id = ta.id
          AND q.question_type = 'open_text'
        ) as total_open_questions
      FROM test_assignments ta
      JOIN users u ON ta.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      JOIN tests t ON ta.test_id = t.id
      WHERE ta.status = 'completed'
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (department_id) {
      query += ` AND u.department_id = $${paramCount}`;
      params.push(department_id);
      paramCount++;
    }
    
    if (test_id) {
      query += ` AND t.id = $${paramCount}`;
      params.push(test_id);
      paramCount++;
    }
    
    if (search) {
      query += ` AND (u.name_ar ILIKE $${paramCount} OR u.name_en ILIKE $${paramCount} OR u.employee_number ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }
    
    query += ' ORDER BY ta.completed_at DESC';
    
    const result = await db.query(query, params);
    
    // Calculate grades and grading status for each result
    const resultsWithDetails = await Promise.all(result.rows.map(async (row) => {
      const grade = await calculateGradeForAssignment(row.assignment_id);
      const needsGrading = parseInt(row.ungraded_open_questions) > 0;
      const hasOpenQuestions = parseInt(row.total_open_questions) > 0;
      
      let gradingStatus = 'لا يوجد أسئلة مفتوحة';
      if (hasOpenQuestions) {
        gradingStatus = needsGrading ? 'يحتاج تقييم' : 'تم التقييم';
      }
      
      return { ...row, grade, grading_status: gradingStatus };
    }));
    
    // Build CSV
    const headers = ['اسم الموظف', 'رقم الموظف', 'القسم', 'اسم التقييم', 'الدرجة', 'حالة التقييم', 'تاريخ الإكمال'];
    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel
    csvContent += headers.map(escapeCSV).join(',') + '\r\n';
    
    resultsWithDetails.forEach(row => {
      const values = [
        row.employee_name || 'غير محدد',
        row.employee_number || 'غير محدد',
        row.department_name || 'غير محدد',
        row.test_name,
        `${row.grade}%`,
        row.grading_status,
        formatDateForCSV(row.completed_at)
      ];
      csvContent += values.map(escapeCSV).join(',') + '\r\n';
    });
    
    const filename = `نتائج-مفلترة-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Export filtered results error:', error);
    res.status(500).json({ error: 'Failed to export filtered results' });
  }
});

// Delete a result (completed assignment) with all related data
router.delete('/:assignmentId', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { assignmentId } = req.params;
    
    // Verify assignment exists and is completed
    const assignment = await db.query(
      'SELECT id, user_id, test_id FROM test_assignments WHERE id = $1 AND status = $2',
      [assignmentId, 'completed']
    );
    
    if (assignment.rows.length === 0) {
      return res.status(404).json({ error: 'Completed assignment not found' });
    }
    
    // Delete in order: analysis_results -> responses -> test_assignments
    // This handles the foreign key constraints
    
    // 1. Delete analysis results
    await db.query('DELETE FROM analysis_results WHERE assignment_id = $1', [assignmentId]);
    
    // 2. Delete responses
    await db.query('DELETE FROM responses WHERE assignment_id = $1', [assignmentId]);
    
    // 3. Delete the test assignment
    await db.query('DELETE FROM test_assignments WHERE id = $1', [assignmentId]);
    
    res.json({ message: 'Result deleted successfully' });
  } catch (error) {
    console.error('Delete result error:', error);
    res.status(500).json({ error: 'Failed to delete result' });
  }
});

module.exports = router;
