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
    const doc = new PDFDocument();
    const writeStream = fs.createWriteStream(pdfPath);

    doc.pipe(writeStream);
    doc.text(`Accessibility Audit Report for ${name}`, { align: 'center' });
    doc.moveDown();
    doc.text(JSON.stringify(results, null, 2));
    doc.end();

    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
};

app.use('/reports', express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
