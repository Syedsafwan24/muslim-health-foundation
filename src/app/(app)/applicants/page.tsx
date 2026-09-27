import type { Metadata } from "next";
import type { SearchParams } from "@/lib/params";
import { PeopleList } from "../people/people-list";

export const metadata: Metadata = { title: "Applicants" };

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <PeopleList as="applicant" searchParams={searchParams} />;
}
