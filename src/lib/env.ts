/** Server-only environment access. Never import from client components. */
export const env = {
  get appBaseUrl() {
    return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  },
  get authSecret() {
    const s = process.env.AUTH_SECRET;
    if (!s || s.length < 16) {
      if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set (min 16 chars)");
      return "development-only-insecure-secret";
    }
    return s;
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY || "";
  },
  get emailFrom() {
    return process.env.EMAIL_FROM || "May Day College <no-reply@maydaycollege.com.ng>";
  },
  get adminAlertEmail() {
    return process.env.ADMIN_ALERT_EMAIL || "";
  },
  get setupToken() {
    return process.env.SETUP_TOKEN || "";
  },
  get cronSecret() {
    return process.env.CRON_SECRET || "";
  },
  get r2() {
    return {
      accountId: process.env.R2_ACCOUNT_ID || "",
      accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      bucket: process.env.R2_BUCKET_NAME || "",
      endpoint:
        process.env.R2_ENDPOINT ||
        (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : ""),
    };
  },
  get r2Configured() {
    const r = this.r2;
    return Boolean(r.accessKeyId && r.secretAccessKey && r.bucket && r.endpoint);
  },
  get localStorageDir() {
    return process.env.LOCAL_STORAGE_DIR || ".storage";
  },
};
