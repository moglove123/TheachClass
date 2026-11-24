import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth } from './auth.js'
import { ApiError, asyncHandler, ok, notifyMany, audit, assertClassroomAccess } from '../utils.js'

export const announcementsRouter = Router()
announcementsRouter.use(requireAuth)

announcementsRouter.get('/', asyncHandler(async (req, res) => {
  const where = {}
  if (req.query.classroomId) where.classroomId = Number(req.query.classroomId)
  if (req.user.role === 'STUDENT') where.classroom = { enrollments: { some: { userId: req.user.id } } }
  if (req.user.role === 'TEACHER') where.classroom = { teacherId: req.user.id }
  const items = await prisma.announcement.findMany({
    where,
    include: { classroom: { select: { name: true } }, author: { select: { firstName: true, lastName: true } } },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], take: 100,
  })
  ok(res, items)
}))

announcementsRouter.post('/', asyncHandler(async (req, res) => {
  const classroom = await assertClassroomAccess(req.user, req.body?.classroomId, { teacherOnly: true })
  if (!req.body?.title?.trim() || !req.body?.body?.trim())
    throw new ApiError(400, 'กรุณากรอกหัวข้อและเนื้อหาประกาศ')
  const item = await prisma.announcement.create({
    data: {
      classroomId: classroom.id, authorId: req.user.id,
      title: String(req.body.title).trim(), body: String(req.body.body).trim(),
      pinned: Boolean(req.body.pinned),
    },
  })
  const ids = (await prisma.enrollment.findMany({ where: { classroomId: classroom.id }, select: { userId: true } })).map((e) => e.userId)
  await notifyMany(ids, 'ANNOUNCEMENT', `ประกาศ: ${item.title}`, item.body, `/classrooms/${classroom.id}`)
  await audit(req.user.id, 'CREATE_ANNOUNCEMENT', 'Announcement', item.id)
  ok(res, item, 'เผยแพร่ประกาศสำเร็จ')
}))

announcementsRouter.patch('/:id', asyncHandler(async (req, res) => {
  const item = await prisma.announcement.findUnique({ where: { id: Number(req.params.id) } })
  if (!item) throw new ApiError(404, 'ไม่พบประกาศ')
  await assertClassroomAccess(req.user, item.classroomId, { teacherOnly: true })
  const data = {}
  for (const key of ['title', 'body']) if (req.body[key] !== undefined) data[key] = String(req.body[key])
  if (req.body.pinned !== undefined) data.pinned = Boolean(req.body.pinned)
  const updated = await prisma.announcement.update({ where: { id: item.id }, data })
  await audit(req.user.id, 'UPDATE_ANNOUNCEMENT', 'Announcement', item.id)
  ok(res, updated, 'อัปเดตประกาศสำเร็จ')
}))

announcementsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const item = await prisma.announcement.findUnique({ where: { id: Number(req.params.id) } })
  if (!item) throw new ApiError(404, 'ไม่พบประกาศ')
  await assertClassroomAccess(req.user, item.classroomId, { teacherOnly: true })
  await prisma.announcement.delete({ where: { id: item.id } })
  await audit(req.user.id, 'DELETE_ANNOUNCEMENT', 'Announcement', item.id)
  ok(res, null, 'ลบประกาศสำเร็จ')
}))
