import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { CreateWalletButton } from "./create-wallet-button";

export default async function OnboardPage() {
  const session = await requireSession();
  if (session.walletAddress && !session.ephemeral) redirect("/wallet");
  const finish = Boolean(session.walletAddress);

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>{finish ? "Finish setup" : "Create your wallet"}</CardTitle>
          <CardDescription>
            {finish
              ? "Your wallet exists, but linking it to your account didn't complete."
              : "Your wallet is a smart account controlled by a passkey on this device."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateWalletButton rpId={config.webauthnRpId} phone={session.phone} finish={finish} />
        </CardContent>
      </Card>
    </main>
  );
}
