import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { CatalogService } from '@/services/catalog.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const mutateSchema = z.object({
  colorName: z.string().min(1).max(40),
  groups: z.array(z.string().min(1).max(120)).min(1).max(100),
  remove: z.boolean().optional(),
})

const newSizeSchema = z.object({
  size: z.string().min(3).max(20),
  barcode: z.string().max(64).optional(),
  colors: z.array(z.string().min(1).max(40)).min(1).max(20),
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

/** GET /api/frame-colors — variant color groups (frames, inks…). ADMIN only. */
export async function GET(req: NextRequest) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  try {
    const groups = await CatalogService.listVariantGroups()
    return NextResponse.json({ groups })
  } catch (err) {
    console.error('[api/frame-colors GET] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}

/**
 * POST /api/frame-colors — three actions (ADMIN only):
 *   - { colorName, groups }              add a variant to the groups
 *   - { colorName, groups, remove:true } hide the variant in the groups
 *   - { size, colors, barcode? }         create a NEW frame size group
 */
export async function POST(req: NextRequest) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    raw = {}
  }

  try {
    if (raw && typeof raw === 'object' && 'size' in raw) {
      const parsed = newSizeSchema.parse(raw)
      const result = await CatalogService.addFrameSize(parsed)
      return NextResponse.json(result, { status: 201 })
    }

    const parsed = mutateSchema.parse(raw)
    if (parsed.remove) {
      const result = await CatalogService.removeVariantColor(parsed.colorName, parsed.groups)
      return NextResponse.json(result)
    }
    const result = await CatalogService.addVariantColor(parsed.colorName, parsed.groups)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
        { status: 400 }
      )
    }
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (
      code === 'INVALID_COLOR' ||
      code === 'INVALID_GROUPS' ||
      code === 'INVALID_SIZE' ||
      code === 'INVALID_COLORS'
    ) {
      return NextResponse.json(
        { error: { code, message: i18n.admin.catalog.frameColorInvalid } },
        { status: 400 }
      )
    }
    if (code === 'SIZE_EXISTS') {
      return NextResponse.json(
        { error: { code, message: i18n.admin.catalog.frameSizeExists } },
        { status: 409 }
      )
    }
    if (code === 'VARIANT_GROUP_NOT_FOUND' || code === 'FRAME_CATEGORY_NOT_FOUND') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.notFound } },
        { status: 404 }
      )
    }
    console.error('[api/frame-colors POST] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}

const barcodeSchema = z.object({
  groupName: z.string().min(1).max(120),
  barcode: z.string().min(1).max(64).optional(),
  unitsPerPack: z.number().int().min(1).max(10000).optional(),
  orderNote: z.string().max(200).nullable().optional(),
})

/**
 * PUT /api/frame-colors — group-level updates applied to ALL the group's
 * variants: billing SKU and/or pack settings (unitsPerPack + order note).
 * ADMIN only.
 */
export async function PUT(req: NextRequest) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  let parsed
  try {
    parsed = barcodeSchema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
      { status: 400 }
    )
  }

  try {
    let updated = 0
    if (parsed.barcode !== undefined) {
      const r = await CatalogService.setVariantGroupBarcode(parsed.groupName, parsed.barcode)
      updated = r.updated
    }
    if (parsed.unitsPerPack !== undefined || parsed.orderNote !== undefined) {
      const r = await CatalogService.setVariantGroupPack(parsed.groupName, {
        unitsPerPack: parsed.unitsPerPack,
        orderNote: parsed.orderNote,
      })
      updated = Math.max(updated, r.updated)
    }
    return NextResponse.json({ updated })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (code === 'INVALID_BARCODE' || code === 'INVALID_UNITS_PER_PACK') {
      return NextResponse.json(
        { error: { code, message: i18n.admin.catalog.frameColorInvalid } },
        { status: 400 }
      )
    }
    if (code === 'VARIANT_GROUP_NOT_FOUND') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.notFound } },
        { status: 404 }
      )
    }
    console.error('[api/frame-colors PUT] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
