import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  GraduationCap, Search, Download, History, Plus, ChartNoAxesCombined,
  CheckCircle2, XCircle, TrendingUp, Users, FileSpreadsheet,
} from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { api, downloadFile } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Badge, Button, Card, ErrorState, Guide, Input, Loader, Modal, PageHeader, Pagination, SearchBox,
  Select, StatCard, Table, toast,
} from '../components/ui.jsx'
import { thaiDateTime } from '../utils.js'

const CATEGORIES = [
  ['COLLECTION', 'คะแนนเก็บ'], ['MIDTERM', 'กลางภาค'], ['FINAL', 'ปลายภาค'],
  ['ACTIVITY', 'กิจกรรม'], ['BONUS', 'คะแนนพิเศษ'],
]

function TeacherGrades() {
  const [classrooms, setClassrooms] = useState([])
  const [classroomId, setClassroomId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [scoreForm, setScoreForm] = useState(null)
  const [history, setHistory] = useState(null)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = () => {
    if (!classroomId) return
    setLoading(true); setError(false)
    api.get(`/grades/classroom/${classroomId}`).then((res) => { setData(res.data); setError(false) })
      .catch(() => { setData(null); setError(true) }).finally(() => setLoading(false))
  }
  useEffect(() => {
    api.get('/classrooms').then((res) => {
      setClassrooms(res.data)
      if (!classroomId && res.data.length) setClassroomId(String(res.data[0].id))
    }).catch(() => setError(true))
  }, [])
  useEffect(() => { load() }, [classroomId])
  useEffect(() => { setPage(1) }, [search, gradeFilter, classroomId])

  const filtered = useMemo(() => (data?.items || []).filter((i) => {
    if (search && !`${i.firstName} ${i.lastName} ${i.studentId || ''}`.toLowerCase().includes(search.toLowerCase())) return false
    if (gradeFilter && i.grade !== gradeFilter) return false
    return true
  }), [data, search, gradeFilter])
  const pages = Math.max(1, Math.ceil(filtered.length / 12))
  const shown = filtered.slice((page - 1) * 12, page * 12)

  const saveScore = async (e) => {
    e.preventDefault()
    if (scoreForm?.score === '' || scoreForm?.maxScore === '')
      return toast('กรุณากรอกคะแนนที่ได้และคะแนนเต็ม', 'error')
    const score = Number(scoreForm?.score), maxScore = Number(scoreForm?.maxScore)
    if (!Number.isFinite(maxScore) || maxScore <= 0) return toast('กรุณาระบุคะแนนเต็มให้ถูกต้อง', 'error')
    if (!Number.isFinite(score) || score < 0 || score > maxScore) return toast(`คะแนนที่ได้ต้องอยู่ระหว่าง 0–${maxScore}`, 'error')
    setBusy(true)
    try {
      const r = await api.post(`/grades/classroom/${classroomId}/score`, { ...scoreForm, score, maxScore })
      toast(r.message); setScoreForm(null); load()
    } catch { /* handled */ } finally { setBusy(false) }
  }
  const showHistory = async (userId) => {
    try { const r = await api.get(`/grades/classroom/${classroomId}/history?userId=${userId}`); setHistory({ userId, logs: r.data }) }
    catch { toast('ไม่พบประวัติคะแนน', 'error') }
  }
  const currentClass = classrooms.find((c) => String(c.id) === String(classroomId))
  const scoreFileName = `${String(currentClass?.name || 'ชั้นเรียน').replace(/[\\/]/g, '-').replace(/\s+/g, '_')}_สรุปคะแนน.xlsx`
  const downloadAllScores = async () => {
    if (exporting) return
    if (!classroomId) return toast('กรุณาเลือกห้องเรียนก่อน', 'error')
    setExporting(true)
    try {
      await downloadFile(`/exports/student-scores?classroomId=${classroomId}`, scoreFileName)
      toast(`ดาวน์โหลดสรุปคะแนน ${currentClass?.name || ''} สำเร็จ`)
    } catch { /* toast handled */ } finally { setExporting(false) }
  }
  const downloadGrades = async () => {
    if (exporting) return
    if (!classroomId) return toast('กรุณาเลือกห้องเรียนก่อน', 'error')
    setExporting(true)
    try { await downloadFile(`/exports/grades?classroomId=${classroomId}`, 'grades.xlsx') }
    catch { /* toast handled */ } finally { setExporting(false) }
  }

  return (
    <>
      <PageHeader title="คะแนนและเกรด" subtitle="คำนวณคะแนนรวมตามสัดส่วนที่กำหนด และตัดเกรดอัตโนมัติพร้อมประวัติการแก้ไข"
        actions={<>
          <Button loading={exporting} disabled={!classroomId} onClick={downloadAllScores}><FileSpreadsheet className="h-4 w-4" /> สรุปคะแนนทั้งหมด → Excel</Button>
          <Button variant="secondary" loading={exporting} disabled={!classroomId} onClick={downloadGrades}><Download className="h-4 w-4" /> ส่งออก Excel</Button>
        </>} />
      <Guide steps={[
        'เลือกห้องเรียนที่ต้องการดูคะแนน',
        'ใช้ปุ่ม “ใส่คะแนน” แถวนักเรียนเพื่อบันทึกคะแนนเก็บ / สอบ / กิจกรรม',
        'กด “สรุปคะแนนทั้งหมด → Excel” เพื่อโหลดไฟล์ชื่อตามชั้นเรียน (คะแนนทุกคน ทุกประเภท)',
        'ระบบจะคำนวณคะแนนรวมและเกรดให้ทันที ทุกการแก้ไขมีประวัติ',
      ]} />
      <Card className="mb-5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Select label="ห้องเรียน" value={classroomId} onChange={(e) => setClassroomId(e.target.value)} className="lg:w-72">
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <SearchBox value={search} onChange={setSearch} placeholder="ค้นหาชื่อ / รหัสนักเรียน..." />
          <Select label="เกรด" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} className="lg:w-40"><option value="">ทุกเกรด</option>{(data?.scales || []).map((s) => <option key={s.id} value={s.grade}>{s.grade}</option>)}</Select>
          <Link to={classroomId ? `/classrooms/${classroomId}?tab=settings` : '/classrooms'} className="ml-auto text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">ตั้งค่าสัดส่วน / เกณฑ์ตัดเกรด →</Link>
        </div>
        {currentClass && <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
          ไฟล์สรุปคะแนนของห้องนี้จะใช้ชื่อ: <b>{scoreFileName}</b>
        </p>}
      </Card>
      {!classroomId ? <Card className="p-5"><ErrorState message="ยังไม่มีห้องเรียนสำหรับบันทึกคะแนน" /></Card>
        : loading || (!data && !error) ? <Loader />
        : error || !data ? <Card className="p-5"><ErrorState message="ไม่สามารถโหลดข้อมูลคะแนนได้" onRetry={load} /></Card>
        : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Users} label="นักเรียน" value={data.items.length} tone="blue" />
            <StatCard icon={TrendingUp} label="คะแนนเฉลี่ย" value={data.average} tone="green" />
            <StatCard icon={CheckCircle2} label="ผ่าน (>=50)" value={data.items.filter((i) => i.passed).length} tone="violet" />
            <StatCard icon={XCircle} label="ไม่ผ่าน" value={data.items.filter((i) => !i.passed).length} tone="rose" />
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <h2 className="mb-3 font-semibold text-slate-800 dark:text-white">ตารางคะแนน</h2>
              <Table headers={['รหัส', 'ชื่อ-นามสกุล', 'งาน', ...CATEGORIES.map(([, l]) => l), 'รวม', 'เกรด', '']} empty={!shown.length}>
                {shown.map((i) => <tr key={i.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-300">{i.studentId || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-700 dark:text-slate-200">{i.firstName} {i.lastName}</td>
                  <td className="px-3 py-3 text-xs text-slate-500">{i.assignmentWeighted}</td>
                  {CATEGORIES.map(([key]) => <td key={key} className="px-3 py-3 text-xs text-slate-500">{i.categories[key]}</td>)}
                  <td className="px-3 py-3 text-sm font-bold text-slate-800 dark:text-white">{i.total}</td>
                  <td className="px-3 py-3"><Badge className={i.grade === 'F' ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'}>{i.grade}</Badge></td>
                  <td className="px-3 py-3"><div className="flex gap-1">
                    <Button size="sm" variant="ghost" title="ประวัติคะแนน" onClick={() => showHistory(i.id)}><History className="h-4 w-4" /></Button>
                    <Button size="sm" variant="outline" title="ใส่คะแนน" onClick={() => setScoreForm({ userId: i.id, name: `${i.firstName} ${i.lastName}`, category: 'COLLECTION', score: '', maxScore: 20, note: '' })}><Plus className="h-4 w-4" /> ใส่คะแนน</Button>
                  </div></td>
                </tr>)}
              </Table>
              <div className="mt-4"><Pagination page={page} pages={pages} total={filtered.length} onChange={setPage} /></div>
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800 dark:text-white"><ChartNoAxesCombined className="h-4 w-4 text-blue-500" /> การกระจายเกรด</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.distribution} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fontFamily: 'Prompt' }} />
                    <YAxis type="category" dataKey="grade" tick={{ fontSize: 11, fontFamily: 'Prompt' }} width={32} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontFamily: 'Prompt', fontSize: 12 }} />
                    <Bar dataKey="count" name="จำนวนคน" fill="#2563eb" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-700/30">
                <p className="mb-1 font-semibold text-slate-700 dark:text-slate-300">สัดส่วนคะแนน</p>
                <p>งาน {data.classroom.weights.ASSIGNMENT}% · เก็บ {data.classroom.weights.COLLECTION}% · กลางภาค {data.classroom.weights.MIDTERM}% · ปลายภาค {data.classroom.weights.FINAL}% · กิจกรรม {data.classroom.weights.ACTIVITY}% · พิเศษ {data.classroom.weights.BONUS}%</p>
              </div>
            </Card>
          </div>
        </>
      )}

      <Modal open={Boolean(scoreForm)} onClose={() => setScoreForm(null)} title={`บันทึกคะแนน — ${scoreForm?.name || ''}`}
        footer={<><Button variant="secondary" onClick={() => setScoreForm(null)}>ยกเลิก</Button><Button form="score-form" type="submit" loading={busy}>บันทึก</Button></>}>
        <form id="score-form" onSubmit={saveScore} className="space-y-4">
          <Select label="ประเภทคะแนน" value={scoreForm?.category} onChange={(e) => setScoreForm({ ...scoreForm, category: e.target.value })}>
            {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="คะแนนที่ได้" type="number" min="0" step="0.5" required value={scoreForm?.score ?? ''} onChange={(e) => setScoreForm({ ...scoreForm, score: e.target.value })} />
            <Input label="คะแนนเต็ม" type="number" min="1" step="0.5" value={scoreForm?.maxScore ?? ''} onChange={(e) => setScoreForm({ ...scoreForm, maxScore: e.target.value })} />
          </div>
          <Input label="หมายเหตุ" value={scoreForm?.note || ''} onChange={(e) => setScoreForm({ ...scoreForm, note: e.target.value })} />
          <p className="text-xs text-slate-500">ระบบจะคำนวณคะแนนถ่วงน้ำหนักและเกรดใหม่ทันที และแจ้งเตือนนักเรียน</p>
        </form>
      </Modal>
      <Modal open={Boolean(history)} onClose={() => setHistory(null)} title="ประวัติการเปลี่ยนแปลงคะแนน">
        <div className="space-y-2">
          {history?.logs?.length ? history.logs.map((l) => <div key={l.id} className="rounded-lg border border-slate-100 p-3 text-sm dark:border-slate-700">
            <p className="font-medium text-slate-700 dark:text-slate-200">{CATEGORIES.find(([k]) => k === l.record?.category)?.[1] || l.record?.category}</p>
            <p className="mt-1 text-xs text-slate-500">{l.oldScore ?? '—'} → <b>{l.newScore}</b> · {l.editor?.firstName} {l.editor?.lastName} · {thaiDateTime(l.createdAt)}</p>
            {l.note && <p className="mt-1 text-xs text-slate-500">{l.note}</p>}
          </div>) : <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีประวัติการเปลี่ยนแปลง</p>}
        </div>
      </Modal>
    </>
  )
}

