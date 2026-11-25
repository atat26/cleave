// A small PDF made here, so a test needs no file of its own: `pages` pages, each saying "Page n".
// (Plain text pages in the standard Helvetica font; the byte positions in the table at the end are
// worked out, so any reader opens it without repairs.)
export function makePdf(pages) {
  const objects = []; // object n is objects[n - 1]
  const add = (text) => objects.push(text) && objects.length;
  const catalog = add('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesRoot = add('PLACEHOLDER');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  void catalog;
  const kids = [];
  for (let n = 1; n <= pages; n++) {
    const content = `BT /F1 36 Tf 72 700 Td (Page ${n}) Tj ET`;
    const contentId = add(
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
    const pageId = add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    kids.push(`${pageId} 0 R`);
  }
  objects[pagesRoot - 1] =
    `<< /Type /Pages /Count ${pages} /Kids [${kids.join(' ')}] >>`;

  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
