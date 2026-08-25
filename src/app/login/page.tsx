import { AuthForm } from '@/components/AuthForm';
import { login } from '@/app/auth/actions';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirectTo?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <AuthForm mode="login" action={login} redirectTo={searchParams.redirectTo} />
    </main>
  );
}
