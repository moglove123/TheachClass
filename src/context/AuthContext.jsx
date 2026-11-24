import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const res = await api.get('/auth/me')
      setUser(res.data)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const onUnauthorized = () => { setUser(null); window.location.href = '/login' }
    window.addEventListener('app-unauthorized', onUnauthorized)
    return () => window.removeEventListener('app-unauthorized', onUnauthorized)
  }, [])

  const login = async (email, password, successMessage) => {
    const res = await api.post('/auth/login', { email, password })
    setUser(res.data)
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { type: 'success', message: successMessage || res.message || 'เข้าสู่ระบบสำเร็จ' } }))
    return res.data
  }

  const logout = async () => {
    try { await api.post('/auth/logout') } catch { /* ignore */ }
    setUser(null)
    window.location.href = '/login'
  }

  return <AuthContext.Provider value={{ user, setUser, loading, refresh, login, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
