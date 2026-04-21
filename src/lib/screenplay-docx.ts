import {
  Document, Packer, Paragraph, TextRun, AlignmentType, PageOrientation,
  Header, Footer, PageNumber,
} from "docx";
import { saveAs } from "file-saver";

interface Opts { title: string; content: string; watermark?: boolean; }

const sceneRe = /^(INT\.|EXT\.|EST\.|INT\/EXT\.|I\/E\.)/;
const transitionRe = /^(CUT TO:|FADE (IN|OUT)|DISSOLVE TO:|SMASH CUT:|MATCH CUT:)/;
const parenRe = /^\s*\(.+\)\s*$/;

// 1440 DXA = 1 inch
const IN = 1440;

const FONT = "Courier New";
const FONT_SIZE = 24; // 12pt (half-points)

function classify(line: string): "blank" | "scene" | "trans" | "paren" | "char" | "action" {
  const t = line.trim();
  if (!t) return "blank";
  const upper = t.toUpperCase();
  if (sceneRe.test(upper)) return "scene";
  if (transitionRe.test(upper)) return "trans";
  if (parenRe.test(t)) return "paren";
  const isAllCaps = t === upper && /[A-Z]/.test(t);
  if (isAllCaps && t.length < 40 && !/[.!?]$/.test(t)) return "char";
  return "action";
}

function makeParagraphs(content: string): Paragraph[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const out: Paragraph[] = [];

  for (const raw of lines) {
    const line = raw.replace(/\s+$/g, "");
    const kind = classify(line);
    const text = line.trim();

    switch (kind) {
      case "blank":
        out.push(new Paragraph({ children: [new TextRun({ text: "", font: FONT, size: FONT_SIZE })] }));
        break;
      case "scene":
        out.push(new Paragraph({
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text: text.toUpperCase(), font: FONT, size: FONT_SIZE, bold: true })],
        }));
        break;
      case "trans":
        out.push(new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 120, after: 120 },
          children: [new TextRun({ text: text.toUpperCase(), font: FONT, size: FONT_SIZE })],
        }));
        break;
      case "char":
        out.push(new Paragraph({
          indent: { left: IN * 2.2 },
          spacing: { before: 120 },
          children: [new TextRun({ text: text.toUpperCase(), font: FONT, size: FONT_SIZE })],
        }));
        break;
      case "paren":
        out.push(new Paragraph({
          indent: { left: IN * 1.6 },
          children: [new TextRun({ text, font: FONT, size: FONT_SIZE })],
        }));
        break;
      case "action":
      default:
        out.push(new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text, font: FONT, size: FONT_SIZE })],
        }));
    }
  }
  return out;
}

function watermarkParagraphs(): Paragraph[] {
  // Repeated faint banner blocks to simulate a watermark on every page
  const banner = (text: string, size: number) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text, font: "Arial", size, bold: true, color: "BFBFBF" })],
    });
  return [
    banner("SCRIPTOON", 96), // 48pt
    banner("FREE PLAN — scripttoon.lovable.app", 20),
  ];
}

export async function exportScreenplayDOCX({ title, content, watermark = false }: Opts) {
  const safe = title.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "_") || "screenplay";

  const titlePage = [
    new Paragraph({ spacing: { before: IN * 3 }, children: [new TextRun({ text: "" })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title.toUpperCase(), font: FONT, size: 48, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240 },
      children: [new TextRun({ text: "Generated with ScriptToon", font: FONT, size: 24 })],
    }),
    new Paragraph({ children: [new TextRun({ text: "", break: 1 })] }),
  ];

  const body = makeParagraphs(content);

  // Optional watermark — DOCX doesn't have a true VML watermark via docx-js,
  // so we inject a faint full-page banner at the top of the document and into the header.
  const headerChildren = watermark
    ? watermarkParagraphs()
    : [new Paragraph({ children: [new TextRun({ text: "" })] })];

  const footerChildren = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Page ", font: FONT, size: 20, color: "808080" }),
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20, color: "808080" }),
      ],
    }),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: FONT_SIZE } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
            margin: { top: IN, right: IN, bottom: IN, left: Math.round(IN * 1.5) },
          },
        },
        headers: { default: new Header({ children: headerChildren }) },
        footers: { default: new Footer({ children: footerChildren }) },
        children: [...titlePage, ...body],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${safe}.docx`);
}