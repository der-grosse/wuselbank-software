import { Pool, PoolClient } from "pg";
import express from "express";
import cors from "cors";

const SECRET = process.env.SECRET;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT;
const DB_NAME = process.env.DB_NAME;
const LIMIT = parseInt(process.env.LIMIT ?? "0") || 0;
const CORS_ORIGIN = process.env.CORS_ORIGIN;
const READER_SECRET = process.env.READER_SECRET;

const pool = new Pool({
  user: DB_USER,
  host: DB_HOST,
  database: DB_NAME,
  password: DB_PASSWORD,
  port: parseInt(DB_PORT ?? "0") || 5432,

  max: 5,
});

pool
  .query(
    `
    CREATE TABLE IF NOT EXISTS Accounts (
  account_number serial NOT NULL PRIMARY KEY,
  account_name varchar(255) NOT NULL,
  unlimited boolean NOT NULL
);

CREATE TABLE IF NOT EXISTS Transactions (
  transaction_id serial NOT NULL PRIMARY KEY,
  receiver int,
  sender int,
  amount int NOT NULL,
  FOREIGN KEY (sender) REFERENCES Accounts(account_number) ON DELETE SET NULL,
  FOREIGN KEY (receiver) REFERENCES Accounts(account_number) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS Cards (
  card_number int NOT NULL PRIMARY KEY,
  account_number int NOT NULL,
  FOREIGN KEY (account_number) REFERENCES Accounts(account_number) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS CardReader (
  reader_id int NOT NULL PRIMARY KEY,
  account_number int NOT NULL,
  FOREIGN KEY (account_number) REFERENCES Accounts(account_number) ON DELETE CASCADE
);`,
  )
  .then(() => console.log("Initialized"));

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: CORS_ORIGIN,
    optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
  }),
);

app.get("/api/accounts", async (req, res) => {
  try {
    res.json(await listAccounts());
  } catch (error) {
    res.status(500).send();
  }
});

app.post("/api/accounts", async (req, res) => {
  try {
    const { name, unlimited, password } = req.body;
    if (password !== SECRET) return res.status(401).send();
    const account_number = await createAccount(name, unlimited);
    res.status(200).send();
  } catch (error) {
    console.error(error);
    res.status(500).send();
  }
});

app.patch("/api/accounts", async (req, res) => {
  try {
    const { account_number, name, unlimited, password } = req.body;
    if (password !== SECRET) return res.status(401).send();
    await updateAccount(account_number, name, unlimited);
    res.json({ account_number });
  } catch (error) {
    console.error(error);
    res.status(500).send();
  }
});

app.delete("/api/accounts", async (req, res) => {
  try {
    const { account_number, password } = req.body;
    if (password !== SECRET) return res.status(401).send();
    await deleteAccount(account_number);
    res.json({ account_number });
  } catch (error) {
    console.error(error);
    res.status(500).send();
  }
});

app.post("/api/card", async (req, res) => {
  try {
    const { card_number, account_number, password } = req.body;
    if (password !== SECRET) return res.status(401).send();
    await linkCard(card_number, account_number);
    res.status(201).send();
  } catch (error) {
    console.error(error);
    res.status(500).send();
  }
});

app.delete("/api/card", async (req, res) => {
  try {
    const { card_number, password } = req.body;
    if (password !== SECRET) return res.status(401).send();
    await unlinkCard(card_number);
    res.status(200).send();
  } catch (error) {
    console.error(error);
    res.status(500).send();
  }
});

app.post("/api/reader", async (req, res) => {
  try {
    const { reader_id, account_number, password } = req.body;
    if (password !== SECRET) return res.status(401).send();
    await linkCardreader(reader_id, account_number);
    res.status(201).send();
  } catch (error) {
    console.error(error);
    res.status(500).send();
  }
});

