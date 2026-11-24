import { prisma } from '../db.js'
import { computeGrade, defaultScales } from '../utils.js'

const round2 = (n) => Math.round(n * 100) / 100

export async function computeClassroomGrades(classroomId) {
  const classroom = await prisma.classroom.findUnique({
    where: { id: Number(classroomId) },
    include: { gradeScales: true },
  })
  if (!classroom) return null
  const scales = classroom.gradeScales.length ? classroom.gradeScales : defaultScales
  const [enrollments, assignments, submissions, records] = await Promise.all([
    prisma.enrollment.findMany({
      where: { classroomId: classroom.id },
      include: { user: { select: { id: true, studentId: true, firstName: true, lastName: true } } },
      orderBy: { user: { studentId: 'asc' } },
    }),
    prisma.assignment.findMany({ where: { classroomId: classroom.id }, select: { id: true, maxScore: true, bonusScore: true } }),
    prisma.submission.findMany({
      where: { assignment: { classroomId: classroom.id }, status: 'GRADED', score: { not: null } },
      select: { assignmentId: true, userId: true, score: true },
      orderBy: { attempt: 'desc' },
    }),
    prisma.gradeRecord.findMany({ where: { classroomId: classroom.id } }),
  ])

  const assignmentMax = assignments.reduce((sum, a) => sum + Number(a.maxScore) + Number(a.bonusScore), 0)
  const latestScore = new Map()
  for (const s of submissions) if (!latestScore.has(`${s.assignmentId}:${s.userId}`)) latestScore.set(`${s.assignmentId}:${s.userId}`, s.score)

  const weights = {
    ASSIGNMENT: classroom.weightAssignment,
    COLLECTION: classroom.weightCollection,
    MIDTERM: classroom.weightMidterm,
    FINAL: classroom.weightFinal,
    ACTIVITY: classroom.weightActivity,
    BONUS: classroom.weightBonus,
  }

  return enrollments.map(({ user }) => {
    const assignmentRaw = round2(assignments.reduce((sum, a) => sum + (latestScore.get(`${a.id}:${user.id}`) || 0), 0))
    const assignmentWeighted = assignmentMax > 0 ? round2((assignmentRaw / assignmentMax) * weights.ASSIGNMENT) : 0
    const categories = {}
    let other = 0
    for (const category of ['COLLECTION', 'MIDTERM', 'FINAL', 'ACTIVITY', 'BONUS']) {
      const rec = records.find((r) => r.userId === user.id && r.category === category)
      let value = 0
      if (rec) {
        value = rec.maxScore && rec.maxScore > 0
          ? (rec.score / rec.maxScore) * weights[category]
          : Math.min(rec.score, weights[category] || Infinity)
      }
      value = category === 'BONUS' ? round2(value) : round2(Math.min(value, weights[category]))
      categories[category] = value
      if (category !== 'BONUS') other += value
      else other += value
    }
    const total = round2(Math.min(100, assignmentWeighted + other))
    return {
      studentId: user.studentId, id: user.id,
      firstName: user.firstName, lastName: user.lastName,
      assignmentRaw, assignmentWeighted,
      categories, total,
      grade: computeGrade(total, scales),
      passed: total >= 50,
    }
  })
}
