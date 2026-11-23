/** Branded, inline-styled transactional email layout (works in Gmail/Outlook). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export type EmailContent = {
  heading: string;
  /** Paragraphs of plain text (escaped automatically). */
  paragraphs: string[];
  /** Optional key/value rows shown in a summary table. */
  rows?: [string, string][];
  /** Optional large code (OTP). */
  code?: string;
  cta?: { label: string; url: string };
  footnote?: string;
};

export function renderEmail(c: EmailContent, schoolName = "May Day College"): { html: string; text: string } {
  const p = c.paragraphs.map((t) => `<p style="margin:0 0 14px;color:#202B45;font-size:15px;line-height:1.6">${escapeHtml(t)}</p>`).join("");
  const rows = c.rows?.length
    ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:8px 0 18px;background:#F8FAFF;border-radius:12px">${c.rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:10px 14px;color:#8993A8;font-size:13px;border-bottom:1px solid #E9ECFF">${escapeHtml(k)}</td><td style="padding:10px 14px;color:#202B45;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #E9ECFF">${escapeHtml(v)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const code = c.code
    ? `<div style="margin:12px 0 20px;text-align:center"><span style="display:inline-block;letter-spacing:10px;font-size:32px;font-weight:700;color:#101C35;background:#E9ECFF;padding:14px 22px;border-radius:14px">${escapeHtml(c.code)}</span></div>`
    : "";
  const cta = c.cta
    ? `<div style="margin:22px 0"><a href="${escapeHtml(c.cta.url)}" style="display:inline-block;background:#3157C8;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px">${escapeHtml(c.cta.label)}</a></div>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#E9ECFF;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#101C35,#3157C8);padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:#101C35;padding:22px 28px"><span style="color:#E8B75A;font-size:12px;letter-spacing:2px;text-transform:uppercase">Official notice</span><div style="color:#ffffff;font-size:20px;font-weight:700;margin-top:4px">${escapeHtml(schoolName)}</div></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:21px;color:#101C35">${escapeHtml(c.heading)}</h1>${p}${code}${rows}${cta}
${c.footnote ? `<p style="margin:18px 0 0;color:#8993A8;font-size:12px;line-height:1.5">${escapeHtml(c.footnote)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;background:#F8FAFF;color:#8993A8;font-size:11px">This is an automated message from the ${escapeHtml(schoolName)} portal. Please do not reply.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    c.heading,
    "",
    ...c.paragraphs,
    c.code ? `\nCode: ${c.code}\n` : "",
    ...(c.rows ?? []).map(([k, v]) => `${k}: ${v}`),
    c.cta ? `\n${c.cta.label}: ${c.cta.url}` : "",
    c.footnote ? `\n${c.footnote}` : "",
  ].join("\n");
  return { html, text };
}
