import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/session";

export default async function CheckinLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["organizer", "staff"]);
  return <Shell user={user}>{children}</Shell>;
}
