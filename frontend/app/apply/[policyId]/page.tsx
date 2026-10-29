import type { Metadata } from "next";
import { ApplyJourney } from "./ApplyJourney";

export const metadata: Metadata = { title: "Verify your identity · KYC Studio" };

export default async function ApplyPage(props: PageProps<"/apply/[policyId]">) {
  const { policyId } = await props.params;
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <ApplyJourney policyId={policyId} />
    </main>
  );
}
