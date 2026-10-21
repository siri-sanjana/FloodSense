import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import { normalizeBrokenSpacing } from './normalize-broken-spacing';

type ExportFormat = 'pdf' | 'docx';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cleanInlineMarkdown(text: string) {
  const cleaned = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '[$1]')
    .replace(/\\([\\`*_{}[\]()#+.!<>|~-])/g, '$1');
  return normalizeBrokenSpacing(cleaned);
}

function inlineRuns(text: string) {
  const tokenPattern = /(\*\*.+?\*\*|__.+?__|\*[^*]+\*|_[^_]+_|`[^`]+`|\[\[[^\]]+\]\])/g;
  return text.split(tokenPattern).filter(Boolean).map((part) => {
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return new TextRun({ text: normalizeBrokenSpacing(part.slice(2, -2)), bold: true });
    }
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return new TextRun({ text: normalizeBrokenSpacing(part.slice(1, -1)), italics: true });
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return new TextRun({ text: normalizeBrokenSpacing(part.slice(1, -1)), font: 'Courier New' });
    }
    return new TextRun({ text: normalizeBrokenSpacing(part.replace(/\[\[([^\]]+)\]\]/g, '[$1]')) });
  });
}

function markdownParagraphs(markdown: string) {
  return markdown.split(/\n{2,}/).flatMap((block) => {
    const trimmed = block.trim();
    if (!trimmed || /^([-*_]\s*){3,}$/.test(trimmed)) return [];

    return trimmed.split('\n').flatMap((rawLine) => {
      const line = rawLine.trim();
      if (!line || /^([-*_]\s*){3,}$/.test(line)) return [];

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = Math.min(heading[1].length, 3);
        return [new Paragraph({
          text: cleanInlineMarkdown(heading[2]),
          heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          spacing: { before: 240, after: 100 },
        })];
      }

      const quote = line.match(/^>\s?(.*)$/);
      if (quote) {
        return [new Paragraph({ children: inlineRuns(quote[1]), indent: { left: 360 }, spacing: { after: 120 } })];
      }

      const bullet = line.match(/^[-*+]\s+(.+)$/);
      const ordered = line.match(/^(\d+)\.\s+(.+)$/);
      if (bullet || ordered) {
        return [new Paragraph({
          children: inlineRuns(bullet?.[1] || ordered![2]),
          bullet: bullet ? { level: 0 } : undefined,
          numbering: ordered ? { reference: 'sitrep-numbering', level: 0 } : undefined,
          spacing: { after: 80 },
        })];
      }

      return [new Paragraph({ children: inlineRuns(line), spacing: { after: 120 } })];
    });
  });
}

async function exportDocx(content: string, filename: string) {
  const documentFile = new Document({
    numbering: {
      config: [{
        reference: 'sitrep-numbering',
        levels: [{
          level: 0,
          format: 'decimal',
          text: '%1.',
          alignment: 'start',
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      }],
    },
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: 'FloodSense Situation Report (SITREP)', heading: HeadingLevel.TITLE }),
        ...markdownParagraphs(content),
      ],
    }],
  });
  downloadBlob(await Packer.toBlob(documentFile), filename);
}

function exportPdf(content: string, filename: string) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 18;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = 22;

  pdf.setCharSpace(0);
  const addPage = () => {
    pdf.addPage();
    y = 20;
    pdf.setCharSpace(0);
  };
  const addText = (rawText: string, size: number, bold: boolean, before = 0, after = 3, indent = 0) => {
    y += before;
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setCharSpace(0);
    const text = cleanInlineMarkdown(rawText);
    const lines = pdf.splitTextToSize(text, maxWidth - indent) as string[];
    const lineHeight = size * 0.42;
    for (const line of lines) {
      if (y + lineHeight > pageHeight - 18) addPage();
      pdf.setCharSpace(0);
      pdf.text(line, margin + indent, y);
      y += lineHeight;
    }
    y += after;
  };

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setCharSpace(0);
  pdf.text('FloodSense Situation Report (SITREP)', margin, y);
  y += 12;
  pdf.setDrawColor(14, 116, 144);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y - 5, pageWidth - margin, y - 5);

  content.split(/\n{2,}/).forEach((block) => {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0 || lines.every((line) => /^([-*_]\s*){3,}$/.test(line))) return;
    lines.forEach((line) => {
      if (/^([-*_]\s*){3,}$/.test(line)) return;
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const size = heading[1].length === 1 ? 14 : heading[1].length === 2 ? 12 : 10.5;
        addText(heading[2], size, true, 3, 2);
        return;
      }
      const quote = line.match(/^>\s?(.*)$/);
      if (quote) {
        addText(quote[1], 10.5, false, 1, 3, 4);
        return;
      }
      const bullet = line.match(/^[-*+]\s+(.+)$/);
      const ordered = line.match(/^(\d+)\.\s+(.+)$/);
      if (bullet || ordered) {
        addText(`${bullet ? '•' : `${ordered![1]}.`}  ${bullet?.[1] || ordered![2]}`, 10, false, 0, 1, 3);
        return;
      }
      addText(line, 10, false, 0, 1);
    });
    y += 2;
  });

  pdf.save(filename);
}

export async function exportSitrep(content: string, format: ExportFormat) {
  if (!content.trim()) throw new Error('There is no report content to export.');
  const filename = `floodsense-sitrep-${new Date().toISOString().slice(0, 10)}.${format}`;
  if (format === 'pdf') {
    exportPdf(content, filename);
  } else {
    await exportDocx(content, filename);
  }
}
