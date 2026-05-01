const fs = require("fs/promises");
const path = require("path");
const { Document, Packer, Paragraph } = require("docx");

function buildParagraphs(text) {
  const lines = text.split(/\r?\n/);
  const paragraphs = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line) {
      paragraphs.push(new Paragraph(line));
    }
  }

  return paragraphs.length > 0 ? paragraphs : [new Paragraph("")];
}

async function writeDocxFile({ filePath, text }) {
  const paragraphs = buildParagraphs(text);

  const document = new Document({
    sections: [
      {
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

module.exports = {
  writeDocxFile,
};
