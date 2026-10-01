/**
 * Global Error Boundary (500 Page)
 *
 * Catches unhandled runtime errors at the app level and renders
 * a branded error page with a retry button and error reference digest.
 */
'use client'

import { useEffect } from "react";
import Link from "next/link";
import { AlertOctagon, ArrowLeft, RefreshCw } from "lucide-react";
import { StatusPage } from "@/components/common/status-page";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <StatusPage
      icon={AlertOctagon}
      tone="maroon"
      code="500"
      title="Something Went Wrong"
      actions={
        <>
          <Button variant="maroon" size="lg" onClick={() => reset()}>
            <RefreshCw /> Try Again
          </Button>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <ArrowLeft /> Back to Home
          </Link>
        </>
      }
      footer={
        error.digest && (
          <p className="text-xs text-gray-500">
            Error reference: <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-700">{error.digest}</code>
          </p>
        )
      }
    >
      Something went wrong on our end and it has been logged. Please try again, or contact the VP of Education if the problem persists.
    </StatusPage>
  );
}
