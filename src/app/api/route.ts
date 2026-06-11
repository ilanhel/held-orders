import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'HELD Orders API v1',
    timestamp: new Date().toISOString(),
  })
}
