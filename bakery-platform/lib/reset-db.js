// `npm run seed` — wipe and reseed the database file.
import { openDb, resetDb } from "./db.js";

const db = openDb();
resetDb(db);
const n = db.prepare("SELECT COUNT(*) AS n FROM products").get();
console.log(`Database reset. Seeded 1 bakery, ${n.n} products.`);
