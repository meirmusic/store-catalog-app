// Self-service "forgot password" (task #28 v4) against a MOCKED Apps
// Script. Real email delivery can't be tested here - that stays manual
// (TEST_PLAN.md) - but every screen state and error message can.
import { test, expect } from '@playwright/test';

const MOCK_URL = 'https://mock-apps-script.test/exec';

async function openForgotPassword(page, handler) {
  await page.route('**://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('**://fonts.gstatic.com/**', (route) => route.abort());
  await page.route('**://accounts.google.com/**', (route) => route.abort());
  await page.route(MOCK_URL, async (route) => {
    const body = JSON.parse(route.request().postData());
    return route.fulfill({ json: handler(body) });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.click('button:has-text("שכחתי סיסמה")');
}

test('TC-PW-001: full reset - request a code, submit it with a new password, back to login with a success message', async ({ page }) => {
  const calls = [];
  await openForgotPassword(page, (body) => {
    calls.push(body);
    return { ok: true };
  });

  await page.fill('input[type=email]', 'office@example.com');
  await page.click('button:has-text("שליחת קוד")');
  await expect(page.locator('input[placeholder="קוד מהמייל"]')).toBeVisible();

  await page.fill('input[placeholder="קוד מהמייל"]', '123456');
  await page.fill('input[placeholder="סיסמה חדשה (לפחות 8 תווים)"]', 'new-password-1');
  await page.fill('input[placeholder="אימות סיסמה חדשה"]', 'new-password-1');
  await page.click('button:has-text("עדכון סיסמה")');

  await expect(page.locator('text=הסיסמה עודכנה - אפשר להתחבר איתה עכשיו')).toBeVisible();
  expect(calls.map((c) => c.action)).toEqual(['requestPasswordReset', 'resetPassword']);
  expect(calls[1].payload).toEqual({ email: 'office@example.com', code: '123456', newPassword: 'new-password-1' });
});

// Real report: the flow once got stuck with no email arriving. A failed
// send (e.g. the script not yet allowed to send email) must say so, not
// claim "code sent" and not blame the sign-in.
test('TC-PW-002: a failed code send says so, and the button is usable again', async ({ page }) => {
  await openForgotPassword(page, () => ({ error: 'Exception: You do not have permission to call MailApp.sendEmail' }));

  await page.fill('input[type=email]', 'office@example.com');
  await page.click('button:has-text("שליחת קוד")');

  await expect(page.locator('text=שליחת הקוד נכשלה')).toBeVisible();
  await expect(page.locator('input[placeholder="קוד מהמייל"]')).toHaveCount(0);
  await expect(page.locator('button:has-text("שליחת קוד")')).toBeEnabled();
});

test('TC-PW-003: a wrong code asks for a new one; any other failure gets an honest generic message', async ({ page }) => {
  let resetAnswer = { error: 'invalid code' };
  await openForgotPassword(page, (body) => (body.action === 'resetPassword' ? resetAnswer : { ok: true }));

  await page.fill('input[type=email]', 'office@example.com');
  await page.click('button:has-text("שליחת קוד")');
  await page.fill('input[placeholder="קוד מהמייל"]', '000000');
  await page.fill('input[placeholder="סיסמה חדשה (לפחות 8 תווים)"]', 'new-password-1');
  await page.fill('input[placeholder="אימות סיסמה חדשה"]', 'new-password-1');
  await page.click('button:has-text("עדכון סיסמה")');
  await expect(page.locator('text=הקוד שגוי או פג תוקף')).toBeVisible();

  resetAnswer = { error: 'Exception: something broke on the server' };
  await page.click('button:has-text("עדכון סיסמה")');
  await expect(page.locator('text=איפוס הסיסמה נכשל')).toBeVisible();
});

// Same principle as the item form (REG-018): the browser never blocks a
// submit with its own bubble - the app checks and shows its own message.
test('TC-PW-004: empty fields get the app\'s own message, not a browser bubble', async ({ page }) => {
  const calls = [];
  await openForgotPassword(page, (body) => {
    calls.push(body);
    return { ok: true };
  });

  await page.click('button:has-text("שליחת קוד")');
  await expect(page.locator('text=יש למלא את כל השדות')).toBeVisible();
  expect(calls).toHaveLength(0);

  await page.fill('input[type=email]', 'office@example.com');
  await page.click('button:has-text("שליחת קוד")');
  await page.click('button:has-text("עדכון סיסמה")');
  await expect(page.locator('text=יש למלא את כל השדות')).toBeVisible();
  expect(calls.map((c) => c.action)).toEqual(['requestPasswordReset']);
});
