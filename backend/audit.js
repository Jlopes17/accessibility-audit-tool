const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const { AxePuppeteer } = require('axe-puppeteer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.post('/api/audit', async (req, res) => {
  const { url, name } = req.body;

  if (!url || !name) {
    return res.status(400).json({ error: 'URL and name are required' });
  }

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url);

    const results = await new AxePuppeteer(page).analyze();
    await browser.close();

    const pdfPath = path.join(__dirname, `report_${Date.now()}.pdf`);
    await generatePDF(results, name, pdfPath);

    res.json({ reportUrl: `http://localhost:${PORT}/reports/${path.basename(pdfPath)}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const generatePDF = (results, name, pdfPath) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const writeStream = fs.createWriteStream(pdfPath);

    doc.pipe(writeStream);

    // Title
    doc.fontSize(20).text(`Accessibility Audit Report for ${name}`, { align: 'center' });
    doc.moveDown(2);

    // Summary
    doc.fontSize(14).fillColor('green').text('Compliant', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(12).fillColor('black').text('Great news! Based on our scan, your webpage is accessible and conforms with WCAG standards.', { align: 'center' });
    doc.moveDown(2);

    // Detailed Violations
    results.violations.forEach((violation, index) => {
      doc.fontSize(16).fillColor('black').text(`${index + 1}. ${violation.description}`, { underline: true });
      doc.fontSize(12).text(`Impact: ${violation.impact}`, { indent: 20 });
      doc.text(`Help: ${violation.help}`, { indent: 20 });
      doc.moveDown(1);
      doc.fontSize(14).text('Issues:', { bold: true, indent: 20 });

      violation.nodes.forEach((node, nodeIndex) => {
        doc.fontSize(12).text(`  ${nodeIndex + 1}. ${node.failureSummary}`, { indent: 40 });
        doc.text(`  Element: ${node.target.join(', ')}`, { indent: 40 });
        doc.text(`  Snippet: ${node.html}`, { indent: 40 });
        doc.moveDown(0.5);
        doc.text('How to solve:', { italic: true, indent: 40 });
        doc.text(node.any.map((item) => item.message).join('\n'), { indent: 60 });
        doc.moveDown(1);
      });

      doc.moveDown(2);
    });

    doc.end();

    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
};

app.use('/reports', express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
