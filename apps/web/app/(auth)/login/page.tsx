import { Suspense } from "react";
import { LoginForm } from "./login-form";

// useSearchParams (read inside LoginForm) requires a Suspense boundary so
// the page can be statically prerendered.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
