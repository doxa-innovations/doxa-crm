import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../../lib/csv.ts";
import { toLocalDateTime, formatCurrency } from "../../lib/utils.ts";
test("quoted commas, newlines, escaped quotes, BOM and CRLF survive CSV preview", () => {
  const rows = parseCsv(
    '\uFEFFfull_name,email,phone,company,source\r\n"Ada, A",a@example.test,123,"A ""quoted""\nCompany",website\r\n',
  );
  assert.equal(rows[1].length, 5);
  assert.equal(rows[1][0], "Ada, A");
  assert.equal(rows[1][3], 'A "quoted"\nCompany');
});
test("malformed CSV is rejected", () => {
  assert.throws(() =>
    parseCsv('full_name,email,phone,company,source\n"unclosed'),
  );
  assert.throws(() => parseCsv("bad,header\n1,2"));
});
test("datetime-local round trip preserves instant in Addis Ababa", () => {
  process.env.TZ = "Africa/Addis_Ababa";
  const instant = "2026-10-04T12:00:00.000Z";
  assert.equal(toLocalDateTime(instant), "2026-10-04T15:00");
  assert.equal(new Date(toLocalDateTime(instant)).toISOString(), instant);
});
test("money preserves cents", () =>
  assert.match(formatCurrency(123.45, "USD"), /123\.45/));
