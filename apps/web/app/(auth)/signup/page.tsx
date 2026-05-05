import { Suspense } from "react";
import { SignupForm } from "./signup-form";

// useSearchParams (read inside SignupForm) requires a Suspense boundary so
// the page can be statically prerendered.
export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
