import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth } from './auth.js'
import { asyncHandler, ok, bangkokDateKey, safeJson } from '../utils.js'
import { computeClassroomGrades } from '../services/grading.js'
import { getMissedAssignments } from '../services/missed.js'

export const dashboardRouter = Router()
dashboardRouter.use(requireAuth)

const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

dashboardRouter.get('/', asyncHandler(async (req, res) => {
  const user = req.user

  if (user.role === 'STUDENT') {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: user.id },
      include: { classroom: { include: { teacher: { select: { firstName: true, lastName: true } } } } },
    })
    const classroomIds = enrollments.map((e) => e.classroomId)
    const today = bangkokDateKey()
    const [attendance, assignments, submissions, announcements, notifications, missed] = await Promise.all([
      prisma.attendance.findMany({ where: { userId: user.id, date: today } }),
      prisma.assignment.findMany({
        where: { classroomId: { in: classroomIds } },
        include: { classroom: { select: { id: true, name: true, subject: true } } },
        orderBy: { dueAt: 'asc' },
      }),
      prisma.submission.findMany({ where: { userId: user.id }, orderBy: { attempt: 'desc' } }),
      prisma.announcement.findMany({
        where: { classroomId: { in: classroomIds } },
        include: { classroom: { select: { name: true } }, author: { select: { firstName: true, lastName: true } } },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], take: 5,
      }),
      prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
      getMissedAssignments(user.id),
    ])
    const latestSubmission = new Map()
    for (const s of submissions) if (!latestSubmission.has(s.assignmentId)) latestSubmission.set(s.assignmentId, s)
    const now = new Date()
    const upcoming = assignments.filter((a) => new Date(a.dueAt) >= now).slice(0, 6)
    const pending = assignments.filter((a) => !latestSubmission.has(a.id) && new Date(a.dueAt) >= now)
    const graded = assignments.filter((a) => latestSubmission.get(a.id)?.status === 'GRADED').slice(0, 6)
    const gradeResults = await Promise.all(classroomIds.map((id) => computeClassroomGrades(id)))
    const mine = gradeResults.map((list) => list?.find((r) => r.id === user.id)).filter(Boolean)
    const average = mine.length ? Math.round((mine.reduce((a, b) => a + b.total, 0) / mine.length) * 100) / 100 : 0
    return ok(res, {
      role: 'STUDENT',
      classrooms: enrollments.map((e) => ({
        id: e.classroom.id, name: e.classroom.name, subject: e.classroom.subject,
        teacher: e.classroom.teacher, joinCode: undefined,
      })),
      todayAttendance: attendance.map((a) => ({ classroomId: a.classroomId, status: a.status, checkinAt: a.checkinAt })),
      stats: {
        classrooms: classroomIds.length, upcoming: upcoming.length, pending: pending.length,
        missed: missed.length, graded: graded.length, average,
      },
      upcoming, pending, missed, graded: graded.map((a) => ({ ...a, submission: latestSubmission.get(a.id) })),
      announcements, notifications, grades: mine,
    })
  }

  if (user.role === 'TEACHER') {
    const classrooms = await prisma.classroom.findMany({
      where: { teacherId: user.id },
      include: { _count: { select: { enrollments: true } } },
    })
    const ids = classrooms.map((c) => c.id)
    const today = bangkokDateKey()
    const [attendanceToday, assignments, submissions, pendingNotifications, pendingLeaves] = await Promise.all([
      prisma.attendance.findMany({ where: { classroomId: { in: ids }, date: today } }),
      prisma.assignment.findMany({ where: { classroomId: { in: ids } }, include: { classroom: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.submission.findMany({ where: { assignment: { classroomId: { in: ids } } }, orderBy: { submittedAt: 'desc' }, take: 100 }),
      prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.leaveRequest.findMany({
        where: { classroomId: { in: ids }, status: 'PENDING' },
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
          classroom: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' }, take: 5,
      }),
    ])
    const gradedIds = new Set(submissions.filter((s) => s.status === 'GRADED').map((s) => s.id))
    const allGradeResults = await Promise.all(ids.map((id) => computeClassroomGrades(id)))
    const allStudents = allGradeResults.flat()
    const attendanceTrend = []
    for (let i = 6; i >= 0; i--) {
      const date = daysAgo(i)
      const records = await prisma.attendance.findMany({ where: { classroomId: { in: ids }, date } })
      attendanceTrend.push({
        date,
        PRESENT: records.filter((r) => r.status === 'PRESENT').length,
        LATE: records.filter((r) => r.status === 'LATE').length,
        ABSENT: records.filter((r) => r.status === 'ABSENT').length,
        LEAVE: records.filter((r) => r.status === 'LEAVE').length,
      })
    }
    const distribution = {}
    for (const s of allStudents) distribution[s.grade] = (distribution[s.grade] || 0) + 1
    return ok(res, {
      role: 'TEACHER',
      stats: {
        classrooms: classrooms.length,
        students: classrooms.reduce((a, c) => a + c._count.enrollments, 0),
        presentToday: attendanceToday.filter((a) => a.status === 'PRESENT').length,
        lateToday: attendanceToday.filter((a) => a.status === 'LATE').length,
        absentToday: attendanceToday.filter((a) => a.status === 'ABSENT').length,
        leaveToday: attendanceToday.filter((a) => a.status === 'LEAVE').length,
        openAssignments: assignments.filter((a) => a.isOpen).length,
        pendingGrading: submissions.filter((s) => s.status !== 'GRADED').length,
        pendingLeaves: pendingLeaves.length,
        average: allStudents.length ? Math.round((allStudents.reduce((a, b) => a + b.total, 0) / allStudents.length) * 100) / 100 : 0,
      },
      classrooms: classrooms.map((c) => ({ id: c.id, name: c.name, subject: c.subject, students: c._count.enrollments })),
      openAssignments: assignments.filter((a) => a.isOpen).slice(0, 6),
      recentSubmissions: submissions.filter((s) => !gradedIds.has(s.id)).slice(0, 8),
      pendingLeaves, attendanceTrend, distribution, notifications: pendingNotifications,
    })
  }

  const [users, teachers, students, pending, classrooms, assignments, submissions, auditLogs] = await Promise.all([
    prisma.user.count(), prisma.user.count({ where: { role: 'TEACHER' } }),
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.user.count({ where: { status: 'PENDING' } }),
    prisma.classroom.count(), prisma.assignment.count(), prisma.submission.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 6, include: { actor: { select: { firstName: true, lastName: true } } } }),
  ])
  ok(res, {
    role: 'ADMIN',
    stats: { users, teachers, students, pending, classrooms, assignments, submissions },
    auditLogs,
  })
}))
