// Integration tests run against a dedicated, disposable test database.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-test-secret-test-secret";
process.env.LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || ".storage-test";
