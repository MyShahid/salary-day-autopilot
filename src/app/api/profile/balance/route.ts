import { badJson, readJson, toResponse } from "@/lib/http";
import { updateBalance } from "@/lib/settings-service";

export async function PUT(req: Request) {
  const body = await readJson(req);
  return body ? toResponse(await updateBalance(body)) : badJson();
}
