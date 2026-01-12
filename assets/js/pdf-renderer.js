/**
 * Canvas-based PDF rendering (raster).
 *
 * Why: Arabic-safe without embedding fonts in PDF. We render to canvas using browser fonts,
 * then embed each page image into PDF.
 */
import { escapeHtml } from './utils.js'; // escapeHtml unused but kept for compat

export function renderClientInvoicesToCanvases({
  brandTitle,
  brandSub,
  client,
  invoices,
  rangeText,
}){
  const pages = [];
  const page = makePage();

  page.addHeader(brandTitle, brandSub, client, rangeText);

  for(const inv of invoices){
    page.ensureSpace(80);
    page.addInvoiceBlock(inv, client);
  }

  pages.push(...page.flushAll());
  return pages; // [{canvas, wPx, hPx}]
}

function makePage(){
  const A4 = { w: 595.28, h: 841.89 };
  const scale = 2; // ~150dpi
  const wPx = Math.round(A4.w * scale);
  const hPx = Math.round(A4.h * scale);

  const margin = 28 * scale;
  const line = 1 * scale;

  const state = {
    canvases: [],
    canvas: null,
    ctx: null,
    y: margin,
  };

  function newCanvas(){
    const c = document.createElement('canvas');
    c.width = wPx;
    c.height = hPx;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, wPx, hPx);

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    state.canvas = c;
    state.ctx = ctx;
    state.y = margin;
  }

  function pushCanvas(){
    if(state.canvas){
      state.canvases.push({ canvas: state.canvas, wPx, hPx });
    }
  }

  function flushAll(){
    pushCanvas();
    const out = state.canvases.slice();
    state.canvases = [];
    state.canvas = null;
    state.ctx = null;
    return out;
  }

  function ensureSpace(px){
    if(!state.canvas) newCanvas();
    if(state.y + px > hPx - margin){
      pushCanvas();
      newCanvas();
    }
  }

  function drawText(text, x, y, fontPx, color = '#111'){
    const ctx = state.ctx;
    ctx.fillStyle = color;
    ctx.font = `${fontPx}px Tahoma, Arial, sans-serif`;
    ctx.fillText(String(text ?? ''), x, y);
  }

  function wrapText(text, maxWidth, fontPx){
    const ctx = state.ctx;
    ctx.font = `${fontPx}px Tahoma, Arial, sans-serif`;
    const words = String(text ?? '').split(/\s+/).filter(Boolean);
    const lines = [];
    let lineText = '';
    for(const w of words){
      const test = lineText ? `${lineText} ${w}` : w;
      const width = ctx.measureText(test).width;
      if(width <= maxWidth){
        lineText = test;
      }else{
        if(lineText) lines.push(lineText);
        lineText = w;
      }
    }
    if(lineText) lines.push(lineText);
    if(lines.length === 0) lines.push('');
    return lines;
  }

  function drawBox(x, y, w, h, r = 12 * scale){
    const ctx = state.ctx;
    ctx.strokeStyle = '#d7dde5';
    ctx.lineWidth = line;
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
  }

  function addHeader(brandTitle, brandSub, client, rangeText){
    ensureSpace(160);
    const ctx = state.ctx;

    const titlePx = 22 * scale;
    const subPx = 13 * scale;
    const smallPx = 11 * scale;

    drawText(brandTitle || 'الغدير نقل و تخليص', wPx - margin, state.y, titlePx, '#111');
    state.y += titlePx + 6 * scale;

    drawText(brandSub || 'كشف حساب العميل (PDF)', wPx - margin, state.y, subPx, '#5f6b7a');
    state.y += subPx + 8 * scale;

    const clientLine = `${client?.name || ''} — ${client?.phone || ''} — ${client?.location || ''}`;
    drawText(clientLine, wPx - margin, state.y, smallPx, '#5f6b7a');
    state.y += smallPx + 4 * scale;

    drawText(rangeText || '', wPx - margin, state.y, smallPx, '#5f6b7a');
    state.y += smallPx + 10 * scale;

    // divider
    ctx.strokeStyle = '#d7dde5';
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.moveTo(margin, state.y);
    ctx.lineTo(wPx - margin, state.y);
    ctx.stroke();
    state.y += 12 * scale;
  }

  function addInvoiceBlock(inv, client){
    const sym = inv.sym || '$';
    const ctx = state.ctx;

    const headPx = 14 * scale;
    const smallPx = 11 * scale;

    const blockX = margin;
    const blockW = wPx - margin * 2;

    // We estimate height dynamically; draw after measure.
    const tableMaxRowsPerPage = 18; // conservative
    const rowH = 18 * scale;

    // --- Header
    ensureSpace(70);
    const startY = state.y;
    drawBox(blockX, startY, blockW, 1); // placeholder line; real box later after height known.

    drawText(`${inv.name || 'فاتورة'}`, wPx - margin - 10 * scale, state.y + 10 * scale, headPx, '#111');
    drawText(`تاريخ: ${inv.date || '-'}`, margin + 10 * scale, state.y + 12 * scale, smallPx, '#5f6b7a');
    state.y += 44 * scale;

    // --- Operations table
    state.y += 2 * scale;
    drawText('العمليات', wPx - margin - 10 * scale, state.y, headPx, '#111');
    state.y += headPx + 8 * scale;
    const ops = inv.t1;
    state.y = drawTablePaginated({
      title: 'العمليات',
      payload: ops,
      totalLabel: 'إجمالي العمليات',
      totalValue: `${inv.s1}${sym}`,
      y: state.y,
      rowH,
      maxRowsPerPage: tableMaxRowsPerPage,
    });

    // --- Receipts table
    ensureSpace(40);
    drawText('القبوضات', wPx - margin - 10 * scale, state.y, headPx, '#111');
    state.y += headPx + 8 * scale;
    const pay = inv.t2;
    state.y = drawTablePaginated({
      title: 'القبوضات',
      payload: pay,
      totalLabel: 'مجموع القبوضات',
      totalValue: `${inv.s2}${sym}`,
      y: state.y,
      rowH,
      maxRowsPerPage: tableMaxRowsPerPage,
    });

    // --- Final table
    ensureSpace(130);
    drawText('الحساب النهائي', wPx - margin - 10 * scale, state.y, headPx, '#111');
    state.y += headPx + 8 * scale;

    const finalH = 92 * scale;
    drawBox(blockX + 10 * scale, state.y, blockW - 20 * scale, finalH, 12 * scale);

    const leftX = margin + 22 * scale;
    const rightX = wPx - margin - 22 * scale;

    const lineY = (dy) => state.y + dy;
    drawRowPair('إجمالي العمليات', `${inv.s1}${sym}`, rightX, leftX, lineY(12 * scale), smallPx);
    drawRowPair('مجموع القبوضات', `${inv.s2}${sym}`, rightX, leftX, lineY(40 * scale), smallPx);
    drawRowPair('الرصيد النهائي', `${inv.bal}${sym}`, rightX, leftX, lineY(68 * scale), smallPx, '#111');

    state.y += finalH + 18 * scale;

    // --- page separator
    ensureSpace(18);
    ctx.strokeStyle = '#eef2f6';
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.moveTo(margin, state.y);
    ctx.lineTo(wPx - margin, state.y);
    ctx.stroke();
    state.y += 14 * scale;

    function drawRowPair(label, value, rx, lx, y, fontPx, color = '#5f6b7a'){
      ctx.fillStyle = color;
      ctx.font = `${fontPx}px Tahoma, Arial, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(label, rx, y);

      ctx.fillStyle = '#111';
      ctx.textAlign = 'left';
      ctx.fillText(value, lx, y);
      ctx.textAlign = 'right';
    }
  }

  function drawTablePaginated({ payload, totalLabel, totalValue, y, rowH, maxRowsPerPage }){
    const ctx = state.ctx;
    const headers = Array.isArray(payload?.headerTitles) ? payload.headerTitles : [];
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];

    const tableX = margin + 10 * scale;
    const tableW = wPx - (margin + 10 * scale) * 2;

    // column widths: distribute, but give amount column more
    const colCount = Math.max(1, headers.length || (rows[0]?.length || 1));
    const base = tableW / colCount;
    const widths = new Array(colCount).fill(base);

    if(colCount >= 2){
      widths[colCount - 1] = base * 1.15;
      const rem = tableW - widths[colCount - 1];
      const other = rem / (colCount - 1);
      for(let i=0;i<colCount-1;i++) widths[i] = other;
    }

    const fontPx = 11 * scale;
    const headerPx = 11 * scale;
    const pad = 6 * scale;

    const drawHeader = (yy) => {
      const h = rowH + 2 * scale;
      drawGridRow({
        yy,
        texts: headers,
        widths,
        fontPx: headerPx,
        pad,
        bg: '#f2f5f9',
        bold: true,
      });
      return yy + h;
    };

    const drawBodyRow = (yy, r) => {
      const texts = [];
      for(let i=0;i<colCount;i++) texts.push(r?.[i] ?? '');
      const h = rowH + 2 * scale;
      drawGridRow({
        yy,
        texts,
        widths,
        fontPx,
        pad,
        bg: '#ffffff',
        bold: false,
      });
      return yy + h;
    };

    const drawTotals = (yy) => {
      const t = new Array(colCount).fill('');
      if(colCount >= 2) t[colCount - 2] = totalLabel;
      t[colCount - 1] = totalValue;
      const h = rowH + 2 * scale;
      drawGridRow({
        yy,
        texts: t,
        widths,
        fontPx: headerPx,
        pad,
        bg: '#eaffea',
        bold: true,
      });
      return yy + h;
    };

    const drawGridRow = ({ yy, texts, widths, fontPx, pad, bg, bold }) => {
      ensureSpace(rowH + 18 * scale);
      const ctx = state.ctx;

      // background
      ctx.fillStyle = bg;
      ctx.fillRect(tableX, yy, tableW, rowH + 2 * scale);

      // cells
      let x = tableX;
      ctx.strokeStyle = '#e3e8ef';
      ctx.lineWidth = 1 * scale;
      ctx.font = `${bold ? '700' : '400'} ${fontPx}px Tahoma, Arial, sans-serif`;
      ctx.fillStyle = '#111';
      ctx.textBaseline = 'top';

      for(let i=0;i<widths.length;i++){
        const w = widths[i];
        ctx.strokeRect(x, yy, w, rowH + 2 * scale);

        const text = String(texts[i] ?? '');
        ctx.textAlign = 'right';
        const maxW = w - pad * 2;
        const lines = wrapText(text, maxW, fontPx);
        // only 1 line to keep height stable; truncate
        const t = (lines[0] ?? '');
        const clip = ellipsize(t, maxW, fontPx);
        ctx.fillText(clip, x + w - pad, yy + pad);
        x += w;
      }
    };

    const ellipsize = (text, maxW, fontPx) => {
      const ctx = state.ctx;
      ctx.font = `${fontPx}px Tahoma, Arial, sans-serif`;
      if(ctx.measureText(text).width <= maxW) return text;
      const ell = '…';
      let s = text;
      while(s.length > 0 && ctx.measureText(s + ell).width > maxW){
        s = s.slice(0, -1);
      }
      return s + ell;
    };

    // paginate rows
    let yy = y;
    ensureSpace(rowH * 4);
    yy = drawHeader(yy);

    let printed = 0;
    for(const r of rows){
      if(printed >= maxRowsPerPage){
        // totals not yet; new page
        pushCanvas();
        newCanvas();
        // keep header brand at top? not necessary; table continues
        yy = margin;
        // small continuation label
        drawText('متابعة...', wPx - margin, yy, 11 * scale, '#5f6b7a');
        yy += 18 * scale;
        yy = drawHeader(yy);
        printed = 0;
      }
      yy = drawBodyRow(yy, r);
      printed += 1;
    }

    yy = drawTotals(yy);
    return yy + 10 * scale;
  }

  return { addHeader, addInvoiceBlock, ensureSpace, flushAll };
}

function roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
