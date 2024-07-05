const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const { AxePuppeteer } = require('axe-puppeteer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const urlParser = require('url');

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
    await generatePDF(results, url, pdfPath);

    res.json({ reportUrl: `http://localhost:${PORT}/reports/${path.basename(pdfPath)}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const generateCodeSnippet = (violation) => {
  let codeSnippet = '';

  switch (violation.id) {
    case 'color-contrast':
      codeSnippet = '/* Ensure sufficient color contrast */\n.element {\n  color: #000000;\n  background-color: #FFFFFF;\n}';
      break;
    case 'image-alt':
      codeSnippet = '<img src="image.jpg" alt="Description of the image">';
      break;
    case 'label':
      codeSnippet = '<label for="input-id">Label text</label>\n<input id="input-id" type="text">';
      break;
    case 'link-name':
      codeSnippet = '<a href="destination.html">Descriptive Link Text</a>';
      break;
    // Add more cases as needed for different violations
    default:
      codeSnippet = '/* Add appropriate fixes here based on the violation */';
  }

  return codeSnippet;
};

const generatePDF = (results, url, pdfPath) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const writeStream = fs.createWriteStream(pdfPath);

    const websiteName = urlParser.parse(url).hostname;

    doc.pipe(writeStream);

    // Title
    doc.fontSize(20).text(`Accessibility Audit Report for ${websiteName}`, { align: 'center' });
    doc.moveDown(2);

    // Detailed Violations
    results.violations.forEach((violation, index) => {
      doc
        .rect(doc.x, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right, 150)
        .fill('#f5f5f5')
        .stroke();

      doc
        .fillColor('#000000')
        .fontSize(16)
        .text(`${index + 1}. ${violation.description}`, { underline: true, continued: true })
        .fontSize(12)
        .text(` (Impact: ${violation.impact})`, { align: 'right', continued: false });

      doc.moveDown();
      doc.fontSize(12).text(`Help: ${violation.help}`);
      doc.moveDown();

      violation.nodes.forEach((node, nodeIndex) => {
        doc.fontSize(14).fillColor('#000').text(`Issue ${nodeIndex + 1}:`, { underline: true });
        doc.fontSize(12).fillColor('#000').text(`Element: ${node.target.join(', ')}`);
        doc.moveDown(0.5);
        doc.fillColor('#000').text(`Snippet: ${node.html}`);
        doc.moveDown(0.5);

        doc.fontSize(12).fillColor('#000').text('How to solve:', { bold: true });
        node.any.forEach((item, itemIndex) => {
          doc.fontSize(12).fillColor('#000').text(`${itemIndex + 1}. ${item.message}`);
        });

        const codeSnippet = generateCodeSnippet(violation);
        if (codeSnippet) {
          doc.moveDown(0.5);
          doc.fontSize(12).fillColor('#000').text('Example fix:', { bold: true });
          doc.fontSize(12).fillColor('#000').text(codeSnippet, { indent: 40 });
        }

        doc.moveDown();
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
