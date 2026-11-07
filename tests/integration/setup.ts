process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgresql://penocracy:penocracy@localhost:5432/penocracy_test";
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.AUTH_SECRET ||= "test-secret";
