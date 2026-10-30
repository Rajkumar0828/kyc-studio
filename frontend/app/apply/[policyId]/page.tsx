import type { Metadata } from "next";
import { ApplyJourney } from "./ApplyJourney";

export const metadata: Metadata = { title: "Verify your identity · KYC Studio" };

export default async function ApplyPage(props: PageProps<"/apply/[policyId]">) {
  const { policyId } = await props.params;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <ApplyJourney policyId={policyId} />
    </main>
  );
}
