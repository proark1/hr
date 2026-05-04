"use client";
import { useTransition } from "react";
import { switchOrgAction } from "@/app/(app)/actions";
import { Select } from "@/components/ui/select";

type Props = {
  orgs: ReadonlyArray<{ id: string; name: string }>;
  activeOrgId: string | undefined;
};

export function OrgSwitcher({ orgs, activeOrgId }: Props) {
  const [pending, startTransition] = useTransition();

  if (orgs.length === 0) return null;

  return (
    <form action={switchOrgAction}>
      <Select
        name="orgId"
        defaultValue={activeOrgId}
        disabled={pending}
        onChange={(e) => {
          // Auto-submit on change.
          const fd = new FormData();
          fd.set("orgId", e.currentTarget.value);
          startTransition(async () => {
            await switchOrgAction(fd);
          });
        }}
        className="bg-sidebar-active text-sidebar-foreground border-sidebar-active"
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
    </form>
  );
}
