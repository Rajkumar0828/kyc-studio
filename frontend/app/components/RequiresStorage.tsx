import { Icon } from "./Icon";

// Shown by admin pages whose data lives in MongoDB (and Vault) when the server
// runs with file storage, instead of failing.
export function RequiresStorage({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-xl text-zinc-500 dark:bg-zinc-800">
        <Icon name="database" />
      </span>
      <p className="font-medium text-zinc-900 dark:text-zinc-100">Requires MongoDB{/Vault/.test(message) ? " and Vault" : ""}</p>
      <p className="mt-1 max-w-md text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      <a href="/api/health" className="mt-4 text-sm font-medium text-accent-700 underline underline-offset-2 hover:no-underline dark:text-accent-300">Check the server&apos;s storage status</a>
    </div>
  );
}
