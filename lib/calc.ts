import { Account, OpeningBalance, Tx, Type } from "./db";

export type SummaryRow = {
  cuenta: string;
  mesAnterior: number;
  inicio: number;
  fin: number;
  ahorroGasto: number;
};

export function computeSummary(args: {
  ym: string;
  accounts: Account[];
  types: Type[];
  openings: OpeningBalance[];
  txs: Tx[];
}) {
  const { accounts, types, openings, txs, ym } = args;

  const typeById = new Map<number, Type>();
  types.forEach((t) => t.id && typeById.set(t.id, t));

  const openingByKey = new Map<string, number>();
  openings.forEach((o) => openingByKey.set(`${o.ym}|${o.accountId}`, o.amount));

  const rows: SummaryRow[] = accounts.map((acc) => {
    const accId = acc.id!;
    const opening = openingByKey.get(`${ym}|${accId}`) ?? 0;

    const txAcc = txs.filter((t) => t.ym === ym && t.accountId === accId);

    let income = 0;
    let fixedOut = 0;
    let transferOut = 0;
    let variableOut = 0;

    for (const tx of txAcc) {
      const ty = typeById.get(tx.typeId);
      if (!ty) continue;

      if (ty.direction === "INCOME") {
        income += tx.amount;
      } else {
        if (ty.bucket === "FIXED") fixedOut += tx.amount;
        else if (ty.bucket === "TRANSFER") transferOut += tx.amount;
        else if (ty.bucket === "VARIABLE") variableOut += tx.amount;
        else fixedOut += tx.amount; // OTHER como fijo por defecto
      }
    }

    const inicio = opening + income - fixedOut - transferOut;
    const fin = inicio - variableOut;
    const ahorroGasto = fin - opening;

    return {
      cuenta: acc.name,
      mesAnterior: round2(opening),
      inicio: round2(inicio),
      fin: round2(fin),
      ahorroGasto: round2(ahorroGasto),
    };
  });

  return rows;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
