import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ClipboardList, Plus, Search, Pencil, Trash2, Eye, UploadCloud, FileText,
  ArrowLeft, Clock, CheckCircle2, Star, History, ToggleLeft, ToggleRight, Download, AlertTriangle,
} from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Advanced, Badge, Button, Card, Confirm, Countdown, ErrorState, FileList, Guide, Input, Loader, Modal,
  PageHeader, Pagination, SearchBox, Select, StatCard, Table, Textarea, toast,
} from '../components/ui.jsx'
import { thaiDate, thaiDateTime } from '../utils.js'

const localInput = (v) => {
  if (!v) return ''
  const d = new Date(v)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const defaultForm = () => ({
  classroomId: '', title: '', description: '', startAt: '', dueAt: '', maxScore: 100,
  bonusScore: 0, allowLate: false, latePenaltyPercent: 0, extensionMinutes: 0,
  isOpen: true, attachments: [],
})

/** สถานะการส่งของนักเรียน 1 คนต่องาน 1 งาน (ใช้ทั้งแสดงบนการ์ดและตัวกรอง) */
const SUBMISSION_STATE = {
  sent: { status: 'SUBMITTED', label: 'ส่งแล้ว' },
  late: { status: 'LATE', label: 'ส่งช้า' },
  graded: { status: 'GRADED', label: 'ตรวจแล้ว' },
  missed: { status: 'ABSENT', label: 'ขาดส่ง' },
  pending: { status: 'PENDING_SUB', label: 'ยังไม่ส่ง' },
}
const submissionState = (assignment, missedIds) => {
  const s = assignment.mySubmission
  if (s) return s.isLate ? 'late' : s.status === 'GRADED' ? 'graded' : 'sent'
  return missedIds.has(assignment.id) ? 'missed' : 'pending'
}

function FileUploader({ files, onChange, accept, onUploadingChange }) {
  const [uploading, setUploading] = useState(false)
  const setBusyUpload = (v) => { setUploading(v); onUploadingChange?.(v) }
  const upload = async (e) => {
    const list = [...e.target.files]
    if (!list.length) return
    setBusyUpload(true)
    try {
      const fd = new FormData()
      list.forEach((f) => fd.append('files', f))
      const res = await api.post('/upload', fd)
      onChange([...(files || []), ...res.data])
      toast('อัปโหลดไฟล์สำเร็จ')
    } catch { /* handled */ } finally { setBusyUpload(false); e.target.value = '' }
  }
  return (
    <div>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-5 text-center transition hover:border-blue-400 hover:bg-blue-50/50 dark:border-slate-600 dark:hover:bg-blue-500/10">
        <UploadCloud className="h-6 w-6 text-blue-500" />
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{uploading ? 'กำลังอัปโหลด...' : 'คลิกเพื่อเลือกไฟล์ (สูงสุด 5 ไฟล์)'}</span>
        <span className="text-xs text-slate-400">PDF, Word, Excel, รูปภาพ, ZIP, PPT, TXT, CSV · ไม่เกิน 20MB ต่อไฟล์</span>
        <input type="file" multiple accept={accept} onChange={upload} className="hidden" />
      </label>
      {!!files?.length && <div className="mt-3 space-y-2">
        {files.map((f, i) => <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-700/40">
          <FileText className="h-4 w-4 text-blue-500" /><span className="flex-1 truncate text-slate-700 dark:text-slate-200">{f.name}</span>
          <span className="text-slate-400">{Math.round(f.size / 1024)} KB</span>
          <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="text-rose-500">ลบ</button>
        </div>)}
      </div>}
    </div>
  )
}

function AssignmentForm({ open, onClose, classrooms, initial, onSaved }) {
  const [form, setForm] = useState(defaultForm())
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  useEffect(() => {
    if (open) setForm(initial
      ? { ...initial, startAt: localInput(initial.startAt), dueAt: localInput(initial.dueAt), attachments: initial.attachments || [], classroomId: initial.classroomId }
      : { ...defaultForm(), classroomId: classrooms[0]?.id || '' })
  }, [open, initial, classrooms])
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    if (form.maxScore === '' || !Number.isFinite(Number(form.maxScore)) || Number(form.maxScore) < 0)
      return toast('กรุณาระบุคะแนนเต็มให้ถูกต้อง', 'error')
    setBusy(true)
    try {
      const payload = { ...form, maxScore: Number(form.maxScore) }
      if (initial) await api.patch(`/assignments/${initial.id}`, payload)
      else await api.post('/assignments', payload)
      toast(initial ? 'อัปเดตงานสำเร็จ' : 'สร้างงานสำเร็จ')
      onSaved(); onClose()
    } catch { /* handled */ } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} wide title={initial ? 'แก้ไขงาน' : 'สร้างงานใหม่'}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button form="assignment-form" type="submit" loading={busy} disabled={uploading}>บันทึก</Button></>}>
      <form id="assignment-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="ห้องเรียน *" value={form.classroomId} onChange={(e) => set('classroomId', Number(e.target.value))} required>
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="ชื่องาน *" required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="เช่น งานที่ 1: HTML/CSS พื้นฐาน" />
          <Input label="เวลาเริ่มส่ง" type="datetime-local" value={form.startAt} onChange={(e) => set('startAt', e.target.value)} />
          <Input label="กำหนดส่ง *" type="datetime-local" required value={form.dueAt} onChange={(e) => set('dueAt', e.target.value)} />
          <Input label="คะแนนเต็ม" type="number" min="0" value={form.maxScore} onChange={(e) => set('maxScore', e.target.value)} />
        </div>
        <Textarea label="รายละเอียดงาน" rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={form.isOpen} onChange={(e) => set('isOpen', e.target.checked)} /> เปิดรับส่งงาน (ปิดอยู่จะส่งไม่ได้)</label>
        <Advanced title="ตัวเลือกคะแนนและไฟล์แนบ" hint="ไม่ต้องการก็ปล่อยไว้ได้">
          <p className="mb-3 text-xs text-slate-500">คะแนนที่นักเรียนเห็น = คะแนนเต็ม + คะแนนพิเศษ</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="คะแนนพิเศษ" type="number" min="0" value={form.bonusScore} onChange={(e) => set('bonusScore', e.target.value)} />
            <Input label="ส่งช้าปรับลง (%)" type="number" min="0" max="100" value={form.latePenaltyPercent} onChange={(e) => set('latePenaltyPercent', e.target.value)} />
            <Input label="ขยายเวลา (นาที)" type="number" min="0" value={form.extensionMinutes} onChange={(e) => set('extensionMinutes', e.target.value)} />
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={form.allowLate} onChange={(e) => set('allowLate', e.target.checked)} /> อนุญาตให้ส่งช้าได้</label>
          <div className="mt-4"><p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">ไฟล์แนบของงาน</p><FileUploader files={form.attachments} onChange={(v) => set('attachments', v)} onUploadingChange={setUploading} /></div>
        </Advanced>
      </form>
    </Modal>
  )
}

function ListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [classrooms, setClassrooms] = useState([])
  const [missed, setMissed] = useState([])
  const [search, setSearch] = useState('')
  const [classroomId, setClassroomId] = useState('')
  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const isTeacher = ['ADMIN', 'TEACHER'].includes(user.role)

  const load = () => {
    setLoading(true); setError(false)
    const q = new URLSearchParams()
    if (classroomId) q.set('classroomId', classroomId)
    api.get(`/assignments?${q}`).then((res) => { setItems(res.data); setError(false) })
      .catch(() => setError(true)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [classroomId])
  useEffect(() => {
    if (!isTeacher) api.get('/assignments/missed').then((res) => setMissed(res.data)).catch(() => {})
  }, [isTeacher])
  useEffect(() => { api.get('/classrooms').then((res) => setClassrooms(res.data)) }, [])
  useEffect(() => { setPage(1) }, [search, classroomId, status])
  // /assignments/missed เป็นสิทธิ์ของนักเรียน — ครู/แอดมินเลือกตัวกรองนี้จะได้รายการว่างเสมอ
  useEffect(() => { if (isTeacher && status === 'missed') setStatus('') }, [isTeacher, status])

  const missedIds = useMemo(() => new Set(missed.map((a) => a.id)), [missed])
  const filtered = useMemo(() => items.filter((a) => {
    if (search && !a.title.toLowerCase().includes(search.toLowerCase())) return false
    if (status === 'open' && !a.isOpen) return false
    if (status === 'closed' && a.isOpen) return false
    if (status === 'missed' && !missedIds.has(a.id)) return false
    if (!isTeacher && status === 'sent' && !['sent', 'late', 'graded'].includes(submissionState(a, missedIds))) return false
    if (!isTeacher && status === 'pending' && submissionState(a, missedIds) !== 'pending') return false
    if (!isTeacher && status === 'late' && submissionState(a, missedIds) !== 'late') return false
    if (!isTeacher && status === 'graded' && submissionState(a, missedIds) !== 'graded') return false
    return true
  }), [items, search, status, missedIds, isTeacher])
  const pages = Math.max(1, Math.ceil(filtered.length / 9))
  const shown = filtered.slice((page - 1) * 9, page * 9)

  const toggle = async (a) => {
    try { const r = await api.post(`/assignments/${a.id}/toggle`, {}); toast(r.message); load() }
    catch { /* handled */ }
  }
  const remove = async () => {
    try { const r = await api.delete(`/assignments/${confirm.id}`); toast(r.message); setConfirm(null); load() }
    catch { /* handled */ }
  }

  return (
    <>
      <PageHeader title="งานและการส่งงาน" subtitle={isTeacher ? 'สร้างงาน กำหนดเวลา และตรวจคะแนนนักเรียน' : 'งานที่ได้รับมอบหมายทั้งหมดของคุณ'}
        actions={isTeacher && <Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="h-4 w-4" /> สร้างงาน</Button>} />
      <Guide steps={isTeacher
        ? ['กด “สร้างงาน” แล้วใส่ชื่องานและกำหนดส่ง', 'เปิดการ์ดงานเพื่อดูรายชื่อนักเรียนและตรวจคะแนน', 'ใช้ปุ่มเปิด/ปิดเพื่อให้นักเรียนส่งงานได้หรือหยุดส่ง']
        : ['เลือกห้องเรียนเพื่อกรองงาน', 'ดูสถานะการส่งได้เลยบนการ์ดงาน (ส่งแล้ว / ยังไม่ส่ง / ขาดส่ง)', 'เปิดงานเพื่อดูรายละเอียด แล้วอัปโหลดไฟล์ก่อนหมดเวลา']} />
      {!isTeacher && missed.length > 0 && <Card className="mb-5 border-rose-200 bg-rose-50/70 p-5 dark:border-rose-500/25 dark:bg-rose-500/10">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-rose-500" />
          <h2 className="font-semibold text-rose-800 dark:text-rose-200">งานที่ขาดส่ง ({missed.length})</h2>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setStatus(status === 'missed' ? '' : 'missed')}>
            {status === 'missed' ? 'แสดงงานทั้งหมด' : 'กรองเฉพาะงานขาดส่ง'}
          </Button>
        </div>
        <div className="space-y-2">
          {missed.slice(0, 5).map((a) => <button key={a.id} onClick={() => navigate(`/assignments/${a.id}`)}
            className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-rose-100 bg-white/80 p-3 text-left transition hover:border-rose-300 dark:border-rose-500/20 dark:bg-slate-800/60">
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800 dark:text-white">{a.title}</span>
              <span className="block truncate text-xs text-slate-500">{a.classroom?.name} · กำหนดส่ง {thaiDateTime(a.dueAt)} · เกินกำหนด {a.daysOverdue} วัน</span></span>
            <Badge status="ABSENT">ขาดส่ง</Badge>
          </button>)}
        </div>
        {missed.length > 5 && <p className="mt-3 text-xs text-rose-700 dark:text-rose-300">และอีก {missed.length - 5} งาน · กดกรองเพื่อดูทั้งหมด</p>}
      </Card>}
      <Card className="mb-5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchBox value={search} onChange={setSearch} placeholder="ค้นหาชื่องาน..." />
          <Select value={classroomId} onChange={(e) => setClassroomId(e.target.value)} className="lg:w-64"><option value="">ทุกห้องเรียน</option>{classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="lg:w-44">
            <option value="">ทุกสถานะ</option>
            <option value="open">เปิดรับส่ง</option>
            <option value="closed">ปิดรับส่ง</option>
            {!isTeacher && <>
              <option value="sent">ส่งแล้ว</option>
              <option value="pending">ยังไม่ส่ง</option>
              <option value="late">ส่งช้า</option>
              <option value="graded">ตรวจแล้ว</option>
              <option value="missed">งานที่ขาดส่ง</option>
            </>}
          </Select>
          <span className="ml-auto text-xs text-slate-400">ทั้งหมด {filtered.length} งาน</span>
        </div>
      </Card>
      {loading ? <Loader /> : error ? <Card className="p-5"><ErrorState message="ไม่สามารถโหลดรายการงานได้" onRetry={load} /></Card> : shown.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => {
            const stateKey = isTeacher ? null : submissionState(a, missedIds)
            const badge = stateKey ? SUBMISSION_STATE[stateKey] : null
            return (
              <Card key={a.id} className="flex flex-col">
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">{a.classroom?.code}</p>
                  <div className="flex flex-wrap justify-end gap-1">
                    {badge && <Badge status={badge.status}>{badge.label}</Badge>}
                    <Badge status={a.isOpen ? 'ACTIVE' : 'SUSPENDED'}>{a.isOpen ? 'เปิดรับ' : 'ปิดรับ'}</Badge>
                  </div>
                </div>
                <h3 className="mt-2 line-clamp-2 font-bold text-slate-900 dark:text-white">{a.title}</h3>
                <p className="mt-1 line-clamp-2 flex-1 text-xs text-slate-500">{a.description || 'ไม่มีรายละเอียด'}</p>
                <div className="mt-4 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <p className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> กำหนดส่ง {thaiDateTime(a.dueAt)}</p>
                  <p className="flex items-center gap-2"><Star className="h-3.5 w-3.5" /> คะแนนเต็ม {a.maxScore + a.bonusScore}</p>
                  {isTeacher && <p className="flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> ส่งแล้ว {a._count.submissions} คน</p>}
                </div>
                <div className="mt-3"><Countdown dueAt={a.dueAt} className="text-xs" /></div>
                {badge && <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-700/40 dark:text-slate-400">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                  {a.mySubmission
                    ? <span>ส่งครั้งที่ {a.mySubmission.attempt} · {thaiDateTime(a.mySubmission.submittedAt)}{a.mySubmission.score != null ? ` · คะแนน ${a.mySubmission.score}` : ''}</span>
                    : <span>{stateKey === 'missed' ? 'เกินกำหนดส่งและยังไม่ได้ส่งงาน' : 'ยังไม่ได้ส่งงาน'}</span>}
                </div>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => navigate(`/assignments/${a.id}`)}><Eye className="h-3.5 w-3.5" /> เปิดงาน</Button>
                  {isTeacher && <>
                    <Button size="sm" variant="outline" onClick={() => toggle(a)}>{a.isOpen ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}{a.isOpen ? 'ปิด' : 'เปิด'}</Button>
                    <Button size="sm" variant="ghost" title="แก้ไขงาน" onClick={() => { setEditing(a); setFormOpen(true) }}><Pencil className="h-3.5 w-3.5" /><span className="hidden xl:inline">แก้ไข</span></Button>
                    <Button size="sm" variant="ghost" title="ลบงาน" onClick={() => setConfirm(a)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /><span className="hidden xl:inline">ลบ</span></Button>
                  </>}
                </div>
              </div>
            </Card>
            )
          })}
        </div>
      ) : <Card className="p-12 text-center text-slate-400">ไม่พบงานตามเงื่อนไขที่เลือก</Card>}
      <div className="mt-5"><Pagination page={page} pages={pages} total={filtered.length} onChange={setPage} /></div>
      <AssignmentForm open={formOpen} onClose={() => setFormOpen(false)} initial={editing} classrooms={classrooms} onSaved={load} />
      <Confirm open={Boolean(confirm)} onClose={() => setConfirm(null)} onConfirm={remove} title="ลบงาน" message={`ต้องการลบงาน "${confirm?.title}" และงานที่ส่งทั้งหมดใช่หรือไม่?`} />
    </>
  )
}

function DetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isTeacher = ['ADMIN', 'TEACHER'].includes(user.role)
  const [assignment, setAssignment] = useState(null)
  const [submissions, setSubmissions] = useState(null)
  const [error, setError] = useState(false)
  const [submissionsError, setSubmissionsError] = useState(false)
  const [mySubs, setMySubs] = useState([])
  const [files, setFiles] = useState([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [grading, setGrading] = useState(null)
  const [scoreLogs, setScoreLogs] = useState([])
  const [subFilter, setSubFilter] = useState('')

  const load = () => {
    setError(false); setSubmissionsError(false)
    api.get(`/assignments/${id}`).then((res) => { setAssignment(res.data); setError(false) })
      .catch((err) => { if (err.response?.status === 404) navigate('/assignments'); else setError(true) })
    if (isTeacher) api.get(`/submissions/assignment/${id}`).then((res) => { setSubmissions(res.data); setSubmissionsError(false) }).catch(() => setSubmissionsError(true))
    else api.get(`/submissions/me?assignmentId=${id}`).then((res) => setMySubs(res.data)).catch(() => {})
  }
  useEffect(() => { load() }, [id, user.role])

  const submit = async (e) => {
    e.preventDefault()
    if (uploading) return toast('กรุณารออัปโหลดไฟล์ให้เสร็จก่อนส่งงาน', 'error')
    setBusy(true)
    try {
      const res = await api.post('/submissions', { assignmentId: Number(id), files, note })
      toast(res.message); setFiles([]); setNote(''); load()
    } catch { /* handled */ } finally { setBusy(false) }
  }
  const openGrading = async (item) => {
    setGrading({ item, score: item.submission?.score ?? '', feedback: item.submission?.feedback || '' })
    setScoreLogs([])
    if (item.submission) {
      try { const res = await api.get(`/submissions/${item.submission.id}/history`); setScoreLogs(res.data) } catch { /* handled */ }
    }
  }
  const saveGrade = async (e) => {
    e.preventDefault()
    if (!grading?.item?.submission) return toast('นักเรียนยังไม่ส่งงาน จึงยังให้คะแนนไม่ได้', 'error')
    const score = Number(grading.score)
    if (!Number.isFinite(score) || score < 0 || score > maxScore)
      return toast(`คะแนนต้องอยู่ระหว่าง 0–${maxScore}`, 'error')
    setBusy(true)
    try {
      const r = await api.post(`/submissions/${grading.item.submission.id}/grade`, { score, feedback: grading.feedback })
      toast(r.message); setGrading(null); load()
    } catch { /* handled */ } finally { setBusy(false) }
  }

  if (error) return <Card className="p-5"><ErrorState message="ไม่สามารถโหลดรายละเอียดงานได้" onRetry={load} /></Card>
  if (!assignment) return <Loader />
  const maxScore = assignment.maxScore + assignment.bonusScore
  const mySubmission = mySubs[0]
  const statusLabels = { PENDING: 'ยังไม่ส่ง', SUBMITTED: 'ส่งแล้ว', LATE: 'ส่งช้า', GRADED: 'ตรวจแล้ว' }
  const visibleSubmissions = (submissions?.items || []).filter((i) => !subFilter || i.status === subFilter)

  return (
    <>
      <PageHeader title={assignment.title} subtitle={`${assignment.classroom?.name} · ${assignment.classroom?.subject} · ครู ${assignment.creator?.firstName} ${assignment.creator?.lastName}`}
        actions={<Button variant="secondary" onClick={() => navigate('/assignments')}><ArrowLeft className="h-4 w-4" /> กลับ</Button>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge status={assignment.isOpen ? 'ACTIVE' : 'SUSPENDED'}>{assignment.isOpen ? 'เปิดรับส่งงาน' : 'ปิดรับส่งงาน'}</Badge>
              {assignment.allowLate && <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">ส่งช้าได้</Badge>}
              <span className="ml-auto"><Countdown dueAt={assignment.dueAt} /></span>
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">{assignment.description || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
            <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-700/30 sm:grid-cols-4">
              <div><p className="text-xs text-slate-400">กำหนดส่ง</p><p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{thaiDateTime(assignment.dueAt)}</p></div>
              <div><p className="text-xs text-slate-400">คะแนนเต็ม</p><p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{maxScore}</p></div>
              <div><p className="text-xs text-slate-400">คะแนนพิเศษ</p><p className="mt-1 font-medium text-slate-700 dark:text-slate-200">+{assignment.bonusScore}</p></div>
              <div><p className="text-xs text-slate-400">โทษส่งช้า</p><p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{assignment.latePenaltyPercent}%</p></div>
            </div>
            {!!assignment.attachments?.length && <div className="mt-4"><p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">ไฟล์แนบ</p><FileList files={assignment.attachments} /></div>}
          </Card>

          {!isTeacher && <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800 dark:text-white"><UploadCloud className="h-5 w-5 text-blue-500" /> {mySubmission ? 'ส่งงานอีกครั้ง (ความพยายามใหม่)' : 'ส่งงานของคุณ'}</h2>
            {mySubmission && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">ส่งไปแล้ว · ความพยายามครั้งที่ {mySubmission.attempt} · {thaiDateTime(mySubmission.submittedAt)}</p>
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">สถานะ: <Badge status={mySubmission.status} labels={statusLabels} /> {mySubmission.isLate && <span className="ml-2 text-amber-600">ส่งช้า</span>}</p>
              {mySubmission.score != null && <p className="mt-2 text-sm font-bold text-emerald-800 dark:text-emerald-200">คะแนน {mySubmission.score}/{maxScore}</p>}
              {mySubmission.feedback && <p className="mt-2 rounded-lg bg-white/70 p-2 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">💬 {mySubmission.feedback}</p>}
            </div>}
            {assignment.isOpen ? <form onSubmit={submit} className="space-y-4">
              <FileUploader files={files} onChange={setFiles} onUploadingChange={setUploading} />
              <Textarea label="ข้อความถึงครู (ไม่บังคับหากแนบไฟล์)" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" loading={busy || uploading}><UploadCloud className="h-4 w-4" /> ส่งงาน</Button>
            </form> : <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">ครูปิดรับงานนี้แล้ว ไม่สามารถส่งงานเพิ่มได้</p>}
          </Card>}
        </div>

        {isTeacher && submissionsError ? (
          <Card className="p-5"><ErrorState message="ไม่สามารถโหลดรายชื่อนักเรียนที่ส่งงานได้" onRetry={load} /></Card>
        ) : isTeacher && !submissions ? (
          <Card className="p-5"><Loader /></Card>
        ) : isTeacher && submissions ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={CheckCircle2} label="ส่งแล้ว" value={submissions.stats.submitted} tone="blue" />
              <StatCard icon={ClipboardList} label="ยังไม่ส่ง" value={submissions.stats.missing} tone="rose" />
              <StatCard icon={Star} label="ตรวจแล้ว" value={submissions.stats.graded} tone="green" />
              <StatCard icon={ClipboardList} label="คะแนนเฉลี่ย" value={submissions.stats.average} tone="violet" />
            </div>
            <Card className="p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-slate-800 dark:text-white">นักเรียนในห้อง ({submissions.items.length})</h2>
                <Select value={subFilter} onChange={(e) => setSubFilter(e.target.value)} className="w-40">
                  <option value="">ทุกสถานะ</option>
                  <option value="PENDING">ยังไม่ส่ง</option>
                  <option value="SUBMITTED">ส่งแล้ว</option>
                  <option value="LATE">ส่งช้า</option>
                  <option value="GRADED">ตรวจแล้ว</option>
                </Select>
              </div>
              <div className="max-h-[520px] space-y-2 overflow-y-auto">
                {visibleSubmissions.map((i) => <div key={i.user.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3 dark:border-slate-700">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-600 dark:bg-blue-500/15">{i.user.firstName[0]}{i.user.lastName[0]}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{i.user.firstName} {i.user.lastName}</p>
                    <p className="text-xs text-slate-400">{i.user.studentId || '—'} · ส่ง {i.submittedCount} ครั้ง</p></div>
                  <Badge status={i.status} labels={statusLabels} />
                  <Button size="sm" variant="outline" onClick={() => openGrading(i)}>{i.submission?.score != null ? `${i.submission.score} คะแนน` : i.submission ? 'ตรวจ' : 'ยังไม่ส่ง'}</Button>
                </div>)}
                {!visibleSubmissions.length && <p className="py-6 text-center text-sm text-slate-400">ไม่มีนักเรียนในสถานะนี้</p>}
              </div>
            </Card>
          </div>
        ) : !isTeacher && <Card className="p-5">
          <h2 className="mb-3 font-semibold text-slate-800 dark:text-white">ข้อมูลการส่ง</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">จำนวนนักเรียนในห้อง: {assignment.studentCount} คน</p>
          <p className="mt-2 text-xs text-slate-400">หากส่งช้าหลังกำหนด ระบบจะบันทึกว่าส่งช้า และครูสามารถพิจารณาหักคะแนนตามที่กำหนด</p>
        </Card>}
      </div>

      <Modal open={Boolean(grading)} onClose={() => setGrading(null)} title={`ตรวจงาน — ${grading?.item?.user?.firstName || ''} ${grading?.item?.user?.lastName || ''}`}
        footer={<><Button variant="secondary" onClick={() => setGrading(null)}>ยกเลิก</Button><Button form="grade-form" type="submit" loading={busy} disabled={!grading?.item?.submission}>บันทึกคะแนน</Button></>}>
        {grading?.item?.submission ? <>
          <form id="grade-form" onSubmit={saveGrade} className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-700/30">
              <p className="text-xs text-slate-500">ส่งเมื่อ {thaiDateTime(grading.item.submission.submittedAt)} · ครั้งที่ {grading.item.submission.attempt} {grading.item.submission.isLate && <span className="text-rose-500">· ส่งช้า</span>}</p>
              <div className="mt-2"><FileList files={grading.item.submission.files} /></div>
              {grading.item.submission.note && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">📝 {grading.item.submission.note}</p>}
            </div>
            <Input label={`คะแนน (0–${maxScore})`} type="number" min="0" max={maxScore} step="0.5" required value={grading.score} onChange={(e) => setGrading({ ...grading, score: e.target.value })} />
            <Textarea label="ข้อเสนอแนะ" rows={3} value={grading.feedback} onChange={(e) => setGrading({ ...grading, feedback: e.target.value })} />
          </form>
          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-700">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300"><History className="h-4 w-4" /> ประวัติการให้คะแนน</p>
            {scoreLogs.length ? scoreLogs.map((l) => <div key={l.id} className="mb-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-700/40 dark:text-slate-300">
              {l.oldScore ?? '—'} → <b>{l.newScore ?? '—'}</b> · {l.editor?.firstName} {l.editor?.lastName} · {thaiDateTime(l.createdAt)}
            </div>) : <p className="text-xs text-slate-400">ยังไม่มีประวัติ</p>}
          </div>
        </> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          นักเรียนยังไม่ส่งงานในรายการนี้ จึงยังไม่มีคะแนนให้ตรวจ ระบบจะให้คะแนนได้เมื่อมีการส่งงาน
        </div>}
      </Modal>
    </>
  )
}

export default function Assignments() {
  const { id } = useParams()
  return id ? <DetailPage /> : <ListPage />
}
