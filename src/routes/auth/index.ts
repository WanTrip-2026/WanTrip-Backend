import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../../supabaseAdmin'

const router = Router()

console.log('[authRouter] loaded')

function setSessionCookie(res: any, payload: { sub: string; email?: string | null }) {
  const cookieName = process.env.COOKIE_NAME || 'wantrip_session'
  const token = jwt.sign(payload, process.env.APP_JWT_SECRET!, { expiresIn: '7d' })

  const isProd = process.env.NODE_ENV === 'production'
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

router.get('/cors-test', (_req, res) => {
  res.json({ ok: true })
})

/**
 * POST /api/auth/session
 * body: { access_token }
 */
const createSessionHandler = async (req: any, res: any) => {
  try {
    const { access_token } = req.body ?? {}
    if (!access_token) return res.status(400).json({ message: 'access_token required' })

    const { data, error } = await supabaseAdmin.auth.getUser(access_token)
    if (error) return res.status(401).json({ message: error.message })

    const user = data.user
    if (!user) return res.status(401).json({ message: 'Invalid token' })

    const { error: upsertErr } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email,
          full_name: (user.user_metadata as any)?.full_name || '',
        },
        { onConflict: 'id' }
      )

    if (upsertErr) return res.status(500).json({ message: upsertErr.message })

    setSessionCookie(res, { sub: user.id, email: user.email })

    return res.json({ ok: true, user: { id: user.id, email: user.email } })
  } catch (e: any) {
    console.error('[auth/session] error:', e)
    return res.status(500).json({ message: e?.message || 'Server error' })
  }
}

router.post('/session', createSessionHandler)

router.post('/exchange', createSessionHandler)

router.post('/logout', async (_req, res) => {
  const cookieName = process.env.COOKIE_NAME || 'wantrip_session'
  res.clearCookie(cookieName, { path: '/' })
  return res.json({ ok: true })
})

router.get('/me', async (req, res) => {
  const cookieName = process.env.COOKIE_NAME || 'wantrip_session'
  const token = (req as any).cookies?.[cookieName]
  if (!token) return res.json({ user: null })

  try {
    const payload = jwt.verify(token, process.env.APP_JWT_SECRET!) as any
    const userId = payload.sub

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()

    if (error) {
      console.warn('[auth/me] profile not found:', error.message)
    }

    return res.json({
      user: {
        id: userId,
        email: payload.email ?? null,
        full_name: profile?.full_name ?? null,
      },
    })
  } catch (e) {
    return res.json({ user: null })
  }
})


export default router
