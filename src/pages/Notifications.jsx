import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell, CheckCheck, Check, Trash2, BellRing, ClipboardList, MapPin, GraduationCap,
  Megaphone, AlertTriangle, School, UserPlus, Clock, FileText, ShieldCheck,
} from 'lucide-react'
import { api } from '../api.js'
import { Badge, Button, Card, Confirm, EmptyState, ErrorState, Loader, PageHeader, Pagination, Select, toast } from '../components/ui.jsx'
import { thaiDateTime } from '../utils.js'

const iconFor = (type = '') => {
  if (type.startsWith('DEADLINE') || type === 'OVERDUE') return Clock
  if (type.includes('ASSIGNMENT') || type === 'GRADED' || type === 'NEW_SUBMISSION') return ClipboardList
  if (type.includes('ATTENDANCE') || type.startsWith('CHECKIN') || type === 'GPS_ANOMALY') return MapPin
  if (type.startsWith('LEAVE')) return FileText
  if (type.includes('SCORE') || type.includes('GRADE')) return GraduationCap
  if (type.includes('ANNOUNCEMENT')) return Megaphone
  if (type.includes('CLASSROOM')) return School
  if (type === 'ROLE_CHANGED') return ShieldCheck
  if (type.includes('ACCOUNT') || type.includes('USER')) return UserPlus
  if (type.includes('PASSWORD')) return AlertTriangle
  return Bell
}
const typeLabel = (type) => ({
  NEW_ASSIGNMENT: 'งานใหม่', ASSIGNMENT_UPDATED: 'แก้ไขงาน', ASSIGNMENT_DELETED: 'ลบงาน',
  GRADED: 'ตรวจงานแล้ว', NEW_SUBMISSION: 'งานที่ส่ง', DEADLINE_24H: 'ใกล้กำหนด 24 ชม.',
  DEADLINE_12H: 'ใกล้กำหนด 12 ชม.', DEADLINE_1H: 'ใกล้กำหนด 1 ชม.', OVERDUE: 'ส่งช้า',
  ANNOUNCEMENT: 'ประกาศ', ATTENDANCE_UPDATED: 'การเข้าเรียน', ATTENDANCE_CHANGED: 'เปลี่ยนสถานะ',
  CHECKIN_OPEN: 'เปิดรอบเช็กชื่อ', CHECKIN_CLOSED: 'ปิดรอบเช็กชื่อ', GPS_ANOMALY: 'ความผิดปกติ GPS',
  LEAVE_REQUEST: 'คำร้องลาใหม่', LEAVE_APPROVED: 'อนุมัติคำร้องลา', LEAVE_REJECTED: 'ปฏิเสธคำร้องลา',
  SCORE_UPDATED: 'อัปเดตคะแนน', ACCOUNT_APPROVED: 'อนุมัติบัญชี', ACCOUNT_SUSPENDED: 'ระงับบัญชี',
  ROLE_CHANGED: 'เปลี่ยนสิทธิ์', ACCOUNT_CREATED: 'สร้างบัญชี',
}[type] || type)

// ปรับลิงก์จาก backend ให้ตรงกับเส้นทางที่มีจริงในแอป
const normalizeLink = (link) => {
  if (!link) return link
  if (/^\/classrooms\/\d+\/attendance$/.test(link)) return link.replace('/attendance', '')
  if (/^\/classrooms\/\d+\/students$/.test(link)) return link.replace('/students', '?tab=students')
  if (/^\/assignments\/\d+\/submissions$/.test(link)) return link.replace('/submissions', '')
  return link
}

