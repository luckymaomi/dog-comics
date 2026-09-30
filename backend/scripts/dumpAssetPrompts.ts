import Database from "better-sqlite3";
import { loadConfig } from "../src/config";

const config = loadConfig();
const db = new Database(config.database.path);
console.log("db:", config.database.path);
console.log("dramas:", db.prepare("SELECT id, title FROM dramas").all());
const rows = db
  .prepare(
    `SELECT id, drama_id, kind, name, output_prompt, image_url
     FROM project_assets ORDER BY drama_id, id`,
  )
  .all() as Array<{
  id: number;
  drama_id: number;
  kind: string;
  name: string;
  output_prompt: string;
  image_url: string | null;
}>;

for (const row of rows) {
  console.log("\n====");
  console.log(`#${row.id} [${row.kind}] ${row.name}`);
  console.log(`image_url: ${row.image_url ?? "(无)"}`);
  console.log("--- output_prompt ---");
  console.log(row.output_prompt?.trim() ? row.output_prompt : "(空)");
}
console.log(`\n合计 ${rows.length} 张资产卡`);
db.close();
