import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieStore = cookies()
  const headersList = headers()

  const token = cookieStore.get('auth-token')
  const host = headersList.get('host')
  const userAgent = headersList.get('user-agent')

  return NextResponse.json({
    authenticated: !!token,
    host,
    userAgent,
  })
}
