import { badJson, readJson, toResponse } from "@/lib/http";
import { createIncome } from "@/lib/settings-service";

export async function POST(req: Request) {
  const body = await readJson(req);
  return body ? toResponse(await createIncome(body), 201) : badJson();
}
