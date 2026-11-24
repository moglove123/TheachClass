import { Navigate, Route, Routes } from 'react-router-dom'
import { Loader, Toaster } from './components/ui.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Layout from './components/Layout.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { ForgotPasswordPage, LoginPage, RegisterPage } from './pages/AuthPages.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Classrooms from './pages/Classrooms.jsx'
import Attendance from './pages/Attendance.jsx'
import Assignments from './pages/Assignments.jsx'
import Grades from './pages/Grades.jsx'
import Notifications from './pages/Notifications.jsx'
import Reports from './pages/Reports.jsx'
import Users from './pages/Users.jsx'
import Settings from './pages/Settings.jsx'
import Audit from './pages/Audit.jsx'
import Profile from './pages/Profile.jsx'

function Protected({ children, roles }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-decor grid min-h-screen place-items-center"><Loader label="กำลังตรวจสอบสิทธิ์..." /></div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />
  return children
}

const guarded = (element, roles) => <Protected roles={roles}>{element}</Protected>

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-decor grid min-h-screen place-items-center"><Loader label="กำลังโหลดระบบ..." /></div>

  return (
    <>
      <Toaster />
      <ErrorBoundary>
      <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/classrooms" element={<Classrooms />} />
        <Route path="/classrooms/:id" element={<Classrooms />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/assignments" element={<Assignments />} />
        <Route path="/assignments/:id" element={<Assignments />} />
        <Route path="/grades" element={<Grades />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/reports" element={guarded(<Reports />, ['ADMIN', 'TEACHER'])} />
        <Route path="/users" element={guarded(<Users />, ['ADMIN'])} />
        <Route path="/settings" element={guarded(<Settings />, ['ADMIN'])} />
        <Route path="/audit" element={guarded(<Audit />, ['ADMIN'])} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </ErrorBoundary>
    </>
  )
}
