import { NextRequest, NextResponse } from 'next/server'
import { OrderExportService } from '@/services/export.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const errorStatus: Record<string, number> = {
  ORDER_NOT_FOUND: 404,
}

/**
 * GET /api/export/order/[id]
 * Returns an XLSX file for the given order. WAREHOUSE/ADMIN only.
 * Filename: order-{number}.xlsx
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { authenticated, error } = await requireSession(req, ['WAREHOUSE', 'ADMIN'])
  if (!authenticated) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: i18n.errors.unauthorized } },
      { status: 401 }
    )
  }
  if (error === 'Forbidden') {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: i18n.errors.forbidden } },
      { status: 403 }
    )
  }

  const { id } = await ctx.params
  try {
    const { buffer, filename } = await OrderExportService.buildOrderXlsx(id)
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    const status = errorStatus[code] ?? 500
    if (status === 500) console.error('[api/export/order/:id] error:', err)
    return NextResponse.json(
      { error: { code, message: i18n.errors.serverError } },
      { status }
    )
  }
}
