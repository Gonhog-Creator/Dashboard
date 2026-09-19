import { Widget } from "@/components/layout/Widget";
import { TaskList } from "@/components/tasks/TaskList";
import { listTasks } from "@/lib/todo";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  // One Graph fetch serves both lists (listTasks caches the full set).
  const [open, done] = await Promise.all([
    listTasks({ done: false }).catch(() => null),
    listTasks({ done: true }).catch(() => null),
  ]);

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Tasks</h1>
      <Widget title="Open">
        <TaskList filter="done=false" emptyText="All clear." initialTasks={open} />
      </Widget>
      <Widget title="Completed">
        <TaskList
          filter="done=true"
          showForm={false}
          emptyText="Nothing completed yet."
          initialTasks={done}
        />
      </Widget>
    </div>
  );
}
