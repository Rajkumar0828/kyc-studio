import type { Metadata } from "next";
import { SpecimenFiles } from "@/app/components/SpecimenFiles";
import { ApplyJourney } from "./ApplyJourney";

export const metadata: Metadata = { title: "Verify your identity · KYCite" };

export default async function ApplyPage(props: PageProps<"/apply/[policyId]">) {
  const { policyId } = await props.params;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <ApplyJourney policyId={policyId} />
      {/* For judges and testers: synthetic files to upload, and what each should produce. */}
      <div className="mt-10">
        <SpecimenFiles />
      </div>
    </main>
  );
}
