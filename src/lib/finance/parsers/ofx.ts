import { parseSync } from "ofx-js";
import type { Parser, ParseOutput, ParsedTransaction } from "../types";
import { detectAccountType, detectTransactionType } from "./shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Depth-first search for the first array/object under a named key. */
function findKey(node: any, key: string): any {
  if (!node || typeof node !== "object") return undefined;
  if (key in node) return node[key];
  for (const v of Object.values(node)) {
    const hit = findKey(v, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function asArray<T = any>(v: any): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** OFX dates: YYYYMMDDHHMMSS[.xxx][gmt offset] — take the date part. */
function parseOfxDate(raw: any): Date | null {
  if (!raw) return null;
  const s = String(raw);
  const m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

export const ofxParser: Parser = {
  canParse: (filename) => /\.(ofx|qfx|qbo)$/i.test(filename),

  parse(filename, content): ParseOutput {
    const text = content.toString("utf-8");
    const ofx = parseSync(text) as any;

    const stmtTrns = asArray(findKey(ofx, "STMTTRN"));
    if (stmtTrns.length === 0) throw new Error("No transactions found in OFX file");

    const acctFrom = findKey(ofx, "BANKACCTFROM") ?? findKey(ofx, "CCACCTFROM");
    const accountId: string | undefined = acctFrom?.ACCTID;
    const fiOrg: string | undefined = findKey(ofx, "FI")?.ORG;

    const isCreditCard = Boolean(findKey(ofx, "CCSTMTRS")) ||
      /credit/i.test(String(acctFrom?.ACCTTYPE ?? ""));
    const accountType = isCreditCard ? "credit_card" : detectAccountType(text, filename);

    const transactions: ParsedTransaction[] = [];
    for (const t of stmtTrns) {
      try {
        const date = parseOfxDate(t.DTPOSTED ?? t.DTUSER);
        if (!date) continue;
        let amount = parseFloat(String(t.TRNAMT ?? "0"));
        if (Number.isNaN(amount)) continue;
        const trnType = String(t.TRNTYPE ?? "").toLowerCase();
        if (trnType === "debit") amount = -Math.abs(amount);
        else if (trnType === "credit") amount = Math.abs(amount);

        const description = String(t.MEMO || t.NAME || t.PAYEE || t.FITID || "").trim();
        transactions.push({
          date,
          description: description || "OFX transaction",
          amount,
          account: accountId ?? filename,
          accountType,
          transactionType: detectTransactionType(amount, accountType),
          status: "Posted",
        });
      } catch {
        continue;
      }
    }

    return {
      kind: "transactions",
      transactions,
      positions: [],
      institutionHint: fiOrg,
      accountType,
      accountHint: accountId,
    };
  },
};
