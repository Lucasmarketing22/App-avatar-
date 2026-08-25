import { AuthForm } from '@/components/AuthForm';
import { signup } from '@/app/auth/actions';

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <AuthForm mode="signup" action={signup} />
    </main>
  );
}
