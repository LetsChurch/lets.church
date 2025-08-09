import { createFileRoute, Link } from '@tanstack/react-router';
import { hasValidSession } from '../-functions';

export const Route = createFileRoute('/_main/')({
  component: Home,
  loader: async () => ({
    isLoggedIn: await hasValidSession(),
  }),
});

function Home() {
  const { isLoggedIn } = Route.useLoaderData();

  return (
    <div className="px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome to the Home Page
        </h1>
        {isLoggedIn ? (
          <form method="POST" action="/auth/logout">
            <button
              type="submit"
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            >
              Logout
            </button>
          </form>
        ) : (
          <Link
            to="/auth/login"
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-decoration-none"
          >
            Login
          </Link>
        )}
      </div>
    </div>
  );
}
