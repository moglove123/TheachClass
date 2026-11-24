import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, School, ClipboardCheck, ClipboardList, GraduationCap, Bell,
  FileSpreadsheet, Users, Settings, ScrollText, LogOut, Menu, Sun, Moon, X, MapPin, CircleHelp, UserRound,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../api.js'
import { roleLabel, thaiDay } from '../utils.js'
import { Avatar, Modal } from './ui.jsx'

const navByRole = {
  STUDENT: [
    { to: '/dashboard', label: 'หน้าแรก', icon: LayoutDashboard },
    { to: '/classrooms', label: 'ห้องเรียนของฉัน', icon: School },
    { to: '/attendance', label: 'เช็กชื่อ / การเข้าเรียน', icon: MapPin },
    { to: '/assignments', label: 'งานที่ได้รับมอบหมาย', icon: ClipboardList },
    { to: '/grades', label: 'คะแนนของฉัน', icon: GraduationCap },
    { to: '/notifications', label: 'แจ้งเตือน', icon: Bell },
  ],
  TEACHER: [
    { to: '/dashboard', label: 'หน้าแรก', icon: LayoutDashboard },
    { to: '/classrooms', label: 'ห้องเรียน', icon: School },
    { to: '/attendance', label: 'เช็กชื่อ / เข้าเรียน', icon: ClipboardCheck },
    { to: '/assignments', label: 'งานและการตรวจ', icon: ClipboardList },
    { to: '/grades', label: 'คะแนนและเกรด', icon: GraduationCap },
    { to: '/reports', label: 'รายงาน / ส่งออก Excel', icon: FileSpreadsheet },
    { to: '/notifications', label: 'แจ้งเตือน', icon: Bell },
  ],
  ADMIN: [
    { to: '/dashboard', label: 'ภาพรวมระบบ', icon: LayoutDashboard },
    { to: '/users', label: 'จัดการสมาชิก', icon: Users },
    { to: '/classrooms', label: 'ห้องเรียน / รายวิชา', icon: School },
    { to: '/reports', label: 'รายงาน / ส่งออก Excel', icon: FileSpreadsheet },
    { to: '/settings', label: 'ตั้งค่าระบบ', icon: Settings },
    { to: '/audit', label: 'ประวัติการแก้ไข', icon: ScrollText },
    { to: '/notifications', label: 'แจ้งเตือน', icon: Bell },
  ],
}

