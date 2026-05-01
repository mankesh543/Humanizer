const fs = require('fs/promises');
const path = require('path');
const { Document, Packer, Paragraph } = require('docx');

function buildParagraphs(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => new Paragraph(line));
}

async function writeDocxFile({ filePath, text }) {
  const document = new Document({
    sections: [
      {
        children: buildParagraphs(text),
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
