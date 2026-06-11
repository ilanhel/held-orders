import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'

export default async function Home() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value

  if (!token) redirect('/login')

  const session = await verifySession(token)
  if (!session) redirect('/login')

  if (session.role === 'WAREHOUSE') redirect('/warehouse')
  if (session.role === 'ADMIN') redirect('/admin')
  redirect('/catalog')
}
