import { test, expect, type Page } from '@playwright/test'

/**
 * Full Phase A flow:
 *   Franchisee logs in → adds a product → submits an order.
 *   Warehouse logs in → finds the order in the queue → advances it
 *   through RECEIVED → PICKING → READY → SHIPPED.
 *
 * OTP is deterministic via E2E_FIXED_OTP=000000 (set by playwright webServer).
 * Seed users (prisma/seed.ts):
 *   - Franchisee: 0550000001 (HELD עזריאלי ת"א)
 *   - Warehouse:  0550000003
 */

const FIXED_OTP = '000000'

async function login(page: Page, phone: string) {
  await page.goto('/login')
  await page.getByPlaceholder('05X-XXXXXXX').fill(phone)
  await page.getByRole('button', { name: 'שליחת קוד' }).click()
  await page.getByPlaceholder('6 ספרות').fill(FIXED_OTP)
  await page.getByRole('button', { name: 'אישור' }).click()
}

test('franchisee submits an order and warehouse ships it', async ({ browser }) => {
  // --- Franchisee places an order ---
  const franchiseeCtx = await browser.newContext()
  const fr = await franchiseeCtx.newPage()

  await login(fr, '0550000001')
  await expect(fr).toHaveURL(/\/catalog$/)

  // Add the first available product to the cart (the "+" button on the stepper)
  const addButton = fr.getByRole('button', { name: 'הוסף כמות' }).first()
  await expect(addButton).toBeVisible()
  await addButton.click()

  // Floating cart bar → go to cart
  await fr.getByRole('button', { name: /הסל שלי/ }).click()
  await expect(fr).toHaveURL(/\/cart$/)

  // Submit the order
  await fr.getByRole('button', { name: 'שליחת הזמנה' }).click()
  await expect(fr).toHaveURL(/\/orders\/.+/)

  // Success banner + capture the assigned order number
  await expect(fr.getByText('ההזמנה נשלחה בהצלחה')).toBeVisible()
  const heading = await fr.getByRole('heading').first().innerText()
  const match = heading.match(/#(\d+)/)
  expect(match, `expected an order number in heading "${heading}"`).not.toBeNull()
  const orderNumber = match![1]

  // --- Warehouse processes the order ---
  const warehouseCtx = await browser.newContext()
  const wh = await warehouseCtx.newPage()

  await login(wh, '0550000003')
  await expect(wh).toHaveURL(/\/warehouse$/)

  // Find the order in the queue by its number and open it
  const orderCard = wh.getByRole('button').filter({ hasText: `#${orderNumber}` }).first()
  await expect(orderCard).toBeVisible()
  await orderCard.click()
  await expect(wh).toHaveURL(/\/warehouse\/.+/)

  // Advance through the full state machine
  await wh.getByRole('button', { name: 'סימון התקבלה' }).click()
  await wh.getByRole('button', { name: 'התחל ליקוט' }).click()
  await wh.getByRole('button', { name: 'סימון מוכן' }).click()
  await wh.getByRole('button', { name: 'סימון נשלח' }).click()

  // SHIPPED is terminal: no further action button, and the status shows "נשלח"
  await expect(wh.getByRole('button', { name: 'סימון נשלח' })).toHaveCount(0)
  await expect(wh.getByText(/נשלח/).first()).toBeVisible()

  await franchiseeCtx.close()
  await warehouseCtx.close()
})
