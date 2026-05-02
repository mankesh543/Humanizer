const fs = require("fs");
const PDFDocument = require("pdfkit");

async function writePdfFile({ filePath, text }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // Add text with simple paragraph handling
      doc.fontSize(12).font("Helvetica");

      const paragraphs = text.split(/\r?\n/);
      for (const p of paragraphs) {
        if (p.trim()) {
          doc.text(p.trim(), {
            align: "left",
            lineGap: 5,
          });
          doc.moveDown(0.5);
        } else {
          doc.moveDown(1);
        }
      }

      doc.end();

      stream.on("finish", () => {
        resolve();
      });

      stream.on("error", (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  writePdfFile,
};
