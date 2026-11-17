import { BucketBoard } from "@/components/bucket-board";
import { requireAppContext } from "@/lib/context";
import { listBucketItems } from "@/lib/planner";

export default async function BucketListPage() {
  const context = await requireAppContext();
  const workspace = context.workspace;
  if (!workspace) {
    return (
      <div className="surface p-8 text-center text-sm text-mist-300">
        No workspace available. Reload the page to finish provisioning.
      </div>
    );
  }

  const items = await listBucketItems(workspace.id);
  const canEdit = workspace.role !== "viewer";

  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold tracking-tight text-mist-100">Bucket list</h1></header>
      {!canEdit && (
        <div className="rounded-xl border border-violet-400/20 bg-violet-400/[0.07] px-4 py-3 text-sm text-violet-200">
          You have view-only access to this workspace.
        </div>
      )}

      <BucketBoard
        items={items}
        canEdit={canEdit}
      />
    </div>
  );
}
