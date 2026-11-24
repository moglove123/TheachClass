import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/** กันไม่ให้หน้าเว็บทั้งหมดเป็นสีขาวเมื่อมี error จากการ render */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('TheachClass render error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="app-decor grid min-h-screen place-items-center p-4">
        <div role="alert" className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-xl dark:border-rose-500/30 dark:bg-slate-800">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">เกิดข้อผิดพลาดในการแสดงหน้านี้</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">ระบบบันทึกปัญหาแล้ว กรุณารีเฟรชหน้าเว็บเพื่อใช้งานต่อ หากยังไม่ได้ โปรดติดต่อผู้ดูแลระบบ</p>
          <button onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <RotateCcw className="h-4 w-4" /> รีเฟรชหน้าเว็บ
          </button>
        </div>
      </div>
    )
  }
}
