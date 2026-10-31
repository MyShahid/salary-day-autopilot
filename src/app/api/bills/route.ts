import { badJson, readJson, toResponse } from "@/lib/http";
import { createBill } from "@/lib/settings-service";

export async function POST(req: Request) {
  const body = await readJson(req);
  return body ? toResponse(await createBill(body), 201) : badJson();
}
