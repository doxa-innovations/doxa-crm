export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === "") quoted = !quoted;
      else throw new Error("Unexpected quote in CSV field.");
    } else if (!quoted && (c === "," || c === "\n" || c === "\r")) {
      row.push(cell);
      cell = "";
      if (c !== ",") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
      }
    } else cell += c;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) throw new Error("CSV is empty.");
  const required = ["full_name", "email", "phone", "company", "source"];
  if (required.some((name) => !rows[0].includes(name)))
    throw new Error(
      "CSV must contain full_name, email, phone, company, and source headers.",
    );
  if (rows.some((row) => row.length !== rows[0].length))
    throw new Error(
      "CSV rows must have the same number of fields as the header.",
    );
  return rows;
}
