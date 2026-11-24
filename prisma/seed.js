import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../server/db.js'
import { bangkokDateKey } from '../server/utils.js'

const hash = (p) => bcrypt.hash(p, 10)

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: 'admin@classflow.local' } })
  if (existing) {
    console.log('ฐานข้อมูลมีข้อมูลเริ่มต้นอยู่แล้ว (ข้ามการ seed)')
    return
  }
  const today = bangkokDateKey()
  const admin = await prisma.user.create({
    data: { firstName: 'ผู้ดูแล', lastName: 'ระบบ', email: 'admin@classflow.local', passwordHash: await hash('admin123'), role: 'ADMIN', status: 'ACTIVE', studentId: 'ADMIN001' },
  })
  const teacher = await prisma.user.create({
    data: { firstName: 'สมชาย', lastName: 'ใจดี', email: 'teacher@classflow.local', passwordHash: await hash('teacher123'), role: 'TEACHER', status: 'ACTIVE', phone: '0812345678' },
  })
  const students = []
  for (let i = 1; i <= 5; i++) {
    students.push(await prisma.user.create({
      data: {
        firstName: ['กิตติ์', 'รัตนา', 'ชัยวัฒน์', 'สุดา', 'นัทร์'][i - 1],
        lastName: 'นักเรียน', email: `student${i}@classflow.local`,
        passwordHash: await hash('student123'), role: 'STUDENT', status: 'ACTIVE',
        studentId: `S00${i}`,
      },
    }))
  }

  const classroom = await prisma.classroom.create({
    data: {
      code: 'CS101-1', name: 'ม.5/1 — วิทยาการคอมพิวเตอร์', subject: 'วิทยาการคอมพิวเตอร์',
      subjectCode: 'CS101', semester: '1', academicYear: String(new Date().getFullYear()),
      teacherId: teacher.id, joinCode: 'JOIN001',
      // เปิดเช็กชื่อเป็นรอบผ่าน /api/attendance/sessions เท่านั้น (ไม่เปิดตลอดเทอม)
      gpsLat: 13.7563, gpsLng: 100.5018, gpsRadius: 100, attendanceOpen: false,
      gradeScales: {
        create: [
          { grade: 'A', minScore: 80, maxScore: 100 }, { grade: 'B+', minScore: 75, maxScore: 79.99 },
          { grade: 'B', minScore: 70, maxScore: 74.99 }, { grade: 'C+', minScore: 65, maxScore: 69.99 },
          { grade: 'C', minScore: 60, maxScore: 64.99 }, { grade: 'D+', minScore: 55, maxScore: 59.99 },
          { grade: 'D', minScore: 50, maxScore: 54.99 }, { grade: 'F', minScore: 0, maxScore: 49.99 },
        ],
      },
    },
  })
  for (const s of students) await prisma.enrollment.create({ data: { classroomId: classroom.id, userId: s.id } })

  const statusFor = [['PRESENT', true], ['LATE', false], ['ABSENT', false], ['PRESENT', true], ['LEAVE', false]]
  for (let day = 4; day >= 0; day--) {
    const d = new Date()
    d.setDate(d.getDate() - day)
    const key = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
    for (let i = 0; i < students.length; i++) {
      const [base, checked] = statusFor[i]
      const status = day === 0 ? base : (i + day) % 4 === 0 ? 'LATE' : (i + day) % 7 === 0 ? 'ABSENT' : 'PRESENT'
      await prisma.attendance.create({
        data: {
          classroomId: classroom.id, userId: students[i].id, date: key, status,
          checkinAt: checked ? new Date() : null,
          lat: checked ? 13.75635 : null, lng: checked ? 100.50185 : null,
          distanceM: checked ? 6 : null,
        },
      })
    }
  }

  const due = new Date()
  due.setDate(due.getDate() + 3)
  const assignment = await prisma.assignment.create({
    data: {
      classroomId: classroom.id, title: 'งานที่ 1: HTML/CSS พื้นฐาน',
      description: 'สร้างหน้าเว็บส่วนตัวด้วย HTML และ CSS ส่งเป็นไฟล์ ZIP หรือ PDF',
      startAt: new Date(Date.now() - 86400000), dueAt: due, maxScore: 100, bonusScore: 5,
      allowLate: true, latePenaltyPercent: 10, extensionMinutes: 0,
      isOpen: true, createdBy: teacher.id,
    },
  })
  await prisma.submission.create({
    data: {
      assignmentId: assignment.id, userId: students[0].id,
      files: JSON.stringify([{ name: 'portfolio.zip', url: '#', size: 12345, type: 'application/zip' }]),
      note: 'ส่งงานเรียบร้อยครับ', submittedAt: new Date(), status: 'GRADED', score: 85,
      feedback: 'ดีมาก ปรับเรื่อง responsive เพิ่มอีกนิด', gradedAt: new Date(), gradedBy: teacher.id,
    },
  })
  await prisma.submission.create({
    data: {
      assignmentId: assignment.id, userId: students[1].id,
      files: JSON.stringify([{ name: 'work.pdf', url: '#', size: 54321, type: 'application/pdf' }]),
      submittedAt: new Date(), status: 'SUBMITTED', isLate: false,
    },
  })
  for (let i = 0; i < students.length; i++) {
    for (const [category, score, maxScore] of [['COLLECTION', 15 + (i % 4), 20], ['MIDTERM', 14 + (i % 5), 20], ['FINAL', 22 + (i % 6), 30]]) {
      await prisma.gradeRecord.create({
        data: { classroomId: classroom.id, userId: students[i].id, category, score, maxScore, updatedBy: teacher.id },
      })
    }
  }
  await prisma.announcement.create({
    data: {
      classroomId: classroom.id, authorId: teacher.id,
      title: 'ยินดีต้อนรับเข้าสู่วิชาวิทยาการคอมพิวเตอร์',
      body: 'กรุณาอ่านกฎระเบียบห้องเรียนและเตรียมความพร้อมสำหรับงานชิ้นแรกครับ', pinned: true,
    },
  })
  for (const s of students) {
    await prisma.notification.createMany({
      data: [
        { userId: s.id, type: 'NEW_ASSIGNMENT', title: 'มีงานใหม่', body: `งาน ${assignment.title} แล้ว`, link: `/assignments/${assignment.id}` },
        { userId: s.id, type: 'ANNOUNCEMENT', title: 'ประกาศจากครู', body: 'ยินดีต้อนรับเข้าสู่วิชา', link: `/classrooms/${classroom.id}` },
      ],
    })
  }
  for (const [key, value] of Object.entries({
    REMINDER_HOURS: '24,12,1', GPS_DEFAULT_RADIUS: '100', ATTENDANCE_LATE_MINUTES: '15',
    SUBMISSION_DEFAULT_DAYS: '7', ACADEMIC_YEAR: String(new Date().getFullYear()), SEMESTER: '1',
  })) await prisma.setting.create({ data: { key, value } })

  console.log('Seed เสร็จแล้ว:')
  console.log('  Admin: admin@classflow.local / admin123')
  console.log('  Teacher: teacher@classflow.local / teacher123')
  console.log('  Student: student1@classflow.local / student123')
  console.log(`  Join code: ${classroom.joinCode}, วันที่: ${today}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
