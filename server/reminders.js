import { prisma } from './db.js'

const defaultLeadHours = [24, 12, 1]
// หน้าต่างกว้างพอที่แอปจะ restart ช่วงหนึ่งแล้วกลับมาทัน และมี dedupe อยู่แล้วเลยไม่ส่งซ้ำ
const WINDOW_MS = 60 * 60 * 1000
let running = false

export async function runReminders() {
  if (running) return
  running = true
  try {
    const settings = await prisma.setting.findMany({ where: { key: 'REMINDER_HOURS' } })
    const leads = (settings[0]?.value || '24,12,1').split(',').map((v) => Number(v.trim())).filter((n) => n > 0)
    const hours = leads.length ? leads : defaultLeadHours
    const now = new Date()

    const assignments = await prisma.assignment.findMany({
      where: { isOpen: true },
      include: { classroom: { select: { name: true, enrollments: { select: { userId: true } } } } },
    })
    for (const a of assignments) {
      const due = new Date(a.dueAt)
      if (Number.isNaN(due.getTime())) continue
      for (const lead of hours) {
        const target = due.getTime() - lead * 3600000
        if (now.getTime() >= target && now.getTime() < target + WINDOW_MS) {
          for (const e of a.classroom.enrollments) {
            const sent = await prisma.notification.findFirst({
              where: { userId: e.userId, type: `DEADLINE_${lead}H`, link: `/assignments/${a.id}` },
            })
            if (!sent) {
              await prisma.notification.create({
                data: {
                  userId: e.userId, type: `DEADLINE_${lead}H`,
                  title: 'ใกล้ถึงกำหนดส่งงาน',
                  body: `งาน "${a.title}" หมดเวลาส่งในอีก ${lead} ชั่วโมง`,
                  link: `/assignments/${a.id}`,
                },
              })
            }
          }
        }
      }
      if (now > due) {
        const studentIds = a.classroom.enrollments.map((e) => e.userId)
        const submitted = await prisma.submission.findMany({ where: { assignmentId: a.id }, select: { userId: true } })
        const done = new Set(submitted.map((s) => s.userId))
        for (const userId of studentIds) {
          if (done.has(userId)) continue
          const sent = await prisma.notification.findFirst({
            where: { userId, type: 'OVERDUE', link: `/assignments/${a.id}` },
          })
          if (!sent) {
            await prisma.notification.create({
              data: { userId, type: 'OVERDUE', title: 'ส่งงานล่าช้า', body: `คุณยังไม่ส่งงาน "${a.title}"`, link: `/assignments/${a.id}` },
            })
          }
        }
      }
    }
  } finally {
    running = false
  }
}

export function startReminders() {
  const safeRun = () => runReminders().catch((e) => console.error('reminder error', e.message))
  setTimeout(safeRun, 5000)
  setInterval(safeRun, 60000)
}
