import { Card, CardContent } from "@/components/ui/card";

type Props = { title: string; body?: string };

export function ComingSoon({ title, body }: Props) {
  return (
    <div className="p-8 sm:p-10">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card className="mt-6">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {body ?? "Coming in a follow-up release."}
        </CardContent>
      </Card>
    </div>
  );
}
