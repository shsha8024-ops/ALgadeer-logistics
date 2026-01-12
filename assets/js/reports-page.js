import { escapeHtml, getCurrencySymbol } from './utils.js';
import { loadApp, getInvoices, getStatement } from './storage.js';
import { exportWorkbook, payloadToAoA, sumAmountFromPayload } from './exports.js';

const rq = document.getElementById('rq');
const body = document.getElementById('rBody');
const btnExportAll = document.getElementById('btnExportAll');

function calcInvoiceBalance(stmt){
  const s1 = sumAmountFromPayload(stmt?.t1);
  const s2 = sumAmountFromPayload(stmt?.t2);
  return s1 - s2;
}

function clientTotal(app, clientId){
  const invs = getInvoices(app, clientId);
  let total = 0;
  for(const inv of invs){
    const stmt = getStatement(app, inv.id);
    total += calcInvoiceBalance(stmt);
  }
  return total;
}

function render(){
  const app = loadApp();
  const q = (rq.value || '').trim().toLowerCase();

  body.innerHTML = '';
  for(const c of app.clients){
    const hay = `${c.name||''} ${c.phone||''} ${c.location||''}`.toLowerCase();
    if(q && !hay.includes(q)) continue;

    const invCount = (app.invoicesByClient[c.id] || []).length;
    const total = clientTotal(app, c.id);
    const sym = getCurrencySymbol(c.currency || '$');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(c.name || '')}</td>
      <td>${escapeHtml(c.phone || '')}</td>
      <td>${escapeHtml(c.location || '')}</td>
      <td>${invCount}</td>
      <td>${escapeHtml(`${total}${sym}`)}</td>
      <td><a class="btn primary" href="invoice.html?client=${encodeURIComponent(c.id)}">فتح</a></td>
    `;
    body.appendChild(tr);
  }
}

function exportAll(){
  const app = loadApp();
  const sheets = [];

  for(const c of app.clients){
    const invs = app.invoicesByClient[c.id] || [];
    for(const inv of invs){
      const stmt = app.statementsByInvoice[inv.id];
      if(!stmt) continue;

      const sym = stmt.meta?.currency || getCurrencySymbol(c.currency || '$');
      sheets.push({ name: `${c.name}-${inv.name}-عمليات`, aoa: payloadToAoA(stmt.t1, 'إجمالي العمليات', sym) });
      sheets.push({ name: `${c.name}-${inv.name}-قبوضات`, aoa: payloadToAoA(stmt.t2, 'مجموع القبوضات', sym) });

      const s1 = sumAmountFromPayload(stmt.t1);
      const s2 = sumAmountFromPayload(stmt.t2);
      const bal = s1 - s2;
      sheets.push({ name: `${c.name}-${inv.name}-نهائي`, aoa: [['البند','القيمة'],['إجمالي العمليات',`${s1}${sym}`],['مجموع القبوضات',`${s2}${sym}`],['الرصيد النهائي',`${bal}${sym}`]] });
    }
  }

  exportWorkbook(sheets, `alghadeer_all_clients.xlsx`);
}

rq.addEventListener('input', render);
btnExportAll.addEventListener('click', exportAll);

render();
