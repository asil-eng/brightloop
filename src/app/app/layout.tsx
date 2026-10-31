import { Sidebar } from "@/components/sidebar";
import { requireBackoffice } from "@/lib/auth";
import { logoutAction } from "../(auth)/actions";

export default async function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireBackoffice();
  return (
    <div className="lg:flex">
      <Sidebar isAdmin={user.role === "ADMIN"} user={{ name: user.name, role: user.role }} logout={logoutAction} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