function StudentGrades() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const load = () => {
    setLoading(true); setError(false)
    api.get('/grades/me').then((res) => { setResults(res.data); setError(false) })
      .catch(() => setError(true)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])
  const filtered = results.filter((r) => !search || r.classroom?.name?.toLowerCase().includes(search.toLowerCase()))
  const pages = Math.max(1, Math.ceil(filtered.length / 6))
  const shown = filtered.slice((page - 1) * 6, page * 6)

  return (
    <>
      <PageHeader title="คะแนนของฉัน" subtitle="คะแนนรวม เกรด และรายละเอียดแต่ละวิชาที่เรียน" />
      <Card className="mb-5 p-4"><SearchBox value={search} onChange={setSearch} placeholder="ค้นหาวิชา..." /></Card>
      {loading ? <Loader /> : error ? <Card className="p-5"><ErrorState message="ไม่สามารถโหลดคะแนนของคุณได้" onRetry={load} /></Card> : shown.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((r) => {
            const g = r.result
            return <Card key={r.classroom.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs font-semibold text-blue-600 dark:text-blue-400">{r.classroom.subject}</p><h3 className="mt-1 font-bold text-slate-900 dark:text-white">{r.classroom.name}</h3></div>
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300"><GraduationCap className="h-6 w-6" /></div>
              </div>
              {g ? <>
                <div className="mt-5 flex items-end justify-between">
                  <div><p className="text-xs text-slate-400">คะแนนรวม</p><p className="text-3xl font-bold text-slate-900 dark:text-white">{g.total}<span className="text-sm font-normal text-slate-400"> / 100</span></p></div>
                  <Badge className="bg-blue-50 px-3 py-1.5 text-base text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{g.grade}</Badge>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"><div className={`h-full rounded-full ${g.total >= 50 ? 'bg-blue-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, g.total)}%` }} /></div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <p className="rounded-lg bg-slate-50 p-2 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300">งาน: {g.assignmentWeighted}</p>
                  {CATEGORIES.map(([k, l]) => <p key={k} className="rounded-lg bg-slate-50 p-2 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300">{l}: {g.categories[k]}</p>)}
                </div>
                <p className="mt-3 flex items-center gap-1 text-xs font-medium text-slate-500">{g.passed ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-rose-500" />} {g.passed ? 'ผ่านเกณฑ์' : 'ไม่ผ่านเกณฑ์'}</p>
              </> : <p className="mt-6 text-sm text-slate-400">ยังไม่มีข้อมูลคะแนน</p>}
            </Card>
          })}
        </div>
      ) : <Card className="p-12 text-center text-slate-400">ไม่พบวิชาที่ค้นหา</Card>}
      <div className="mt-5"><Pagination page={page} pages={pages} total={filtered.length} onChange={setPage} /></div>
    </>
  )
}

function UsersIcon() { return <GraduationCap className="h-5 w-5" /> }

export default function Grades() {
  const { user } = useAuth()
  return user?.role === 'STUDENT' ? <StudentGrades /> : <TeacherGrades />
}
