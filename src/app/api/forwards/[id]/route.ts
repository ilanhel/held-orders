import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ForwardService } from '@/services/forward.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().min(1).max(60).optional(),
  active: z.boolean().optional(),
  productIds: z.array(z.string()).max(2000).optional(),
  categoryIds: z.array(z.string()).max(200).optional(),
})

function authError(error: string | null) {
  if (error === 'Forbidden') {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: i18n.errors.forbidden } },
      { status: 403 }
    )
  }
  return NextResponse.json(
    { error: { code: 'UNAUTHORIZED', message: i18n.errors.unauthorized } },
    { status: 401 }
  )
}

function domainError(code: string) {
  if (code === 'INVALID_PHONE') {
    return NextResponse.json(
      { error: { code, message: i18n.admin.settings.invalidPhone } },
      { status: 400 }
    )
  }
  if (code === 'INVALID_NAME' || code === 'PRODUCT_NOT_FOUND' || code === 'CATEGORY_NOT_FOUND') {
    return NextResponse.json(
      { error: { code, message: i18n.errors.serverError } },
      { status: 400 }
    )
  }
  if (code === 'FORWARD_NOT_FOUND') {
    return NextResponse.json(
      { error: { code, message: i18n.errors.notFound } },
      { status: 404 }
    )
  }
  return null
}

/** PUT /api/forwards/[id] — update a forwarding destination. ADMIN only. */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  let parsed
  try {
    parsed = updateSchema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
      { status: 400 }
    )
  }

  try {
    const { id } = await params
    const forward = await ForwardService.update(id, parsed)
    return NextResponse.json({ forward })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    const res = domainError(code)
    if (res) return res
    console.error('[api/forwards PUT] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}

/** DELETE /api/forwards/[id] — delete a forwarding destination. ADMIN only. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  try {
    const { id } = await params
    await ForwardService.remove(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    const res = domainError(code)
    if (res) return res
    console.error('[api/forwards DELETE] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
