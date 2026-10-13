import Database from "better-sqlite3";
const db = new Database("data/tomato_ai_drama.db");
const gens = db
  .prepare(
    "SELECT id, status, error_msg, image_url, task_id FROM image_generations WHERE id >= 110 ORDER BY id",
  )
  .all();
console.log(JSON.stringify(gens, null, 2));
for (const g of gens as Array<{ task_id: string | null }>) {
  if (!g.task_id) continue;
  const t = db.prepare("SELECT id, status, error FROM tasks WHERE id = ?").get(g.task_id);
  console.log("task", JSON.stringify(t));
}
db.close();
