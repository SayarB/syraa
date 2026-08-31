import "dotenv/config";
import { createPostgresMemoryRepository } from "./repository.js";
import { createMemoryService } from "./service.js";

async function main(): Promise<void> {
  const userId = process.argv[2] ?? "demo-user";
  const text = process.argv[3] ?? "Never invent citations.";

  const repo = await createPostgresMemoryRepository();
  const memory = createMemoryService(repo);

  try {
    const mem = await memory.ensureMemory(userId, "user");
    const item = await memory.createItem({
      userId,
      memoryId: mem.id,
      type: "rule",
      text,
    });
    const items = await memory.listItems(userId, { memoryId: mem.id });

    console.log(`memory_id=${mem.id} scope=${mem.scope}`);
    console.log(`created_item=${item.id} type=${item.type}`);
    console.log("items:");
    for (const it of items) {
      console.log(`  - [${it.type}/${it.status}] ${it.text}`);
    }
  } finally {
    await repo.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
