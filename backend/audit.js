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

    const axeResults = await new AxePuppeteer(page).analyze();
    const lighthouseResults = await runLighthouseAudit(url);

    await browser.close();

    const pdfPath = path.join(__dirname, `reports/report_${Date.now()}.pdf`);
    await generatePDF(axeResults, lighthouseResults, url, pdfPath);

    res.json({ reportUrl: `http://localhost:${PORT}/reports/${path.basename(pdfPath)}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const runLighthouseAudit = async (url) => {
  const lighthouse = await import('lighthouse');
  const chromeLauncher = await import('chrome-launcher');
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  const options = { logLevel: 'info', output: 'json', onlyCategories: ['accessibility'], port: chrome.port };
  const runnerResult = await lighthouse.default(url, options);

  await chrome.kill();

  return runnerResult.lhr;
};

const generateCodeSnippet = (violation) => {
  let codeSnippet = '';

  switch (violation.id) {
    case 'aria-roles':
      codeSnippet = '/* Ensure the ARIA role is appropriate for the element */\n<aside role="complementary" class="cookie-consent-bar-overlay fade-fast-enter-active fadefast-enter-to">';
      break;
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

const generatePDF = (axeResults, lighthouseResults, url, pdfPath) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const writeStream = fs.createWriteStream(pdfPath);

    const websiteName = urlParser.parse(url).hostname;
    const axeViolations = axeResults.violations.length;
    const lighthouseScore = lighthouseResults.categories.accessibility.score * 100;

    let complianceStatus = 'Not Compliant';
    if (lighthouseScore >= 90 && axeViolations === 0) {
      complianceStatus = 'Compliant';
    } else if (lighthouseScore >= 50) {
      complianceStatus = 'Semi Compliant';
    }

    doc.pipe(writeStream);

    // Background color for all pages
    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#05051e').stroke();

    // Title Section
    doc
      .fillColor('#ffffff')
      .fontSize(26)
      .text('Dentsu Benelux Accessibility Audit', { align: 'center' })
      .moveDown(1.5)
      .fontSize(20)
      .text(`Scan results for ${websiteName}`, { align: 'center' })
      .moveDown(1)
      .fontSize(16)
      .text(`Compliance Status: ${complianceStatus}`, { align: 'center' })
      .moveDown(1)
      .text(`Overall Accessibility Score: ${lighthouseScore}`, { align: 'center' })
      .moveDown(1)
      .fontSize(12)
      .text('This report includes automatic accessibility checks using Axe and Lighthouse tools.', { align: 'center' })
      .moveDown(1)
      .text('Types of checks include:', { align: 'center' })
      .text('- ARIA roles', { align: 'center' })
      .text('- Color contrast', { align: 'center' })
      .text('- Image alt text', { align: 'center' })
      .text('- Form labels', { align: 'center' })
      .text('- Link names', { align: 'center' });

    doc.addPage();

    // Axe Results Section
    doc
      .fontSize(18)
      .fillColor('#ffffff')
      .text('Axe Accessibility Violations', { underline: true });

    axeResults.violations.forEach((violation, index) => {
      doc
        .moveDown(1.5)
        .roundedRect(40, doc.y, 515, 180, 10)
        .fill('#aeaebc')
        .stroke()
        .fillColor('#000000')
        .fontSize(16)
        .text(`${index + 1}. ${violation.description}`, 50, doc.y + 10, { underline: true, width: 495 })
        .fontSize(12)
        .moveDown(0.5)
        .text(`Impact: ${violation.impact}`, { width: 495 })
        .moveDown(0.5)
        .text(`Help: ${violation.help}`, { width: 495 })
        .moveDown(1);

      violation.nodes.forEach((node, nodeIndex) => {
        doc
          .fontSize(14)
          .fillColor('#000')
          .text(`Issue ${nodeIndex + 1}:`, { underline: true, width: 495 })
          .fontSize(12)
          .fillColor('#000')
          .text(`Element: ${node.target.join(', ')}`, { width: 495 })
          .moveDown(0.5)
          .fillColor('#000')
          .text(`Snippet: ${node.html}`, { width: 495 })
          .moveDown(0.5)
          .fontSize(12)
          .fillColor('#000')
          .text('How to solve:', { bold: true, width: 495 });

        node.any.forEach((item, itemIndex) => {
          doc.fontSize(12).fillColor('#000').text(`${itemIndex + 1}. ${item.message}`, { width: 495 });
        });

        const codeSnippet = generateCodeSnippet(violation);
        if (codeSnippet) {
          doc.moveDown(0.5);
          doc.fontSize(12).fillColor('#000').text('Example fix:', { bold: true, width: 495 });
          doc.fontSize(12).fillColor('#000').text(codeSnippet, { indent: 40, width: 495 });
        }

        doc.moveDown();
      });

      doc.moveDown(2);
    });

    // Lighthouse Results Section
    doc
      .fontSize(18)
      .fillColor('#ffffff')
      .text('Lighthouse Accessibility Scores', { underline: true });
    doc.fontSize(16).text(`Overall Accessibility Score: ${lighthouseScore}`, { width: 495 });
    doc.moveDown(1.5);

    Object.values(lighthouseResults.audits).forEach((audit) => {
      if (audit.score !== 1) {
        doc
          .moveDown(1.5)
          .roundedRect(40, doc.y, 515, 100, 10)
          .fill('#aeaebc')
          .stroke()
          .fillColor('#000000')
          .fontSize(16)
          .text(audit.title, 50, doc.y + 10, { underline: true, width: 495 })
          .fontSize(12)
          .moveDown(0.5)
          .text(`Description: ${audit.description}`, { width: 495 })
          .moveDown(0.5)
          .text(`Score: ${audit.score * 100}`, { width: 495 });
      }
    });

    doc.end();

    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
};

app.use('/reports', express.static(path.join(__dirname, 'reports')));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
