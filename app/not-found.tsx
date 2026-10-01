/**
 * 404 Not Found Page
 *
 * Rendered when a user navigates to a route that doesn't exist.
 * Provides links back to home and the login page.
 */
import Link from "next/link";
import { ArrowLeft, MapPinOff } from "lucide-react";
import { StatusPage } from "@/components/common/status-page";
import { buttonVariants } from "@/components/ui/button-variants";

export default function NotFound() {
  return (
    <StatusPage
      icon={MapPinOff}
      code="404"
      title="Page Not Found"
      actions={
        <>
          <Link href="/" className={buttonVariants({ size: "lg" })}>
            <ArrowLeft /> Back to Home
          </Link>
          <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Portal Login
          </Link>
        </>
      }
    >
      The page you&apos;re looking for doesn&apos;t exist in the DTCGC portal, or may have been moved to a different location.
    </StatusPage>
  );
}
