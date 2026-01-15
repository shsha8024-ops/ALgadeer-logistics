// Helper function to generate PDF with Arabic support
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export const generateArabicPDF = (title, subtitle, tables, filename) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Configure for RTL
  doc.setR2L(true);
  
  // Add Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  const pageWidth = doc.internal.pageSize.width;
  doc.text(title, pageWidth / 2, 20, { align: 'center' });
  
  if (subtitle) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, pageWidth / 2, 30, { align: 'center' });
  }
  
  let currentY = subtitle ? 40 : 30;
  
  // Add tables
  tables.forEach((table, index) => {
    if (index > 0) {
      currentY += 10;
    }
    
    if (table.title) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(table.title, pageWidth / 2, currentY, { align: 'center' });
      currentY += 5;
    }
    
    doc.autoTable({
      startY: currentY,
      head: table.head,
      body: table.body,
      foot: table.foot,
      styles: { 
        font: 'helvetica',
        halign: 'center',
        fontSize: 10,
        cellPadding: 3
      },
      headStyles: { 
        fillColor: [102, 126, 234],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center'
      },
      footStyles: { 
        fillColor: [240, 240, 240],
        textColor: 0,
        fontStyle: 'bold',
        halign: 'center'
      },
      alternateRowStyles: { 
        fillColor: [250, 250, 250] 
      },
      margin: { top: 10, right: 10, bottom: 10, left: 10 }
    });
    
    currentY = doc.lastAutoTable.finalY;
  });
  
  doc.save(filename);
};
