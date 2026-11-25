import { Shell } from "@/components/Shell";
import { requireOrganizer } from "@/lib/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOrganizer();
  return <Shell user={user}>{children}</Shell>;
}
