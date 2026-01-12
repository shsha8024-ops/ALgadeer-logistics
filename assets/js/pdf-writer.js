/**
 * Minimal PDF builder that supports JPEG full-page images.
 *
 * Why: offline, no dependencies, Arabic-safe via rasterized canvas.
 */
export function pdfFromJpegs({ jpegs, page = { w: 595.28, h: 841.89 } }){
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [0];

  const pushStr = (s) => { const b = enc.encode(s); chunks.push(b); offsets[0] += b.length; };
  const pushBytes = (b) => { const u = (b instanceof Uint8Array) ? b : new Uint8Array(b); chunks.push(u); offsets[0] += u.length; };

  const objects = [];
  const addObj = (bodyBytes) => {
    objects.push({ offset: offsets[0], body: bodyBytes });
    const idx = objects.length;
    pushStr(`${idx} 0 obj\n`);
    pushBytes(bodyBytes);
    pushStr(`\nendobj\n`);
    return idx;
  };

  const jpegObjs = [];
  const pageObjs = [];
  const contentObjs = [];

  // Header
  pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // Placeholder: we add objects after we have all content; but offsets depend on stream sizes
  // We'll build all objects sequentially now.

  // Build each page image, content, page object later (need Pages ref)
  // We'll first create image and content objects; then Pages; then Page objects; then Catalog.

  for(let i=0;i<jpegs.length;i++){
    const img = jpegs[i]; // {bytes:Uint8Array, wPx:number, hPx:number}
    const name = `Im${i}`;

    const imgDict =
`<<
/Type /XObject
/Subtype /Image
/Width ${img.wPx}
/Height ${img.hPx}
/ColorSpace /DeviceRGB
/BitsPerComponent 8
/Filter /DCTDecode
/Length ${img.bytes.length}
>>`;

    const imgStreamHead = enc.encode(imgDict + "\nstream\n");
    const imgStreamTail = enc.encode("\nendstream");
    const imgBody = concatBytes([imgStreamHead, img.bytes, imgStreamTail]);
    const imgObj = addObj(imgBody);
    jpegObjs.push({ obj: imgObj, name });

    // Content stream places image as full page
    const cs = `q\n${page.w} 0 0 ${page.h} 0 0 cm\n/${name} Do\nQ\n`;
    const csBytes = enc.encode(cs);
    const cDict = `<< /Length ${csBytes.length} >>\nstream\n`;
    const cHead = enc.encode(cDict);
    const cTail = enc.encode("\nendstream");
    const cBody = concatBytes([cHead, csBytes, cTail]);
    const cObj = addObj(cBody);
    contentObjs.push(cObj);

    pageObjs.push({ imgObj, contentObj: cObj }); // temporary, real page obj later
  }

  // Pages object (kids added after page objects created, but we need its obj id now)
  const pagesObjId = objects.length + 1; // next id without writing yet
  // We'll create page objects now, referencing pagesObjId
  const realPageObjIds = [];

  for(let i=0;i<pageObjs.length;i++){
    const { imgObj, contentObj } = pageObjs[i];
    const res = `<< /XObject << /Im${i} ${imgObj} 0 R >> >>`;
    const pDict =
`<<
/Type /Page
/Parent ${pagesObjId} 0 R
/Resources ${res}
/MediaBox [0 0 ${page.w} ${page.h}]
/Contents ${contentObj} 0 R
>>`;
    const pObj = addObj(enc.encode(pDict));
    realPageObjIds.push(pObj);
  }

  // Now create Pages object
  const kids = realPageObjIds.map(id => `${id} 0 R`).join(' ');
  const pagesDict =
`<<
/Type /Pages
/Count ${realPageObjIds.length}
/Kids [ ${kids} ]
>>`;
  const pagesObj = addObj(enc.encode(pagesDict));

  // Catalog
  const catalogDict =
`<<
/Type /Catalog
/Pages ${pagesObj} 0 R
>>`;
  const catalogObj = addObj(enc.encode(catalogDict));

  // xref
  const xrefOffset = offsets[0];
  pushStr('xref\n');
  pushStr(`0 ${objects.length + 1}\n`);
  pushStr('0000000000 65535 f \n');
  let running = 0
  // We didn't store per-object offsets properly since we appended sequentially; capture by recomputing using objects' stored offsets.
  for(let i=0;i<objects.length;i++){
    const off = objects[i].offset;
    pushStr(String(off).padStart(10,'0') + ' 00000 n \n');
  }

  // trailer
  pushStr('trailer\n');
  pushStr(`<< /Size ${objects.length + 1} /Root ${catalogObj} 0 R >>\n`);
  pushStr('startxref\n');
  pushStr(String(xrefOffset) + '\n%%EOF');

  return concatBytes(chunks);
}

function concatBytes(parts){
  let len = 0;
  for(const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for(const p of parts){
    out.set(p, o);
    o += p.length;
  }
  return out;
}
