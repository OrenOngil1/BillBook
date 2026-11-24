// Values tests/setupVitest.ts pins for the VITE_* variables src/api/client.ts reads.
// Tests assert against these literals instead of re-deriving them from the code under test.
export const TEST_API_URL = "http://api.test";
export const TEST_USER_ID = 1;
