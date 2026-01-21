import Dexie, { Table } from "dexie";

export type Direction = "INCOME" | "EXPENSE";
export type Bucket = "FIXED" | "VARIABLE" | "TRANSFER" | "OTHER";

export type Account = { id?: number; name: string };
export type Type = { id?: number; name: string; direction: Direction; bucket: Bucket };

export type OpeningBalance = { id?: number; ym: string; accountId: number; amount: number };

export type Tx = {
  id?: number;
  ym: string; // YYYY-MM
  date?: string; // YYYY-MM-DD opcional
  description: string;
  typeId: number;
  amount: number;
  accountId: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

class FinanzasDB extends Dexie {
  accounts!: Table<Account, number>;
  types!: Table<Type, number>;
  openings!: Table<OpeningBalance, number>;
  txs!: Table<Tx, number>;

  constructor() {
    super("finanzas_db");
    this.version(1).stores({
      accounts: "++id,&name",
      types: "++id,&name,direction,bucket",
      openings: "++id,[ym+accountId],ym,accountId",
      txs: "++id,ym,accountId,typeId,date",
    });
  }
}

export const db = new FinanzasDB();

export async function seedDefaults() {
  const [accCount, typeCount] = await Promise.all([db.accounts.count(), db.types.count()]);

  if (accCount === 0) {
    await db.accounts.bulkAdd([{ name: "BBVA" }, { name: "CAIXA" }]);
  }

  if (typeCount === 0) {
    await db.types.bulkAdd([
      { name: "Nomina", direction: "INCOME", bucket: "OTHER" },
      { name: "Ingreso recibos", direction: "INCOME", bucket: "OTHER" },

      { name: "Domiciliado", direction: "EXPENSE", bucket: "FIXED" },
      { name: "Gasto Variable", direction: "EXPENSE", bucket: "VARIABLE" },

      { name: "Transferencia recibos", direction: "EXPENSE", bucket: "TRANSFER" },
      { name: "Transferencia ahorro", direction: "EXPENSE", bucket: "TRANSFER" },

      { name: "Ahorro", direction: "EXPENSE", bucket: "TRANSFER" },
    ]);
  }
}
