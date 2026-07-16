"use client";

import { TopBar } from "@/components/ui";
import { HeartSpinner } from "@/components/hearts";

export default function Page() {
  return (
    <>
      <TopBar title="Plans" />
      <HeartSpinner />
    </>
  );
}
