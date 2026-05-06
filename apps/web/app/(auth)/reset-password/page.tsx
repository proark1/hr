import { ResetPasswordForm } from "./reset-password-form";

type SearchParams = { token?: string };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={token ?? ""} />;
}