app.delete("/api/reader", async (req, res) => {
  try {
    const { reader_id, password } = req.body;
    if (password !== SECRET) return res.status(401).send();
    await unlinkCardreader(reader_id);
    res.status(200).send();
  } catch (error) {
    console.error(error);
    res.status(500).send();
  }
});

app.post("/api/transaction", async (req, res) => {
  try {
    const { sender, receiver, amount, password } = req.body;
    if (password !== SECRET) return res.status(401).send();
    const success = await addTransaction(
      parseInt(sender),
      receiver,
      amount,
      LIMIT,
    );
    console.log({ success, sender, receiver, amount });
    res.status(success ? 200 : 400).send();
  } catch (error) {
    console.error(error);
    res.status(500).send();
  }
});

app.post("/api/reader_payment", async (req, res) => {
  try {
    const { reader_id, amount, card_number, secret } = req.body;
    if (secret != READER_SECRET) return res.status(400).send();
    const success = await addReaderPayment(
      reader_id,
      card_number,
      amount,
      LIMIT,
    );
    res.status(success ? 200 : 400).send();
  } catch (error) {
    console.error(error);
    res.status(500).send();
  }
});

app.listen(4000, () => console.log("Listening on port 4000"));

interface Transaction {
  transaction_id: number;
  sender: string;
  receiver: string;
  amount: number;
}

interface Account {
  account_name: string;
  balance: number;
  unlimited: boolean;
  account_number: number;
  transactions: Transaction[];
  cards: number[];
  cardreaders: number[];
}

async function listAccounts(): Promise<Account[]> {
  const client = await pool.connect();
  client.query("BEGIN");
  const accountsDB = (await client.query(
    "SELECT * FROM Accounts ORDER BY account_number",
  )) as {
    rows: {
      account_number: number;
      account_name: string;
      unlimited: boolean;
    }[];
  };

  const transactionsDB = (await client.query("SELECT * FROM Transactions")) as {
    rows: {
      transaction_id: number;
      sender: number;
      receiver: number;
      amount: number;
    }[];
  };
  const cardsDB = (await client.query("SELECT * FROM Cards")) as {
    rows: {
      card_number: number;
      account_number: number;
    }[];
  };
  const cardReaderDB = (await client.query("SELECT * FROM CardReader")) as {
    rows: {
      reader_id: number;
      account_number: number;
    }[];
  };
  client.query("COMMIT");
  client.release();

  const accountNameMap = new Map<number, string>();
  accountsDB.rows.forEach(({ account_number, account_name }) =>
    accountNameMap.set(account_number, account_name),
  );

  return accountsDB.rows.map((account) => {
    let balance = 0;
    const transactions = transactionsDB.rows.filter(
      (transaction) =>
        transaction.sender === account.account_number ||
        transaction.receiver === account.account_number,
    );
    transactions.forEach((transaction) => {
      if (transaction.sender === account.account_number) {
        balance -= transaction.amount;
      } else {
        balance += transaction.amount;
      }
    });
    const cards = cardsDB.rows.filter(
      (card) => card.account_number === account.account_number,
    );
    const cardreaders = cardReaderDB.rows.filter(
      (cardreader) => cardreader.account_number === account.account_number,
    );
    return {
      account_name: account.account_name,
      balance,
      unlimited: account.unlimited,
      account_number: account.account_number + 1000,
      transactions: transactions.map(
        ({ transaction_id, sender, receiver, amount }) => ({
          transaction_id,
          sender: accountNameMap.get(sender) || "Gelöschtes Konto",
          receiver: accountNameMap.get(receiver) || "Gelöschtes Konto",
          amount,
        }),
      ),
      cards: cards.map((card) => card.card_number),
      cardreaders: cardreaders.map((cardreader) => cardreader.reader_id),
    };
  });
}

async function createAccount(name: string, unlimited: Boolean): Promise<void> {
  await pool.query(
    `INSERT INTO Accounts (account_name, unlimited) VALUES ($1, $2);`,
    [name, unlimited],
  );
  return;
}

