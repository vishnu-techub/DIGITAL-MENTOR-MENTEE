/**
 * THE institutional header, defined ONCE.
 * ---------------------------------------------------------------------------
 * Every generated document PDF — the Record Book's repeating per-page header,
 * its appended annexure cover sheets, the legacy jsPDF fallback and its annexure
 * sheets — must show the SAME header. Historically each of those drew its own
 * copy with slightly different geometry (logo box 15mm vs 17mm, college name
 * 13pt vs 14pt, some omitting the affiliation/address line, dividers at 28.4 /
 * 28.5 / 33mm, margins 12mm vs 14mm), so the header drifted between templates.
 *
 * This module is the single source of truth for:
 *   - the header TEXT (college name + verified affiliation/address lines),
 *   - the header COLOURS (KSRCE navy / gold / grey / rule),
 *   - the header GEOMETRY (all mm, measured DOWN from the physical page top),
 *   - the reserved header BAND height and the divider position,
 *   - two ready-to-call drawers: one for pdf-lib pages (y-up) and one for a
 *     jsPDF document (y-down).
 *
 * Layout produced (top → bottom): a navy accent bar spanning the content width;
 * the college logo at the top-left; the college name centred horizontally; the
 * affiliation subtitle and the address centred beneath it; an optional document
 * title / annexure label centred beneath those; then the divider rule. The
 * reserved band (headerBandMm) is always >= the divider + clearance, so body
 * content can never collide with the header.
 *
 * COORDINATE NOTE: every mm value here is "distance from the physical page TOP",
 * i.e. y-down. pdf-lib uses y-up (y = pageHeight - mm) and jsPDF uses y-down
 * (y = mm); each drawer applies the conversion so callers never have to.
 */
import { rgb } from 'pdf-lib';

/** Exact institutional name printed in every generated PDF. */
export const COLLEGE_NAME = 'K.S.R. COLLEGE OF ENGINEERING';

/** Verified affiliation line (subtitle). */
export const COLLEGE_SUBTITLE =
  '(An Autonomous Institution, Approved by AICTE, New Delhi & Affiliated to Anna University, Chennai)';

/** Verified postal address + website line. */
export const COLLEGE_ADDRESS =
  'K.S.R. Kalvi Nagar, Tiruchengode \u2013 637 215, Namakkal District, Tamil Nadu | www.ksrce.ac.in';

/** KSRCE palette, 0-255. */
export const HEADER_COLORS = {
  navy: { r: 11, g: 37, b: 69 },
  gold: { r: 197, g: 155, b: 39 },
  gray: { r: 80, g: 80, b: 80 },
  rule: { r: 200, g: 200, b: 200 },
} as const;

/**
 * Header geometry, in millimetres measured down from the physical page top.
 *
 * The numbers are chosen so nothing can overlap: the accent bar ends at 12.6mm,
 * the college name's baseline sits at 17.5mm (cap top ≈ 13.7mm, clear of the
 * bar), the logo box starts at 13mm, and the divider sits at 28.4mm (31.5mm band)
 * or 30.6mm (35mm band) — always below the last text line.
 */
export const HEADER_GEOMETRY = {
  /** Top of the navy accent bar. */
  barTopMm: 10,
  /** Height of the navy accent bar (bar occupies barTopMm .. barTopMm+this). */
  barHeightMm: 2.6,
  /** Top of the logo box. */
  logoTopMm: 13,
  /** Logo is fitted inside this square, preserving aspect ratio. */
  logoBoxMm: 15,
  /** Logo offset to the right of the content's left margin. */
  logoInsetMm: 1.5,
  /** College name baseline. */
  nameBaselineMm: 17.5,
  nameSizePt: 13,
  /** Affiliation subtitle baseline. */
  subtitleBaselineMm: 21,
  subtitleSizePt: 7,
  /** Address baseline. */
  addressBaselineMm: 24,
  addressSizePt: 7,
  /** Document-title / annexure-label baseline. */
  titleBaselineMm: 28.5,
  titleSizePt: 9.5,
} as const;

/**
 * Reserved header band height (mm) — used as the `@page` top margin for the
 * Chrome-rendered record book, and as the point below which content must start.
 * A title line needs 35mm; without one the band shrinks to 31.5mm so the freed
 * line leaves no gap.
 */
export function headerBandMm(hasTitle: boolean): number {
  return hasTitle ? 35 : 31.5;
}

/** y (mm from the page top) of the header divider, for a given band. */
export function headerRuleMm(hasTitle: boolean): number {
  return hasTitle ? 30.6 : 28.4;
}

export interface HeaderDrawOptions {
  /** Left/right content margin in mm; the bar and rule span this content width. */
  sideMm: number;
  /** True when the document prints a title / annexure-label line. */
  hasTitle: boolean;
  /** The document title or annexure label (e.g. "Annexure 1"). */
  title?: string;
}

const MM_PT = 2.83465; // 1 mm in PDF points

