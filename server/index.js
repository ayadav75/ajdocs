import { initDb } from './db.js';
import { app } from './app.js';

if (process.env.NODE_ENV === 'production' && !process.env.COOKIE_SECRET) {
  throw new Error('COOKIE_SECRET is required in production');
}

await initDb();
const port = process.env.PORT ?? 3000;
app.listen(port, () => console.log(`AJDocs on http://localhost:${port}`));
