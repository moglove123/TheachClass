import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts'
import {
  School, ClipboardList, ClipboardCheck, GraduationCap,
  Users, BookOpen, FileText, MapPin, ArrowRight, CalendarClock, AlertCircle, FileSpreadsheet,
} from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Badge, Card, Countdown, Loader, PageHeader, StatCard, Table, toast } from '../components/ui.jsx'
import { thaiDate, thaiDay } from '../utils.js'

const CHART_COLORS = ['#2d6ba6', '#d1873b', '#c0553f', '#4f8a6a', '#8062a8', '#b0873a', '#3d8a8a', '#6b7a8a']
const tooltipStyle = { borderRadius: 6, border: '1px solid #dbe5ee', fontFamily: 'Sarabun', fontSize: 12 }

function SectionTitle({ children, to, linkText = 'ดูทั้งหมด' }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">{children}</h2>
      {to && <Link to={to} className="flex shrink-0 items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">{linkText} <ArrowRight className="h-3.5 w-3.5" /></Link>}
    </div>
  )
}

function QuickStart({ items }) {
  return (
    <div className="mb-5 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
        <p className="caps">ทางลัด</p>
        <p className="text-[11px] text-slate-400">เลือกงานที่ต้องทำต่อ</p>
      </div>
      <div className="grid divide-y divide-slate-100 dark:divide-slate-700 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {items.map(({ to, label, detail, icon: Icon }) => (
          <Link key={to} to={to} className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30">
            <Icon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-blue-700 dark:group-hover:text-blue-300" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-white">{label}</span>
              <span className="block truncate text-[11px] text-slate-400">{detail}</span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-500" />
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/dashboard').then((res) => setData(res.data)).catch(() => toast('ไม่สามารถโหลดข้อมูลหน้าแรกได้', 'error')).finally(() => setLoading(false))
  }, [])

  if (loading) return <Loader />
  if (!data) return <Card className="p-8 text-center text-slate-500">ไม่พบข้อมูลสำหรับแสดงผล</Card>

  if (data.role === 'STUDENT') {
    const s = data.stats
    const statusToday = data.todayAttendance.reduce((acc, a) => { acc[a.classroomId] = a.status; return acc }, {})
    return (
      <>
        <PageHeader title={`สวัสดี ${user.firstName}`} subtitle="ภาพรวมการเรียนของคุณวันนี้ พร้อมงานที่ต้องส่งและการเข้าเรียน" />
        <QuickStart items={[
          { to: '/attendance', label: 'เช็กชื่อวันนี้', detail: 'รอครูเปิดรอบ แล้วกดปุ่มเดียว', icon: MapPin },
          { to: '/assignments?status=missed', label: 'งานที่ขาดส่ง', detail: 'ดูงานที่เกินกำหนดแล้ว', icon: AlertCircle },
          { to: '/grades', label: 'คะแนนของฉัน', detail: 'ดูคะแนนและเกรดล่าสุด', icon: GraduationCap },
        ]} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard icon={School} label="วิชาที่เรียน" value={s.classrooms} tone="blue" />
          <StatCard icon={CalendarClock} label="งานใกล้กำหนด" value={s.upcoming} tone="amber" />
          <StatCard icon={ClipboardList} label="งานที่ยังไม่ส่ง" value={s.pending} tone="rose" />
          <StatCard icon={AlertCircle} label="งานที่ขาดส่ง" value={s.missed ?? 0} tone="rose" />
          <StatCard icon={GraduationCap} label="คะแนนเฉลี่ย" value={s.average} sub="เต็ม 100" tone="green" />
        </div>
        {!!data.missed?.length && <Card className="mt-5 border-rose-200 bg-rose-50/70 p-5 dark:border-rose-500/25 dark:bg-rose-500/10">
          <SectionTitle to="/assignments?status=missed" linkText="ดูทั้งหมด">งานที่ขาดส่ง ({data.missed.length})</SectionTitle>
          <div className="space-y-2">
            {data.missed.slice(0, 3).map((a) => <Link key={a.id} to={`/assignments/${a.id}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-100 bg-white/80 p-3 transition hover:border-rose-300 dark:border-rose-500/20 dark:bg-slate-800/60">
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800 dark:text-white">{a.title}</span>
                <span className="block truncate text-xs text-slate-500">{a.classroom?.name} · เกินกำหนด {a.daysOverdue} วัน</span></span>
              <Badge status="ABSENT">ยังไม่ส่ง</Badge>
            </Link>)}
          </div>
        </Card>}
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <SectionTitle to="/assignments">งานที่ใกล้ถึงกำหนดส่ง</SectionTitle>
            {data.upcoming.length ? (
              <div className="space-y-3">
                {data.upcoming.map((a) => (
                  <Link key={a.id} to={`/assignments/${a.id}`} className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 transition hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-700 dark:hover:bg-slate-700/40 sm:flex-row sm:items-center">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300"><ClipboardList className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-white">{a.title}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{a.classroom?.name} · กำหนดส่ง {thaiDate(a.dueAt)}</p>
                    </div>
                    <div className="text-left sm:text-right"><Countdown dueAt={a.dueAt} className="text-xs" /></div>
                  </Link>
                ))}
              </div>
            ) : <p className="py-8 text-center text-sm text-slate-400">ไม่มีงานที่รอดำเนินการ</p>}
          </Card>
          <Card className="p-5">
            <SectionTitle to="/classrooms">วิชาของฉัน</SectionTitle>
            <div className="space-y-3">
              {data.classrooms.map((c) => (
                <Link key={c.id} to={`/classrooms/${c.id}`} className="block rounded-xl border border-slate-100 p-3 transition hover:border-blue-200 dark:border-slate-700">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{c.subject}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{c.name} · {c.teacher?.firstName} {c.teacher?.lastName}</p>
                  <div className="mt-2 flex items-center gap-2">
                    {statusToday[c.id]
                      ? <Badge status={statusToday[c.id]} />
                      : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300">ยังไม่เช็กชื่อ</span>}
                    <span className="text-[11px] text-slate-400">วันนี้</span>
                  </div>
                </Link>
              ))}
              {!data.classrooms.length && <p className="py-6 text-center text-sm text-slate-400">ยังไม่ได้เข้าร่วมห้องเรียน</p>}
            </div>
          </Card>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <SectionTitle to="/grades">คะแนนล่าสุด</SectionTitle>
            {data.grades?.length ? (
              <div className="space-y-2">
                {data.grades.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-700/40">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15"><GraduationCap className="h-4 w-4" /></div>
                    <p className="flex-1 text-sm text-slate-700 dark:text-slate-200">ผลการเรียนล่าสุด</p>
                    <span className="text-sm font-bold text-slate-800 dark:text-white">{g.total}</span>
                    <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{g.grade}</Badge>
                  </div>
                ))}
              </div>
            ) : <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีคะแนน</p>}
          </Card>
          <Card className="p-5">
            <SectionTitle to="/notifications">ข่าวสารและประกาศ</SectionTitle>
            <div className="space-y-3">
              {(data.announcements || []).map((a) => (
                <div key={a.id} className="border-l-2 border-blue-400 pl-3">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{a.pinned && <span className="mr-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">ปักหมุด</span>}{a.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{a.body}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{a.classroom?.name} · {a.author?.firstName} · {thaiDate(a.createdAt)}</p>
                </div>
              ))}
              {!data.announcements?.length && <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีประกาศ</p>}
            </div>
          </Card>
        </div>
      </>
    )
  }

  if (data.role === 'TEACHER') {
    const s = data.stats
    const pie = Object.entries(data.distribution || {}).map(([grade, count]) => ({ name: grade, value: count }))
    return (
      <>
        <PageHeader title={`ยินดีต้อนรับ ครู${user.firstName}`} subtitle="ติดตามการเข้าเรียน งานที่ต้องตรวจ และผลการเรียนของนักเรียน" />
        <QuickStart items={[
          { to: '/attendance', label: 'เปิดรอบเช็กชื่อ', detail: 'ใช้พิกัดปัจจุบันเปิดให้นักเรียนเช็ก', icon: MapPin },
          { to: '/assignments', label: 'ตรวจงาน', detail: 'ให้คะแนนและตอบกลับนักเรียน', icon: ClipboardList },
          { to: '/reports', label: 'ส่งออก Excel', detail: 'ดาวน์โหลดรายงานข้อมูล', icon: FileSpreadsheet },
        ]} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard icon={School} label="ห้องเรียน" value={s.classrooms} tone="blue" />
          <StatCard icon={Users} label="นักเรียนทั้งหมด" value={s.students} tone="violet" />
          <StatCard icon={ClipboardCheck} label="มาเรียนวันนี้" value={s.presentToday} sub={`สาย ${s.lateToday} · ขาด ${s.absentToday}`} tone="green" />
          <StatCard icon={ClipboardList} label="รอตรวจงาน" value={s.pendingGrading} tone="amber" />
          <StatCard icon={FileText} label="คำร้องลารอตรวจ" value={s.pendingLeaves ?? 0} tone="rose" />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <SectionTitle to="/attendance">แนวโน้มการเข้าเรียน 7 วันล่าสุด</SectionTitle>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.attendanceTrend} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#dbe5ee" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(v) => thaiDay(v)} tick={{ fontSize: 11, fontFamily: 'Sarabun' }} />
                  <YAxis tick={{ fontSize: 11, fontFamily: 'Sarabun' }} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => thaiDay(v)} />
                  <Legend wrapperStyle={{ fontFamily: 'Sarabun', fontSize: 12 }} />
                  <Area type="monotone" dataKey="PRESENT" name="มาเรียน" stroke="#2d6ba6" fill="#2d6ba6" fillOpacity={0.1} strokeWidth={1.75} />
                  <Area type="monotone" dataKey="LATE" name="มาสาย" stroke="#a35a3f" fill="transparent" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="ABSENT" name="ขาดเรียน" stroke="#b03a3a" fill="transparent" strokeWidth={1.5} strokeDasharray="4 3" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="p-5">
            <SectionTitle to="/grades">กระจายเกรด</SectionTitle>
            {pie.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={78} paddingAngle={2} label={({ name, value }) => `${name}: ${value}`}>
                      {pie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="grid h-64 place-items-center text-sm text-slate-400">ยังไม่มีข้อมูลเกรด</div>}
          </Card>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Card className="p-5">
            <SectionTitle to="/attendance?leave=pending" linkText="ไปพิจารณา">คำร้องลารอตรวจ</SectionTitle>
            {data.pendingLeaves?.length ? data.pendingLeaves.map((l) => (
              <Link key={l.id} to={`/attendance?leave=${l.id}`} className="mb-2 block rounded-lg border border-rose-100 bg-rose-50/60 p-3 dark:border-rose-500/20 dark:bg-rose-500/10">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-white">{l.student?.firstName} {l.student?.lastName} · {l.date}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{l.classroom?.name} · {l.reason}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {({ SICK: 'ลาป่วย', PERSONAL: 'ลากิจ' }[l.leaveType] || 'ลาทั่วไป')}
                  {l.isHourly ? ` · ${l.startTime}–${l.endTime} น.` : ''}
                </p>
              </Link>
            )) : <p className="py-6 text-center text-sm text-slate-400">ไม่มีคำร้องลารอตรวจ</p>}
          </Card>
          <Card className="p-5">
            <SectionTitle to="/assignments">งานที่เปิดอยู่</SectionTitle>
            {data.openAssignments?.length ? data.openAssignments.map((a) => (
              <Link key={a.id} to={`/assignments/${a.id}`} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3 text-sm dark:border-slate-700">
                <BookOpen className="h-4 w-4 text-blue-500" />
                <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{a.title}</span>
                <Countdown dueAt={a.dueAt} className="text-xs" />
              </Link>
            )) : <p className="py-6 text-center text-sm text-slate-400">ไม่มีงานที่เปิดอยู่</p>}
          </Card>
          <Card className="p-5">
            <SectionTitle to="/assignments">งานส่งล่าสุด</SectionTitle>
            {data.recentSubmissions?.length ? data.recentSubmissions.map((s) => (
              <Link key={s.id} to={`/assignments/${s.assignmentId}`} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3 text-sm dark:border-slate-700">
                <FileText className="h-4 w-4 text-violet-500" />
                <span className="flex-1 text-slate-700 dark:text-slate-200">ส่งงานครั้งที่ {s.attempt}</span>
                <span className="text-xs text-slate-400">{thaiDate(s.submittedAt)}</span>
              </Link>
            )) : <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีงานส่ง</p>}
          </Card>
        </div>
      </>
    )
  }

  const s = data.stats
  const pie = [
    { name: 'ผู้ดูแล', value: Math.max(0, s.users - s.teachers - s.students) },
    { name: 'ครู', value: s.teachers },
    { name: 'นักเรียน', value: s.students },
  ]
  return (
    <>
      <PageHeader title="ภาพรวมระบบ" subtitle="ดูภาพรวมผู้ใช้ ห้องเรียน และกิจกรรมล่าสุดของระบบ" />
      <QuickStart items={[
        { to: '/users', label: 'อนุมัติสมาชิก', detail: 'ตรวจสอบบัญชีที่รออนุมัติ', icon: Users },
        { to: '/classrooms', label: 'จัดการห้องเรียน', detail: 'สร้างห้องและมอบหมายครู', icon: School },
        { to: '/reports', label: 'รายงาน / Excel', detail: 'ส่งออกหรือสำรองข้อมูล', icon: FileSpreadsheet },
      ]} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label="ผู้ใช้งานทั้งหมด" value={s.users} tone="blue" />
        <StatCard icon={School} label="ห้องเรียน" value={s.classrooms} tone="violet" />
        <StatCard icon={ClipboardList} label="งานทั้งหมด" value={s.assignments} tone="amber" />
        <StatCard icon={AlertCircle} label="รออนุมัติบัญชี" value={s.pending} tone="rose" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle>สถิติการใช้งาน</SectionTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'ครู', value: s.teachers }, { name: 'นักเรียน', value: s.students },
                { name: 'ห้องเรียน', value: s.classrooms }, { name: 'งาน', value: s.assignments },
                { name: 'งานที่ส่ง', value: s.submissions }, { name: 'เช็กชื่อ', value: s.attendance },
              ]}>
                <CartesianGrid strokeDasharray="2 4" stroke="#dbe5ee" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: 'Sarabun' }} />
                <YAxis tick={{ fontSize: 11, fontFamily: 'Sarabun' }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" name="จำนวน" fill="#2d6ba6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle>สัดส่วนผู้ใช้งาน</SectionTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={78} label>{pie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} />)}</Pie>
                <Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontFamily: 'Sarabun', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <Card className="mt-5 p-5">
        <SectionTitle to="/audit" linkText="ดูประวัติทั้งหมด"> 활동ล่าสุด</SectionTitle>
        <Table headers={['ผู้ดำเนินการ', 'การกระทำ', 'ข้อมูล', 'เวลา']} empty={!data.auditLogs.length}>
          {data.auditLogs.map((log) => (
            <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
              <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{log.actor ? `${log.actor.firstName} ${log.actor.lastName}` : 'ระบบ'}</td>
              <td className="px-4 py-3"><Badge className="bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{log.action}</Badge></td>
              <td className="px-4 py-3 text-xs text-slate-500">{log.entity} {log.entityId ? `#${log.entityId}` : ''}</td>
              <td className="px-4 py-3 text-xs text-slate-400">{thaiDate(log.createdAt)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  )
}
