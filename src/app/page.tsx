import { redirect } from "next/navigation";
import { getSession, homePath } from "@/lib/session";

export default async function Home() {
  redirect(homePath(await getSession()));
}