export default function Notifications() {
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [unread, setUnread] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState('')

  const load = () => {
    setLoading(true); setError(false)
    const q = new URLSearchParams({ page: String(page), limit: '15' })
    if (unread) q.set('unread', unread)
    api.get(`/notifications?${q}`).then((res) => setData(res.data)).catch(() => setError(true)).finally(() => setLoading(false))
    window.dispatchEvent(new CustomEvent('app-refresh-unread'))
  }
  useEffect(() => { load() }, [page, unread])

  const markRead = async (id) => {
    if (busy) return
    setBusy(id)
    try { await api.post(`/notifications/${id}/read`); load() }
    catch { /* handled */ } finally { setBusy('') }
  }
  const readAll = async () => {
    if (busy) return
    setBusy('all')
    try { const r = await api.post('/notifications/read-all'); toast(r.message); load() }
    catch { /* handled */ } finally { setBusy('') }
  }
  const remove = async () => {
    if (busy) return
    setBusy('delete')
    try { const r = await api.delete(`/notifications/${confirm.id}`); toast(r.message); setConfirm(null); load() }
    catch { /* handled */ } finally { setBusy('') }
  }

  return (
    <>
      <PageHeader title="แจ้งเตือน" subtitle="งานใหม่ กำหนดส่ง การเข้าเรียน คะแนน และประกาศจากครู"
        actions={<Button variant="secondary" loading={busy === 'all'} disabled={Boolean(busy)} onClick={readAll}><CheckCheck className="h-4 w-4" /> อ่านทั้งหมด</Button>} />
      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <BellRing className="h-5 w-5 text-blue-500" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">ทั้งหมด {data?.total || 0} รายการ</span>
          {data?.unread > 0 && <Badge className="bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{data.unread} ยังไม่ได้อ่าน</Badge>}
          <Select label="สถานะ" value={unread} onChange={(e) => { setUnread(e.target.value); setPage(1) }} className="ml-auto w-44">
            <option value="">ทั้งหมด</option><option value="true">ยังไม่ได้อ่าน</option>
          </Select>
        </div>
        {loading ? <Loader />
          : error ? <ErrorState message="โหลดการแจ้งเตือนไม่ได้" onRetry={load} />
            : data?.items?.length ? (
          <div className="space-y-2">
            {data.items.map((n) => {
              const Icon = iconFor(n.type)
              return <div key={n.id} className={`group flex items-start gap-3 rounded-xl border p-4 transition ${n.isRead ? 'border-slate-100 bg-white dark:border-slate-700/70 dark:bg-slate-800/40' : 'border-blue-100 bg-blue-50/60 dark:border-blue-500/20 dark:bg-blue-500/10'}`}>
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${n.isRead ? 'bg-slate-100 text-slate-500 dark:bg-slate-700' : 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300'}`}><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`text-sm ${n.isRead ? 'font-medium text-slate-700 dark:text-slate-300' : 'font-bold text-slate-900 dark:text-white'}`}>{n.title}</p>
                    <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300">{typeLabel(n.type)}</Badge>
                    {!n.isRead && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{n.body}</p>
                  <p className="mt-1.5 text-xs text-slate-400">{thaiDateTime(n.createdAt)}</p>
                  {n.link && <Link to={normalizeLink(n.link)} onClick={() => !n.isRead && markRead(n.id)} className="mt-2 inline-flex items-center text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">เปิดดู →</Link>}
                </div>
                <div className="flex shrink-0 gap-1 opacity-60 transition group-hover:opacity-100">
                  {!n.isRead && <Button size="sm" variant="ghost" title="ทำเครื่องหมายว่าอ่านแล้ว" loading={busy === n.id} disabled={Boolean(busy)} onClick={() => markRead(n.id)}><Check className="h-4 w-4" /><span className="hidden sm:inline">อ่านแล้ว</span></Button>}
                  <Button size="sm" variant="ghost" title="ลบ" disabled={Boolean(busy)} onClick={() => setConfirm(n)}><Trash2 className="h-4 w-4 text-rose-500" /><span className="hidden sm:inline">ลบ</span></Button>
                </div>
              </div>
            })}
          </div>
            ) : <EmptyState icon={Bell} title="ยังไม่มีการแจ้งเตือน" description="เมื่อมีงานใหม่ กำหนดส่ง การเข้าเรียน หรือคะแนน แจ้งเตือนจะแสดงที่นี่" />}
        <div className="mt-5"><Pagination page={page} pages={data?.pages || 1} total={data?.total || 0} onChange={setPage} /></div>
      </Card>
      <Confirm open={Boolean(confirm)} onClose={() => setConfirm(null)} onConfirm={remove} loading={busy === 'delete'} title="ลบการแจ้งเตือน" message="ต้องการลบการแจ้งเตือนนี้ใช่หรือไม่?" />
    </>
  )
}
