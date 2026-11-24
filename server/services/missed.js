import { prisma } from '../db.js'

/** งานที่กำหนดส่งผ่านแล้วแต่นักเรียนยังไม่ส่ง (ปลอดภัยสำหรับบทบาท STUDENT) */
export async function getMissedAssignments(userId) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    select: { classroomId: true },
  })
  const classroomIds = enrollments.map((e) => e.classroomId)
  if (!classroomIds.length) return []

  const now = new Date()
  const assignments = await prisma.assignment.findMany({
    where: { classroomId: { in: classroomIds } },
    include: { classroom: { select: { id: true, name: true, subject: true, code: true } } },
    orderBy: { dueAt: 'asc' },
  })
  if (!assignments.length) return []

  const submitted = await prisma.submission.findMany({
    where: { userId, assignmentId: { in: assignments.map((a) => a.id) } },
    select: { assignmentId: true },
  })
  const submittedIds = new Set(submitted.map((s) => s.assignmentId))

  return assignments
    .filter((a) => {
      const effectiveDue = new Date(a.dueAt).getTime() + (a.extensionMinutes || 0) * 60000
      return effectiveDue < now.getTime() && !submittedIds.has(a.id)
    })
    .map((a) => {
      const effectiveDue = new Date(a.dueAt).getTime() + (a.extensionMinutes || 0) * 60000
      return {
        ...a,
        isMissed: true,
        daysOverdue: Math.max(1, Math.floor((now.getTime() - effectiveDue) / 86400000)),
      }
    })
}
