import { notFound } from "next/navigation";
import { requireOrganizer } from "./session";
import { getOwnedEvent } from "./core/events";
import { AppError } from "./util";

/** يحمّل فعالية يملكها المنظّم الحالي، وإلا 404 (عزل المنظّمين). */
export async function loadOwnedEvent(id: string) {
  const user = await requireOrganizer();
  try {
    const event = await getOwnedEvent(user.id, id);
    return { user, event };
  } catch (e) {
    if (e instanceof AppError && e.code === "not_found") notFound();
    throw e;
  }
}
