import { createCompany } from "./actions";

export default async function NewCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Set up your company
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Your AI employees will work under this company.
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <form action={createCompany} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-zinc-700">
              Company name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="website" className="block text-sm font-medium text-zinc-700">
              Website
            </label>
            <input
              id="website"
              name="website"
              type="text"
              placeholder="https://"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="mt-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
