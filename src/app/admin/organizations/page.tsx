import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Organizations are managed from the Users slide-in. */
export default function OrganizationsRedirect() {
  redirect("/admin/users");
}
