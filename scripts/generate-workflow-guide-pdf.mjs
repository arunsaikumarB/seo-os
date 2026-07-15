/**
 * Generate SEO OS v2 Backlink Builder — Step-by-Step User Guide (PDF)
 * Usage: node scripts/generate-workflow-guide-pdf.mjs [outputPath]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outArg = process.argv[2];
const outPath =
  outArg ||
  path.join(root, 'docs', 'SEO-OS-v2-Backlink-Builder-Step-by-Step-Guide.pdf');

const ink = rgb(0.1, 0.12, 0.16);
const muted = rgb(0.35, 0.38, 0.42);
const accent = rgb(0.08, 0.45, 0.52);
const light = rgb(0.96, 0.97, 0.98);
const line = rgb(0.85, 0.87, 0.9);

const steps = [
  {
    n: 1,
    title: 'Create Project',
    where: 'Sidebar → ① Create Project (Settings)',
    time: '~2 minutes',
    what: [
      'Confirm project name, domain, industry, and description.',
      'One project = one website. Keep client sites separated.',
      'Save changes before continuing.',
    ],
    tip: 'Everything in Backlink Builder is scoped to this project.',
  },
  {
    n: 2,
    title: 'Import Websites',
    where: 'Sidebar → ② Import Websites',
    time: '~5 minutes',
    what: [
      'Paste a list of target URLs or upload a file.',
      'Start the import — AI analysis begins automatically.',
      'Wait until websites appear in your project library.',
    ],
    tip: 'Import first. Classification and scoring run in the background.',
  },
  {
    n: 3,
    title: 'AI Discovery & Qualification',
    where: 'Sidebar → ③ AI Discovery & Qualification',
    time: '~5 minutes',
    what: [
      'Review AI classification for each site (directory, guest post, forum, etc.).',
      'AI detects the submission type — you do not choose it manually.',
      'Confirm scores and qualification status look reasonable.',
    ],
    tip: 'AI routes each opportunity into the correct content + submission workflow.',
  },
  {
    n: 4,
    title: 'Opportunity Review',
    where: 'Sidebar → ④ Opportunity Review',
    time: '~10 minutes',
    what: [
      'Open the Pending tab.',
      'Review Website, Type, Score, Traffic, Difficulty, and Est. Approval.',
      'Approve strong opportunities (or approve in bulk).',
      'On Approved rows, click Generate (Content) or Execute (Browser).',
    ],
    tip: 'Approve only sites you want to pursue. Reject low-fit opportunities.',
  },
  {
    n: 5,
    title: 'Content Studio',
    where: 'Sidebar → ⑤ Content Studio',
    time: '~10 minutes',
    what: [
      'Select an approved website.',
      'Let AI generate the submission package for the detected type.',
      'Review titles, descriptions, body copy, links, and assets.',
      'Approve the package when ready.',
    ],
    tip: 'Directories get listings; guest posts get articles; image/video types get media packs.',
  },
  {
    n: 6,
    title: 'Browser Execution',
    where: 'Sidebar → ⑥ Browser Execution',
    time: '~15 minutes (plus waiting on CAPTCHA / email)',
    what: [
      'Select approved opportunities and click Start Execution.',
      'Watch natural progress: Opening website… Studying form… Filling details…',
      'If CAPTCHA or email verification appears, complete it when prompted.',
      'Use More for Pause, Resume, Retry, or Cancel when needed.',
    ],
    tip: 'Estimated approval after submit is often 7–14 days depending on the site.',
  },
  {
    n: 7,
    title: 'Verification',
    where: 'Sidebar → ⑦ Verification',
    time: '~10 minutes',
    what: [
      'Check pending submissions for live backlinks.',
      'Mark verified wins when the link is published.',
      'Follow up on delayed or rejected submissions.',
    ],
    tip: 'Verified links feed executive reporting and success rate.',
  },
  {
    n: 8,
    title: 'Reports',
    where: 'Sidebar → ⑧ Reports',
    time: '~5 minutes',
    what: [
      'Open Executive Reports.',
      'Review submitted, verified, pending, and success rate.',
      'Download Excel, CSV, or PDF for stakeholders.',
    ],
    tip: 'Use reports for client updates — no technical worker details required.',
  },
];

const extras = [
  {
    title: 'What you will see on every page',
    bullets: [
      'Global status: current project, workflow %, AI activity, queued jobs.',
      'Stage bar: Current stage, Next stage, Progress %, estimated time left.',
      'One primary action path — Advanced tools stay under Advanced ▾.',
    ],
  },
  {
    title: 'Advanced (optional)',
    bullets: [
      'Campaigns, Relationship Hub, Image Studio, Video Studio',
      'Browser Assistant, Recommendations, Provider Settings',
      'Runtime Diagnostics, Browser Runtime, Mission Control, Learning, Settings',
    ],
  },
  {
    title: 'Human approvals you may need',
    bullets: [
      'Opportunity Approve / Reject',
      'Content / image / video package approval',
      'CAPTCHA, login, email, or phone verification during execution',
      'Final verification of published backlinks',
    ],
  },
];

function ascii(text) {
  return String(text)
    .replace(/[→▸►]/g, '->')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[…]/g, '...')
    .replace(/[①②③④⑤⑥⑦⑧⑨]/g, '')
    .replace(/[^\x20-\x7E\n]/g, '');
}

function wrap(text, font, size, maxWidth) {
  const words = ascii(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) cur = test;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageW = 612;
  const pageH = 792;
  const margin = 48;
  const contentW = pageW - margin * 2;
  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const ensure = (need) => {
    if (y - need < margin + 24) {
      footer();
      page = doc.addPage([pageW, pageH]);
      y = pageH - margin;
    }
  };

  const footer = () => {
    page.drawText('SEO OS - Backlink Builder Step-by-Step Guide - Confidential', {
      x: margin,
      y: 28,
      size: 8,
      font,
      color: muted,
    });
    page.drawText(String(doc.getPageCount()), {
      x: pageW - margin - 12,
      y: 28,
      size: 8,
      font,
      color: muted,
    });
  };

  // Cover
  page.drawRectangle({ x: 0, y: pageH - 160, width: pageW, height: 160, color: accent });
  page.drawText('SEO OS', {
    x: margin,
    y: pageH - 70,
    size: 28,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText('Backlink Builder - Step-by-Step Guide', {
    x: margin,
    y: pageH - 100,
    size: 16,
    font,
    color: rgb(0.9, 0.95, 0.96),
  });
  page.drawText('Version 2 - Guided Workflow for Enterprise Users', {
    x: margin,
    y: pageH - 122,
    size: 11,
    font,
    color: rgb(0.8, 0.9, 0.92),
  });
  y = pageH - 190;

  const intro = [
    'This guide explains the complete backlink-building workflow in SEO OS.',
    'Follow the numbered steps in the sidebar from start to finish.',
    'Normal users never need Advanced tools. AI handles classification and package type.',
    'Goal: understand the full process in under 30 seconds, then execute confidently.',
  ];
  for (const para of intro) {
    for (const ln of wrap(para, font, 11, contentW)) {
      ensure(16);
      page.drawText(ln, { x: margin, y, size: 11, font, color: ink });
      y -= 16;
    }
    y -= 4;
  }

  y -= 8;
  ensure(40);
  page.drawText('Workflow overview', { x: margin, y, size: 14, font: bold, color: ink });
  y -= 20;
  const flow =
    'Create Project -> Import -> AI Discovery -> Opportunity Review -> Content Studio -> Browser Execution -> Verification -> Reports';
  for (const ln of wrap(flow, font, 10, contentW)) {
    ensure(14);
    page.drawText(ln, { x: margin, y, size: 10, font, color: accent });
    y -= 14;
  }
  y -= 16;

  for (const step of steps) {
    ensure(120);
    page.drawRectangle({
      x: margin,
      y: y - 8,
      width: contentW,
      height: 22,
      color: light,
      borderColor: line,
      borderWidth: 0.5,
    });
    page.drawText(ascii(`Step ${step.n} - ${step.title}`), {
      x: margin + 10,
      y: y - 2,
      size: 12,
      font: bold,
      color: ink,
    });
    y -= 28;

    page.drawText(ascii(`Where: ${step.where}`), { x: margin + 4, y, size: 9, font, color: muted });
    y -= 12;
    page.drawText(ascii(`Time: ${step.time}`), { x: margin + 4, y, size: 9, font, color: muted });
    y -= 16;

    page.drawText('What to do', { x: margin + 4, y, size: 10, font: bold, color: ink });
    y -= 14;
    for (const b of step.what) {
      const lines = wrap(`-  ${b}`, font, 10, contentW - 8);
      for (const ln of lines) {
        ensure(14);
        page.drawText(ln, { x: margin + 8, y, size: 10, font, color: ink });
        y -= 13;
      }
      y -= 2;
    }

    ensure(28);
    page.drawText('Tip', { x: margin + 4, y, size: 9, font: bold, color: accent });
    y -= 12;
    for (const ln of wrap(step.tip, font, 9, contentW - 8)) {
      ensure(12);
      page.drawText(ln, { x: margin + 8, y, size: 9, font, color: muted });
      y -= 12;
    }
    y -= 18;
  }

  for (const block of extras) {
    ensure(80);
    page.drawText(ascii(block.title), { x: margin, y, size: 12, font: bold, color: ink });
    y -= 16;
    for (const b of block.bullets) {
      for (const ln of wrap(`-  ${b}`, font, 10, contentW)) {
        ensure(14);
        page.drawText(ln, { x: margin + 4, y, size: 10, font, color: ink });
        y -= 13;
      }
      y -= 2;
    }
    y -= 12;
  }

  ensure(40);
  page.drawText('Product URL', { x: margin, y, size: 10, font: bold, color: ink });
  y -= 14;
  page.drawText('https://idyllic-brigadeiros-404b59.netlify.app', {
    x: margin,
    y,
    size: 10,
    font,
    color: accent,
  });
  y -= 20;
  page.drawText('Generated for SEO OS v2 UX - Frontend guided workflow', {
    x: margin,
    y,
    size: 8,
    font,
    color: muted,
  });

  footer();

  mkdirSync(path.dirname(outPath), { recursive: true });
  const bytes = await doc.save();
  writeFileSync(outPath, bytes);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
