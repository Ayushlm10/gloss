import { localMode } from "@/lib/local-mode";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { Landing } from "@/components/landing/Landing";

export const metadata: Metadata = { title: "Gloss", alternates: { canonical: "/" } };

export default async function Home() {
  const userId = localMode ? null : (await auth()).userId;
  return <Landing signedIn={Boolean(userId)} />;
}