const HELP = {
  STUDENT: [
    'เข้าห้องเรียน: หน้าแรก → ห้องเรียนของฉัน → กรอกรหัสที่ครูให้',
    'เช็กชื่อ: อนุญาต GPS ในเบราว์เซอร์ → เลือกวิชา → กด “เช็กชื่อตอนนี้”',
    'ส่งงาน: งานที่ได้รับมอบหมาย → เปิดงาน → อัปโหลดไฟล์ → กดส่งงาน',
    'ดูคะแนนและประกาศได้จากเมนู “คะแนนของฉัน” และ “แจ้งเตือน”',
  ],
  TEACHER: [
    'สร้างห้องเรียนและนำรหัสเข้าห้องไปให้นักเรียน',
    'เปิดเช็กชื่อ: หน้า “เช็กชื่อ / เข้าเรียน” → เลือกวิชา → กด “เปิดเช็กชื่อ”',
    'สร้างงาน: หน้า “งานและการตรวจ” → สร้างงาน → กำหนดกำหนดส่ง',
    'ตรวจงานและดูรายงาน Excel ได้จากเมนูที่คำนำหน้าชัดเจน',
  ],
  ADMIN: [
    'จัดการสิทธิ์/ระงับบัญชีที่หน้า “จัดการสมาชิก” (บัญชีที่สมัครใหม่ใช้งานได้ทันที)',
    'สร้างห้องเรียนและมอบหมายครูได้ที่หน้า “ห้องเรียน / รายวิชา”',
    'ตั้งค่ากฎคะแนนและการแจ้งเตือนที่หน้า “ตั้งค่าระบบ”',
    'ส่งออกข้อมูลหรือสำรองระบบได้ที่หน้า “รายงาน / ส่งออก Excel”',
  ],
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/15 text-white ring-1 ring-white/20">
        <GraduationCap className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-[15px] font-semibold leading-tight text-white">TheachClass</span>
        <span className="block text-[9px] uppercase leading-tight tracking-[0.16em] text-sky-200/70">ระบบจัดการชั้นเรียน</span>
      </span>
    </div>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('cf-theme') === 'dark')
  const [unread, setUnread] = useState(0)
  const location = useLocation()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('cf-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    const load = () => api.get('/notifications?limit=1').then((res) => setUnread(res.data?.unread || 0)).catch(() => {})
    load()
    // อัปเดต badge แบบเบา ๆ แม้ไม่ได้เปิดหน้าแจ้งเตือน (ไม่ต้องกด refresh เอง)
    const timer = setInterval(load, 30000)
    window.addEventListener('app-refresh-unread', load)
    return () => {
      clearInterval(timer)
      window.removeEventListener('app-refresh-unread', load)
    }
  }, [location.pathname])

  // ทุกสิทธิ์ (นักเรียน/ครู/ผู้ดูแล) เข้าหน้าโปรไฟล์ได้เหมือนกัน
  const nav = [...(navByRole[user?.role] || []), { to: '/profile', label: 'โปรไฟล์ของฉัน', icon: UserRound }]

  const sidebar = (
    <div className="flex h-full flex-col border-r border-blue-900 bg-[#1e486b] dark:border-slate-700 dark:bg-[#0a1119]">
      <div className="flex h-14 items-center gap-2.5 border-b border-white/15 px-4 dark:border-slate-700">
        <Wordmark />
        <button onClick={() => setOpen(false)} aria-label="ปิดเมนู" className="ml-auto rounded-md p-1 text-sky-100/80 hover:bg-white/10 lg:hidden"><X className="h-5 w-5" /></button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200/60">เมนูหลัก</p>
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={() => setOpen(false)}
            className={({ isActive }) => `relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium ${
              isActive
                ? 'bg-white text-blue-800 shadow-sm ring-1 ring-slate-200/80 before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-blue-700 dark:bg-white/10 dark:text-blue-100 dark:ring-white/10 dark:before:bg-blue-300'
                : 'text-sky-50/80 hover:bg-white/10 hover:text-white dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'}`}>
            <Icon className="h-[17px] w-[17px] shrink-0" />
            <span className="flex-1 truncate">{label}</span>
            {to === '/notifications' && unread > 0 && <span className="rounded bg-rose-100 px-1.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{unread}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/15 p-2 dark:border-slate-700">
        <NavLink to="/profile" onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-white/10">
          <Avatar user={user} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-white">{user?.firstName} {user?.lastName}</span>
            <span className="block truncate text-[11px] text-sky-200/70">{roleLabel(user?.role)} · โปรไฟล์</span>
          </span>
        </NavLink>
        <button onClick={logout} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium text-sky-100/80 hover:bg-white/10 hover:text-white dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white">
          <LogOut className="h-[17px] w-[17px]" /> ออกจากระบบ
        </button>
      </div>
    </div>
  )

  return (
    <div className="app-decor min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 lg:block">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setOpen(false)}>
        <aside className="h-full w-60" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
      </div>}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-[#f2f7fc] px-4 dark:border-slate-700 dark:bg-[#111a24] sm:px-6">
          <button onClick={() => setOpen(true)} aria-label="เปิดเมนู" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800 lg:hidden"><Menu className="h-5 w-5" /></button>
          <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
            {roleLabel(user?.role)} <span className="mx-1.5 text-slate-300 dark:text-slate-600">/</span>
            <span className="capitalize">{thaiDay(new Date())}</span>
          </p>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <button onClick={() => setHelpOpen(true)} aria-label="วิธีใช้งาน" className="rounded-md p-2 text-slate-500 hover:bg-slate-200/60 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800" title="วิธีใช้งาน"><CircleHelp className="h-[18px] w-[18px]" /></button>
            <button onClick={() => setDark((d) => !d)} aria-label="เปลี่ยนโหมดสี" className="rounded-md p-2 text-slate-500 hover:bg-slate-200/60 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800" title="เปลี่ยนโหมด">
              {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <NavLink to="/notifications" aria-label="แจ้งเตือน" title="แจ้งเตือน" className="relative rounded-md p-2 text-slate-500 hover:bg-slate-200/60 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
              <Bell className="h-[18px] w-[18px]" />
              {unread > 0 && <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
            </NavLink>
            <button onClick={logout} aria-label="ออกจากระบบ" className="rounded-md p-2 text-slate-500 hover:bg-slate-200/60 hover:text-rose-700 dark:text-slate-300 dark:hover:bg-slate-800" title="ออกจากระบบ"><LogOut className="h-[18px] w-[18px]" /></button>
            <NavLink to="/profile" title="โปรไฟล์ของฉัน" className="ml-1 flex items-center gap-2 border-l border-slate-200 py-1 pl-3 dark:border-slate-700">
              <Avatar user={user} size="md" />
              <span className="hidden sm:block">
                <span className="block text-[13px] font-semibold leading-tight text-slate-800 dark:text-white">{user?.firstName} {user?.lastName}</span>
                <span className="block text-[11px] text-slate-400">{roleLabel(user?.role)}</span>
              </span>
            </NavLink>
          </div>
        </header>
        <main key={location.pathname} className="mx-auto max-w-[1440px] animate-[fadeUp_.18s_ease-out] px-4 py-6 sm:px-6 lg:px-8"><Outlet /></main>
      </div>
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={`วิธีใช้งานสำหรับ${roleLabel(user?.role)}`}>
        <ol className="space-y-2.5">
          {(HELP[user?.role] || HELP.STUDENT).map((line, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              <span className="w-4 shrink-0 pt-0.5 font-mono text-[11px] text-slate-400">{String(i + 1).padStart(2, '0')}</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      </Modal>
    </div>
  )
}
