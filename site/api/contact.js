// /api/contact — Vercel serverless relay for the contact + newsletter forms.
// Zero-cost delivery channels (read from project env vars, optional):
//   - TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID  → forwards the message to Telegram
//   - RESEND_API_KEY + CONTACT_TO_EMAIL       → forwards via Resend email
// If none are configured it answers { ok:false, reason:'not_configured' } and the
// page shows a graceful fallback instead of a dead submit.
const escapeHtml = (value = "") =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");

export default async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, reason: "method" });

  const { name, email, subject, message, kind = "contact" } = req.body || {};
  const clean = (v) => String(v ?? "").trim().slice(0, 2000);

  if (kind === "newsletter") {
    if (!clean(email)) return res.status(400).json({ ok: false, reason: "email_required" });
  } else if (!clean(name) || !clean(email) || !clean(message)) {
    return res.status(400).json({ ok: false, reason: "fields_required" });
  }

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;
  const resendKey = process.env.RESEND_API_KEY;
  const resendTo = process.env.CONTACT_TO_EMAIL;

  if (telegramToken && telegramChatId) {
    const chatId = String(telegramChatId).trim();
    const text =
      kind === "newsletter"
        ? `📮 <b>নিউজলেটার সাবস্ক্রিপশন</b>\n\n📧 ${escapeHtml(email)}`
        : `✉️ <b>নতুন যোগাযোগ</b>\n\n👤 ${escapeHtml(name)}\n📧 ${escapeHtml(email)}\n🏷 ${escapeHtml(subject)}\n\n💬 ${escapeHtml(message)}`;
    try {
      const r = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, parse_mode: "HTML", text }),
      });
      if (r.ok) return res.json({ ok: true, kind });
    } catch (error) {}
  }

  if (resendKey && resendTo) {
    const subjectLine =
      kind === "newsletter"
        ? `Newsdesk BD — newsletter subscription from ${clean(email)}`
        : `[Contact] ${clean(subject) || "বার্তা"}`;
    const html =
      kind === "newsletter"
        ? `<p><b>নিউজলেটার</b></p><p>Email: ${escapeHtml(email)}</p>`
        : `<p><b>নাম:</b> ${escapeHtml(name)}</p><p><b>ইমেইল:</b> ${escapeHtml(email)}</p><p><b>বিষয়:</b> ${escapeHtml(subject)}</p><p><b>বার্তা:</b></p><p>${escapeHtml(message)}</p>`;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.CONTACT_FROM_EMAIL || "Newsdesk BD <onboarding@resend.dev>",
          to: [resendTo],
          subject: subjectLine,
          html,
        }),
      });
      if (r.ok) return res.json({ ok: true, kind });
    } catch (error) {}
  }

  res.status(503).json({ ok: false, reason: "not_configured" });
};