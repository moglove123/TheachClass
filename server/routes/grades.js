import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth } from './auth.js'
import { ApiError, asyncHandler, ok, audit, notify, assertClassroomAccess, defaultScales } from '../utils.js'
import { computeClassroomGrades } from '../services/grading.js'

export const gradesRouter = Router()
gradesRouter.use(requireAuth)

gradesRouter.get('/classroom/:classroomId', asyncHandler(async (req, res) => {
  await assertClassroomAccess(req.user, req.params.classroomId, { teacherOnly: true })
  const classroom = await prisma.classroom.findUnique({
    where: { id: Number(req.params.classroomId) }, include: { gradeScales: true },
  })
  const items = await computeClassroomGrades(classroom.id)
  const scales = classroom.gradeScales.length ? classroom.gradeScales : defaultScales
  const distribution = scales.map((s) => ({ grade: s.grade, count: items.filter((i) => i.grade === s.grade).length }))
  ok(res, {
    classroom: {
      id: classroom.id, name: classroom.name,
      weights: {
        ASSIGNMENT: classroom.weightAssignment, COLLECTION: classroom.weightCollection,
        MIDTERM: classroom.weightMidterm, FINAL: classroom.weightFinal,
        ACTIVITY: classroom.weightActivity, BONUS: classroom.weightBonus,
      },
    },
    scales, items, distribution,
    average: items.length ? Math.round((items.reduce((a, b) => a + b.total, 0) / items.length) * 100) / 100 : 0,
  })
}))

gradesRouter.get('/me', asyncHandler(async (req, res) => {
  if (!req.query.classroomId) {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: req.user.id }, include: { classroom: true },
    })
    const results = await Promise.all(enrollments.map(async (e) => ({
      classroom: { id: e.classroom.id, name: e.classroom.name, subject: e.classroom.subject },
      result: (await computeClassroomGrades(e.classroom.id))?.find((r) => r.id === req.user.id),
    })))
    return ok(res, results)
  }
  await assertClassroomAccess(req.user, req.query.classroomId)
  const items = await computeClassroomGrades(req.query.classroomId)
  ok(res, items?.find((r) => r.id === req.user.id) ?? null)
}))

gradesRouter.patch('/classroom/:classroomId/weights', asyncHandler(async (req, res) => {
  const classroom = await assertClassroomAccess(req.user, req.params.classroomId, { teacherOnly: true })
  const map = {
    ASSIGNMENT: 'weightAssignment', COLLECTION: 'weightCollection', MIDTERM: 'weightMidterm',
    FINAL: 'weightFinal', ACTIVITY: 'weightActivity', BONUS: 'weightBonus',
  }
  const data = {}
  for (const [key, field] of Object.entries(map)) {
    if (req.body?.[key] !== undefined) data[field] = Number(req.body[key])
  }
  const total = Object.values(data).reduce((a, b) => a + b, 0)
  if (total !== 100) throw new ApiError(400, `สัดส่วนคะแนนต้องรวมเป็น 100 ขณะนี้ได้ ${total}`)
  const updated = await prisma.classroom.update({ where: { id: classroom.id }, data })
  await audit(req.user.id, 'UPDATE_WEIGHTS', 'Classroom', classroom.id, data)
  ok(res, updated, 'อัปเดตสัดส่วนคะแนนสำเร็จ ระบบคำนวณเกรดใหม่แล้ว')
}))

gradesRouter.put('/classroom/:classroomId/scales', asyncHandler(async (req, res) => {
  const classroom = await assertClassroomAccess(req.user, req.params.classroomId, { teacherOnly: true })
  const scales = req.body?.scales
  if (!Array.isArray(scales) || !scales.length) throw new ApiError(400, 'กรุณาระบุเกณฑ์การตัดเกรด')
  await prisma.$transaction([
    prisma.gradeScale.deleteMany({ where: { classroomId: classroom.id } }),
    prisma.gradeScale.createMany({
      data: scales.map((s) => ({
        classroomId: classroom.id, grade: String(s.grade),
        minScore: Number(s.minScore), maxScore: Number(s.maxScore),
      })),
    }),
  ])
  await audit(req.user.id, 'UPDATE_SCALES', 'Classroom', classroom.id, { scales })
  ok(res, await prisma.gradeScale.findMany({ where: { classroomId: classroom.id }, orderBy: { minScore: 'desc' } }), 'อัปเดตเกณฑ์ตัดเกรดสำเร็จ')
}))

gradesRouter.post('/classroom/:classroomId/score', asyncHandler(async (req, res) => {
  const classroom = await assertClassroomAccess(req.user, req.params.classroomId, { teacherOnly: true })
  const { userId, category, score, maxScore, note } = req.body ?? {}
  if (!['COLLECTION', 'MIDTERM', 'FINAL', 'ACTIVITY', 'BONUS'].includes(category))
    throw new ApiError(400, 'ประเภทคะแนนไม่ถูกต้อง')
  const target = await prisma.enrollment.findUnique({
    where: { classroomId_userId: { classroomId: classroom.id, userId: Number(userId) } },
  })
  if (!target) throw new ApiError(404, 'ไม่พบนักเรียนในห้องเรียนนี้')
  const value = Number(score)
  if (!Number.isFinite(value) || value < 0) throw new ApiError(400, 'คะแนนไม่ถูกต้อง')
  const existing = await prisma.gradeRecord.findUnique({
    where: { classroomId_userId_category: { classroomId: classroom.id, userId: Number(userId), category } },
  })
  const record = await prisma.gradeRecord.upsert({
    where: { classroomId_userId_category: { classroomId: classroom.id, userId: Number(userId), category } },
    create: { classroomId: classroom.id, userId: Number(userId), category, score: value, maxScore: maxScore ? Number(maxScore) : null, updatedBy: req.user.id },
    update: { score: value, maxScore: maxScore ? Number(maxScore) : null, updatedBy: req.user.id },
  })
  await prisma.gradeLog.create({
    data: {
      gradeRecordId: record.id, changedBy: req.user.id,
      oldScore: existing?.score ?? null, newScore: value, note: note || null,
    },
  })
  await notify(Number(userId), 'SCORE_UPDATED', 'อัปเดตคะแนน',
    `ครูอัปเดตคะแนน ${category} เป็น ${value} ในวิชา ${classroom.subject}`)
  await audit(req.user.id, 'UPDATE_SCORE', 'GradeRecord', record.id, { category, from: existing?.score, to: value })
  ok(res, record, 'บันทึกคะแนนสำเร็จ')
}))

gradesRouter.get('/classroom/:classroomId/history', asyncHandler(async (req, res) => {
  const classroom = await assertClassroomAccess(req.user, req.params.classroomId, { teacherOnly: true })
  const where = { record: { classroomId: classroom.id } }
  if (req.query.userId) where.record = { classroomId: classroom.id, userId: Number(req.query.userId) }
  const logs = await prisma.gradeLog.findMany({
    where, include: { editor: { select: { firstName: true, lastName: true } }, record: true },
    orderBy: { createdAt: 'desc' }, take: 200,
  })
  ok(res, logs)
}))
