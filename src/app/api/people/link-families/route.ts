import { linkFamiliesByLastName } from "@/lib/people";

export async function POST() {
  return Response.json(await linkFamiliesByLastName());
}
