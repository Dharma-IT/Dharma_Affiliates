import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const supabase = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
}) : null

export async function authenticatedFetch(url: string, options: RequestInit = {}) {
  if (!supabase) throw new Error('Supabase authentication is not configured.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('Your session has expired. Sign in again to continue.')
  const headers = new Headers(options.headers)
  headers.set('Authorization', 'Bearer ' + data.session.access_token)
  return fetch(url, { ...options, headers })
}
