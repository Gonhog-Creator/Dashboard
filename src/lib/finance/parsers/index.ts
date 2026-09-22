import type { ParseOutput } from "../types";
import { fidelityPositionParser } from "./fidelityPositions";
import { fidelityParser } from "./fidelity";
import { ofxParser } from "./ofx";
import { csvParser } from "./csv";
import { parsePdf } from "./pdf";

/** Order matters — same as BudgetTool's ParserFactory. */
const syncParsers = [fidelityPositionParser, fidelityParser, ofxParser, csvParser];

export async function parseStatement(filename: string, content: Buffer): Promise<ParseOutput> {
  if (filename.toLowerCase().endsWith(".pdf")) {
    return parsePdf(filename, content);
  }
  for (const p of syncParsers) {
    if (p.canParse(filename, content)) return p.parse(filename, content);
  }
  throw new Error(`No parser found for file: ${filename}`);
}