async function updateAccount(
  account_number: number,
  name: string,
  unlimited: boolean,
): Promise<void> {
  await pool.query(
    "UPDATE Accounts SET unlimited = $1, account_name=$2 WHERE account_number = $3;",
    [unlimited, name, account_number - 1000],
  );
}

async function deleteAccount(account_number: number): Promise<void> {
  await pool.query("DELETE FROM Accounts WHERE account_number = $1;", [
    account_number - 1000,
  ]);
}

async function linkCardreader(
  reader_id: number,
  account_number: number,
): Promise<void> {
  await pool.query(
    "INSERT INTO CardReader (reader_id, account_number) VALUES ($1, $2);",
    [reader_id, account_number - 1000],
  );
}

async function unlinkCardreader(reader_id: number): Promise<void> {
  await pool.query("DELETE FROM CardReader WHERE reader_id = $1;", [reader_id]);
}

async function linkCard(
  card_number: number,
  account_number: number,
): Promise<void> {
  await pool.query(
    "INSERT INTO Cards (card_number, account_number) VALUES ($1, $2);",
    [card_number, account_number - 1000],
  );
}

async function unlinkCard(card_number: number): Promise<void> {
  await pool.query("DELETE FROM Cards WHERE card_number = $1;", [card_number]);
}

async function addTransaction(
  sender: number,
  receiver: number,
  amount: number,
  limit: number,
): Promise<boolean> {
  const client = await pool.connect();
  client.query("BEGIN");
  const balance = await checkBalance(sender - 1000, client);
  console.log({ balance, amount });
  if (balance + limit < amount) {
    client.query("ROLLBACK");
    client.release();
    return false;
  }
  await client.query(
    `INSERT INTO Transactions (sender, receiver, amount) VALUES ($1, $2, $3);`,
    [sender - 1000, receiver - 1000, Number(amount)],
  );
  await client.query("COMMIT;");
  client.release();
  return true;
}

async function addReaderPayment(
  reader_id: number,
  card_number: number,
  amount: number,
  limit: number,
): Promise<boolean> {
  const client = await pool.connect();
  client.query("BEGIN");
  const account_number = (
    await client.query(
      "SELECT account_number FROM Cards WHERE card_number = $1;",
      [card_number],
    )
  ).rows[0].account_number;
  const balance = await checkBalance(account_number, client);
  if (balance + limit < amount) {
    client.query("ROLLBACK");
    client.release();
    return false;
  }
  console.log({ card_number, reader_id, amount });
  await pool.query(
    `INSERT INTO Transactions (sender, receiver, amount) VALUES (
      COALESCE(
        (SELECT account_number FROM Cards WHERE card_number = $1),
      0),
      COALESCE(
        (SELECT account_number FROM CardReader WHERE reader_id = $2),
      0),
      $3
    );`,
    [card_number, reader_id, Number(amount)],
  );
  client.query("COMMIT;");
  client.release();
  return true;
}

async function checkBalance(
  account_number: number,
  client?: PoolClient,
): Promise<number> {
  let no_client = false;
  if (!client) {
    client = await pool.connect();
    client.query("BEGIN");
    no_client = true;
  }
  const { rows } = await client.query(
    `SELECT COALESCE((SELECT SUM(amount) FROM Transactions WHERE receiver = $1), 0) - COALESCE((SELECT SUM(amount) FROM Transactions WHERE sender = $1),0) as balance;`,
    [account_number],
  );

  const unlimited = await client.query(
    `SELECT * FROM Accounts WHERE account_number = $1;`,
    [account_number],
  );
  console.log({
    unlimited: unlimited.rows[0].unlimited,
    account_number,
    balance: rows[0].balance,
  });
  console.log(unlimited.rows[0].unlimited);

  if (no_client) client.query("COMMIT");
  if (unlimited.rows[0].unlimited) return 1000;
  return Number(rows[0].balance);
}
