import { redirect } from "next/navigation";

/** Organizations are managed from the Users slide-in. */
export default function OrganizationsRedirect() {
  redirect("/admin/users");
}