/**
 * Draw the institutional header onto a pdf-lib page (y-up coordinate system).
 * Called once per rendered page by the Record Book stamp.
 */
export function drawInstitutionalHeaderPdfLib(
  page: any,
  deps: { helv: any; helvBold: any; logo: any | null },
  opts: HeaderDrawOptions
): void {
  const G = HEADER_GEOMETRY;
  const C = HEADER_COLORS;
  const { width, height } = page.getSize();
  const side = opts.sideMm * MM_PT;
  const navy = rgb(C.navy.r / 255, C.navy.g / 255, C.navy.b / 255);
  const gold = rgb(C.gold.r / 255, C.gold.g / 255, C.gold.b / 255);
  const gray = rgb(C.gray.r / 255, C.gray.g / 255, C.gray.b / 255);
  const rule = rgb(C.rule.r / 255, C.rule.g / 255, C.rule.b / 255);

  // Navy accent bar, full content width, at the very top of the band.
  page.drawRectangle({
    x: side,
    y: height - (G.barTopMm + G.barHeightMm) * MM_PT,
    width: width - side * 2,
    height: G.barHeightMm * MM_PT,
    color: navy,
  });

  // College logo, top-left, fitted inside a square box (aspect ratio preserved).
  if (deps.logo) {
    const box = G.logoBoxMm * MM_PT;
    const scale = Math.min(box / deps.logo.width, box / deps.logo.height);
    const w = deps.logo.width * scale;
    const h = deps.logo.height * scale;
    page.drawImage(deps.logo, {
      x: side + G.logoInsetMm * MM_PT,
      y: height - G.logoTopMm * MM_PT - h,
      width: w,
      height: h,
    });
  }

  const centerText = (text: string, baselineMm: number, size: number, font: any, color: any): void => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y: height - baselineMm * MM_PT, size, font, color });
  };

  centerText(COLLEGE_NAME, G.nameBaselineMm, G.nameSizePt, deps.helvBold, navy);
  centerText(COLLEGE_SUBTITLE, G.subtitleBaselineMm, G.subtitleSizePt, deps.helv, gray);
  centerText(COLLEGE_ADDRESS, G.addressBaselineMm, G.addressSizePt, deps.helv, gray);
  if (opts.hasTitle && opts.title) {
    centerText(opts.title, G.titleBaselineMm, G.titleSizePt, deps.helvBold, gold);
  }

  const ruleMm = headerRuleMm(opts.hasTitle);
  page.drawLine({
    start: { x: side, y: height - ruleMm * MM_PT },
    end: { x: width - side, y: height - ruleMm * MM_PT },
    thickness: 0.5,
    color: rule,
  });
}

/**
 * Draw the institutional header onto a jsPDF document (y-down coordinate
 * system). Used by the Record Book's annexure cover sheets and by the legacy
 * jsPDF fallback (page header + its own annexure sheets).
 */
export function drawInstitutionalHeaderJsPdf(
  doc: any,
  deps: { logoBase64: string | null },
  opts: HeaderDrawOptions
): void {
  const G = HEADER_GEOMETRY;
  const C = HEADER_COLORS;
  const sw = doc.internal.pageSize.getWidth();
  const sm = opts.sideMm;

  doc.setFillColor(C.navy.r, C.navy.g, C.navy.b);
  doc.rect(sm, G.barTopMm, sw - sm * 2, G.barHeightMm, 'F');

  if (deps.logoBase64) {
    try {
      // Fit the logo inside the square box without distorting it.
      const logoW = 205;
      const logoH = 190;
      const scale = Math.min(G.logoBoxMm / logoW, G.logoBoxMm / logoH);
      doc.addImage(
        deps.logoBase64,
        'PNG',
        sm + G.logoInsetMm,
        G.logoTopMm,
        logoW * scale,
        logoH * scale
      );
    } catch {
      /* logo optional — the header still renders without it */
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(G.nameSizePt);
  doc.setTextColor(C.navy.r, C.navy.g, C.navy.b);
  doc.text(COLLEGE_NAME, sw / 2, G.nameBaselineMm, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(G.subtitleSizePt);
  doc.setTextColor(C.gray.r, C.gray.g, C.gray.b);
  doc.text(COLLEGE_SUBTITLE, sw / 2, G.subtitleBaselineMm, { align: 'center' });
  doc.setFontSize(G.addressSizePt);
  doc.text(COLLEGE_ADDRESS, sw / 2, G.addressBaselineMm, { align: 'center' });

  if (opts.hasTitle && opts.title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(G.titleSizePt);
    doc.setTextColor(C.gold.r, C.gold.g, C.gold.b);
    doc.text(opts.title, sw / 2, G.titleBaselineMm, { align: 'center' });
  }

  doc.setDrawColor(C.rule.r, C.rule.g, C.rule.b);
  doc.setLineWidth(0.5);
  const ruleMm = headerRuleMm(opts.hasTitle);
  doc.line(sm, ruleMm, sw - sm, ruleMm);
}
