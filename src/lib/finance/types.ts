export interface ParsedTransaction {
  date: Date;
  description: string;
  amount: number; // negative = money out
  account?: string; // account hint found in the file
  accountType?: string; // checking|credit_card|investment|savings
  transactionType?: string;
  status?: string;
  symbol?: string;
  quantity?: number;
  price?: number;
}

export interface ParsedPosition {
  symbol?: string;
  description?: string;
  quantity?: number;
  price?: number;
  value?: number;
  costBasis?: number;
  account?: string;
  accountNumber?: string;
  asOf: Date;
}

export interface ParsedSnapshot {
  accountHint: string; // ends with last-4 mask when known
  date: Date;
  balance: number;
}

export interface ParseOutput {
  kind: "transactions" | "positions";
  transactions: ParsedTransaction[];
  positions: ParsedPosition[];
  /** Statement-ending balances (e.g. Fidelity monthly reports). */
  snapshots?: ParsedSnapshot[];
  /** Institution guess, e.g. 'Fidelity' | 'First Citizens' */
  institutionHint?: string;
  accountType?: string;
  accountHint?: string;
}

export interface Parser {
  canParse(filename: string, content: Buffer): boolean;
  parse(filename: string, content: Buffer): ParseOutput;
}
