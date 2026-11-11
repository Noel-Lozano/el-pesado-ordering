"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { UserIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/Notice";
import { TabBar } from "@/components/ui/TabBar";
import { TopBar } from "@/components/ui/TopBar";
import { useAuth } from "@/context/AuthContext";
import { clearCheckoutDraft } from "@/lib/checkoutDraft";
import { clearLastOrderId } from "@/lib/lastOrder";
import { maskPhone } from "@/lib/phone";
import { strings } from "@/lib/strings";

// Cuenta tab. There are no account endpoints (ADR-004 Gaps): this shows the
// number verified on this device and lets the customer sign out, which only
// forgets the token locally (the server-side JWT expires on its own in 24 h).
export function AccountView() {
  const { phone, token, hasLoaded, clear } = useAuth();
  const [hasSignedOut, setHasSignedOut] = useState(false);
  const isSignedIn = token !== null && phone !== null;

  const signOut = () => {
    clear();
    clearLastOrderId();
    clearCheckoutDraft();
    setHasSignedOut(true);
  };

  return (
    <>
      <TopBar title={strings.account.pageTitle} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-6">
        {hasSignedOut && <Notice>{strings.account.signedOut}</Notice>}

        {hasLoaded && isSignedIn && (
          <Card className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-sm bg-yellow">
                <UserIcon size={22} />
              </span>
              <div className="flex flex-col">
                <h2 className="text-base font-black">{strings.account.phoneLabel}</h2>
                <p className="font-bold tabular-nums">{maskPhone(phone)}</p>
              </div>
            </div>
            <p className="text-sm font-semibold text-muted">{strings.account.verifiedBody}</p>
            <Button variant="secondary" onClick={signOut}>
              {strings.account.signOut}
            </Button>
          </Card>
        )}

        {hasLoaded && !isSignedIn && (
          <section className="flex flex-col items-center gap-4 py-6 text-center">
            <h2 className="font-display text-2xl font-normal">{strings.account.noAccountTitle}</h2>
            <p className="font-semibold text-muted">{strings.account.noAccountBody}</p>
            <ButtonLink href="/" className="w-full">
              {strings.account.seeMenu}
            </ButtonLink>
          </section>
        )}
      </main>
      <TabBar activeTab="account" />
    </>
  );
}
