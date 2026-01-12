/**
 * PDF export (offline, direct download).
 */
import { todayISO, getCurrencySymbol } from './utils.js';
import { pdfFromJpegs } from './pdf-writer.js';
import { renderClientInvoicesToCanvases } from './pdf-renderer.js';
import { sumAmountFromPayload } from './exports.js';

export async function downloadClientPdf({
  client,
  invoices,
  fromISO,
  toISO,
  title = 'الغدير نقل و تخليص',
}){
  const genAt = todayISO();
  const rangeText = (fromISO || toISO)
    ? `المدة: ${fromISO || '...'} → ${toISO || '...'} | تاريخ الإخراج: ${genAt}`
    : `المدة: كل الفواتير | تاريخ الإخراج: ${genAt}`;

  const enriched = invoices.map(inv => {
    const sym = inv.statement?.meta?.currency || getCurrencySymbol(client?.currency || '$');
    const s1 = sumAmountFromPayload(inv.statement?.t1);
    const s2 = sumAmountFromPayload(inv.statement?.t2);
    return {
      id: inv.id,
      name: inv.name,
      date: inv.date || inv.statement?.meta?.date || '',
      sym,
      s1, s2,
      bal: s1 - s2,
      t1: inv.statement?.t1,
      t2: inv.statement?.t2,
    };
  });

  const pages = renderClientInvoicesToCanvases({
    brandTitle: title,
    brandSub: 'كشف حساب العميل (PDF)',
    client,
    invoices: enriched,
    rangeText,
  });

  const jpegs = pages.map(p => {
    const dataUrl = p.canvas.toDataURL('image/jpeg', 0.92);
    const bytes = dataUrlToBytes(dataUrl);
    return { bytes, wPx: p.wPx, hPx: p.hPx };
  });

  const pdfBytes = pdfFromJpegs({ jpegs });
  downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), makeName(client?.name, fromISO, toISO));
}

function makeName(clientName, fromISO, toISO){
  const base = (clientName || 'عميل').replace(/\\s+/g,'_');
  if(fromISO || toISO){
    return `كشف_${base}_${fromISO || '...'}_${toISO || '...'}.pdf`;
  }
  return `كشف_${base}.pdf`;
}

function dataUrlToBytes(dataUrl){
  const m = String(dataUrl).match(/^data:.*?;base64,(.*)$/);
  const b64 = m ? m[1] : '';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
  return out;
}

function downloadBlob(blob, filename){
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
