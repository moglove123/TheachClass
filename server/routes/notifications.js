import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth } from './auth.js'
import { asyncHandler, ok, paginate, ApiError } from '../utils.js'

export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)

notificationsRouter.get('/', asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query)
  const where = { userId: req.user.id }
  if (req.query.unread === 'true') where.isRead = false
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
  ])
  ok(res, { items, total, unread, page, limit, pages: Math.ceil(total / limit) })
}))

notificationsRouter.post('/read-all', asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } })
  ok(res, null, 'อ่านแจ้งเตือนทั้งหมดแล้ว')
}))

notificationsRouter.post('/:id/read', asyncHandler(async (req, res) => {
  const item = await prisma.notification.findUnique({ where: { id: Number(req.params.id) } })
  if (!item || item.userId !== req.user.id) throw new ApiError(404, 'ไม่พบการแจ้งเตือน')
  ok(res, await prisma.notification.update({ where: { id: item.id }, data: { isRead: true } }))
}))

notificationsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const item = await prisma.notification.findUnique({ where: { id: Number(req.params.id) } })
  if (!item || item.userId !== req.user.id) throw new ApiError(404, 'ไม่พบการแจ้งเตือน')
  await prisma.notification.delete({ where: { id: item.id } })
  ok(res, null, 'ลบการแจ้งเตือนสำเร็จ')
}))
