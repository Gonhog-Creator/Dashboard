import { Widget } from "@/components/layout/Widget";
import { TaskList } from "@/components/tasks/TaskList";

export default function TasksPage() {
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Tasks</h1>
      <Widget title="Open">
        <TaskList filter="done=false" emptyText="All clear." />
      </Widget>
      <Widget title="Completed">
        <TaskList filter="done=true" showForm={false} emptyText="Nothing completed yet." />
      </Widget>
    </div>
  );
}
